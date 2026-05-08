"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type Report = {
  id: string;
  session_id: string;
  student_name: string;
  grade: string | null;
  subject: string | null;
  test_score: number | null;
  test_total: number | null;
  test_percentage: number | null;
  habit_score: number | null;
  method_score: number | null;
  skill_score: number | null;
  report_html: string | null;
  teacher_notes: string | null;
  ai_analysis: string | null;
  status: "pending" | "analyzed" | "approved" | "sent";
  created_at: string;
};

function ScorePill({ label, score }: { label: string; score: number }) {
  const color =
    score >= 80 ? "text-green-700 bg-green-100"
    : score >= 60 ? "text-blue-700 bg-blue-100"
    : score >= 40 ? "text-yellow-700 bg-yellow-100"
    : "text-red-700 bg-red-100";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>
      {label}：{score}
    </span>
  );
}

function statusBadge(s: Report["status"]) {
  if (s === "sent")     return <span className="rounded-full bg-green-100 px-3 py-0.5 text-xs font-bold text-green-700">送信済</span>;
  if (s === "approved") return <span className="rounded-full bg-blue-100 px-3 py-0.5 text-xs font-bold text-blue-700">承認済</span>;
  if (s === "analyzed") return <span className="rounded-full bg-indigo-100 px-3 py-0.5 text-xs font-bold text-indigo-700">分析済</span>;
  return <span className="rounded-full bg-amber-100 px-3 py-0.5 text-xs font-bold text-amber-700">未分析</span>;
}

// ── レポート詳細・編集ビュー ────────────────────────────
function ReportDetailView({ report, onBack, onUpdated }: {
  report: Report;
  onBack: () => void;
  onUpdated: (r: Report) => void;
}) {
  const [notes, setNotes] = useState(report.teacher_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(report.status);

  const save = async (nextStatus?: Report["status"]) => {
    setSaving(true);
    const update: Partial<Report> = { teacher_notes: notes };
    if (nextStatus) update.status = nextStatus;
    const { data } = await supabase
      .from("questionnaire_responses")
      .update(update)
      .eq("session_id", report.session_id)
      .select()
      .single();
    if (data) {
      const updated = { ...report, ...update };
      if (nextStatus) setStatus(nextStatus);
      onUpdated(updated as Report);
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
        .score-green { color:#16a34a; font-weight:700; }
        .score-blue  { color:#2563eb; font-weight:700; }
        .score-yellow{ color:#d97706; font-weight:700; }
        .score-red   { color:#dc2626; font-weight:700; }
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
            <h1 className="text-xl font-bold text-slate-950">
              {report.student_name}（{report.grade} / {report.subject}）の報告書
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">提出日: {report.created_at.slice(0, 10)}</p>
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

        {/* スコアサマリー */}
        <div className="no-print rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap gap-3">
            {report.test_percentage != null && <ScorePill label="テスト正答率" score={report.test_percentage} />}
            {report.habit_score != null && <ScorePill label="学習習慣" score={report.habit_score} />}
            {report.method_score != null && <ScorePill label="学習法" score={report.method_score} />}
            {report.skill_score != null && <ScorePill label="学力スキル" score={report.skill_score} />}
          </div>
        </div>

        {/* AI生成レポート本文 */}
        {report.report_html ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div id="report-html" dangerouslySetInnerHTML={{ __html: report.report_html }} />
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400">
            AIレポートがまだ生成されていません。多層診断のヒューマンチェックからAI分析を実行してください。
          </div>
        )}

        {/* 講師コメント欄 */}
        <div className="no-print rounded-3xl border border-indigo-200 bg-indigo-50 p-6 shadow-sm">
          <h3 className="mb-3 font-semibold text-indigo-900">講師コメント・補足</h3>
          <p className="mb-3 text-xs text-indigo-600">
            AIレポートに追加したいコメント・修正事項・保護者へのメッセージを記入してください。不要な場合は空欄のままで構いません。
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder="例：今回のテストで特に頑張っていた点、次回に向けた具体的なアドバイス、保護者への連絡事項など..."
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

        {/* 講師コメント印刷エリア */}
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

// ── メインページ ────────────────────────────────────────
export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Report | null>(null);
  const [filter, setFilter] = useState<"all" | "analyzed" | "sent">("all");

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("questionnaire_responses")
      .select("*")
      .in("status", ["analyzed", "approved", "sent"])
      .order("created_at", { ascending: false });
    setReports((data as Report[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleUpdated = (updated: Report) => {
    setReports((prev) => prev.map((r) => r.session_id === updated.session_id ? updated : r));
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

  const filtered = reports.filter((r) => {
    if (filter === "analyzed") return r.status === "analyzed" || r.status === "approved";
    if (filter === "sent")     return r.status === "sent";
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">報告書</h1>
            <p className="mt-1 text-slate-600">AI分析済みの報告書に講師コメントを加えて送信できます</p>
          </div>
        </div>

        {/* フィルタタブ */}
        <div className="no-print mb-6 flex gap-2">
          {([
            { key: "all",      label: "すべて" },
            { key: "analyzed", label: "未送信" },
            { key: "sent",     label: "送信済" },
          ] as const).map((tab) => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                filter === tab.key
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}>
              {tab.label}
              {tab.key === "analyzed" && reports.filter((r) => r.status === "analyzed" || r.status === "approved").length > 0 && (
                <span className="ml-2 rounded-full bg-indigo-500 px-1.5 text-xs text-white">
                  {reports.filter((r) => r.status === "analyzed" || r.status === "approved").length}
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
              多層診断のヒューマンチェックでAI分析を完了すると、ここに表示されます。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <div key={r.session_id}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {statusBadge(r.status)}
                      <span className="text-xs text-slate-400">{r.created_at.slice(0, 10)}</span>
                    </div>
                    <p className="text-lg font-bold text-slate-900">{r.student_name}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{r.subject} ・ {r.grade}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.test_percentage != null && <ScorePill label="テスト正答率" score={r.test_percentage} />}
                      {r.habit_score != null && <ScorePill label="学習習慣" score={r.habit_score} />}
                      {r.method_score != null && <ScorePill label="学習法" score={r.method_score} />}
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
