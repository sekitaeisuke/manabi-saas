"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { GRADE_ORDER, SUBJECT_LIST } from "@/lib/curriculum";

type LessonReport = {
  id: string;
  test_title: string;
  test_subject: string | null;
  test_grade: string | null;
  student_name: string;
  score: number | null;
  total: number | null;
  percentage: number | null;
  report_html: string | null;
  teacher_notes: string | null;
  status: "draft" | "sent";
  report_source: "test" | "manual" | null;
  created_at: string;
};

// ── つなぐ準拠 17チェック項目 ──────────────────────────────
const CHECK_GROUPS = [
  {
    label: "成果物",
    color: "border-indigo-200 bg-indigo-50",
    items: [
      "1日の内容が終えられる",
      "時間通りに進める",
      "暗算・暗記がスムーズ",
      "苦手単元も取り組める",
      "問題量が多い",
    ],
  },
  {
    label: "読む",
    color: "border-blue-200 bg-blue-50",
    items: [
      "問題を読む／わかる",
      "解説を読む／わかる",
      "ノートを読む／わかる",
    ],
  },
  {
    label: "書く",
    color: "border-green-200 bg-green-50",
    items: ["ノートを使う", "途中式を書く", "言葉を書いて練習する"],
  },
  {
    label: "聞く",
    color: "border-amber-200 bg-amber-50",
    items: ["質問・相談する", "授業をわかるまで", "テスト情報収集"],
  },
  {
    label: "考える",
    color: "border-purple-200 bg-purple-50",
    items: ["誤答原因がわかる", "教科バランス良い", "解き直しを実践"],
  },
] as const;

function ScorePill({ label, score }: { label: string; score: number }) {
  const color =
    score >= 80 ? "text-green-700 bg-green-100"
    : score >= 60 ? "text-blue-700 bg-blue-100"
    : score >= 40 ? "text-yellow-700 bg-yellow-100"
    : "text-red-700 bg-red-100";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>
      {label}：{score}%
    </span>
  );
}

function statusBadge(s: LessonReport["status"]) {
  if (s === "sent") return <span className="rounded-full bg-green-100 px-3 py-0.5 text-xs font-bold text-green-700">送信済</span>;
  return <span className="rounded-full bg-amber-100 px-3 py-0.5 text-xs font-bold text-amber-700">下書き</span>;
}

function ReportDetailView({ report, onBack, onUpdated }: {
  report: LessonReport;
  onBack: () => void;
  onUpdated: (r: LessonReport) => void;
}) {
  const [notes, setNotes] = useState(report.teacher_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(report.status);

  const save = async (nextStatus?: LessonReport["status"]) => {
    setSaving(true);
    const update: Partial<LessonReport> = { teacher_notes: notes };
    if (nextStatus) update.status = nextStatus;
    const { data } = await supabase
      .from("lesson_reports")
      .update(update)
      .eq("id", report.id)
      .select()
      .single();
    if (data) {
      const updated = { ...report, ...update };
      if (nextStatus) setStatus(nextStatus);
      onUpdated(updated as LessonReport);
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10">
      <style>{`
        #report-html h2 { font-size:1.05rem; font-weight:700; margin:20px 0 8px; border-left:4px solid #4f46e5; padding-left:10px; color:#1e293b; }
        #report-html h3 { font-size:0.95rem; font-weight:600; margin:14px 0 6px; color:#334155; }
        #report-html p, #report-html li { line-height:1.8; font-size:0.9rem; color:#475569; }
        #report-html ul { padding-left:1.5rem; }
        #report-html table { border-collapse:collapse; width:100%; margin:10px 0; font-size:0.875rem; }
        #report-html td, #report-html th { border:1px solid #e2e8f0; padding:6px 10px; }
        #report-html th { background:#f8fafc; font-weight:600; }
        @media print {
          @page { size:A4 portrait; margin:15mm; }
          .no-print { display:none !important; }
          body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        }
      `}</style>

      <main className="mx-auto max-w-4xl space-y-6">
        <div className="no-print flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-950">
              {report.student_name}「{report.test_title}」授業報告書
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {report.test_grade} / {report.test_subject} ・ {report.created_at.slice(0, 10)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {statusBadge(status)}
            <button onClick={onBack}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              一覧に戻る
            </button>
            <button onClick={() => window.print()}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
              印刷 / PDF
            </button>
          </div>
        </div>

        {report.percentage != null && (
          <div className="no-print rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-3">
              <ScorePill label="正答率" score={report.percentage} />
              {report.score != null && report.total != null && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  得点：{report.score} / {report.total}点
                </span>
              )}
            </div>
          </div>
        )}

        {report.report_html ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div id="report-html" dangerouslySetInnerHTML={{ __html: report.report_html }} />
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400">
            レポートHTMLがありません。
          </div>
        )}

        <div className="no-print rounded-3xl border border-indigo-200 bg-indigo-50 p-6 shadow-sm">
          <h3 className="mb-3 font-semibold text-indigo-900">講師コメント・補足</h3>
          <p className="mb-3 text-xs text-indigo-600">
            AIレポートに追加したいコメント・修正事項・保護者へのメッセージを記入してください。
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder="例：今回の授業で特に頑張っていた点、次回に向けた具体的なアドバイス、保護者への連絡事項など..."
            className="w-full rounded-2xl border border-indigo-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <button onClick={() => save()} disabled={saving}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              {saving ? "保存中..." : "コメントを保存"}
            </button>
            {status !== "sent" && (
              <button onClick={() => save("sent")} disabled={saving || !report.report_html}
                className="rounded-xl bg-green-600 px-6 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40">
                {saving ? "処理中..." : "✓ 送信完了にする"}
              </button>
            )}
            {status === "sent" && (
              <span className="rounded-xl bg-green-100 px-5 py-2 text-sm font-semibold text-green-700">
                送信済み
              </span>
            )}
          </div>
        </div>

        {notes && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm print:border print:border-slate-300 print:bg-white">
            <h3 className="mb-2 font-semibold text-amber-900 print:text-slate-900">【講師より】</h3>
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{notes}</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ReportsPage() {
  const [reports, setReports] = useState<LessonReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LessonReport | null>(null);
  const [filter, setFilter] = useState<"all" | "draft" | "sent">("all");
  const [showManualForm, setShowManualForm] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("lesson_reports")
      .select("*")
      .order("created_at", { ascending: false });
    setReports((data as LessonReport[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleUpdated = (updated: LessonReport) => {
    setReports((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    setSelected(updated);
  };

  if (selected) {
    return (
      <ReportDetailView
        report={selected}
        onBack={() => { setSelected(null); fetchReports(); }}
        onUpdated={handleUpdated}
      />
    );
  }

  if (showManualForm) {
    return (
      <ManualReportForm
        onBack={() => setShowManualForm(false)}
        onCreated={() => { setShowManualForm(false); fetchReports(); }}
      />
    );
  }

  const filtered = reports.filter((r) => {
    if (filter === "draft") return r.status === "draft";
    if (filter === "sent")  return r.status === "sent";
    return true;
  });

  const draftCount = reports.filter((r) => r.status === "draft").length;

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">報告書</h1>
            <p className="mt-1 text-slate-600">テスト後、または手動で授業報告書を作成・送信できます</p>
          </div>
          <button
            onClick={() => setShowManualForm(true)}
            className="rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 transition"
          >
            + 手動で報告書を作成
          </button>
        </div>

        <div className="mb-6 flex gap-2">
          {([
            { key: "all",   label: "すべて" },
            { key: "draft", label: "未送信" },
            { key: "sent",  label: "送信済" },
          ] as const).map((tab) => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                filter === tab.key
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}>
              {tab.label}
              {tab.key === "draft" && draftCount > 0 && (
                <span className="ml-2 rounded-full bg-indigo-500 px-1.5 text-xs text-white">
                  {draftCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            <p>報告書がありません。</p>
            <p className="mt-1 text-sm text-slate-400">
              授業確認テストの採点後「報告書を保存」を押すと、ここに表示されます。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <div key={r.id}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {statusBadge(r.status)}
                      {r.report_source === "manual" && (
                        <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-700">手動作成</span>
                      )}
                      <span className="text-xs text-slate-400">{r.created_at.slice(0, 10)}</span>
                    </div>
                    <p className="text-lg font-bold text-slate-900">{r.student_name}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{r.test_title}　{r.test_subject && `・ ${r.test_subject}`}　{r.test_grade}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.percentage != null && <ScorePill label="正答率" score={r.percentage} />}
                      {r.score != null && r.total != null && (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {r.score}/{r.total}点
                        </span>
                      )}
                    </div>
                    {r.teacher_notes && (
                      <p className="mt-3 line-clamp-1 text-xs text-slate-400">
                        💬 {r.teacher_notes}
                      </p>
                    )}
                  </div>
                  <button onClick={() => setSelected(r)}
                    className={`shrink-0 rounded-2xl px-5 py-2.5 text-sm font-semibold transition shadow-sm ${
                      r.status === "sent"
                        ? "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                        : "bg-indigo-600 text-white hover:bg-indigo-700"
                    }`}>
                    {r.status === "sent" ? "確認する" : "開いて編集"}
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

// ── 手動報告書作成フォーム ────────────────────────────────
function ManualReportForm({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: () => void;
}) {
  const [students, setStudents] = useState<{ id: string; name: string; grade: string }[]>([]);
  const [studentName, setStudentName] = useState("");
  const [grade, setGrade] = useState("中1");
  const [subject, setSubject] = useState("数学");
  const [learningContent, setLearningContent] = useState("");
  const [learningMethod, setLearningMethod] = useState("");
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [teacherNotes, setTeacherNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from("students").select("id, name, grade").order("name").then(({ data }) => {
      setStudents(data ?? []);
    });
  }, []);

  const toggleItem = (item: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  const selectStudent = (name: string) => {
    setStudentName(name);
    const s = students.find((s) => s.name === name);
    if (s) setGrade(s.grade);
  };

  const generate = async () => {
    if (!studentName.trim()) { setError("生徒名を入力してください"); return; }
    setError("");
    setGenerating(true);
    setPreviewHtml("");
    setSaved(false);
    try {
      const res = await fetch("/api/reports/generate-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: studentName.trim(),
          grade,
          subject,
          learningContent,
          learningMethod,
          checkedItems: Array.from(checkedItems),
          teacherNotes: teacherNotes || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setPreviewHtml(data.reportHtml);
      setSaved(true);
    } catch (e) {
      setError("エラー: " + String(e));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <style>{`
        #manual-report-preview h2 { font-size:1.05rem; font-weight:700; margin:20px 0 8px; border-left:4px solid #4f46e5; padding-left:10px; color:#1e293b; }
        #manual-report-preview h3 { font-size:0.95rem; font-weight:600; margin:14px 0 6px; color:#334155; }
        #manual-report-preview p, #manual-report-preview li { line-height:1.8; font-size:0.9rem; color:#475569; }
        #manual-report-preview ul { padding-left:1.5rem; }
        #manual-report-preview table { border-collapse:collapse; width:100%; margin:10px 0; font-size:0.875rem; }
        #manual-report-preview td, #manual-report-preview th { border:1px solid #e2e8f0; padding:6px 10px; }
        #manual-report-preview th { background:#f8fafc; font-weight:600; }
        @media print {
          @page { size:A4 portrait; margin:15mm; }
          .no-print { display:none !important; }
          body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        }
      `}</style>

      <main className="mx-auto max-w-4xl space-y-6">
        {/* ヘッダー */}
        <div className="no-print flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">手動で報告書を作成</h1>
            <p className="mt-1 text-sm text-slate-500">学習内容・方法・チェック項目を入力してAIが報告書を生成します</p>
          </div>
          <div className="flex gap-3">
            <button onClick={onBack}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              一覧に戻る
            </button>
            {previewHtml && (
              <button onClick={() => window.print()}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                印刷 / PDF
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="no-print rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {/* 基本情報 */}
        <div className="no-print rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-slate-900">基本情報</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-1 text-sm text-slate-700">
              生徒名
              <div className="relative">
                <input
                  list="student-datalist"
                  value={studentName}
                  onChange={(e) => selectStudent(e.target.value)}
                  placeholder="名前を入力または選択"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <datalist id="student-datalist">
                  {students.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}（{s.grade}）</option>
                  ))}
                </datalist>
              </div>
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              学年
              <select value={grade} onChange={(e) => setGrade(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400">
                {GRADE_ORDER.map((g) => <option key={g}>{g}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              教科
              <select value={subject} onChange={(e) => setSubject(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400">
                {SUBJECT_LIST.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>
        </div>

        {/* 学習内容・方法 */}
        <div className="no-print rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-slate-900">授業内容</h2>
          <label className="grid gap-1 text-sm text-slate-700">
            学習内容（what）
            <textarea
              value={learningContent}
              onChange={(e) => setLearningContent(e.target.value)}
              rows={3}
              placeholder="例：数学の二次方程式（解の公式）を使って文章題を練習した"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </label>
          <label className="grid gap-1 text-sm text-slate-700">
            学習方法（how）
            <textarea
              value={learningMethod}
              onChange={(e) => setLearningMethod(e.target.value)}
              rows={3}
              placeholder="例：例題を講師と一緒に解いた後、類題を自力で5問解いて途中式を確認した"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </label>
        </div>

        {/* 17チェック項目 */}
        <div className="no-print rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">学習スキルチェック（17項目）</h2>
            <span className="text-xs text-slate-400">
              チェック済み: {checkedItems.size} / 17
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CHECK_GROUPS.map((group) => (
              <div key={group.label} className={`rounded-2xl border p-4 ${group.color}`}>
                <p className="mb-3 text-xs font-bold text-slate-600 uppercase tracking-wide">{group.label}</p>
                <div className="space-y-2">
                  {group.items.map((item) => (
                    <label key={item} className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={checkedItems.has(item)}
                        onChange={() => toggleItem(item)}
                        className="mt-0.5 h-4 w-4 accent-indigo-600 shrink-0"
                      />
                      <span className="text-sm text-slate-700 leading-snug">{item}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 講師メモ */}
        <div className="no-print rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="mb-3 font-semibold text-amber-900">講師メモ（任意）</h2>
          <p className="mb-3 text-xs text-amber-700">レポートには反映しますが、AIへの補足指示として使えます</p>
          <textarea
            value={teacherNotes}
            onChange={(e) => setTeacherNotes(e.target.value)}
            rows={3}
            placeholder="例：今日は特に集中できていた。次回は英語の単語テストを実施予定"
            className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        {/* 生成ボタン */}
        <div className="no-print">
          {generating ? (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              <span className="font-semibold text-indigo-700">AIが報告書を生成しています...</span>
            </div>
          ) : (
            <button
              onClick={generate}
              disabled={!studentName.trim()}
              className="w-full rounded-2xl bg-indigo-600 py-4 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40 transition"
            >
              AIで報告書を生成する →
            </button>
          )}
        </div>

        {/* 生成済みプレビュー */}
        {previewHtml && (
          <>
            <div className="no-print rounded-3xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700">
              ✓ 報告書を生成・保存しました。一覧の「下書き」に追加されています。
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <div id="manual-report-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
            <div className="no-print flex justify-end gap-3">
              <button onClick={onCreated}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                報告書一覧へ
              </button>
              <button
                onClick={() => {
                  setPreviewHtml("");
                  setSaved(false);
                  setStudentName("");
                  setLearningContent("");
                  setLearningMethod("");
                  setCheckedItems(new Set());
                  setTeacherNotes("");
                }}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
                別の報告書を作成
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
