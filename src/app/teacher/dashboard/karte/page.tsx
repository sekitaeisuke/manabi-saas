"use client";
import { sanitizeHtml } from "@/lib/sanitize";
import { showToast } from "@/lib/toast";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Textbook, LearningPlan } from "@/lib/supabase";
import { GRADE_ORDER, SUBJECT_LIST } from "@/lib/curriculum";

type View = "list" | "create" | "detail" | "textbooks";

type DiagnosisPreset = {
  studentName: string;
  grade: string;
  subject: string;
  testScore: number | null;
  testTotal: number | null;
  testPercentage: number | null;
  habitScore: number | null;
  methodScore: number | null;
  aiAnalysis: string | null;
  sessionId: string;
};

// 生徒名から一定のアバターカラーを返す
const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-rose-500",
  "bg-amber-500", "bg-indigo-500", "bg-teal-500", "bg-orange-500",
];
function avatarColor(name: string) {
  return AVATAR_COLORS[(name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];
}

// ─── エントリ ─────────────────────────────────────────────
export default function KartePage() {
  return <Suspense><KartePageInner /></Suspense>;
}

function KartePageInner() {
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>(
    searchParams.get("create") === "1" ? "create" : "list"
  );
  const [plans, setPlans] = useState<LearningPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<LearningPlan | null>(null);
  const [search, setSearch] = useState("");

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("learning_plans")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setTableError(true);
    } else {
      setPlans((data as LearningPlan[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  if (view === "textbooks") return <TextbookManager onBack={() => setView("list")} />;
  if (view === "create") return (
    <CreateKarteFlow
      onSaved={() => { fetchPlans(); setView("list"); }}
      onBack={() => setView("list")}
    />
  );
  if (view === "detail" && selectedPlan) return (
    <KarteDetail
      plan={selectedPlan}
      onBack={() => { setSelectedPlan(null); setView("list"); }}
      onUpdated={fetchPlans}
    />
  );

  // ── 一覧 ───────────────────────────────────────────────
  const filtered = plans.filter((p) =>
    !search || p.student_name.includes(search) || p.grade.includes(search) || p.subject.includes(search)
  );

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl">
        {/* ヘッダー */}
        <div className="mb-7 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">カルテ一覧</h1>
            <p className="mt-0.5 text-sm text-slate-500">生徒ごとの3ヶ月学習方針書</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView("textbooks")}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
              テキスト管理
            </button>
            <button onClick={() => setView("create")}
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
              + 新規作成
            </button>
          </div>
        </div>

        {/* テーブル未作成エラー */}
        {tableError && (
          <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <p className="mb-2 font-semibold text-amber-900">Supabaseにテーブルが必要です</p>
            <p className="mb-3 text-sm text-amber-800">Supabase の SQL エディタで以下を実行してください：</p>
            <pre className="rounded-xl bg-amber-100 p-4 text-xs text-amber-900 overflow-x-auto whitespace-pre-wrap">{`CREATE TABLE textbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL, grade text NOT NULL, name text NOT NULL,
  publisher text, description text, type text DEFAULT 'メインテキスト',
  created_at timestamptz DEFAULT now()
);
CREATE TABLE learning_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name text NOT NULL, grade text NOT NULL, subject text NOT NULL,
  test_score integer, test_total integer, test_percentage integer,
  diagnosis_session_id text, selected_textbooks jsonb,
  plan_html text NOT NULL, teacher_notes text,
  status text DEFAULT 'draft', created_at timestamptz DEFAULT now()
);`}</pre>
          </div>
        )}

        {/* 検索 */}
        {plans.length > 0 && (
          <div className="mb-5">
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="生徒名・学年・科目で検索..."
              className="w-full max-w-sm rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>
        )}

        {/* カード一覧 */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1,2,3,4,5,6].map((i) => (
              <div key={i} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-200 shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 w-24 bg-slate-200 rounded" />
                    <div className="h-3 w-16 bg-slate-100 rounded" />
                  </div>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded" />
                <div className="h-3 w-3/4 bg-slate-100 rounded" />
                <div className="flex gap-2 pt-1">
                  <div className="h-6 w-16 rounded-full bg-slate-100" />
                  <div className="h-6 w-20 rounded-full bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white py-20 text-center text-slate-500">
            <p className="text-5xl mb-4">📋</p>
            <p className="font-semibold text-slate-700">カルテがまだありません</p>
            <p className="mt-1 text-sm">多層診断の「カルテを作成」ボタン、または「新規作成」から作成できます</p>
            <button onClick={() => setView("create")}
              className="mt-5 rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-violet-700">
              + 新規作成
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((plan) => {
              const initial = plan.student_name.charAt(0);
              const bg = avatarColor(plan.student_name);
              return (
                <button
                  key={plan.id}
                  onClick={() => { setSelectedPlan(plan); setView("detail"); }}
                  className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-violet-300 hover:shadow-md"
                >
                  {/* カードヘッダー */}
                  <div className={`flex items-center gap-3 px-5 py-4 ${bg} bg-opacity-10`}>
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${bg} text-xl font-bold text-white shadow-sm`}>
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-slate-900 text-base">{plan.student_name}</p>
                      <p className="text-xs text-slate-500">{plan.grade} ・ {plan.subject}</p>
                    </div>
                    {plan.test_percentage != null && (
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                        plan.test_percentage >= 80 ? "bg-green-100 text-green-700" :
                        plan.test_percentage >= 60 ? "bg-blue-100 text-blue-700" :
                        "bg-red-100 text-red-700"
                      }`}>{plan.test_percentage}%</span>
                    )}
                  </div>
                  {/* カードボディ */}
                  <div className="flex flex-1 items-center justify-between px-5 py-3">
                    <p className="text-xs text-slate-400">{plan.created_at.slice(0, 10)}</p>
                    <div className="flex items-center gap-2">
                      {plan.status === "shared" && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">共有済</span>
                      )}
                      <span className="text-xs font-medium text-violet-600 group-hover:underline">カルテを開く →</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── カルテ詳細（読みやすさ最優先） ──────────────────────────
function KarteDetail({ plan, onBack, onUpdated }: {
  plan: LearningPlan;
  onBack: () => void;
  onUpdated: () => void;
}) {
  const [notes, setNotes] = useState(plan.teacher_notes ?? "");
  const [status, setStatus] = useState(plan.status);
  const [saving, setSaving] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const bg = avatarColor(plan.student_name);

  const saveNotes = async () => {
    setSaving(true);
    await supabase.from("learning_plans").update({ teacher_notes: notes }).eq("id", plan.id);
    setSaving(false);
    onUpdated();
  };
  const toggleShare = async () => {
    const next = status === "draft" ? "shared" : "draft";
    setSaving(true);
    await supabase.from("learning_plans").update({ status: next }).eq("id", plan.id);
    setStatus(next);
    setSaving(false);
    onUpdated();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 固定ヘッダー */}
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <button onClick={onBack}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          一覧
        </button>

        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${bg} text-sm font-bold text-white`}>
          {plan.student_name.charAt(0)}
        </div>
        <div className="flex-1">
          <span className="font-bold text-slate-900">{plan.student_name}</span>
          <span className="ml-2 text-sm text-slate-400">{plan.grade} ・ {plan.subject} ・ {plan.created_at.slice(0, 10)}</span>
        </div>

        {plan.test_percentage != null && (
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${
            plan.test_percentage >= 80 ? "bg-green-100 text-green-700" :
            plan.test_percentage >= 60 ? "bg-blue-100 text-blue-700" :
            "bg-red-100 text-red-700"
          }`}>テスト {plan.test_percentage}%</span>
        )}

        <button onClick={() => setNotesOpen(!notesOpen)}
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100">
          講師メモ
        </button>
        <button onClick={toggleShare} disabled={saving}
          className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${
            status === "shared"
              ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          } disabled:opacity-40`}>
          {status === "shared" ? "✓ 共有済" : "共有する"}
        </button>
        <button onClick={() => window.print()}
          className="rounded-xl bg-slate-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-900">
          印刷
        </button>
      </div>

      {/* 講師メモ（展開式） */}
      {notesOpen && (
        <div className="no-print border-b border-amber-200 bg-amber-50 px-6 py-4">
          <div className="mx-auto max-w-3xl flex gap-3 items-start">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="指導メモ・補足を記入..."
              className="flex-1 rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-400" />
            <button onClick={saveNotes} disabled={saving}
              className="shrink-0 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40">
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
          {notes && (
            <div className="mx-auto mt-3 max-w-3xl rounded-xl bg-white px-4 py-3 text-sm text-slate-700 border border-amber-200">
              <p className="text-xs text-amber-600 mb-1">保存済みメモ</p>
              <p className="whitespace-pre-wrap">{notes}</p>
            </div>
          )}
        </div>
      )}

      {/* カルテ本体 */}
      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* 使用テキスト */}
        {plan.selected_textbooks && plan.selected_textbooks.length > 0 && (
          <div className="no-print mb-6 flex flex-wrap gap-2">
            <span className="text-xs text-slate-400 self-center">使用テキスト：</span>
            {plan.selected_textbooks.map((t) => (
              <span key={t.id} className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700">
                {t.name}
              </span>
            ))}
          </div>
        )}

        {/* メイン HTML */}
        <div className="rounded-3xl bg-white px-10 py-10 shadow-sm border border-slate-100">
          <style>{`
            #learning-plan { font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans JP", sans-serif; }
            #learning-plan h1 { font-size:1.4rem; font-weight:800; color:#1e1b4b; margin-bottom:20px; padding-bottom:10px; border-bottom:2px solid #7c3aed; }
            #learning-plan h2 { font-size:1.05rem; font-weight:700; margin:28px 0 10px; padding:8px 14px; background:#f5f3ff; border-left:4px solid #7c3aed; color:#3730a3; border-radius:0 8px 8px 0; }
            #learning-plan h3 { font-size:0.95rem; font-weight:600; margin:18px 0 6px; color:#1e293b; }
            #learning-plan p { line-height:1.9; font-size:0.9rem; color:#374151; margin:6px 0; }
            #learning-plan li { line-height:1.9; font-size:0.9rem; color:#374151; }
            #learning-plan ul { padding-left:1.6rem; margin:6px 0; }
            #learning-plan ol { padding-left:1.6rem; margin:6px 0; }
            #learning-plan table { border-collapse:collapse; width:100%; margin:12px 0; font-size:0.875rem; border-radius:8px; overflow:hidden; }
            #learning-plan td, #learning-plan th { border:1px solid #e5e7eb; padding:8px 12px; }
            #learning-plan th { background:#f5f3ff; font-weight:700; color:#3730a3; }
            #learning-plan tr:nth-child(even) { background:#fafafa; }
            #learning-plan strong { color:#1e293b; }
            @media print {
              @page { size: A4 portrait; margin: 18mm 15mm; }
              .no-print { display: none !important; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              #learning-plan { font-size: 10.5pt; }
              #learning-plan h2 { page-break-after: avoid; }
            }
          `}</style>
          <div id="learning-plan" dangerouslySetInnerHTML={{ __html: sanitizeHtml(plan.plan_html) }} />
        </div>
      </div>
    </div>
  );
}

// ─── カルテ作成フロー ──────────────────────────────────────
function CreateKarteFlow({ onSaved, onBack }: { onSaved: () => void; onBack: () => void }) {
  const [preset, setPreset] = useState<DiagnosisPreset | null>(null);
  const [studentName, setStudentName] = useState("");
  const [grade, setGrade] = useState("中1");
  const [subject, setSubject] = useState("数学");
  const [testScore, setTestScore] = useState("");
  const [testTotal, setTestTotal] = useState("");
  const [habitScore, setHabitScore] = useState("");
  const [methodScore, setMethodScore] = useState("");
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [diagnosisSessionId, setDiagnosisSessionId] = useState<string | null>(null);

  const [allTextbooks, setAllTextbooks] = useState<Textbook[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [genStep, setGenStep] = useState(0); // 0=idle 1=chatgpt 2=gemini 3=claude 4=done
  const [planHtml, setPlanHtml] = useState("");
  const [genError, setGenError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("karteFromDiagnosis");
    if (raw) {
      try {
        const data: DiagnosisPreset = JSON.parse(raw);
        setPreset(data);
        setStudentName(data.studentName);
        setGrade(data.grade || "中1");
        setSubject(data.subject || "数学");
        setTestScore(data.testScore != null ? String(data.testScore) : "");
        setTestTotal(data.testTotal != null ? String(data.testTotal) : "");
        setHabitScore(data.habitScore != null ? String(data.habitScore) : "");
        setMethodScore(data.methodScore != null ? String(data.methodScore) : "");
        setAiAnalysis(data.aiAnalysis ?? "");
        setDiagnosisSessionId(data.sessionId);
        sessionStorage.removeItem("karteFromDiagnosis");
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    supabase.from("textbooks").select("*").order("subject").order("name")
      .then(({ data }) => setAllTextbooks((data as Textbook[]) ?? []));
  }, []);

  const filteredTextbooks = allTextbooks.filter(
    (t) => t.subject === subject || t.grade === grade || t.grade === "全学年"
  );

  const toggleTextbook = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const generate = async () => {
    if (!studentName) { showToast("生徒名を入力してください", "info"); return; }
    setGenStep(1);
    setGenError("");
    setPlanHtml("");
    try {
      const selectedTextbooks = allTextbooks.filter((t) => selectedIds.has(t.id));
      const score = testScore ? Number(testScore) : null;
      const total = testTotal ? Number(testTotal) : null;
      const percentage = score != null && total != null && total > 0
        ? Math.round((score / total) * 100) : null;
      const basePayload = {
        studentName, grade, subject,
        testScore: score, testTotal: total, testPercentage: percentage,
        habitScore: habitScore ? Number(habitScore) : null,
        methodScore: methodScore ? Number(methodScore) : null,
        aiAnalysis: aiAnalysis || null,
        textbooks: selectedTextbooks,
      };

      // Step 1: ChatGPT (GPT-4o) — 初稿作成
      const r1 = await fetch("/api/karte/generate/chatgpt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(basePayload),
      });
      const d1 = await r1.json();
      if (d1.error) { setGenError("ChatGPT: " + d1.error); setGenStep(0); return; }

      // Step 2: Gemini (GPT-4o-mini) — 精査・改善
      setGenStep(2);
      const r2 = await fetch("/api/karte/generate/gemini", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: d1.draft, studentName, grade, subject }),
      });
      const d2 = await r2.json();
      if (d2.error) { setGenError("Gemini: " + d2.error); setGenStep(0); return; }

      // Step 3: Claude — HTML仕上げ
      setGenStep(3);
      const r3 = await fetch("/api/karte/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...basePayload, refined: d2.refined }),
      });
      const d3 = await r3.json();
      if (d3.error) { setGenError("Claude: " + d3.error); setGenStep(0); return; }
      setPlanHtml(d3.planHtml);
      setGenStep(4);
    } catch (e) {
      setGenError("生成に失敗しました: " + String(e));
      setGenStep(0);
    }
  };

  const save = async () => {
    if (!planHtml) return;
    setSaving(true);
    setSaveError("");
    const selectedTextbooks = allTextbooks.filter((t) => selectedIds.has(t.id))
      .map((t) => ({ id: t.id, name: t.name, publisher: t.publisher }));
    const score = testScore ? Number(testScore) : null;
    const total = testTotal ? Number(testTotal) : null;
    const percentage = score != null && total != null && total > 0
      ? Math.round((score / total) * 100) : null;
    const { error } = await supabase.from("learning_plans").insert({
      student_name: studentName, grade, subject,
      test_score: score, test_total: total, test_percentage: percentage,
      diagnosis_session_id: diagnosisSessionId,
      selected_textbooks: selectedTextbooks.length > 0 ? selectedTextbooks : null,
      plan_html: planHtml, status: "draft",
    });
    setSaving(false);
    if (error) {
      if (error.message.includes("does not exist") || error.code === "42P01") {
        setSaveError("Supabaseにテーブルが必要です。SupabaseのSQLエディタで learning_plans テーブルを作成してください。");
      } else {
        setSaveError("保存に失敗しました: " + error.message);
      }
      return;
    }
    setSaved(true);
    setTimeout(() => { setSaved(false); onSaved(); }, 1200);
  };

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-6xl">
        {/* ヘッダー */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">カルテを作成</h1>
            {preset && (
              <p className="mt-0.5 text-sm text-violet-600">
                診断データを取得済み（{preset.studentName}）
              </p>
            )}
          </div>
          <button onClick={onBack}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            一覧に戻る
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* 左: 入力 */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-slate-700">生徒情報</p>
              <div className="space-y-3">
                <input value={studentName} onChange={(e) => setStudentName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                  placeholder="生徒名" />
                <div className="grid grid-cols-2 gap-2">
                  <select value={grade} onChange={(e) => setGrade(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400">
                    {GRADE_ORDER.map((g) => <option key={g}>{g}</option>)}
                  </select>
                  <select value={subject} onChange={(e) => setSubject(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400">
                    {SUBJECT_LIST.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-slate-700">診断結果</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={testScore} onChange={(e) => setTestScore(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                  placeholder="得点" />
                <input type="number" value={testTotal} onChange={(e) => setTestTotal(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                  placeholder="満点" />
                <input type="number" value={habitScore} onChange={(e) => setHabitScore(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                  placeholder="学習習慣 0-100" />
                <input type="number" value={methodScore} onChange={(e) => setMethodScore(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                  placeholder="学習法 0-100" />
              </div>
              <textarea value={aiAnalysis} onChange={(e) => setAiAnalysis(e.target.value)} rows={4}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                placeholder="AI診断分析テキスト（任意）— 多層診断の分析内容を貼り付けると精度が上がります" />
            </div>

            {filteredTextbooks.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">テキスト選択</p>
                  <span className="text-xs text-slate-400">{selectedIds.size}冊</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {filteredTextbooks.map((t) => (
                    <label key={t.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                      selectedIds.has(t.id) ? "border-violet-300 bg-violet-50" : "border-slate-100 hover:bg-slate-50"
                    }`}>
                      <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleTextbook(t.id)}
                        className="accent-violet-600" />
                      <span className="flex-1 truncate text-slate-800">{t.name}</span>
                      <span className="shrink-0 text-xs text-slate-400">{t.grade}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 3-step progress */}
            {genStep >= 1 && genStep <= 3 && (
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <p className="mb-3 text-xs font-semibold text-violet-700">AI生成中...</p>
                <div className="space-y-2">
                  {[
                    { step: 1, label: "ChatGPT が初稿を作成中", sub: "GPT-4o" },
                    { step: 2, label: "Gemini が内容を精査中", sub: "GPT-4o-mini" },
                    { step: 3, label: "Claude が仕上げ中", sub: "claude-sonnet-4-6" },
                  ].map(({ step, label, sub }) => (
                    <div key={step} className="flex items-center gap-2.5">
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        genStep > step ? "bg-green-500 text-white" :
                        genStep === step ? "bg-violet-600 text-white" :
                        "bg-slate-200 text-slate-400"
                      }`}>
                        {genStep > step ? "✓" : step}
                      </div>
                      <div className="flex-1">
                        <p className={`text-xs font-medium ${genStep >= step ? "text-slate-800" : "text-slate-400"}`}>{label}</p>
                        <p className="text-xs text-slate-400">{sub}</p>
                      </div>
                      {genStep === step && (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {genError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{genError}</p>}
            {saveError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}

            <button onClick={generate} disabled={genStep >= 1 && genStep <= 3 || !studentName}
              className="w-full rounded-2xl bg-violet-600 py-3.5 font-semibold text-white hover:bg-violet-700 disabled:opacity-40 transition">
              {genStep >= 1 && genStep <= 3 ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  生成中...
                </span>
              ) : genStep === 4 ? "再生成する" : "カルテを生成する"}
            </button>
          </div>

          {/* 右: プレビュー */}
          <div className="lg:col-span-3">
            <div className="sticky top-6">
              {planHtml ? (
                <div>
                  <div className="rounded-3xl border border-violet-100 bg-white px-8 py-8 shadow-sm overflow-y-auto max-h-[70vh]">
                    <style>{`
                      #karte-preview h2 { font-size:1rem; font-weight:700; margin:20px 0 8px; padding:6px 12px; background:#f5f3ff; border-left:4px solid #7c3aed; color:#3730a3; border-radius:0 6px 6px 0; }
                      #karte-preview h3 { font-size:0.9rem; font-weight:600; margin:14px 0 4px; color:#1e293b; }
                      #karte-preview p, #karte-preview li { line-height:1.8; font-size:0.875rem; color:#374151; }
                      #karte-preview ul, #karte-preview ol { padding-left:1.5rem; margin:4px 0; }
                      #karte-preview table { border-collapse:collapse; width:100%; margin:8px 0; font-size:0.8rem; }
                      #karte-preview td, #karte-preview th { border:1px solid #e5e7eb; padding:5px 8px; }
                      #karte-preview th { background:#f5f3ff; font-weight:700; color:#3730a3; }
                    `}</style>
                    <div id="karte-preview" dangerouslySetInnerHTML={{ __html: sanitizeHtml(planHtml) }} />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={generate} disabled={genStep >= 1 && genStep <= 3}
                      className="flex-1 rounded-xl border border-violet-200 bg-violet-50 py-2.5 text-sm text-violet-700 hover:bg-violet-100 disabled:opacity-40">
                      再生成
                    </button>
                    <button onClick={save} disabled={saving || saved}
                      className="flex-2 rounded-xl bg-green-600 px-8 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                      {saved ? "保存済み ✓" : saving ? "保存中..." : "カルテを保存する"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-24 text-center text-slate-400">
                  <p className="text-5xl mb-4">📋</p>
                  <p className="text-sm">左のフォームに入力して<br />「カルテを生成する」を押してください</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── テキスト管理 ─────────────────────────────────────────
function TextbookManager({ onBack }: { onBack: () => void }) {
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("中1");
  const [subject, setSubject] = useState("数学");
  const [publisher, setPublisher] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("メインテキスト");
  const [saving, setSaving] = useState(false);

  const TEXTBOOK_TYPES = ["メインテキスト", "問題集", "参考書", "補助教材", "サブテキスト"];

  const fetchTextbooks = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("textbooks").select("*").order("subject").order("grade").order("name");
    setTextbooks((data as Textbook[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTextbooks(); }, [fetchTextbooks]);

  const addTextbook = async () => {
    if (!name) return;
    setSaving(true);
    const { error } = await supabase.from("textbooks").insert({
      name, grade, subject,
      publisher: publisher || null, description: description || null, type,
    });
    setSaving(false);
    if (error) { showToast("追加に失敗しました: " + error.message, "error"); return; }
    setName(""); setPublisher(""); setDescription(""); setShowForm(false);
    fetchTextbooks();
  };

  const deleteTextbook = async (id: string) => {
    if (!confirm("このテキストを削除しますか？")) return;
    await supabase.from("textbooks").delete().eq("id", id);
    fetchTextbooks();
  };

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">テキスト管理</h1>
            <p className="mt-0.5 text-sm text-slate-500">カルテ作成時に選択するテキスト・教材を登録します</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(!showForm)}
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
              + 追加
            </button>
            <button onClick={onBack}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
              カルテ一覧に戻る
            </button>
          </div>
        </div>

        {showForm && (
          <div className="mb-5 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
            <p className="mb-3 font-semibold text-slate-800">テキストを追加</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400 sm:col-span-2"
                placeholder="テキスト名（例：中学数学 基礎問題精講）" />
              <select value={subject} onChange={(e) => setSubject(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400">
                {SUBJECT_LIST.map((s) => <option key={s}>{s}</option>)}
              </select>
              <select value={grade} onChange={(e) => setGrade(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400">
                <option value="全学年">全学年</option>
                {GRADE_ORDER.map((g) => <option key={g}>{g}</option>)}
              </select>
              <input value={publisher} onChange={(e) => setPublisher(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                placeholder="出版社（任意）" />
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400">
                {TEXTBOOK_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              <input value={description} onChange={(e) => setDescription(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400 sm:col-span-2"
                placeholder="説明（任意）" />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setShowForm(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">キャンセル</button>
              <button onClick={addTextbook} disabled={!name || saving}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40">
                {saving ? "追加中..." : "追加"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-slate-400">読み込み中...</div>
        ) : textbooks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-slate-500">
            テキストが登録されていません
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold text-slate-700">テキスト名</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">科目</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">学年</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">種類</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-700">出版社</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {textbooks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">{t.name}</td>
                    <td className="px-3 py-3 text-slate-600">{t.subject}</td>
                    <td className="px-3 py-3 text-slate-600">{t.grade}</td>
                    <td className="px-3 py-3 text-slate-500">{t.type}</td>
                    <td className="px-3 py-3 text-slate-400">{t.publisher ?? "—"}</td>
                    <td className="px-3 py-3">
                      <button onClick={() => deleteTextbook(t.id)}
                        className="rounded-lg border border-red-100 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50">
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
