"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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

export default function KartePage() {
  return (
    <Suspense>
      <KartePageInner />
    </Suspense>
  );
}

// ─── メインページ ─────────────────────────────────────────
function KartePageInner() {
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>(
    searchParams.get("create") === "1" ? "create" : "list"
  );
  const [plans, setPlans] = useState<LearningPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<LearningPlan | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("learning_plans")
      .select("*")
      .order("created_at", { ascending: false });
    setPlans((data as LearningPlan[]) ?? []);
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

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">カルテ（学習方針書）</h1>
            <p className="mt-1 text-slate-600">AIが3ヶ月間の個別学習方針を自動生成します</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setView("textbooks")}
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm text-slate-700 hover:bg-slate-50">
              テキスト管理
            </button>
            <button onClick={() => setView("create")}
              className="rounded-2xl bg-violet-600 px-5 py-3 font-semibold text-white hover:bg-violet-700">
              + 新規作成
            </button>
            <Link href="/teacher/dashboard"
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm text-slate-700 hover:bg-slate-50">
              ダッシュボード
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">読み込み中...</div>
        ) : plans.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            <p className="text-lg font-medium mb-1">カルテがまだありません</p>
            <p className="text-sm">多層診断ページの「カルテ作成」ボタン、または「新規作成」から作成してください</p>
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="font-semibold text-slate-950">{plan.student_name}</h2>
                      <span className="text-sm text-slate-500">{plan.grade} ・ {plan.subject}</span>
                      {plan.test_percentage != null && (
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          plan.test_percentage >= 80 ? "bg-green-100 text-green-700" :
                          plan.test_percentage >= 60 ? "bg-blue-100 text-blue-700" :
                          "bg-red-100 text-red-700"
                        }`}>テスト {plan.test_percentage}%</span>
                      )}
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        plan.status === "shared" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                      }`}>
                        {plan.status === "shared" ? "共有済" : "下書き"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">作成: {plan.created_at.slice(0, 10)}</p>
                  </div>
                  <button
                    onClick={() => { setSelectedPlan(plan); setView("detail"); }}
                    className="shrink-0 rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100">
                    カルテを見る
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

  const [generating, setGenerating] = useState(false);
  const [planHtml, setPlanHtml] = useState("");
  const [genError, setGenError] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
      } catch { /* ignore parse errors */ }
    }
  }, []);

  useEffect(() => {
    supabase.from("textbooks").select("*").order("subject").order("grade").order("name")
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
    if (!studentName) { alert("生徒名を入力してください"); return; }
    setGenerating(true);
    setGenError("");
    try {
      const selectedTextbooks = allTextbooks.filter((t) => selectedIds.has(t.id));
      const score = testScore ? Number(testScore) : null;
      const total = testTotal ? Number(testTotal) : null;
      const percentage = score != null && total != null && total > 0
        ? Math.round((score / total) * 100) : null;

      const res = await fetch("/api/karte/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName, grade, subject,
          testScore: score, testTotal: total, testPercentage: percentage,
          habitScore: habitScore ? Number(habitScore) : null,
          methodScore: methodScore ? Number(methodScore) : null,
          aiAnalysis: aiAnalysis || null,
          textbooks: selectedTextbooks,
        }),
      });
      const data = await res.json();
      if (data.error) { setGenError(data.error); return; }
      setPlanHtml(data.planHtml);
    } catch (e) {
      setGenError("生成に失敗しました: " + String(e));
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!planHtml) return;
    setSaving(true);
    const selectedTextbooks = allTextbooks.filter((t) => selectedIds.has(t.id))
      .map((t) => ({ id: t.id, name: t.name, publisher: t.publisher }));
    const score = testScore ? Number(testScore) : null;
    const total = testTotal ? Number(testTotal) : null;
    const percentage = score != null && total != null && total > 0
      ? Math.round((score / total) * 100) : null;

    const { error } = await supabase.from("learning_plans").insert({
      student_name: studentName,
      grade, subject,
      test_score: score, test_total: total, test_percentage: percentage,
      diagnosis_session_id: diagnosisSessionId,
      selected_textbooks: selectedTextbooks.length > 0 ? selectedTextbooks : null,
      plan_html: planHtml,
      status: "draft",
    });
    setSaving(false);
    if (error) { alert("保存に失敗しました: " + error.message); return; }
    setSaved(true);
    setTimeout(() => { setSaved(false); onSaved(); }, 1200);
  };

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10">
      <main className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">カルテを作成</h1>
            {preset && (
              <p className="mt-1 text-sm text-violet-600">
                多層診断からデータを取得しました（{preset.studentName}）
              </p>
            )}
          </div>
          <button onClick={onBack}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            一覧に戻る
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* 左: 入力フォーム */}
          <div className="lg:col-span-2 space-y-5">
            {/* 生徒情報 */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-semibold text-slate-900">生徒情報</h2>
              <div className="space-y-3">
                <label className="grid gap-1 text-sm text-slate-700">
                  氏名
                  <input value={studentName} onChange={(e) => setStudentName(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="例：田中太郎" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-sm text-slate-700">
                    学年
                    <select value={grade} onChange={(e) => setGrade(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-400">
                      {GRADE_ORDER.map((g) => <option key={g}>{g}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm text-slate-700">
                    科目
                    <select value={subject} onChange={(e) => setSubject(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-400">
                      {SUBJECT_LIST.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            </section>

            {/* 診断結果 */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-semibold text-slate-900">診断結果</h2>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-sm text-slate-700">
                  テスト得点
                  <input type="number" value={testScore} onChange={(e) => setTestScore(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="例：72" />
                </label>
                <label className="grid gap-1 text-sm text-slate-700">
                  満点
                  <input type="number" value={testTotal} onChange={(e) => setTestTotal(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="例：100" />
                </label>
                <label className="grid gap-1 text-sm text-slate-700">
                  学習習慣スコア
                  <input type="number" value={habitScore} onChange={(e) => setHabitScore(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="0-100" />
                </label>
                <label className="grid gap-1 text-sm text-slate-700">
                  学習法スコア
                  <input type="number" value={methodScore} onChange={(e) => setMethodScore(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="0-100" />
                </label>
              </div>
              <label className="mt-3 grid gap-1 text-sm text-slate-700">
                AI診断分析テキスト（任意）
                <textarea value={aiAnalysis} onChange={(e) => setAiAnalysis(e.target.value)} rows={5}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                  placeholder="多層診断の分析テキストを貼り付けると、より精度の高いカルテが作成されます" />
              </label>
            </section>

            {/* テキスト選択 */}
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">使用テキスト</h2>
                <span className="text-xs text-slate-400">{selectedIds.size}冊選択中</span>
              </div>
              {filteredTextbooks.length === 0 ? (
                <p className="text-sm text-slate-400">
                  テキストが登録されていません。「テキスト管理」から追加してください。
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredTextbooks.map((t) => (
                    <label key={t.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                      selectedIds.has(t.id) ? "border-violet-300 bg-violet-50" : "border-slate-100 hover:bg-slate-50"
                    }`}>
                      <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleTextbook(t.id)}
                        className="mt-0.5 accent-violet-600" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">{t.name}</p>
                        <p className="text-xs text-slate-400">
                          {t.grade} ・ {t.type}{t.publisher && ` ・ ${t.publisher}`}
                        </p>
                        {t.description && <p className="mt-0.5 text-xs text-slate-400">{t.description}</p>}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </section>

            {genError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{genError}</div>
            )}

            <button onClick={generate} disabled={generating || !studentName}
              className="w-full rounded-2xl bg-violet-600 py-4 font-semibold text-white hover:bg-violet-700 disabled:opacity-40 transition">
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  AIがカルテを生成中...（30秒〜1分）
                </span>
              ) : "カルテを生成する"}
            </button>
          </div>

          {/* 右: プレビュー */}
          <div className="lg:col-span-3">
            <div className="sticky top-6 space-y-4">
              {planHtml ? (
                <>
                  <div className="rounded-3xl border border-violet-200 bg-white p-8 shadow-sm overflow-y-auto max-h-[75vh]">
                    <KartePlanStyle />
                    <div id="learning-plan" dangerouslySetInnerHTML={{ __html: planHtml }} />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={generate} disabled={generating}
                      className="flex-1 rounded-xl border border-violet-300 bg-violet-50 py-3 text-sm text-violet-700 hover:bg-violet-100 disabled:opacity-40">
                      再生成
                    </button>
                    <button onClick={() => window.print()}
                      className="flex-1 rounded-xl border border-slate-300 bg-white py-3 text-sm text-slate-700 hover:bg-slate-50">
                      印刷
                    </button>
                    <button onClick={save} disabled={saving || saved}
                      className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                      {saved ? "保存済み ✓" : saving ? "保存中..." : "カルテを保存"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-16 text-center text-slate-400">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="font-medium text-slate-600">左のフォームに入力後</p>
                  <p className="text-sm mt-1">「カルテを生成する」を押すとここに表示されます</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── カルテ詳細 ───────────────────────────────────────────
function KarteDetail({ plan, onBack, onUpdated }: {
  plan: LearningPlan;
  onBack: () => void;
  onUpdated: () => void;
}) {
  const [notes, setNotes] = useState(plan.teacher_notes ?? "");
  const [status, setStatus] = useState(plan.status);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await supabase.from("learning_plans").update({ teacher_notes: notes }).eq("id", plan.id);
    setSaving(false);
    onUpdated();
  };

  const share = async () => {
    setSaving(true);
    await supabase.from("learning_plans").update({ status: "shared" }).eq("id", plan.id);
    setStatus("shared");
    setSaving(false);
    onUpdated();
  };

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10">
      <main className="mx-auto max-w-4xl space-y-6">
        <div className="no-print flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-950">
              {plan.student_name}（{plan.grade} / {plan.subject}）のカルテ
            </h1>
            <p className="mt-1 text-sm text-slate-500">作成: {plan.created_at.slice(0, 10)}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={onBack}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              一覧に戻る
            </button>
            <button onClick={() => window.print()}
              className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              A4印刷
            </button>
          </div>
        </div>

        {(plan.test_percentage != null || plan.selected_textbooks) && (
          <div className="no-print rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-6 items-start">
              {plan.test_percentage != null && (
                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-1">テスト正答率</p>
                  <p className={`text-3xl font-bold ${
                    plan.test_percentage >= 80 ? "text-green-600" :
                    plan.test_percentage >= 60 ? "text-blue-600" : "text-red-600"
                  }`}>{plan.test_percentage}%</p>
                  {plan.test_score != null && plan.test_total != null && (
                    <p className="text-xs text-slate-400 mt-0.5">{plan.test_score}/{plan.test_total}点</p>
                  )}
                </div>
              )}
              {plan.selected_textbooks && plan.selected_textbooks.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-2">使用テキスト</p>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.selected_textbooks.map((t) => (
                      <span key={t.id} className="rounded-full bg-violet-100 px-3 py-1 text-xs text-violet-700">
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <KartePlanStyle />
          <div id="learning-plan" dangerouslySetInnerHTML={{ __html: plan.plan_html }} />
        </div>

        <div className="no-print rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h3 className="mb-3 font-semibold text-amber-900">講師メモ・補足</h3>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}
            placeholder="指導方針、観察メモ、保護者への補足など..."
            className="w-full rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-400" />
          <div className="mt-3 flex gap-3 justify-end">
            <button onClick={save} disabled={saving}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              {saving ? "保存中..." : "メモを保存"}
            </button>
            {status === "draft" ? (
              <button onClick={share} disabled={saving}
                className="rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40">
                共有済みにする
              </button>
            ) : (
              <span className="flex items-center gap-1 rounded-xl bg-green-100 px-5 py-2 text-sm font-semibold text-green-700">
                ✓ 共有済み
              </span>
            )}
          </div>
        </div>
      </main>
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
      publisher: publisher || null,
      description: description || null,
      type,
    });
    setSaving(false);
    if (error) { alert("追加に失敗しました: " + error.message); return; }
    setName(""); setPublisher(""); setDescription("");
    setShowForm(false);
    fetchTextbooks();
  };

  const deleteTextbook = async (id: string) => {
    if (!confirm("このテキストを削除しますか？")) return;
    await supabase.from("textbooks").delete().eq("id", id);
    fetchTextbooks();
  };

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10">
      <main className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">テキスト管理</h1>
            <p className="mt-1 text-sm text-slate-500">カルテ作成時に選択するテキスト・教材を登録します</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(!showForm)}
              className="rounded-2xl bg-violet-600 px-5 py-3 font-semibold text-white hover:bg-violet-700">
              + テキストを追加
            </button>
            <button onClick={onBack}
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm text-slate-700 hover:bg-slate-50">
              カルテ一覧に戻る
            </button>
          </div>
        </div>

        {showForm && (
          <div className="mb-6 rounded-3xl border border-violet-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-semibold text-slate-900">テキストを追加</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm text-slate-700 sm:col-span-2">
                テキスト名
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-400"
                  placeholder="例：中学数学 基礎問題精講" />
              </label>
              <label className="grid gap-1 text-sm text-slate-700">
                科目
                <select value={subject} onChange={(e) => setSubject(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-400">
                  {SUBJECT_LIST.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm text-slate-700">
                対象学年
                <select value={grade} onChange={(e) => setGrade(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-400">
                  <option value="全学年">全学年</option>
                  {GRADE_ORDER.map((g) => <option key={g}>{g}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm text-slate-700">
                出版社
                <input value={publisher} onChange={(e) => setPublisher(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-400"
                  placeholder="例：旺文社" />
              </label>
              <label className="grid gap-1 text-sm text-slate-700">
                種類
                <select value={type} onChange={(e) => setType(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-400">
                  {TEXTBOOK_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm text-slate-700 sm:col-span-2">
                説明（任意）
                <input value={description} onChange={(e) => setDescription(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-violet-400"
                  placeholder="例：基礎固めに最適。1日10問程度のペースで進める" />
              </label>
            </div>
            <div className="mt-4 flex gap-3 justify-end">
              <button onClick={() => setShowForm(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                キャンセル
              </button>
              <button onClick={addTextbook} disabled={!name || saving}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40">
                {saving ? "追加中..." : "追加する"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">読み込み中...</div>
        ) : textbooks.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            テキストが登録されていません。「+ テキストを追加」から登録してください。
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-slate-700">テキスト名</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">科目</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">学年</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">種類</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">出版社</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {textbooks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-medium text-slate-900">{t.name}</td>
                    <td className="px-4 py-3 text-slate-600">{t.subject}</td>
                    <td className="px-4 py-3 text-slate-600">{t.grade}</td>
                    <td className="px-4 py-3 text-slate-500">{t.type}</td>
                    <td className="px-4 py-3 text-slate-400">{t.publisher ?? "—"}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => deleteTextbook(t.id)}
                        className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50">
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── 共通スタイル ─────────────────────────────────────────
function KartePlanStyle() {
  return (
    <style>{`
      #learning-plan h2 { font-size:1.05rem; font-weight:700; margin:20px 0 8px; border-left:4px solid #7c3aed; padding-left:10px; color:#1e293b; }
      #learning-plan h3 { font-size:0.95rem; font-weight:600; margin:14px 0 6px; color:#334155; }
      #learning-plan p, #learning-plan li { line-height:1.8; font-size:0.9rem; color:#475569; }
      #learning-plan ul, #learning-plan ol { padding-left:1.5rem; }
      #learning-plan table { border-collapse:collapse; width:100%; margin:10px 0; font-size:0.875rem; }
      #learning-plan td, #learning-plan th { border:1px solid #e2e8f0; padding:6px 10px; }
      #learning-plan th { background:#f8fafc; font-weight:600; }
      @media print {
        @page { size: A4 portrait; margin: 15mm; }
        .no-print { display: none !important; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        #learning-plan { font-size: 10pt; }
      }
    `}</style>
  );
}
