"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Student, Diagnosis, VolumeRatings, QualityRatings, DiagnosisRating } from "@/lib/supabase";
import { GRADE_ORDER } from "@/lib/curriculum";

// ─── 定数 ────────────────────────────────────────────
const RATING_OPTIONS: { value: DiagnosisRating; label: string; color: string }[] = [
  { value: 4, label: "◎", color: "bg-green-100 text-green-700 border-green-400" },
  { value: 3, label: "○", color: "bg-blue-100 text-blue-700 border-blue-400" },
  { value: 2, label: "△", color: "bg-yellow-100 text-yellow-700 border-yellow-400" },
  { value: 1, label: "×", color: "bg-red-100 text-red-700 border-red-400" },
];

const DEFAULT_VOLUME: VolumeRatings = {
  daily_completion: 3, schedule_adherence: 3, basic_fluency: 3,
  weak_unit: 3, practice_volume: 3,
};
const DEFAULT_QUALITY: QualityRatings = {
  read_problem: 3, read_solution: 3, read_example: 3,
  write_steps: 3, write_notes: 3, write_vocab: 3,
  listen_teacher: 3, listen_test_info: 3, listen_until_understand: 3,
  speak_error: 3, speak_resolving: 3, speak_balance: 3,
};

// ─── メインページ ─────────────────────────────────────
export default function DiagnosisPage() {
  const [view, setView] = useState<"list" | "history" | "create" | "report" | "human-check">("list");
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<Diagnosis | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("students").select("*").order("name");
    setStudents(data ?? []);
    setLoading(false);
  }, []);

  const fetchDiagnoses = useCallback(async (studentId: string) => {
    const { data } = await supabase.from("diagnoses").select("*")
      .eq("student_id", studentId).order("created_at", { ascending: false });
    setDiagnoses(data ?? []);
  }, []);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const selectStudent = async (student: Student) => {
    setSelectedStudent(student);
    await fetchDiagnoses(student.id);
    setView("history");
  };

  const openReport = (diagnosis: Diagnosis) => {
    setSelectedDiagnosis(diagnosis);
    setView("report");
  };

  const onSaved = async (diagnosis: Diagnosis) => {
    setSelectedDiagnosis(diagnosis);
    if (selectedStudent) await fetchDiagnoses(selectedStudent.id);
    setView("report");
  };

  if (view === "human-check") {
    return <HumanCheckView onBack={() => setView("list")} />;
  }

  if (view === "report" && selectedDiagnosis) {
    return (
      <ReportView
        diagnosis={selectedDiagnosis}
        student={selectedStudent!}
        onBack={() => setView("history")}
      />
    );
  }

  if (view === "create" && selectedStudent) {
    return (
      <CreateDiagnosis
        student={selectedStudent}
        previousDiagnoses={diagnoses}
        onSaved={onSaved}
        onCancel={() => setView("history")}
      />
    );
  }

  if (view === "history" && selectedStudent) {
    return (
      <StudentHistory
        student={selectedStudent}
        diagnoses={diagnoses}
        onNewDiagnosis={() => setView("create")}
        onOpenReport={openReport}
        onBack={() => { setView("list"); fetchStudents(); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">多層診断システム</h1>
            <p className="mt-1 text-slate-600">学力・学習量・学習の質を多角的に診断します</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setView("human-check")}
              className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 font-semibold text-amber-800 hover:bg-amber-100">
              ヒューマンチェック
            </button>
            <NewStudentButton onCreated={(s) => { setStudents((prev) => [s, ...prev]); }} />
            <Link href="/teacher/dashboard"
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-slate-700 hover:bg-slate-50">
              ダッシュボード
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">読み込み中...</div>
        ) : students.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            生徒が登録されていません。「生徒を追加」から登録してください。
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {students.map((s) => (
              <button key={s.id} onClick={() => selectStudent(s)}
                className="rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-2xl">👤</span>
                  <span className="font-bold text-slate-900">{s.name}</span>
                </div>
                <p className="text-sm text-slate-500">{s.grade}</p>
                <p className="mt-2 text-xs text-slate-400">登録: {s.created_at.slice(0, 10)}</p>
              </button>
            ))}
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

// ─── 生徒の診断履歴 ──────────────────────────────────
function StudentHistory({ student, diagnoses, onNewDiagnosis, onOpenReport, onBack }: {
  student: Student;
  diagnoses: Diagnosis[];
  onNewDiagnosis: () => void;
  onOpenReport: (d: Diagnosis) => void;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10">
      <main className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">{student.name}（{student.grade}）の診断履歴</h1>
            <p className="mt-1 text-slate-600">{diagnoses.length}件の診断記録</p>
          </div>
          <div className="flex gap-3">
            <button onClick={onNewDiagnosis}
              className="rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700">
              + 新規診断
            </button>
            <button onClick={onBack}
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-slate-700 hover:bg-slate-50">
              生徒一覧
            </button>
          </div>
        </div>

        {diagnoses.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            診断記録がありません。「新規診断」から作成してください。
          </div>
        ) : (
          <div className="space-y-4">
            {/* 推移グラフ */}
            {diagnoses.length >= 2 && (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 font-semibold text-slate-900">スコア推移</h3>
                <TrendChart diagnoses={[...diagnoses].reverse()} />
              </div>
            )}
            {/* 診断一覧 */}
            {diagnoses.map((d) => (
              <div key={d.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-900">{d.created_at.slice(0, 10)}</p>
                    <div className="mt-2 flex gap-4 text-sm">
                      <ScorePill label="学習量" score={d.volume_score} />
                      <ScorePill label="学習の質" score={d.quality_score} />
                      {d.test_rate != null && (
                        <ScorePill label="テスト正答率" score={d.test_rate} />
                      )}
                    </div>
                  </div>
                  <button onClick={() => onOpenReport(d)}
                    className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-100">
                    レポートを見る
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

// ─── 新規診断作成 ─────────────────────────────────────
function CreateDiagnosis({ student, previousDiagnoses, onSaved, onCancel }: {
  student: Student;
  previousDiagnoses: Diagnosis[];
  onSaved: (d: Diagnosis) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"test" | "volume" | "quality" | "generating">("test");
  const [subject, setSubject] = useState("数学");
  const [testScore, setTestScore] = useState<number | "">("");
  const [testTotal, setTestTotal] = useState<number | "">(100);
  const [weakUnitsText, setWeakUnitsText] = useState("");
  const [basicScore, setBasicScore] = useState<number | "">("");
  const [basicTotal, setBasicTotal] = useState<number | "">("");
  const [standardScore, setStandardScore] = useState<number | "">("");
  const [standardTotal, setStandardTotal] = useState<number | "">("");
  const [advancedScore, setAdvancedScore] = useState<number | "">("");
  const [advancedTotal, setAdvancedTotal] = useState<number | "">("");
  const [volumeRatings, setVolumeRatings] = useState<VolumeRatings>(DEFAULT_VOLUME);
  const [qualityRatings, setQualityRatings] = useState<QualityRatings>(DEFAULT_QUALITY);
  const [error, setError] = useState("");

  // テストページから渡されたデータを読み込む
  useEffect(() => {
    const saved = sessionStorage.getItem("diagnosisTestData");
    if (saved) {
      try {
        const d = JSON.parse(saved);
        if (d.score != null) setTestScore(d.score);
        if (d.total != null) setTestTotal(d.total);
        if (d.subject) setSubject(d.subject);
        if (d.weakUnits) setWeakUnitsText(d.weakUnits.join("、"));
        if (d.basic) { setBasicScore(d.basic.score); setBasicTotal(d.basic.total); }
        if (d.standard) { setStandardScore(d.standard.score); setStandardTotal(d.standard.total); }
        if (d.advanced) { setAdvancedScore(d.advanced.score); setAdvancedTotal(d.advanced.total); }
        sessionStorage.removeItem("diagnosisTestData");
      } catch { /* ignore */ }
    }
  }, []);

  const setVolume = (key: keyof VolumeRatings, val: DiagnosisRating) =>
    setVolumeRatings((prev) => ({ ...prev, [key]: val }));
  const setQuality = (key: keyof QualityRatings, val: DiagnosisRating) =>
    setQualityRatings((prev) => ({ ...prev, [key]: val }));

  const generate = async () => {
    setStep("generating");
    setError("");
    const testRate = testScore !== "" && testTotal ? Math.round((Number(testScore) / Number(testTotal)) * 100) : null;
    const weakUnits = weakUnitsText ? weakUnitsText.split(/[、,，\n]/).map((s) => s.trim()).filter(Boolean) : [];
    const difficultyResults = (basicTotal || standardTotal || advancedTotal) ? {
      basic: { score: Number(basicScore) || 0, total: Number(basicTotal) || 0 },
      standard: { score: Number(standardScore) || 0, total: Number(standardTotal) || 0 },
      advanced: { score: Number(advancedScore) || 0, total: Number(advancedTotal) || 0 },
    } : null;

    const prevData = previousDiagnoses.slice(-3).map((d) => ({
      created_at: d.created_at, volume_score: d.volume_score, quality_score: d.quality_score,
    }));

    try {
      const res = await fetch("/api/diagnosis/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: student.name, grade: student.grade, subject,
          testScore: testScore !== "" ? Number(testScore) : null,
          testTotal: testTotal !== "" ? Number(testTotal) : null,
          testRate, weakUnits, difficultyResults,
          volumeRatings, qualityRatings,
          previousDiagnoses: prevData,
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setStep("quality"); return; }

      // Supabaseに保存
      const { data: saved, error: dbErr } = await supabase.from("diagnoses").insert({
        student_id: student.id,
        test_score: testScore !== "" ? Number(testScore) : null,
        test_total: testTotal !== "" ? Number(testTotal) : null,
        test_rate: testRate,
        test_subject: subject,
        weak_units: weakUnits,
        difficulty_results: difficultyResults,
        volume_ratings: volumeRatings,
        quality_ratings: qualityRatings,
        volume_score: data.volumeScore,
        quality_score: data.qualityScore,
        report_html: data.reportHtml,
      }).select().single();

      if (dbErr || !saved) { setError("保存に失敗しました: " + dbErr?.message); setStep("quality"); return; }
      onSaved(saved);
    } catch (e) {
      setError("エラー: " + String(e));
      setStep("quality");
    }
  };

  if (step === "generating") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-5xl animate-pulse">🧠</div>
          <p className="text-xl font-semibold text-slate-700">AIが多層診断を生成中...</p>
          <p className="mt-2 text-slate-500">30秒〜1分ほどかかります</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10">
      <main className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-950">
            {student.name}（{student.grade}）の新規診断
          </h1>
          <button onClick={onCancel}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            キャンセル
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2">
          {(["test", "volume", "quality"] as const).map((s, i) => (
            <div key={s} className={`flex-1 rounded-full py-1.5 text-center text-xs font-semibold transition ${step === s ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-500"}`}>
              {i + 1}. {s === "test" ? "テスト結果" : s === "volume" ? "学習量評価" : "学習の質評価"}
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {/* ── Step 1: テスト結果 ── */}
        {step === "test" && (
          <div className="space-y-4">
            <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="mb-5 text-lg font-semibold">テスト結果（任意）</h2>
              <p className="mb-4 text-xs text-slate-400">テストを実施していない場合は空欄のまま次へ進めます</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1 text-sm text-slate-700">
                  科目
                  <select value={subject} onChange={(e) => setSubject(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400">
                    {["国語","算数","数学","英語","理科","社会","総合"].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <div className="grid gap-1 text-sm text-slate-700">
                  合計得点
                  <div className="flex items-center gap-2">
                    <input type="number" value={testScore} onChange={(e) => setTestScore(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-20 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400"
                      placeholder="得点" />
                    <span>/</span>
                    <input type="number" value={testTotal} onChange={(e) => setTestTotal(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-20 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400"
                      placeholder="満点" />
                    <span>点</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  { label: "基礎", s: basicScore, t: basicTotal, setS: setBasicScore, setT: setBasicTotal },
                  { label: "標準", s: standardScore, t: standardTotal, setS: setStandardScore, setT: setStandardTotal },
                  { label: "応用", s: advancedScore, t: advancedTotal, setS: setAdvancedScore, setT: setAdvancedTotal },
                ].map((item) => (
                  <div key={item.label} className="grid gap-1 text-sm text-slate-700">
                    {item.label}
                    <div className="flex items-center gap-1">
                      <input type="number" value={item.s} onChange={(e) => item.setS(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-16 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder="得点" />
                      <span className="text-slate-400">/</span>
                      <input type="number" value={item.t} onChange={(e) => item.setT(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-16 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder="満点" />
                    </div>
                  </div>
                ))}
              </div>
              <label className="mt-4 grid gap-1 text-sm text-slate-700">
                苦手単元・間違えた問題（カンマまたは改行で区切り）
                <textarea value={weakUnitsText} onChange={(e) => setWeakUnitsText(e.target.value)} rows={3}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="例：正負の数、方程式の文章題、平面図形" />
              </label>
            </section>
            <button onClick={() => setStep("volume")}
              className="w-full rounded-2xl bg-indigo-600 py-4 font-semibold text-white hover:bg-indigo-700">
              次へ：学習量評価
            </button>
          </div>
        )}

        {/* ── Step 2: 学習量 ── */}
        {step === "volume" && (
          <div className="space-y-4">
            <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold">学習量（生産性）評価</h2>
              <p className="mb-5 text-xs text-slate-400">観察・指導を通じた評価を入力してください</p>
              <div className="space-y-4">
                {([
                  { key: "daily_completion", label: "①一日の学習量達成", desc: "やるべき学習量が毎日こなせているか" },
                  { key: "schedule_adherence", label: "②スケジュール遵守", desc: "学習計画・スケジュール通りに進められているか" },
                  { key: "basic_fluency", label: "③暗記暗算・基礎学力", desc: "暗記・暗算がスムーズで基礎学力が身についているか" },
                  { key: "weak_unit", label: "④苦手単元への取り組み", desc: "苦手な単元に向き合い演習できているか" },
                  { key: "practice_volume", label: "⑤演習量", desc: "十分な演習量が確保できているか" },
                ] as { key: keyof VolumeRatings; label: string; desc: string }[]).map((item) => (
                  <RatingRow key={item.key} label={item.label} desc={item.desc}
                    value={volumeRatings[item.key]}
                    onChange={(v) => setVolume(item.key, v)} />
                ))}
              </div>
            </section>
            <div className="flex gap-3">
              <button onClick={() => setStep("test")}
                className="flex-1 rounded-2xl border border-slate-300 bg-white py-4 text-slate-700 hover:bg-slate-50">
                戻る
              </button>
              <button onClick={() => setStep("quality")}
                className="flex-1 rounded-2xl bg-indigo-600 py-4 font-semibold text-white hover:bg-indigo-700">
                次へ：学習の質評価
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: 学習の質 ── */}
        {step === "quality" && (
          <div className="space-y-4">
            {([
              {
                domain: "読む", color: "blue",
                items: [
                  { key: "read_problem", label: "問題の理解", desc: "問題文を正確に読んで理解できるか" },
                  { key: "read_solution", label: "解答解説の理解", desc: "解説を読んで理解し活用できるか" },
                  { key: "read_example", label: "例題の読解", desc: "例題を自分で読んで学べるか" },
                ],
              },
              {
                domain: "書く", color: "green",
                items: [
                  { key: "write_steps", label: "途中式の記述", desc: "計算・思考の過程を書く習慣があるか" },
                  { key: "write_notes", label: "ノートの活用", desc: "授業・自習でノートをしっかりまとめているか" },
                  { key: "write_vocab", label: "語彙・重要事項の記録", desc: "覚えるべき語彙・公式を書いて整理しているか" },
                ],
              },
              {
                domain: "聞く", color: "orange",
                items: [
                  { key: "listen_teacher", label: "先生への質問・相談", desc: "わからない時に積極的に質問・相談できるか" },
                  { key: "listen_test_info", label: "テスト情報収集", desc: "出題範囲・傾向などを情報として集められるか" },
                  { key: "listen_until_understand", label: "理解するまで聞く", desc: "納得できるまで追求して理解しようとするか" },
                ],
              },
              {
                domain: "話す", color: "purple",
                items: [
                  { key: "speak_error", label: "誤答原因の説明", desc: "なぜ間違えたかを自分の言葉で説明できるか" },
                  { key: "speak_resolving", label: "解きなおしの説明", desc: "正しい解法を説明しながら解きなおせるか" },
                  { key: "speak_balance", label: "教科バランスの説明", desc: "得意・苦手科目のバランスを把握・説明できるか" },
                ],
              },
            ] as { domain: string; color: string; items: { key: keyof QualityRatings; label: string; desc: string }[] }[]).map(({ domain, color, items }) => (
              <section key={domain} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className={`mb-4 inline-block rounded-full px-3 py-1 text-sm font-bold bg-${color}-100 text-${color}-700`}>
                  ■ {domain}
                </h3>
                <div className="space-y-3">
                  {items.map((item) => (
                    <RatingRow key={item.key} label={item.label} desc={item.desc}
                      value={qualityRatings[item.key]}
                      onChange={(v) => setQuality(item.key, v)} />
                  ))}
                </div>
              </section>
            ))}
            <div className="flex gap-3">
              <button onClick={() => setStep("volume")}
                className="flex-1 rounded-2xl border border-slate-300 bg-white py-4 text-slate-700 hover:bg-slate-50">
                戻る
              </button>
              <button onClick={generate}
                className="flex-1 rounded-2xl bg-indigo-600 py-4 font-semibold text-white hover:bg-indigo-700">
                診断レポートを生成する
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── レポート表示・印刷 ──────────────────────────────
function ReportView({ diagnosis, student, onBack }: {
  diagnosis: Diagnosis;
  student: Student;
  onBack: () => void;
}) {
  const vr = diagnosis.volume_ratings;
  const qr = diagnosis.quality_ratings;
  const readScore = Math.round(([qr.read_problem, qr.read_solution, qr.read_example].reduce((a, b) => a + b, 0) / 12) * 100);
  const writeScore = Math.round(([qr.write_steps, qr.write_notes, qr.write_vocab].reduce((a, b) => a + b, 0) / 12) * 100);
  const listenScore = Math.round(([qr.listen_teacher, qr.listen_test_info, qr.listen_until_understand].reduce((a, b) => a + b, 0) / 12) * 100);
  const speakScore = Math.round(([qr.speak_error, qr.speak_resolving, qr.speak_balance].reduce((a, b) => a + b, 0) / 12) * 100);

  const volumeValues = [vr.daily_completion, vr.schedule_adherence, vr.basic_fluency, vr.weak_unit, vr.practice_volume];
  const volumeLabels = ["学習量達成", "スケジュール", "基礎学力", "苦手単元", "演習量"];
  const qualityValues = [readScore, writeScore, listenScore, speakScore].map((v) => Math.round(v / 25));
  const qualityLabels = ["読む", "書く", "聞く", "話す"];

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10">
      <main className="mx-auto max-w-4xl">
        {/* 操作バー（印刷時非表示） */}
        <div className="no-print mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-950">{student.name}（{student.grade}）診断レポート</h1>
          <div className="flex gap-3">
            <button onClick={onBack}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              履歴に戻る
            </button>
            <button onClick={() => window.print()}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
              A4印刷
            </button>
          </div>
        </div>

        {/* 印刷コンテンツ */}
        <div className="print-area space-y-6">
          {/* スコアカード */}
          <div className="grid gap-4 sm:grid-cols-3 no-print">
            <ScoreCard label="学習量スコア" score={diagnosis.volume_score} />
            <ScoreCard label="学習の質スコア" score={diagnosis.quality_score} />
            {diagnosis.test_rate != null && <ScoreCard label="テスト正答率" score={diagnosis.test_rate} />}
          </div>

          {/* レーダーチャート */}
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="mb-6 text-lg font-semibold text-slate-900">診断レーダーチャート</h2>
            <div className="flex flex-wrap justify-around gap-8">
              <div className="text-center">
                <p className="mb-2 text-sm font-semibold text-slate-600">学習量（生産性）</p>
                <RadarChart labels={volumeLabels} values={volumeValues} maxValue={4} size={220} color="#6366f1" />
              </div>
              <div className="text-center">
                <p className="mb-2 text-sm font-semibold text-slate-600">学習の質（効率性）</p>
                <RadarChart labels={qualityLabels} values={qualityValues} maxValue={4} size={220} color="#10b981" />
              </div>
            </div>
          </div>

          {/* AIレポート */}
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
                .print-area { margin: 0; }
                #diagnosis-report { font-size: 10pt; }
              }
            `}</style>
            <div id="diagnosis-report" dangerouslySetInnerHTML={{ __html: diagnosis.report_html ?? "" }} />
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── 小コンポーネント ──────────────────────────────────
function RatingRow({ label, desc, value, onChange }: {
  label: string; desc: string; value: DiagnosisRating; onChange: (v: DiagnosisRating) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-400">{desc}</p>
      </div>
      <div className="flex gap-1">
        {RATING_OPTIONS.map((opt) => (
          <button key={opt.value} onClick={() => onChange(opt.value)}
            className={`h-9 w-9 rounded-xl border-2 text-sm font-bold transition ${value === opt.value ? opt.color : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"}`}>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScoreCard({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? "green" : score >= 60 ? "blue" : score >= 40 ? "yellow" : "red";
  const colorClass = {
    green: "border-green-200 bg-green-50 text-green-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    yellow: "border-yellow-200 bg-yellow-50 text-yellow-700",
    red: "border-red-200 bg-red-50 text-red-700",
  }[color];
  return (
    <div className={`rounded-2xl border p-5 text-center ${colorClass}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-bold">{score}</p>
      <p className="text-xs opacity-70">/ 100</p>
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

function TrendChart({ diagnoses }: { diagnoses: Diagnosis[] }) {
  const max = 100;
  const w = 500;
  const h = 120;
  const padX = 40;
  const padY = 15;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const n = diagnoses.length;

  const toX = (i: number) => padX + (i / (n - 1)) * innerW;
  const toY = (v: number) => padY + (1 - v / max) * innerH;

  const makePath = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(v)}`).join(" ");

  const vScores = diagnoses.map((d) => d.volume_score);
  const qScores = diagnoses.map((d) => d.quality_score);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={padX} y1={toY(v)} x2={w - padX} y2={toY(v)} stroke="#f1f5f9" strokeWidth="1" />
            <text x={padX - 5} y={toY(v)} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="#94a3b8">{v}</text>
          </g>
        ))}
        <path d={makePath(vScores)} fill="none" stroke="#6366f1" strokeWidth="2" />
        <path d={makePath(qScores)} fill="none" stroke="#10b981" strokeWidth="2" />
        {vScores.map((v, i) => <circle key={i} cx={toX(i)} cy={toY(v)} r="3" fill="#6366f1" />)}
        {qScores.map((v, i) => <circle key={i} cx={toX(i)} cy={toY(v)} r="3" fill="#10b981" />)}
        {diagnoses.map((d, i) => (
          <text key={i} x={toX(i)} y={h - 3} textAnchor="middle" fontSize="8" fill="#94a3b8">
            {d.created_at.slice(5, 10)}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex gap-4 justify-center text-xs">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-indigo-500" />学習量</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-emerald-500" />学習の質</span>
      </div>
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

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">読み込み中...</div>
        ) : responses.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            提出されたアンケートはありません。生徒がテストURLからアンケートを提出すると、ここに表示されます。
          </div>
        ) : (
          <div className="space-y-3">
            {responses.map((r) => (
              <div key={r.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-slate-900">{r.student_name}</span>
                      <span className="text-sm text-slate-500">{r.grade} / {r.subject}</span>
                      <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${statusColor(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-4 text-sm text-slate-600">
                      <span>提出日: {r.created_at.slice(0, 10)}</span>
                      {r.test_percentage != null && <span>テスト正答率: {r.test_percentage}%</span>}
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
                    className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-100 whitespace-nowrap">
                    {r.status === "pending" ? "分析・確認する" : "確認・編集する"}
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
    alert("承認しました。");
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
            <div id="diagnosis-report" dangerouslySetInnerHTML={{ __html: reportHtml }} />
          </div>
        )}
      </main>
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
