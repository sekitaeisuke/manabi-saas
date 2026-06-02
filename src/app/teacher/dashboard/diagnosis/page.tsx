"use client";
import { sanitizeHtml } from "@/lib/sanitize";
import { showToast } from "@/lib/toast";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Student, TestSession } from "@/lib/supabase";
import { GRADE_ORDER, getAdjacentGrades, getUnitsForGrade, SUBJECT_LIST } from "@/lib/curriculum";

// ─── メインページ ─────────────────────────────────────
export default function DiagnosisPage() {
  const [view, setView] = useState<"list" | "history" | "human-check" | "issue-test" | "dist-list" | "q-report">("list");
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedQResponse, setSelectedQResponse] = useState<QResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);

  // フィルター
  const [keyword, setKeyword]       = useState("");
  const [filterGrade, setFilterGrade]   = useState("");
  const [filterSchool, setFilterSchool] = useState("");

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("students").select("*").order("name");
    setStudents(data ?? []);
    setLoading(false);
  }, []);

  const fetchPendingCount = useCallback(async () => {
    const { count } = await supabase
      .from("questionnaire_responses")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    setPendingCount(count ?? 0);
  }, []);

  useEffect(() => {
    fetchStudents();
    fetchPendingCount();
    supabase.from("schools").select("id, name").order("name")
      .then(({ data }) => setSchools(data ?? []));
  }, [fetchStudents, fetchPendingCount]);

  // フィルタリング済み生徒リスト
  const filteredStudents = students.filter((s) => {
    if (filterGrade  && s.grade     !== filterGrade)  return false;
    if (filterSchool && s.school_id !== filterSchool) return false;
    if (keyword) {
      const kw = keyword.toLowerCase();
      if (!s.name.toLowerCase().includes(kw) && !s.grade.toLowerCase().includes(kw)) return false;
    }
    return true;
  });

  const hasFilter = !!(keyword || filterGrade || filterSchool);
  const clearFilter = () => { setKeyword(""); setFilterGrade(""); setFilterSchool(""); };

  const selectStudent = (student: Student) => {
    setSelectedStudent(student);
    setView("history");
  };

  if (view === "human-check") {
    return <HumanCheckView onBack={() => setView("list")} />;
  }

  if (view === "issue-test") {
    return <IssueTestView onBack={() => setView("list")} />;
  }

  if (view === "dist-list") {
    return <DistributionListView onBack={() => setView("list")} />;
  }

  if (view === "q-report" && selectedQResponse) {
    return (
      <QuestionnaireReportView
        response={selectedQResponse}
        onBack={() => { setSelectedQResponse(null); setView("history"); }}
      />
    );
  }

  if (view === "history" && selectedStudent) {
    return (
      <StudentHistory
        student={selectedStudent}
        onOpenQReport={(r) => { setSelectedQResponse(r); setView("q-report"); }}
        onBack={() => { setView("list"); fetchStudents(); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">多層診断システム</h1>
            <p className="mt-1 text-slate-600">学力・学習量・学習の質を多角的に診断します</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setView("issue-test")}
              className="rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700">
              + 多層診断テストを配布
            </button>
            <button onClick={() => setView("dist-list")}
              className="rounded-2xl border border-indigo-300 bg-indigo-50 px-5 py-3 font-semibold text-indigo-700 hover:bg-indigo-100">
              配布管理
            </button>
            <NewStudentButton onCreated={(s) => { setStudents((prev) => [s, ...prev]); }} />
          </div>
        </div>

        {/* 未処理バナー：件数がある時だけ表示 */}
        {pendingCount > 0 ? (
          <button onClick={() => setView("human-check")}
            className="mb-6 w-full rounded-2xl border-2 border-amber-400 bg-amber-50 px-6 py-4 text-left shadow-sm transition hover:bg-amber-100">
            <div className="flex items-center gap-4">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xl font-bold text-white shadow">
                {pendingCount}
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500">
                  <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-75" />
                </span>
              </div>
              <div className="flex-1">
                <p className="font-bold text-amber-900">
                  生徒から {pendingCount} 件の提出があります — ヒューマンチェックが必要です
                </p>
                <p className="mt-0.5 text-sm text-amber-700">
                  ① 内容を確認　② AIで分析　③ 承認　の順に進めてください
                </p>
              </div>
              <span className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 font-semibold text-white shadow-sm">
                今すぐ確認 →
              </span>
            </div>
          </button>
        ) : (
          <button onClick={() => setView("human-check")}
            className="mb-6 w-full rounded-2xl border border-slate-200 bg-white px-6 py-4 text-left shadow-sm transition hover:bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-slate-700">ヒューマンチェック</p>
                <p className="text-xs text-slate-400">現在、未処理の提出はありません</p>
              </div>
              <span className="ml-auto text-xs text-slate-400">→</span>
            </div>
          </button>
        )}

        {/* ─── 検索・フィルター ─── */}
        {!loading && students.length > 0 && (
          <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-3">
              {/* キーワード検索 */}
              <div className="relative flex-1 min-w-[180px]">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="名前で検索..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {/* 学年フィルター */}
              <select
                value={filterGrade}
                onChange={(e) => setFilterGrade(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">全学年</option>
                {GRADE_ORDER.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>

              {/* 教室フィルター */}
              {schools.length > 0 && (
                <select
                  value={filterSchool}
                  onChange={(e) => setFilterSchool(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">全教室</option>
                  {schools.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                </select>
              )}

              {/* クリアボタン */}
              {hasFilter && (
                <button
                  onClick={clearFilter}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 transition"
                >
                  ✕ クリア
                </button>
              )}
            </div>

            {/* 件数表示 */}
            {hasFilter && (
              <p className="mt-2 text-xs text-slate-400">
                {filteredStudents.length} 件 / 全 {students.length} 件
              </p>
            )}
          </div>
        )}

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1,2,3,4,5,6].map((i) => (
              <div key={i} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm animate-pulse space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-slate-200" />
                  <div className="h-5 w-24 rounded bg-slate-200" />
                </div>
                <div className="h-4 w-16 rounded bg-slate-100" />
                <div className="h-3 w-28 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : students.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            生徒が登録されていません。「生徒を追加」から登録してください。
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-3xl mb-3">🔍</p>
            <p className="font-semibold text-slate-700">条件に一致する生徒がいません</p>
            <button onClick={clearFilter}
              className="mt-4 rounded-2xl border border-slate-200 px-5 py-2 text-sm text-slate-500 hover:bg-slate-50 transition">
              フィルターをクリア
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredStudents.map((s) => {
              const schoolName = schools.find((sc) => sc.id === s.school_id)?.name;
              return (
                <button key={s.id} onClick={() => selectStudent(s)}
                  className="rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-2xl">👤</span>
                    <span className="font-bold text-slate-900">{s.name}</span>
                  </div>
                  <p className="text-sm text-slate-500">{s.grade}</p>
                  {schoolName && <p className="mt-1 text-xs text-indigo-500">{schoolName}</p>}
                  <p className="mt-1 text-xs text-slate-400">登録: {s.created_at.slice(0, 10)}</p>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── 生徒追加ボタン ───────────────────────────────────
function NewStudentButton({ onCreated }: { onCreated: (s: Student) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("中1");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name) return;
    setSaving(true);
    const { data, error } = await supabase.from("students").insert({ name, grade }).select().single();
    if (!error && data) { onCreated(data); setOpen(false); setName(""); }
    setSaving(false);
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700">
      + 生徒を追加
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-80 rounded-3xl bg-white p-8 shadow-xl">
        <h3 className="mb-4 text-lg font-bold">生徒を追加</h3>
        <label className="mb-3 grid gap-1 text-sm text-slate-700">
          氏名
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder="例：田中太郎" />
        </label>
        <label className="mb-5 grid gap-1 text-sm text-slate-700">
          学年
          <select value={grade} onChange={(e) => setGrade(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400">
            {GRADE_ORDER.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <button onClick={save} disabled={!name || saving}
            className="flex-1 rounded-xl bg-indigo-600 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
            {saving ? "保存中..." : "追加"}
          </button>
          <button onClick={() => setOpen(false)}
            className="flex-1 rounded-xl border border-slate-300 bg-white py-2 text-slate-700 hover:bg-slate-50">
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 生徒の診断カルテ ─────────────────────────────────
function StudentHistory({ student, onOpenQReport, onBack }: {
  student: Student;
  onOpenQReport: (r: QResponse) => void;
  onBack: () => void;
}) {
  const [qResponses, setQResponses] = useState<QResponse[]>([]);
  const [qLoading, setQLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("questionnaire_responses")
      .select("*")
      .eq("student_name", student.name)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setQResponses((data as QResponse[]) ?? []);
        setQLoading(false);
      });
  }, [student.name]);

  const statusLabel = (s: QResponse["status"]) =>
    s === "pending" ? "未分析" : s === "analyzed" ? "分析済（未承認）" : "承認済";
  const statusColor = (s: QResponse["status"]) =>
    s === "pending" ? "bg-amber-100 text-amber-800"
    : s === "analyzed" ? "bg-blue-100 text-blue-800"
    : "bg-green-100 text-green-800";

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10">
      <main className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">{student.name}（{student.grade}）の診断カルテ</h1>
            <p className="mt-1 text-slate-600">{qLoading ? "読み込み中..." : `${qResponses.length}件のテスト診断`}</p>
          </div>
          <button onClick={onBack}
            className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-slate-700 hover:bg-slate-50">
            生徒一覧
          </button>
        </div>

        {qLoading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中...</div>
        ) : qResponses.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            <p>まだテスト診断の記録がありません。</p>
            <p className="mt-1 text-sm text-slate-400">テストを配布して生徒が受験すると、ここに記録が表示されます。</p>
          </div>
        ) : (
          <div className="space-y-4">
            <TrendChart responses={[...qResponses].reverse()} />
            {qResponses.map((r) => (
              <div key={r.id} className="rounded-3xl border border-indigo-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                    </div>
                    <p className="font-semibold text-slate-900">{r.created_at.slice(0, 10)}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{r.subject} ・ {r.grade}</p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {r.test_percentage != null && <ScorePill label="テスト正答率" score={r.test_percentage} />}
                      {r.habit_score != null && <ScorePill label="学習習慣" score={r.habit_score} />}
                      {r.method_score != null && <ScorePill label="学習法" score={r.method_score} />}
                      {r.skill_score != null && <ScorePill label="学力スキル" score={r.skill_score} />}
                    </div>
                  </div>
                  <button onClick={() => onOpenQReport(r)}
                    className={`shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition shadow-sm ${
                      r.status === "pending"
                        ? "bg-amber-500 text-white hover:bg-amber-600"
                        : "border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    }`}>
                    {r.status === "pending" ? "分析する →" : "レポートを見る"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}


function ScorePill({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? "text-green-700 bg-green-100" : score >= 60 ? "text-blue-700 bg-blue-100" : score >= 40 ? "text-yellow-700 bg-yellow-100" : "text-red-700 bg-red-100";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>
      {label}：{score}
    </span>
  );
}


function TrendChart({ responses }: { responses: QResponse[] }) {
  const points = responses.filter((r) =>
    r.habit_score != null || r.method_score != null || r.verbal_score != null || r.skill_score != null
  );
  if (points.length < 2) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">スコア推移</h3>
        <p className="mt-2 text-xs text-slate-400">2件以上の診断が蓄積されると推移グラフが表示されます。</p>
      </div>
    );
  }

  const width = 720;
  const height = 220;
  const padL = 36;
  const padR = 16;
  const padT = 16;
  const padB = 36;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const xAt = (i: number) =>
    padL + (points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const yAt = (v: number) => padT + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;

  const series = [
    { key: "habit_score",  label: "学習習慣", color: "#6366f1" },
    { key: "method_score", label: "学習方法", color: "#0ea5e9" },
    { key: "verbal_score", label: "言語力",   color: "#10b981" },
    { key: "skill_score",  label: "技能",     color: "#f59e0b" },
  ] as const;

  const pathFor = (key: typeof series[number]["key"]) => {
    const segs: string[] = [];
    let started = false;
    points.forEach((p, i) => {
      const v = p[key];
      if (v == null) { started = false; return; }
      segs.push(`${started ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`);
      started = true;
    });
    return segs.join(" ");
  };

  const dotsFor = (key: typeof series[number]["key"]) =>
    points
      .map((p, i) => ({ v: p[key], i }))
      .filter((d): d is { v: number; i: number } => d.v != null);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">スコア推移</h3>
        <div className="flex flex-wrap gap-3 text-xs">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-3 rounded" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
          {[0, 25, 50, 75, 100].map((g) => (
            <g key={g}>
              <line x1={padL} x2={width - padR} y1={yAt(g)} y2={yAt(g)} stroke="#e2e8f0" strokeDasharray="2 3" />
              <text x={padL - 6} y={yAt(g) + 3} fontSize="9" fill="#94a3b8" textAnchor="end">{g}</text>
            </g>
          ))}
          {points.map((p, i) => (
            <text key={p.id} x={xAt(i)} y={height - 12} fontSize="9" fill="#94a3b8" textAnchor="middle">
              {p.created_at.slice(5, 10)}
            </text>
          ))}
          {series.map((s) => (
            <g key={s.key}>
              <path d={pathFor(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {dotsFor(s.key).map((d) => (
                <circle key={`${s.key}-${d.i}`} cx={xAt(d.i)} cy={yAt(d.v)} r={3} fill={s.color} />
              ))}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}


// ─── 配布管理 ─────────────────────────────────────────────
type SessionWithTest = TestSession & {
  tests: { title: string; subject: string; grade: string; difficulty: string } | null;
};
type TestAssignment = {
  id: string;
  test_session_id: string;
  student_id: string;
  assigned_at: string;
};

function DistributionListView({ onBack }: { onBack: () => void }) {
  const [sessions, setSessions] = useState<SessionWithTest[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<TestAssignment[]>([]);
  const [responses, setResponses] = useState<{ session_id: string; student_name: string; status: string; test_percentage: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [selectingStudent, setSelectingStudent] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [sessRes, stuRes, asnRes, qrRes] = await Promise.all([
      supabase.from("test_sessions").select("*, tests(title, subject, grade, difficulty)").order("created_at", { ascending: false }),
      supabase.from("students").select("*").order("name"),
      supabase.from("test_assignments").select("*"),
      supabase.from("questionnaire_responses").select("session_id, student_name, status, test_percentage"),
    ]);
    setSessions((sessRes.data ?? []) as SessionWithTest[]);
    setStudents(stuRes.data ?? []);
    setAssignments(asnRes.data ?? []);
    setResponses(qrRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const assignStudent = async (sessionId: string) => {
    if (!selectingStudent) return;
    const { data, error } = await supabase.from("test_assignments")
      .insert({ test_session_id: sessionId, student_id: selectingStudent })
      .select().single();
    if (!error && data) setAssignments((prev) => [...prev, data as TestAssignment]);
    setAssigning(null);
    setSelectingStudent("");
  };

  const removeAssignment = async (id: string) => {
    await supabase.from("test_assignments").delete().eq("id", id);
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  };

  const copyUrl = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/test/${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const getResponsesForSession = (sessionId: string) =>
    responses.filter((r) => r.session_id.startsWith(sessionId + ":"));

  const getAssignedStudents = (sessionId: string) => {
    const sessionResponses = getResponsesForSession(sessionId);
    return assignments
      .filter((a) => a.test_session_id === sessionId)
      .map((a) => {
        const student = students.find((s) => s.id === a.student_id);
        const response = student ? sessionResponses.find((r) => r.student_name === student.name) : null;
        return { assignment: a, student, completed: !!response, response };
      });
  };

  const getUnassignedStudents = (sessionId: string) => {
    const assignedIds = assignments.filter((a) => a.test_session_id === sessionId).map((a) => a.student_id);
    return students.filter((s) => !assignedIds.includes(s.id));
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">読み込み中...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10">
      <main className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">配布済みテスト管理</h1>
            <p className="mt-1 text-sm text-slate-500">発行したURLと生徒の受験状況を一覧で管理します</p>
          </div>
          <button onClick={onBack}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            一覧に戻る
          </button>
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            配布済みのテストはありません。「+ 多層診断テストを配布」から作成してください。
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => {
              const url = `${typeof window !== "undefined" ? window.location.origin : ""}/test/${session.url_token}`;
              const assignedStudents = getAssignedStudents(session.id);
              const sessionResponses = getResponsesForSession(session.id);
              const unassigned = getUnassignedStudents(session.id);
              const isExpanded = expandedId === session.id;
              const isAssigning = assigning === session.id;
              const completedCount = assignedStudents.filter((a) => a.completed).length
                + sessionResponses.filter((r) => !assignedStudents.some((a) => a.student?.name === r.student_name)).length;

              return (
                <div key={session.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  {/* カードヘッダー */}
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">{session.tests?.title ?? "テスト"}</p>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {session.tests?.subject} ・ {session.tests?.grade}
                          {session.tests?.difficulty && <> ・ {session.tests.difficulty}</>}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">発行: {session.created_at.slice(0, 10)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">{completedCount}名完了</p>
                          <p className="text-xs text-slate-400">{assignedStudents.length}名割り当て済み</p>
                        </div>
                        <button onClick={() => setExpandedId(isExpanded ? null : session.id)}
                          className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                            isExpanded ? "border-slate-400 bg-slate-100 text-slate-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}>
                          {isExpanded ? "閉じる ▲" : "詳細 ▼"}
                        </button>
                      </div>
                    </div>

                    {/* URL */}
                    <div className="mt-4 flex items-center gap-2">
                      <div className="flex-1 break-all rounded-xl bg-slate-50 px-3 py-2 text-xs font-mono text-indigo-700">{url}</div>
                      <button onClick={() => copyUrl(session.url_token)}
                        className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                          copied === session.url_token ? "bg-green-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"
                        }`}>
                        {copied === session.url_token ? "✓ コピー" : "コピー"}
                      </button>
                    </div>
                  </div>

                  {/* 展開パネル：生徒管理 */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50 p-6">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-700">割り当て済み生徒</p>
                        {!isAssigning && (
                          <button onClick={() => { setAssigning(session.id); setSelectingStudent(""); }}
                            className="rounded-xl border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50">
                            + 生徒を割り当て
                          </button>
                        )}
                      </div>

                      {/* 割り当てフォーム */}
                      {isAssigning && (
                        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-indigo-200 bg-white p-3">
                          <select value={selectingStudent} onChange={(e) => setSelectingStudent(e.target.value)}
                            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400">
                            <option value="">生徒を選択...</option>
                            {unassigned.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}（{s.grade}）</option>
                            ))}
                          </select>
                          <button onClick={() => assignStudent(session.id)} disabled={!selectingStudent}
                            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                            追加
                          </button>
                          <button onClick={() => setAssigning(null)}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                            キャンセル
                          </button>
                        </div>
                      )}

                      {/* 割り当て済み生徒リスト */}
                      {assignedStudents.length === 0 && !isAssigning ? (
                        <p className="text-sm text-slate-400">まだ生徒が割り当てられていません</p>
                      ) : (
                        <div className="space-y-2">
                          {assignedStudents.map(({ assignment, student, completed, response }) => (
                            <div key={assignment.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                                {student?.name.slice(0, 1) ?? "?"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-900">{student?.name ?? "不明"}</p>
                                <p className="text-xs text-slate-400">{student?.grade ?? ""}</p>
                              </div>
                              {completed ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">完了</span>
                                  {response?.test_percentage != null && (
                                    <span className="text-xs text-slate-500">{Math.round(response.test_percentage)}点</span>
                                  )}
                                </div>
                              ) : (
                                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">未受験</span>
                              )}
                              <button onClick={() => removeAssignment(assignment.id)} title="割り当てを解除"
                                className="text-slate-300 transition hover:text-red-400">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 割り当て外で受験した生徒（名前でマッチ） */}
                      {sessionResponses.filter((r) => !assignedStudents.some((a) => a.student?.name === r.student_name)).length > 0 && (
                        <div className="mt-4">
                          <p className="mb-2 text-xs font-semibold text-amber-700">割り当て外で受験した生徒</p>
                          <div className="space-y-2">
                            {sessionResponses
                              .filter((r) => !assignedStudents.some((a) => a.student?.name === r.student_name))
                              .map((r) => (
                                <div key={r.session_id} className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                                    {r.student_name.slice(0, 1)}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-slate-900">{r.student_name}</p>
                                    <p className="text-xs text-slate-400">未割り当て（名前で自動検出）</p>
                                  </div>
                                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">完了</span>
                                  {r.test_percentage != null && (
                                    <span className="text-xs text-slate-500">{Math.round(r.test_percentage)}点</span>
                                  )}
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── 多層診断テスト作成・配布 ─────────────────────────────
type GenStep = "idle" | "step1" | "step2" | "step3" | "saving" | "done";

function IssueTestView({ onBack }: { onBack: () => void }) {
  const [grade, setGrade] = useState("中1");
  const [subject, setSubject] = useState("数学");
  const [count, setCount] = useState(10);
  const [difficulties, setDifficulties] = useState<string[]>(["basic", "standard"]);
  const [selectedUnits, setSelectedUnits] = useState<{ grade: string; unit: string }[]>([]);
  const [step, setStep] = useState<GenStep>("idle");
  const [error, setError] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const adjacentGrades = getAdjacentGrades(grade);

  const toggleUnit = (g: string, unit: string) => {
    setSelectedUnits((prev) => {
      const exists = prev.some((u) => u.grade === g && u.unit === unit);
      return exists ? prev.filter((u) => !(u.grade === g && u.unit === unit)) : [...prev, { grade: g, unit }];
    });
  };

  const toggleDiff = (d: string) =>
    setDifficulties((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);

  const generate = async () => {
    if (difficulties.length === 0) { setError("難易度を1つ以上選択してください"); return; }
    setError(""); setStep("step1");
    const title = `多層診断テスト - ${grade}${subject} - ${new Date().toLocaleDateString("ja-JP")}`;
    const body = { testType: "diagnostic", title, subject, grade, selectedUnits, difficulties, count, instructions: "" };

    try {
      // Step1: ChatGPT
      const r1 = await fetch("/api/generate/chatgpt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d1 = await r1.json();
      if (d1.error) throw new Error(`[Step1] ${d1.error}`);

      // Step2: GPT-4o-mini
      setStep("step2");
      const r2 = await fetch("/api/generate/gemini", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questions: d1.questions, subject, grade, difficulties, instructions: "" }) });
      const d2 = await r2.json();
      if (d2.error) throw new Error(`[Step2] ${d2.error}`);

      // Step3: Claude
      setStep("step3");
      const r3 = await fetch("/api/generate/claude", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questions: d2.questions ?? d1.questions, subject, grade, difficulties, instructions: "" }) });
      const d3 = await r3.json();
      if (d3.error) throw new Error(`[Step3] ${d3.error}`);

      const finalQuestions: { type: string; text: string; options: string[] | null; correct_answer: string; points: number }[] = d3.questions ?? d2.questions ?? d1.questions;

      // Supabaseに保存
      setStep("saving");
      const { data: test, error: testErr } = await supabase
        .from("tests")
        .insert({ title, subject, grade, difficulty: difficulties.join(","), status: "draft", type: "diagnostic" })
        .select().single();
      if (testErr || !test) throw new Error("テストの保存に失敗しました");

      const { error: qErr } = await supabase.from("questions").insert(
        finalQuestions.map((q, i) => ({
          test_id: test.id,
          order_index: i,
          type: q.type === "descriptive" ? "short-answer" : q.type,
          text: q.text,
          options: q.options ?? null,
          correct_answer: q.correct_answer ?? null,
          points: q.points ?? 1,
        }))
      );
      if (qErr) throw new Error("問題の保存に失敗しました: " + qErr.message);

      // URL発行
      const pubRes = await fetch("/api/tests/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ test_id: test.id }) });
      const pubData = await pubRes.json();
      if (pubData.error) throw new Error("URL発行に失敗しました");

      const origin = window.location.origin;
      setPublishedUrl(`${origin}/test/${pubData.token}`);
      setStep("done");
    } catch (e) {
      setError(String(e));
      setStep("idle");
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(publishedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const STEP_LABELS: Record<GenStep, string> = {
    idle: "", step1: "Step 1 / 3　問題を生成中（ChatGPT）...",
    step2: "Step 2 / 3　問題を精査中（GPT-4o-mini）...",
    step3: "Step 3 / 3　最終仕上げ中（Claude）...",
    saving: "Supabaseに保存中...", done: "",
  };

  if (step === "done" && publishedUrl) {
    return (
      <div className="min-h-screen bg-slate-100 px-6 py-10">
        <main className="mx-auto max-w-2xl space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-950">テスト配布URLを発行しました</h1>
            <button onClick={onBack} className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">一覧に戻る</button>
          </div>

          <div className="rounded-3xl border border-green-200 bg-green-50 p-8 shadow-sm text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-semibold text-green-800 text-lg">多層診断テストの準備ができました</p>
            <p className="text-sm text-green-700 mt-1">このURLを生徒に共有してください。テスト完了後に学習アンケートも自動で実施されます。</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-slate-700">配布URL</p>
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
              <p className="flex-1 break-all text-sm text-indigo-700 font-mono">{publishedUrl}</p>
              <button onClick={copyUrl}
                className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition ${copied ? "bg-green-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
                {copied ? "コピー済み ✓" : "コピー"}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-slate-700">生徒の受験フロー</p>
            <div className="space-y-2">
              {[
                "① 生徒がURLを開き、名前を入力してテスト開始",
                "② 学力テスト（AI生成の問題）を回答",
                "③ 学習習慣アンケート（8問）を回答",
                "④ 学習法アンケート（8問）を回答",
                "⑤ 学力スキル自己評価（7問）を回答",
                "⑥ 送信完了 → 講師の「ヒューマンチェック」に届く",
              ].map((s) => (
                <p key={s} className="text-sm text-slate-600">{s}</p>
              ))}
            </div>
          </div>

          <button onClick={() => { setStep("idle"); setPublishedUrl(""); setSelectedUnits([]); }}
            className="w-full rounded-2xl border border-indigo-300 bg-indigo-50 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">
            別のテストを作成する
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10">
      <main className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">多層診断テストを作成・配布</h1>
            <p className="mt-1 text-sm text-slate-500">学力テスト＋学習アンケートをセットにしたURLを発行します</p>
          </div>
          <button onClick={onBack} className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">キャンセル</button>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {/* 基本設定 */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-900">基本設定</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-1 text-sm text-slate-700">
              学年
              <select value={grade} onChange={(e) => { setGrade(e.target.value); setSelectedUnits([]); }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400">
                {GRADE_ORDER.map((g) => <option key={g}>{g}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              教科
              <select value={subject} onChange={(e) => { setSubject(e.target.value); setSelectedUnits([]); }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400">
                {SUBJECT_LIST.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              問題数
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400">
                {[5, 8, 10, 12, 15].map((n) => <option key={n} value={n}>{n}問</option>)}
              </select>
            </label>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-sm text-slate-700">難易度</p>
            <div className="flex gap-3">
              {[
                { key: "basic", label: "基礎", color: "border-green-400 bg-green-100 text-green-700" },
                { key: "standard", label: "標準", color: "border-blue-400 bg-blue-100 text-blue-700" },
                { key: "advanced", label: "応用", color: "border-purple-400 bg-purple-100 text-purple-700" },
              ].map((d) => (
                <button key={d.key} onClick={() => toggleDiff(d.key)}
                  className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition ${difficulties.includes(d.key) ? d.color : "border-slate-200 bg-white text-slate-400"}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 単元選択 */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">出題単元（任意）</h2>
            <span className="text-xs text-slate-400">未選択の場合はAIが自動選択します</span>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            {adjacentGrades.map((g: string) => {
              const units = getUnitsForGrade(subject, g);
              if (!units || units.length === 0) return null;
              return (
                <div key={g}>
                  <p className="mb-2 text-xs font-semibold text-slate-500">{g}</p>
                  <div className="space-y-1">
                    {units.slice(0, 8).map((u) => {
                      const checked = selectedUnits.some((x) => x.grade === g && x.unit === u.name);
                      return (
                        <label key={u.name} className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                          <input type="checkbox" checked={checked} onChange={() => toggleUnit(g, u.name)}
                            className="accent-indigo-600" />
                          {u.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 生成ボタン */}
        {step !== "idle" ? (
          <div className="rounded-3xl border border-indigo-200 bg-indigo-50 p-8 text-center shadow-sm">
            <div className="flex justify-center mb-4">
              <span className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            </div>
            <p className="font-semibold text-indigo-700">{STEP_LABELS[step]}</p>
            <p className="mt-1 text-sm text-indigo-500">AIが問題を生成しています。しばらくお待ちください...</p>
          </div>
        ) : (
          <button onClick={generate}
            className="w-full rounded-2xl bg-indigo-600 py-4 font-semibold text-white shadow-sm hover:bg-indigo-700 transition">
            AIで多層診断テストを生成してURLを発行する →
          </button>
        )}
      </main>
    </div>
  );
}

// ─── ヒューマンチェック ─────────────────────────────────
type QResponse = {
  id: string;
  session_id: string;
  student_name: string;
  grade: string | null;
  subject: string | null;
  test_score: number | null;
  test_total: number | null;
  test_percentage: number | null;
  section_a: Record<string, number>;
  section_b: Record<string, number>;
  section_c: Record<string, number>;
  status: "pending" | "analyzed" | "approved";
  habit_score: number | null;
  method_score: number | null;
  verbal_score: number | null;
  skill_score: number | null;
  report_html: string | null;
  teacher_notes: string | null;
  ai_analysis: string | null;
  created_at: string;
};

function HumanCheckView({ onBack }: { onBack: () => void }) {
  const [responses, setResponses] = useState<QResponse[]>([]);
  const [selected, setSelected] = useState<QResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchResponses = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("questionnaire_responses")
      .select("*")
      .order("created_at", { ascending: false });
    setResponses((data as QResponse[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchResponses(); }, [fetchResponses]);

  if (selected) {
    return (
      <QuestionnaireReportView
        response={selected}
        onBack={() => { setSelected(null); fetchResponses(); }}
      />
    );
  }

  const statusLabel = (s: QResponse["status"]) =>
    s === "pending" ? "未分析" : s === "analyzed" ? "分析済（未承認）" : "承認済";
  const statusColor = (s: QResponse["status"]) =>
    s === "pending" ? "bg-amber-100 text-amber-800" : s === "analyzed" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800";

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10">
      <main className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">ヒューマンチェック</h1>
            <p className="mt-1 text-slate-600">生徒が提出したアンケートをAI分析し、確認・承認を行います</p>
          </div>
          <button onClick={onBack}
            className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-slate-700 hover:bg-slate-50">
            多層診断トップ
          </button>
        </div>

        {/* 3ステップガイド */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          {[
            { num: "①", title: "内容を確認", desc: "生徒の回答・テスト結果を開く", color: "bg-slate-100 text-slate-600 border-slate-200" },
            { num: "②", title: "AIで分析", desc: "ボタンを押してレポートを自動生成", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
            { num: "③", title: "承認する", desc: "確認後に「承認」を押して完了", color: "bg-green-50 text-green-700 border-green-200" },
          ].map((s) => (
            <div key={s.num} className={`rounded-2xl border p-4 ${s.color}`}>
              <p className="text-lg font-bold">{s.num} {s.title}</p>
              <p className="mt-1 text-xs opacity-80">{s.desc}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">読み込み中...</div>
        ) : responses.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            提出されたアンケートはありません。生徒がテストを提出すると、ここに表示されます。
          </div>
        ) : (
          <div className="space-y-3">
            {responses.map((r) => (
              <div key={r.id}
                className={`rounded-3xl border bg-white p-6 shadow-sm transition hover:shadow-md ${
                  r.status === "pending" ? "border-amber-300" : "border-slate-200"
                }`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-lg font-bold text-slate-900">{r.student_name}</span>
                      <span className="text-sm text-slate-500">{r.grade} / {r.subject}</span>
                      <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${statusColor(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
                      <span>提出日: {r.created_at.slice(0, 10)}</span>
                      {r.test_percentage != null && (
                        <span className="font-semibold text-indigo-700">テスト正答率: {r.test_percentage}%</span>
                      )}
                      {r.habit_score != null && (
                        <>
                          <ScorePill label="習慣" score={r.habit_score} />
                          <ScorePill label="学習法" score={r.method_score ?? 0} />
                          <ScorePill label="スキル" score={r.skill_score ?? 0} />
                        </>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setSelected(r)}
                    className={`rounded-xl px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition shadow-sm ${
                      r.status === "pending"
                        ? "bg-amber-500 text-white hover:bg-amber-600"
                        : "border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    }`}>
                    {r.status === "pending" ? "① 確認する →" : r.status === "analyzed" ? "③ 承認する →" : "確認・編集する"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function QuestionnaireReportView({ response, onBack }: { response: QResponse; onBack: () => void }) {
  const [generating, setGenerating] = useState(false);
  const [reportHtml, setReportHtml] = useState(response.report_html ?? "");
  const [notes, setNotes] = useState(response.teacher_notes ?? "");
  const [scores, setScores] = useState({
    habitScore: response.habit_score,
    methodScore: response.method_score,
    verbalScore: response.verbal_score,
    skillScore: response.skill_score,
  });
  const [status, setStatus] = useState(response.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const analyze = async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/diagnosis/from-questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: response.session_id }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setReportHtml(data.reportHtml);
      setScores({
        habitScore: data.habitScore,
        methodScore: data.methodScore,
        verbalScore: data.verbalScore,
        skillScore: data.skillScore,
      });
      setStatus("analyzed");
    } catch (e) {
      setError("エラー: " + String(e));
    } finally {
      setGenerating(false);
    }
  };

  const save = async (newStatus?: QResponse["status"]) => {
    setSaving(true);
    const nextStatus = newStatus ?? status;
    await supabase.from("questionnaire_responses").update({
      report_html: reportHtml,
      teacher_notes: notes,
      status: nextStatus,
    }).eq("session_id", response.session_id);
    if (newStatus) setStatus(newStatus);
    setSaving(false);
  };

  const approve = async () => {
    await save("approved");
    showToast("承認しました", "success");
  };

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10">
      <main className="mx-auto max-w-4xl space-y-6">
        {/* ヘッダー */}
        <div className="no-print flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-950">
              {response.student_name}（{response.grade} / {response.subject}）のアンケート診断
            </h1>
            <p className="mt-1 text-sm text-slate-500">提出日: {response.created_at.slice(0, 10)}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={onBack}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              一覧に戻る
            </button>
            {(status === "analyzed" || status === "approved") && reportHtml && (
              <button
                onClick={() => {
                  sessionStorage.setItem("karteFromDiagnosis", JSON.stringify({
                    studentName: response.student_name,
                    grade: response.grade || "",
                    subject: response.subject || "",
                    testScore: response.test_score,
                    testTotal: response.test_total,
                    testPercentage: response.test_percentage,
                    habitScore: scores.habitScore,
                    methodScore: scores.methodScore,
                    aiAnalysis: response.ai_analysis,
                    sessionId: response.session_id,
                  }));
                  window.location.href = "/teacher/dashboard/karte?create=1";
                }}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
                カルテを作成
              </button>
            )}
            {reportHtml && (
              <button onClick={() => window.print()}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                A4印刷
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {/* 学力テストAI分析 */}
        {response.ai_analysis && (
          <div className="no-print rounded-3xl border border-indigo-200 bg-indigo-50 p-6 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-full bg-indigo-600 px-3 py-0.5 text-xs font-semibold text-white">AI自動分析</span>
              <p className="font-semibold text-indigo-900">学力テスト 解答分析</p>
              {response.test_percentage != null && (
                <span className="ml-auto text-sm font-semibold text-indigo-700">
                  {response.test_score}/{response.test_total}点（{response.test_percentage}%）
                </span>
              )}
            </div>
            <pre className="whitespace-pre-wrap text-sm leading-7 text-slate-700 font-sans">{response.ai_analysis}</pre>
          </div>
        )}

        {/* スコアと分析ボタン */}
        <div className="no-print rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-900 mb-3">テスト・アンケート情報</p>
              <div className="flex flex-wrap gap-3 text-sm">
                {response.test_percentage != null && (
                  <ScorePill label="テスト正答率" score={response.test_percentage} />
                )}
                {scores.habitScore != null && <ScorePill label="学習習慣" score={scores.habitScore} />}
                {scores.methodScore != null && <ScorePill label="学習法" score={scores.methodScore} />}
                {scores.verbalScore != null && <ScorePill label="言語化力" score={scores.verbalScore} />}
                {scores.skillScore != null && <ScorePill label="学力スキル" score={scores.skillScore} />}
              </div>
            </div>
            {status === "pending" ? (
              <button onClick={analyze} disabled={generating}
                className="rounded-2xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 whitespace-nowrap">
                {generating ? "AI分析中..." : "AI分析を実行"}
              </button>
            ) : (
              <button onClick={analyze} disabled={generating}
                className="rounded-2xl border border-indigo-300 bg-indigo-50 px-6 py-3 text-sm text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 whitespace-nowrap">
                {generating ? "再分析中..." : "AI再分析"}
              </button>
            )}
          </div>
          {generating && (
            <div className="mt-4 flex items-center gap-3 text-indigo-700">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              <span className="text-sm">AIが多層診断レポートを生成しています（30秒〜1分）...</span>
            </div>
          )}
        </div>

        {/* 講師メモ */}
        {(reportHtml || status !== "pending") && (
          <div className="no-print rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <h3 className="mb-3 font-semibold text-amber-900">講師メモ・補足</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="指導方針、観察メモ、保護者への補足など..."
              className="w-full rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-400"
            />
            <div className="mt-3 flex gap-3 justify-end">
              <button onClick={() => save()} disabled={saving}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                {saving ? "保存中..." : "メモを保存"}
              </button>
              {status !== "approved" && reportHtml && (
                <button onClick={approve} disabled={saving}
                  className="rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40">
                  承認して完了
                </button>
              )}
              {status === "approved" && (
                <span className="flex items-center gap-1 rounded-xl bg-green-100 px-5 py-2 text-sm font-semibold text-green-700">
                  ✓ 承認済
                </span>
              )}
            </div>
          </div>
        )}

        {/* AIレポート */}
        {reportHtml && (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <style>{`
              #diagnosis-report h2 { font-size:1.05rem; font-weight:700; margin:20px 0 8px; border-left:4px solid #6366f1; padding-left:10px; color:#1e293b; }
              #diagnosis-report h3 { font-size:0.95rem; font-weight:600; margin:14px 0 6px; color:#334155; }
              #diagnosis-report p, #diagnosis-report li { line-height:1.8; font-size:0.9rem; color:#475569; }
              #diagnosis-report ul { padding-left:1.5rem; }
              #diagnosis-report table { border-collapse:collapse; width:100%; margin:10px 0; font-size:0.875rem; }
              #diagnosis-report td, #diagnosis-report th { border:1px solid #e2e8f0; padding:6px 10px; }
              #diagnosis-report th { background:#f8fafc; font-weight:600; }
              .score-green { color:#16a34a; font-weight:700; }
              .score-blue { color:#2563eb; font-weight:700; }
              .score-yellow { color:#d97706; font-weight:700; }
              .score-red { color:#dc2626; font-weight:700; }
              @media print {
                @page { size: A4 portrait; margin: 15mm; }
                .no-print { display: none !important; }
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                #diagnosis-report { font-size: 10pt; }
              }
            `}</style>
            <div id="diagnosis-report" dangerouslySetInnerHTML={{ __html: sanitizeHtml(reportHtml) }} />
          </div>
        )}

        {/* おすすめ学校 */}
        {(status === "analyzed" || status === "approved") && (
          <SchoolRecommendPanel
            testPercentage={response.test_percentage}
            habitScore={scores.habitScore}
            skillScore={scores.skillScore}
            grade={response.grade}
          />
        )}
      </main>
    </div>
  );
}

// ─── おすすめ高校パネル ───────────────────────────────────
type RecommendedSchool = {
  id: string;
  name: string;
  school_type: string;
  school_level: string;
  prefecture: string;
  city: string | null;
  deviation_value_min: number | null;
  deviation_value_max: number | null;
  features: string[] | null;
  description: string | null;
  appeal_points: string | null;
  website: string | null;
};

function SchoolRecommendPanel({
  testPercentage,
  habitScore,
  skillScore,
  grade,
}: {
  testPercentage: number | null;
  habitScore: number | null;
  skillScore: number | null;
  grade: string | null;
}) {
  const [schools, setSchools] = useState<RecommendedSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [estimatedCenter, setEstimatedCenter] = useState<number | null>(null);
  const [targetLevels, setTargetLevels] = useState<string[]>([]);
  const [prefFilter, setPrefFilter] = useState("all");

  const isJuniorTarget = grade?.startsWith("小") ?? false;

  useEffect(() => {
    const params = new URLSearchParams();
    if (testPercentage != null) params.set("test_percentage", String(testPercentage));
    if (habitScore     != null) params.set("habit_score",     String(habitScore));
    if (skillScore     != null) params.set("skill_score",     String(skillScore));
    if (grade          != null) params.set("grade",           grade);

    fetch(`/api/schools/recommend?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setSchools(data.schools ?? []);
        setEstimatedCenter(data.center ?? null);
        setTargetLevels(data.targetLevels ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [testPercentage, habitScore, skillScore, grade]);

  const filtered = prefFilter === "all"
    ? schools
    : schools.filter((s) => s.prefecture === prefFilter);

  const prefectures = [...new Set(schools.map((s) => s.prefecture))].sort();

  return (
    <div className="rounded-3xl border border-indigo-200 bg-indigo-50 p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-indigo-600 px-3 py-0.5 text-xs font-semibold text-white">
              {isJuniorTarget ? "おすすめ中学校" : "おすすめ高校"}
            </span>
            {estimatedCenter && (
              <span className="text-sm text-indigo-700 font-semibold">推定偏差値帯：{estimatedCenter - 6}〜{estimatedCenter + 6}</span>
            )}
            {targetLevels.length > 0 && (
              <span className="text-xs text-indigo-500">
                （{targetLevels.join("・")}）
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-indigo-600">
            {isJuniorTarget
              ? "診断スコアをもとにマッチした受験中学校を表示しています"
              : "診断スコアをもとにマッチした高校を表示しています"}
          </p>
        </div>
        {prefectures.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setPrefFilter("all")}
              className={`rounded-xl px-3 py-1 text-xs font-semibold transition ${prefFilter === "all" ? "bg-indigo-600 text-white" : "border border-indigo-300 bg-white text-indigo-600 hover:bg-indigo-50"}`}>
              全都県
            </button>
            {prefectures.map((p) => (
              <button key={p} onClick={() => setPrefFilter(p)}
                className={`rounded-xl px-3 py-1 text-xs font-semibold transition ${prefFilter === p ? "bg-indigo-600 text-white" : "border border-indigo-300 bg-white text-indigo-600 hover:bg-indigo-50"}`}>
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-indigo-600 text-sm">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          マッチング中...
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-indigo-600">
          {schools.length === 0
            ? "現在、登録されている高校データがありません。「校舎管理」→「高校データベース」から学校を登録してください。"
            : "選択した都県に該当する学校がありません。"}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((s) => (
            <div key={s.id} className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm">{s.name}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                      s.school_type === "公立" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                    }`}>{s.school_type}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {s.prefecture} {s.city}
                    {s.deviation_value_min && s.deviation_value_max && (
                      <span className="ml-2 font-semibold text-indigo-700">偏差値 {s.deviation_value_min}〜{s.deviation_value_max}</span>
                    )}
                  </p>
                  {s.features && s.features.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {s.features.slice(0, 3).map((f) => (
                        <span key={f} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600">{f}</span>
                      ))}
                    </div>
                  )}
                  {s.appeal_points && (
                    <p className="mt-1.5 text-xs text-slate-600 line-clamp-2">{s.appeal_points}</p>
                  )}
                </div>
                {s.website && (
                  <a href={s.website} target="_blank"
                    className="shrink-0 rounded-lg border border-indigo-200 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50">
                    公式サイト
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {schools.length > 0 && (
        <p className="mt-4 text-xs text-indigo-500">
          ※ 偏差値・学校情報は参考値です。実際の入試要件は各校の公式情報をご確認ください。
          学校掲載数: {schools.length}件（フィルター適用後: {filtered.length}件）
        </p>
      )}
    </div>
  );
}

function RadarChart({ labels, values, maxValue = 4, size = 220, color = "#6366f1" }: {
  labels: string[]; values: number[]; maxValue?: number; size?: number; color?: string;
}) {
  const n = labels.length;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.62;
  const labelR = (size / 2) * 0.88;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, rad: number) => ({
    x: cx + rad * Math.cos(angle(i)),
    y: cy + rad * Math.sin(angle(i)),
  });

  const gridLevels = [1, 2, 3, 4].slice(0, maxValue);
  const dataPath = values
    .map((v, i) => { const p = pt(i, (Math.min(v, maxValue) / maxValue) * r); return `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`; })
    .join(" ") + " Z";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridLevels.map((level) => {
        const gr = (level / maxValue) * r;
        const gPath = Array.from({ length: n }, (_, i) => pt(i, gr))
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
        return <path key={level} d={gPath} fill="none" stroke="#e2e8f0" strokeWidth="1" />;
      })}
      {Array.from({ length: n }, (_, i) => {
        const outer = pt(i, r);
        return <line key={i} x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke="#e2e8f0" strokeWidth="1" />;
      })}
      <path d={dataPath} fill={color} fillOpacity="0.2" stroke={color} strokeWidth="2" />
      {values.map((v, i) => {
        const p = pt(i, (Math.min(v, maxValue) / maxValue) * r);
        return <circle key={i} cx={p.x} cy={p.y} r="4" fill={color} />;
      })}
      {labels.map((label, i) => {
        const p = pt(i, labelR);
        return (
          <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fontSize="10" fill="#475569" fontFamily="sans-serif">
            {label}
          </text>
        );
      })}
    </svg>
  );
}
