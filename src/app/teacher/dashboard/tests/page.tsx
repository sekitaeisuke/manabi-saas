"use client";
import { sanitizeHtml } from "@/lib/sanitize";

import Link from "next/link";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Test, Student } from "@/lib/supabase";
import { showToast } from "@/lib/toast";
import {
  CURRICULUM, GRADE_ORDER, SUBJECT_LIST,
  getAdjacentGrades, getUnitsForGrade,
} from "@/lib/curriculum";

// ─── 型 ──────────────────────────────────────────────
type Difficulty = "basic" | "standard" | "advanced";
type TestType = "diagnostic" | "lesson";
type AiStep = "idle" | "chatgpt" | "gemini" | "claude";

type GeneratedQuestion = {
  id: string;
  difficulty: Difficulty;
  section: string;
  text: string;
  type: "multiple-choice" | "short-answer" | "descriptive";
  options: string[] | null;
  correct_answer: string;
  points: number;
};

type ScoredAnswer = { isCorrect: boolean; points: number };
type DifficultyStats = { earned: number; total: number; wrong: string[] };

type AnalysisResult = {
  reportHtml: string;
  score: number;
  total: number;
  rate: number;
  scored?: ScoredAnswer[];
  byDifficulty?: Record<string, DifficultyStats>;
};

// ─── メインページ ─────────────────────────────────────
export default function TeacherTestsPage() {
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "create">("list");

  useEffect(() => { fetchTests(); }, []);

  const fetchTests = async () => {
    setLoading(true);
    const { data } = await supabase.from("tests").select("*").order("created_at", { ascending: false });
    setTests(data ?? []);
    setLoading(false);
  };

  const deleteTest = async (id: string) => {
    if (!confirm("このテストを削除しますか？")) return;
    await supabase.from("tests").delete().eq("id", id);
    fetchTests();
  };

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">診断・確認テスト</h1>
            <p className="mt-1 text-slate-600">AIがテストを自動生成・解答分析・レポート作成を行います。</p>
          </div>
          <div className="flex gap-3">
            {view === "list" ? (
              <button
                onClick={() => setView("create")}
                className="rounded-2xl bg-green-600 px-5 py-3 font-semibold text-white transition hover:bg-green-700"
              >
                + 新規作成
              </button>
            ) : (
              <button
                onClick={() => { setView("list"); fetchTests(); }}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-slate-700 transition hover:bg-slate-50"
              >
                一覧に戻る
              </button>
            )}
            <Link
              href="/teacher/dashboard"
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-slate-700 transition hover:bg-slate-50"
            >
              ダッシュボード
            </Link>
          </div>
        </div>

        {view === "list" ? (
          <TestList tests={tests} loading={loading} onDelete={deleteTest} onRefresh={fetchTests} />
        ) : (
          <CreateTestFlow onSaved={() => { setView("list"); fetchTests(); }} />
        )}
      </main>
    </div>
  );
}

// ─── テスト一覧（フォルダ階層） ───────────────────────────

type SubjectGroup = { subjectName: string; tests: Test[] };
type FolderGroup = { folderKey: string; folderName: string; subjects: SubjectGroup[] };

const SUBJECT_ORDER = ["算数", "数学", "国語", "英語", "理科", "社会"];

function groupTests(tests: Test[]): FolderGroup[] {
  const groups = new Map<string, { name: string; map: Map<string, Test[]> }>();

  for (const test of tests) {
    const monthMatch = test.title.match(/(\d+)月/);
    const month = monthMatch ? monthMatch[1] + "月" : "";
    const typeLabel = test.type === "diagnostic" ? "多層型診断テスト" : "授業確認テスト";
    const folderKey = `${month || "その他"}_${test.type ?? "lesson"}`;
    const folderName = month ? `${month} ${typeLabel}` : typeLabel;

    if (!groups.has(folderKey)) groups.set(folderKey, { name: folderName, map: new Map() });
    const sub = groups.get(folderKey)!.map;
    if (!sub.has(test.subject)) sub.set(test.subject, []);
    sub.get(test.subject)!.push(test);
  }

  const result: FolderGroup[] = [];
  for (const [folderKey, { name: folderName, map: subMap }] of groups) {
    const subjects: SubjectGroup[] = [];
    for (const [subjectName, ts] of subMap) {
      ts.sort((a, b) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade));
      subjects.push({ subjectName, tests: ts });
    }
    subjects.sort((a, b) => {
      const ai = SUBJECT_ORDER.findIndex((s) => a.subjectName.includes(s));
      const bi = SUBJECT_ORDER.findIndex((s) => b.subjectName.includes(s));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    result.push({ folderKey, folderName, subjects });
  }

  result.sort((a, b) => {
    const am = a.folderKey.match(/^(\d+)/);
    const bm = b.folderKey.match(/^(\d+)/);
    const an = am ? parseInt(am[1]) : 0;
    const bn = bm ? parseInt(bm[1]) : 0;
    if (bn !== an) return bn - an;
    if (a.folderKey.includes("_diagnostic") && !b.folderKey.includes("_diagnostic")) return -1;
    if (!a.folderKey.includes("_diagnostic") && b.folderKey.includes("_diagnostic")) return 1;
    return 0;
  });

  return result;
}

function TestList({ tests, loading, onDelete, onRefresh }: {
  tests: Test[];
  loading: boolean;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  const [publishing, setPublishing] = useState<string | null>(null);
  const [publishedUrls, setPublishedUrls] = useState<Record<string, string>>({});
  const [sessionTokens, setSessionTokens] = useState<Record<string, string>>({});
  const [students, setStudents] = useState<Student[]>([]);
  const [startModal, setStartModal] = useState<Test | null>(null);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [starting, setStarting] = useState(false);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [openSubfolders, setOpenSubfolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.from("students").select("*").order("name").then(({ data }) => setStudents(data ?? []));
    supabase.from("test_sessions").select("test_id, url_token").then(({ data }) => {
      const map: Record<string, string> = {};
      (data ?? []).forEach((s: { test_id: string; url_token: string }) => { map[s.test_id] = s.url_token; });
      setSessionTokens(map);
    });
  }, []);

  // 初回：全フォルダを開いた状態にする
  useEffect(() => {
    if (tests.length === 0) return;
    const folders = groupTests(tests);
    const fKeys = new Set(folders.map((f) => f.folderKey));
    const sfKeys = new Set(
      folders.flatMap((f) => f.subjects.map((s) => `${f.folderKey}__${s.subjectName}`))
    );
    setOpenFolders(fKeys);
    setOpenSubfolders(sfKeys);
  }, [tests]);

  const toggleFolder = (key: string) =>
    setOpenFolders((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const toggleSubfolder = (key: string) =>
    setOpenSubfolders((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const publish = async (testId: string) => {
    setPublishing(testId);
    const res = await fetch("/api/tests/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test_id: testId }),
    });
    const data = await res.json();
    if (data.token) {
      const url = `${window.location.origin}/test/${data.token}`;
      setPublishedUrls((prev) => ({ ...prev, [testId]: url }));
      setSessionTokens((prev) => ({ ...prev, [testId]: data.token }));
      onRefresh();
    }
    setPublishing(null);
  };

  const startTest = async () => {
    if (!startModal || !selectedStudent) return;
    setStarting(true);

    // 1. セッション (token) を取得または作成
    let token = sessionTokens[startModal.id];
    if (!token) {
      const res = await fetch("/api/tests/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test_id: startModal.id }),
      });
      const data = await res.json();
      if (!data.token) { setStarting(false); return; }
      token = data.token as string;
      setSessionTokens((prev) => ({ ...prev, [startModal.id]: token }));
      onRefresh();
    }

    // 2. test_session の id を取得
    const { data: sessionRow } = await supabase
      .from("test_sessions")
      .select("id")
      .eq("url_token", token)
      .maybeSingle();

    // 3. 生徒ID を解決し test_assignments に記録（未登録の場合のみ）
    const student = students.find((s) => s.name === selectedStudent);
    if (sessionRow && student) {
      const { data: existing } = await supabase
        .from("test_assignments")
        .select("id")
        .eq("test_session_id", sessionRow.id)
        .eq("student_id", student.id)
        .maybeSingle();
      if (!existing) {
        await supabase.from("test_assignments").insert({
          test_session_id: sessionRow.id,
          student_id: student.id,
        });
      }
    }

    // 4. テストURLを開く
    const url = `/test/${token}?studentName=${encodeURIComponent(selectedStudent)}`;
    window.open(url, "_blank");
    setStarting(false);
    setStartModal(null);
    setSelectedStudent("");
  };

  if (loading) return (
    <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">読み込み中...</div>
  );
  if (tests.length === 0) return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
      テストがまだありません。「新規作成」から作成してください。
    </div>
  );

  const statusLabel: Record<string, { label: string; color: string }> = {
    draft: { label: "下書き", color: "bg-slate-100 text-slate-600" },
    published: { label: "配信中", color: "bg-green-100 text-green-700" },
    closed: { label: "終了", color: "bg-red-100 text-red-700" },
  };

  const folders = groupTests(tests);

  return (
    <>
      <div className="space-y-3">
        {folders.map((folder) => {
          const folderOpen = openFolders.has(folder.folderKey);
          const totalCount = folder.subjects.reduce((s, sub) => s + sub.tests.length, 0);
          return (
            <div key={folder.folderKey} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {/* フォルダヘッダー */}
              <button
                onClick={() => toggleFolder(folder.folderKey)}
                className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition"
              >
                <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${folderOpen ? "rotate-90" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <svg className="h-5 w-5 shrink-0 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
                <span className="flex-1 font-bold text-slate-900">{folder.folderName}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">
                  {totalCount}件
                </span>
              </button>

              {/* 教科サブフォルダ */}
              {folderOpen && (
                <div className="border-t border-slate-100 px-3 pb-3 pt-2 space-y-2">
                  {folder.subjects.map((sub) => {
                    const sfKey = `${folder.folderKey}__${sub.subjectName}`;
                    const sfOpen = openSubfolders.has(sfKey);
                    return (
                      <div key={sfKey} className="overflow-hidden rounded-xl border border-slate-100">
                        {/* 教科フォルダヘッダー */}
                        <button
                          onClick={() => toggleSubfolder(sfKey)}
                          className="flex w-full items-center gap-2.5 bg-slate-50 px-4 py-2.5 text-left hover:bg-slate-100 transition"
                        >
                          <svg className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${sfOpen ? "rotate-90" : ""}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                          <svg className="h-4 w-4 shrink-0 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                          </svg>
                          <span className="flex-1 text-sm font-semibold text-slate-700">
                            {sub.subjectName}診断テスト
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-400 border border-slate-200">
                            {sub.tests.length}件
                          </span>
                        </button>

                        {/* テスト一覧 */}
                        {sfOpen && (
                          <div className="divide-y divide-slate-100">
                            {sub.tests.map((test) => {
                              const st = statusLabel[test.status] ?? statusLabel.draft;
                              const url = publishedUrls[test.id];
                              return (
                                <div key={test.id} className="px-4 py-3">
                                  <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <svg className="h-4 w-4 shrink-0 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <span className="font-medium text-slate-900 text-sm">{test.title}</span>
                                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.color}`}>{st.label}</span>
                                      </div>
                                      <p className="mt-0.5 text-xs text-slate-400 pl-6">{test.grade}</p>
                                      {url && (
                                        <div className="mt-2 flex items-center gap-2 pl-6">
                                          <input readOnly value={url}
                                            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600" />
                                          <button onClick={() => { navigator.clipboard.writeText(url); showToast("URLをコピーしました", "success"); }}
                                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 whitespace-nowrap">
                                            コピー
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex gap-1.5 flex-wrap justify-end shrink-0">
                                      <button onClick={() => { setStartModal(test); setSelectedStudent(""); }}
                                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
                                        受験する
                                      </button>
                                      {test.status === "draft" && (
                                        <button onClick={() => publish(test.id)} disabled={publishing === test.id}
                                          className="rounded-lg border border-green-400 bg-green-50 px-3 py-1.5 text-xs text-green-700 hover:bg-green-100 disabled:opacity-50">
                                          {publishing === test.id ? "発行中..." : "配信する"}
                                        </button>
                                      )}
                                      <button onClick={() => onDelete(test.id)}
                                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                                        削除
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 生徒選択モーダル */}
      {startModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-96 rounded-3xl bg-white p-8 shadow-xl">
            <h3 className="mb-1 text-lg font-bold text-slate-900">生徒を選択して受験開始</h3>
            <p className="mb-5 text-sm text-slate-500">{startModal.title}（{startModal.subject} ・ {startModal.grade}）</p>

            {students.length === 0 ? (
              <p className="mb-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                生徒が登録されていません。多層診断ページから生徒を追加してください。
              </p>
            ) : (
              <div className="mb-5 space-y-2">
                <label className="text-sm font-medium text-slate-700">生徒名</label>
                <select
                  value={selectedStudent}
                  onChange={(e) => setSelectedStudent(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">生徒を選択してください...</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}（{s.grade}）</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={startTest}
                disabled={!selectedStudent || starting}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                {starting ? "準備中..." : "受験を開始する →"}
              </button>
              <button
                onClick={() => { setStartModal(null); setSelectedStudent(""); }}
                className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-slate-700 hover:bg-slate-50"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── テスト作成フロー ──────────────────────────────────
function CreateTestFlow({ onSaved }: { onSaved: () => void }) {
  // 設定
  const [testType, setTestType] = useState<TestType | null>(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("数学");
  const [grade, setGrade] = useState("中1");
  const [selectedUnits, setSelectedUnits] = useState<{ grade: string; unit: string }[]>([]);
  const [difficulties, setDifficulties] = useState<Difficulty[]>(["basic"]);
  const [count, setCount] = useState(10);
  const [instructions, setInstructions] = useState("");

  // AI生成
  const [aiStep, setAiStep] = useState<AiStep>("idle");
  const [generating, setGenerating] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState("");
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);

  // 解答・分析
  const [phase, setPhase] = useState<"form" | "preview" | "answers" | "report">("form");
  const [studentName, setStudentName] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [reportSaved, setReportSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const adjacentGrades = getAdjacentGrades(grade);

  const toggleUnit = (g: string, unit: string) => {
    setSelectedUnits((prev) => {
      const exists = prev.some((u) => u.grade === g && u.unit === unit);
      return exists
        ? prev.filter((u) => !(u.grade === g && u.unit === unit))
        : [...prev, { grade: g, unit }];
    });
  };

  const toggleDifficulty = (d: Difficulty) => {
    setDifficulties((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  };

  const stepDone = (step: "chatgpt" | "gemini" | "claude") => {
    const order: AiStep[] = ["chatgpt", "gemini", "claude"];
    const cur = order.indexOf(aiStep);
    return cur >= order.indexOf(step);
  };

  const generate = async (step: "chatgpt" | "gemini" | "claude") => {
    if (selectedUnits.length === 0) { showToast("単元を1つ以上選択してください", "info"); return; }
    if (difficulties.length === 0) { showToast("難易度を1つ以上選択してください", "info"); return; }
    setGenerating(true);
    setErrorMsg("");
    try {
      let body: Record<string, unknown>;
      if (step === "chatgpt") {
        body = { testType, title, subject, grade, selectedUnits, difficulties, count, instructions };
      } else if (step === "gemini") {
        body = { subject, grade, difficulties, instructions, questions };
      } else {
        body = { testType, title, subject, grade, instructions, questions };
      }
      const res = await fetch(`/api/generate/${step}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let data: Record<string, unknown>;
      try {
        data = await res.json();
      } catch {
        setErrorMsg(`[${step}] サーバーエラー (HTTP ${res.status})`);
        return;
      }
      if (data.error) {
        const detail = data.raw ? `\n詳細: ${data.raw}` : "";
        setErrorMsg(`[${step}] ${data.error}${detail}`);
        return;
      }
      if (data.html) setGeneratedHtml(data.html as string);
      if (data.questions) setQuestions(data.questions as GeneratedQuestion[]);
      setAiStep(step);
    } catch (e) {
      setErrorMsg(`[${step}] ネットワークエラー: ${String(e)}`);
    }
    setGenerating(false);
  };

  const startAnswers = () => {
    const init: Record<string, string> = {};
    questions.forEach((q) => { init[q.id] = ""; });
    setAnswers(init);
    setPhase("answers");
  };

  const analyze = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testType, title, subject, grade, questions, answers, studentName }),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error, "error"); return; }
      setAnalysis(data);
      setPhase("report");
    } catch {
      showToast("分析に失敗しました", "error");
    }
    setAnalyzing(false);
  };

  const saveTest = async () => {
    if (!title || questions.length === 0) { showToast("テスト名と問題が必要です", "info"); return; }
    setSaving(true);
    const { data: test, error } = await supabase
      .from("tests")
      .insert({ title, subject, grade, difficulty: difficulties.join(","), status: "draft", type: testType })
      .select()
      .single();
    if (error || !test) { showToast("保存に失敗しました", "error"); setSaving(false); return; }
    const { error: qErr } = await supabase.from("questions").insert(
      questions.map((q, i) => ({
        test_id: test.id,
        order_index: i,
        type: q.type === "descriptive" ? "short-answer" : q.type,
        text: q.text,
        options: q.options ?? null,
        correct_answer: q.correct_answer ?? null,
        points: q.points ?? 1,
      }))
    );
    if (qErr) { showToast("問題の保存に失敗しました: " + qErr.message, "error"); setSaving(false); return; }
    setSaving(false);
    onSaved();
  };

  const saveReport = async () => {
    if (!analysis) return;
    setSaving(true);
    const { error } = await supabase.from("lesson_reports").insert({
      test_title: title,
      test_subject: subject || null,
      test_grade: grade || null,
      student_name: studentName,
      score: analysis.score,
      total: analysis.total,
      percentage: analysis.rate,
      report_html: analysis.reportHtml,
      status: "draft",
    });
    setSaving(false);
    if (error) { showToast("報告書の保存に失敗しました: " + error.message, "error"); return; }
    setReportSaved(true);
  };

  // ── テスト種別選択 ──
  if (!testType) {
    return (
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-6 text-2xl font-bold text-slate-900">テスト種別を選択</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={() => setTestType("diagnostic")}
            className="rounded-3xl border-2 border-slate-200 bg-white p-8 text-left shadow-sm transition hover:border-indigo-400 hover:shadow-md"
          >
            <div className="mb-3 text-3xl">📊</div>
            <h3 className="text-lg font-bold text-slate-900">学力学習習慣<br />診断分析多層型テスト</h3>
            <p className="mt-2 text-sm text-slate-500">
              複数学年・複数単元を横断し、基礎〜応用の層ごとに出題。解答後に学力診断レポートを生成します。
            </p>
          </button>
          <button
            onClick={() => setTestType("lesson")}
            className="rounded-3xl border-2 border-slate-200 bg-white p-8 text-left shadow-sm transition hover:border-green-400 hover:shadow-md"
          >
            <div className="mb-3 text-3xl">📝</div>
            <h3 className="text-lg font-bold text-slate-900">授業確認テスト<br />（報告書作成用）</h3>
            <p className="mt-2 text-sm text-slate-500">
              授業ごとに実施し、解答後に保護者向け授業報告書を自動生成します。
            </p>
          </button>
        </div>
      </div>
    );
  }

  // ── プレビュー画面 ──
  if (phase === "preview") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">テストプレビュー</h2>
          <div className="flex gap-3">
            <button onClick={() => setPhase("form")}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              編集に戻る
            </button>
            <button onClick={startAnswers}
              className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
              解答を入力する
            </button>
            <button onClick={saveTest} disabled={saving}
              className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? "保存中..." : "下書き保存"}
            </button>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <style>{`
            #test-body { font-family: sans-serif; line-height: 1.8; }
            #test-body h1 { font-size: 1.4rem; font-weight: bold; text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 16px; }
            #test-body h2 { font-size: 1.1rem; font-weight: bold; background: #f1f5f9; padding: 6px 12px; margin: 24px 0 12px; border-left: 4px solid #6366f1; }
            #test-body .question { margin: 16px 0; }
            #test-body .answer-box { border-bottom: 1px solid #94a3b8; min-height: 40px; margin: 8px 0 16px; }
            #test-body table { border-collapse: collapse; width: 100%; margin: 12px 0; }
            #test-body td, #test-body th { border: 1px solid #cbd5e1; padding: 6px 10px; }
            #test-body th { background: #f8fafc; font-weight: bold; }
          `}</style>
          <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(generatedHtml) }} />
        </div>
      </div>
    );
  }

  // ── 解答入力画面 ──
  if (phase === "answers") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">解答を入力</h2>
          <button onClick={() => setPhase("preview")}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            プレビューに戻る
          </button>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          ⚠️ 数字を入力する問題は <strong>半角数字</strong>（1, 2, 3…）で入力してください。全角数字（１、２、３）や漢数字は不正解判定になります。
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm space-y-4">
          <label className="grid gap-1 text-sm text-slate-700">
            生徒名
            <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 outline-none focus:ring-2 focus:ring-green-400"
              placeholder="例：田中太郎" />
          </label>
          <hr className="border-slate-200" />
          {questions.map((q, i) => (
            <div key={q.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">第{i + 1}問</span>
                <DifficultyBadge d={q.difficulty} />
                <span className="text-xs text-slate-400">{q.points}点</span>
              </div>
              <p className="mb-3 text-slate-900">{q.text}</p>
              {q.type === "multiple-choice" && q.options ? (
                <div className="space-y-1">
                  {q.options.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name={q.id} value={opt}
                        checked={answers[q.id] === opt}
                        onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))} />
                      {opt}
                    </label>
                  ))}
                </div>
              ) : (
                <input type="text" value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-400"
                  placeholder={q.difficulty === "basic" || subject === "数学" || subject === "算数" ? "解答を入力（数字は半角で）" : "解答を入力"} />
              )}
            </div>
          ))}
          <button onClick={analyze} disabled={analyzing || !studentName}
            className="w-full rounded-2xl bg-indigo-600 px-6 py-4 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40">
            {analyzing ? "分析中..." : "分析・レポートを生成する"}
          </button>
        </div>
      </div>
    );
  }

  // ── レポート画面 ──
  if (phase === "report" && analysis) {
    const total = analysis.total;
    const earned = analysis.score;
    const rate = analysis.rate;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">
            {testType === "diagnostic" ? "学力診断レポート" : "授業報告書"}
          </h2>
          <div className="flex gap-3">
            <button onClick={() => setPhase("answers")}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              解答入力に戻る
            </button>
            <button onClick={() => window.print()}
              className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              印刷する
            </button>
            {testType === "lesson" && (
              reportSaved ? (
                <span className="rounded-xl bg-green-100 px-4 py-2 text-sm font-semibold text-green-700">
                  保存済み ✓
                </span>
              ) : (
                <button onClick={saveReport} disabled={saving}
                  className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                  {saving ? "保存中..." : "報告書を保存"}
                </button>
              )
            )}
            {testType === "diagnostic" && (
              <button
                onClick={() => {
                  const wrongQuestions = questions
                    .map((q, i) => ({ q, scored: analysis.scored?.[i] }))
                    .filter((x) => x.scored && !x.scored.isCorrect)
                    .map((x) => x.q.text.slice(0, 40));
                  const byDiff = analysis.byDifficulty ?? {};
                  sessionStorage.setItem("diagnosisTestData", JSON.stringify({
                    score: analysis.score,
                    total: analysis.total,
                    subject,
                    weakUnits: wrongQuestions,
                    basic: byDiff.basic ?? null,
                    standard: byDiff.standard ?? null,
                    advanced: byDiff.advanced ?? null,
                  }));
                  window.location.href = "/teacher/dashboard/diagnosis";
                }}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                多層診断を作成
              </button>
            )}
            <button onClick={saveTest} disabled={saving}
              className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
              {saving ? "保存中..." : "テストを保存"}
            </button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <ScoreCard label="得点" value={`${earned}/${total}点`} color="indigo" />
          <ScoreCard label="正答率" value={`${rate}%`} color={rate >= 80 ? "green" : rate >= 60 ? "yellow" : "red"} />
          <ScoreCard label="評価" value={rate >= 90 ? "S" : rate >= 80 ? "A" : rate >= 60 ? "B" : rate >= 40 ? "C" : "D"}
            color={rate >= 80 ? "green" : rate >= 60 ? "yellow" : "red"} />
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <style>{`
            .report-body h2 { font-size: 1.1rem; font-weight: bold; margin: 20px 0 8px; border-left: 4px solid #6366f1; padding-left: 10px; }
            .report-body p, .report-body li { line-height: 1.8; }
            .report-body ul { padding-left: 1.5rem; }
            .report-body table { border-collapse: collapse; width: 100%; margin: 12px 0; }
            .report-body td, .report-body th { border: 1px solid #e2e8f0; padding: 6px 10px; }
          `}</style>
          <div className="report-body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(analysis.reportHtml) }} />
        </div>
      </div>
    );
  }

  // ── 設定フォーム ──
  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">

        {/* テスト種別バッジ */}
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-4 py-1 text-sm font-semibold ${testType === "diagnostic" ? "bg-indigo-100 text-indigo-700" : "bg-green-100 text-green-700"}`}>
            {testType === "diagnostic" ? "📊 診断分析多層型テスト" : "📝 授業確認テスト"}
          </span>
          <button onClick={() => setTestType(null)} className="text-xs text-slate-400 underline">変更</button>
        </div>

        {/* テスト基本情報 */}
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">テスト情報</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-700 sm:col-span-2">
              テスト名
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-green-400"
                placeholder="例：5月実力テスト・数学" />
            </label>
            <label className="grid gap-2 text-sm text-slate-700">
              科目
              <select value={subject} onChange={(e) => { setSubject(e.target.value); setSelectedUnits([]); }}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-green-400">
                {SUBJECT_LIST.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-slate-700">
              主要学年
              <select value={grade} onChange={(e) => { setGrade(e.target.value); setSelectedUnits([]); }}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-green-400">
                {GRADE_ORDER.map((g) => <option key={g}>{g}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-slate-700">
              問題数（合計目安）
              <input type="number" value={count} onChange={(e) => setCount(Number(e.target.value))} min={1} max={30}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-green-400" />
            </label>
          </div>
        </section>

        {/* 単元選択 */}
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">出題単元を選択</h2>
            <span className="text-sm text-slate-500">{selectedUnits.length}単元選択中</span>
          </div>
          <p className="mb-5 text-xs text-slate-400">
            {adjacentGrades[0]} ～ {adjacentGrades[adjacentGrades.length - 1]} の単元から選択できます（一つ上の学年まで対応）
          </p>
          <div className="grid gap-6 sm:grid-cols-3">
            {adjacentGrades.map((g) => {
              const units = getUnitsForGrade(subject, g);
              if (units.length === 0) return null;
              const isMain = g === grade;
              return (
                <div key={g}>
                  <div className={`mb-3 rounded-xl px-3 py-1.5 text-sm font-bold ${isMain ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>
                    {g} {isMain && "（主要）"}
                  </div>
                  <div className="space-y-2">
                    {units.map((u) => {
                      const checked = selectedUnits.some((s) => s.grade === g && s.unit === u.name);
                      return (
                        <label key={u.name} className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                          <input type="checkbox" checked={checked}
                            onChange={() => toggleUnit(g, u.name)}
                            className="mt-0.5 accent-indigo-600" />
                          <span>{u.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 難易度選択 */}
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">難易度を選択（複数可）</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {([
              {
                id: "basic" as Difficulty,
                label: "基礎",
                color: "green",
                desc: "基礎計算・基礎語彙・基礎知識・英文法基礎・基礎漢字\n100%基礎問題",
              },
              {
                id: "standard" as Difficulty,
                label: "標準",
                color: "blue",
                desc: "基礎問題70%\n＋利用問題・英作文30%",
              },
              {
                id: "advanced" as Difficulty,
                label: "応用",
                color: "purple",
                desc: "全問が利用問題・思考力問題・記述問題",
              },
            ] as { id: Difficulty; label: string; color: string; desc: string }[]).map((item) => {
              const active = difficulties.includes(item.id);
              const colorMap: Record<string, string> = {
                green: active ? "border-green-400 bg-green-50" : "border-slate-200",
                blue: active ? "border-blue-400 bg-blue-50" : "border-slate-200",
                purple: active ? "border-purple-400 bg-purple-50" : "border-slate-200",
              };
              return (
                <button key={item.id} onClick={() => toggleDifficulty(item.id)}
                  className={`rounded-2xl border-2 p-4 text-left transition ${colorMap[item.color]}`}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`h-4 w-4 rounded border-2 flex items-center justify-center text-xs ${active ? `border-${item.color}-500 bg-${item.color}-500 text-white` : "border-slate-300"}`}>
                      {active ? "✓" : ""}
                    </span>
                    <span className="font-bold text-slate-800">{item.label}</span>
                  </div>
                  <p className="whitespace-pre-line text-xs text-slate-500">{item.desc}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* 追加指示 */}
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="mb-3 text-xl font-semibold">追加指示（任意）</h2>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-400"
            placeholder="例：選択肢は4択にしてください。図を含む問題を2問入れてください。" />
        </section>

        {/* AI生成フロー */}
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="mb-2 text-xl font-semibold">AI生成フロー</h2>
          <p className="mb-5 text-sm text-slate-500">ステップ順に実行してHTMLテストを完成させてください</p>
          <div className="space-y-3">
            <AiStepButton step="chatgpt" label="ChatGPTで作成" desc="選択単元・難易度に合わせたHTMLテストを生成"
              color="slate" done={stepDone("chatgpt")} num="1"
              disabled={generating || !title || selectedUnits.length === 0 || difficulties.length === 0}
              loading={generating && aiStep === "idle"}
              onClick={() => generate("chatgpt")} />
            <AiStepButton step="gemini" label="GPT-4o-miniで修正" desc="問題の品質・難易度バランスを改善"
              color="blue" done={stepDone("gemini")} num="2"
              disabled={generating || !stepDone("chatgpt")}
              loading={generating && aiStep === "chatgpt"}
              onClick={() => generate("gemini")} />
            <AiStepButton step="claude" label="Claudeで完成" desc="表現・配点・HTMLの最終仕上げ"
              color="purple" done={stepDone("claude")} num="3"
              disabled={generating || !stepDone("gemini")}
              loading={generating && aiStep === "gemini"}
              onClick={() => generate("claude")} />
          </div>
          {generating && (
            <div className="mt-4 text-center text-sm text-slate-500 animate-pulse">
              AIが処理中です。しばらくお待ちください...
            </div>
          )}
          {errorMsg && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-wrap">
              <span className="font-semibold">エラー：</span>{errorMsg}
            </div>
          )}
          {generatedHtml && (
            <button onClick={() => setPhase("preview")}
              className="mt-5 w-full rounded-2xl bg-indigo-600 px-6 py-4 font-semibold text-white transition hover:bg-indigo-700">
              プレビューを表示する
            </button>
          )}
        </section>
      </div>

      {/* サイドバー */}
      <aside className="space-y-4 h-fit">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-slate-950 mb-3">作成の流れ</h3>
          <ol className="space-y-2 text-sm text-slate-600">
            <li className="flex gap-2"><span className="text-slate-400">1.</span>テスト種別を選択</li>
            <li className="flex gap-2"><span className="text-slate-400">2.</span>テスト名・科目・学年を入力</li>
            <li className="flex gap-2"><span className="text-slate-400">3.</span>出題単元をチェック</li>
            <li className="flex gap-2"><span className="text-slate-400">4.</span>難易度を選択</li>
            <li className="flex gap-2"><span className="text-slate-400">5.</span>AI生成（3ステップ）</li>
            <li className="flex gap-2"><span className="text-slate-400">6.</span>HTMLプレビューで確認</li>
            <li className="flex gap-2"><span className="text-slate-400">7.</span>解答を入力して分析</li>
            <li className="flex gap-2"><span className="text-slate-400">8.</span>レポートを印刷・保存</li>
          </ol>
        </div>
        {selectedUnits.length > 0 && (
          <div className="rounded-3xl border border-indigo-200 bg-indigo-50 p-6 shadow-sm">
            <h3 className="mb-3 font-semibold text-indigo-900">選択中の単元</h3>
            <ul className="space-y-1 text-sm text-indigo-700">
              {selectedUnits.map((u) => (
                <li key={`${u.grade}-${u.unit}`} className="flex items-start gap-1">
                  <span className="text-indigo-400">•</span>
                  <span>{u.grade}：{u.unit}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

// ─── 小コンポーネント ──────────────────────────────────
function AiStepButton({ step, label, desc, color, done, num, disabled, loading, onClick }: {
  step: string; label: string; desc: string; color: string;
  done: boolean; num: string; disabled: boolean; loading: boolean; onClick: () => void;
}) {
  const colorMap: Record<string, { border: string; bg: string; btn: string }> = {
    slate: { border: "border-slate-300 bg-slate-50", bg: "border-green-300 bg-green-50", btn: "bg-slate-900 hover:bg-slate-700" },
    blue: { border: "border-slate-200", bg: "border-blue-300 bg-blue-50", btn: "bg-blue-600 hover:bg-blue-700" },
    purple: { border: "border-slate-200", bg: "border-purple-300 bg-purple-50", btn: "bg-purple-600 hover:bg-purple-700" },
  };
  const c = colorMap[color];
  return (
    <div className={`rounded-2xl border p-4 ${done ? c.bg : c.border} ${disabled && !done ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-slate-800">{done ? "✅" : `${num}️⃣`} {label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
        </div>
        <button onClick={onClick} disabled={disabled}
          className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 transition whitespace-nowrap ${c.btn}`}>
          {loading ? "処理中..." : done ? "再実行" : "実行"}
        </button>
      </div>
    </div>
  );
}

function DifficultyBadge({ d }: { d: string }) {
  const map: Record<string, string> = {
    basic: "bg-green-100 text-green-700",
    standard: "bg-blue-100 text-blue-700",
    advanced: "bg-purple-100 text-purple-700",
  };
  const label: Record<string, string> = { basic: "基礎", standard: "標準", advanced: "応用" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[d] ?? "bg-slate-100 text-slate-600"}`}>
      {label[d] ?? d}
    </span>
  );
}

function ScoreCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
    green: "bg-green-50 border-green-200 text-green-700",
    yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
    red: "bg-red-50 border-red-200 text-red-700",
  };
  return (
    <div className={`rounded-2xl border p-6 text-center ${colorMap[color] ?? colorMap.indigo}`}>
      <p className="text-sm font-medium opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}
