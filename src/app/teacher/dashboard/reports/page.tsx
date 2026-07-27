"use client";
import { sanitizeHtml } from "@/lib/sanitize";
import { authFetch } from "@/lib/authFetch";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/lib/toast";
import { triggerConfetti } from "@/lib/confetti";
import { Skeleton } from "@/components/Skeleton";
import { GRADE_ORDER, SUBJECT_LIST } from "@/lib/curriculum";
import { CHECK_GROUPS } from "@/lib/checkGroups";

type LessonReport = {
  id: string;
  test_title: string;
  test_subject: string | null;
  test_grade: string | null;
  student_name: string;
  student_id: string | null;
  score: number | null;
  total: number | null;
  percentage: number | null;
  report_html: string | null;
  teacher_notes: string | null;
  message_to_child: string | null;
  status: "draft" | "sent";
  report_source: "test" | "manual" | null;
  created_at: string;
};

// 教材進捗（textbook_progress）＝「何をどこまで進んだか」の単一の真実。
// 報告書はこれを“参照表示”するだけ（コピーしない＝二元管理にしない）。
type ProgressRow = {
  id: string;
  student_id: string;
  student_name: string;
  lesson_date: string;
  subject: string | null;
  textbook: string;
  progress_where: string | null;
  amount: string | null;
  understanding: "good" | "normal" | "weak" | null;
  comment: string | null;
  teacher_name: string | null;
};

const UNDERSTANDING_MAP = {
  good:   { label: "◎ 手応えあり", cls: "bg-green-100 text-green-700 border-green-300" },
  normal: { label: "○ ふつう",     cls: "bg-blue-100 text-blue-700 border-blue-300" },
  weak:   { label: "△ 不安",       cls: "bg-amber-100 text-amber-700 border-amber-300" },
} as const;

function UnderstandingPill({ u }: { u: ProgressRow["understanding"] }) {
  if (!u) return null;
  const m = UNDERSTANDING_MAP[u];
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${m.cls}`}>{m.label}</span>;
}

/** 1行サマリー文字列（一覧カード用）: 「eng3合本 ／ L7 p.42」 */
function progressSummary(p: ProgressRow): string {
  return [p.textbook, p.progress_where].filter(Boolean).join(" ／ ");
}

// つなぐ準拠 17チェック項目は @/lib/checkGroups に単一定義（AI推定APIと共有）。

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

// 報告書の中に「教材進捗（正式入力＝単一の真実）」を参照表示する。
// データは textbook_progress から読むだけ。ここでは入力させない（入力は教材進捗画面＝唯一の入力口）。
function ProgressBlock({ report }: { report: LessonReport }) {
  const [rows, setRows] = useState<ProgressRow[] | null>(null);
  const reportDate = report.created_at.slice(0, 10);

  useEffect(() => {
    (async () => {
      let q = supabase
        .from("textbook_progress")
        .select("id,student_id,student_name,lesson_date,subject,textbook,progress_where,amount,understanding,comment,teacher_name")
        .order("lesson_date", { ascending: false })
        .limit(12);
      q = report.student_id
        ? q.eq("student_id", report.student_id)
        : q.eq("student_name", report.student_name);
      const { data } = await q;
      setRows((data as ProgressRow[]) ?? []);
    })();
  }, [report.student_id, report.student_name]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm print:border print:border-slate-300">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-lg">📘</span>
        <h3 className="font-bold text-slate-800">教材進捗（何をどこまで）</h3>
        <span className="no-print rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
          正式入力より自動表示
        </span>
      </div>
      <p className="no-print mb-3 text-xs text-slate-400">
        「教材進捗」画面で入力された内容をそのまま表示しています（ここでは編集しません）。
      </p>

      {rows === null ? (
        <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-2/3" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center">
          <p className="text-sm text-slate-500">この生徒の教材進捗はまだ入力されていません。</p>
          <a href="/teacher/dashboard/progress"
            className="no-print mt-2 inline-block rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
            教材進捗を入力する →
          </a>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((p) => {
            const sameDay = p.lesson_date === reportDate;
            return (
              <li key={p.id} className={`flex items-start gap-3 py-2.5 ${sameDay ? "-mx-2 rounded-xl bg-indigo-50/60 px-2" : ""}`}>
                <span className="mt-0.5 shrink-0 text-xs font-semibold text-slate-400">{p.lesson_date}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-slate-800">{p.textbook}</span>
                    {p.progress_where && <span className="text-sm text-slate-500">／ {p.progress_where}</span>}
                    {p.amount && <span className="text-xs text-slate-400">（{p.amount}）</span>}
                    <UnderstandingPill u={p.understanding} />
                    {sameDay && <span className="no-print rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">この回</span>}
                  </div>
                  {p.comment && <p className="mt-0.5 text-xs text-slate-500">{p.comment}</p>}
                </div>
                <span className="shrink-0 text-[11px] text-slate-400">入力：{p.teacher_name ?? "—"}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ReportDetailView({ report, onBack, onUpdated }: {
  report: LessonReport;
  onBack: () => void;
  onUpdated: (r: LessonReport) => void;
}) {
  const [notes, setNotes] = useState(report.teacher_notes ?? "");
  const [messageToChild, setMessageToChild] = useState(report.message_to_child ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(report.status);

  const save = async (nextStatus?: LessonReport["status"]) => {
    setSaving(true);
    const update: Partial<LessonReport> = {
      teacher_notes: notes,
      message_to_child: messageToChild || null,
    };
    if (nextStatus) update.status = nextStatus;
    const { error } = await supabase
      .from("lesson_reports")
      .update(update)
      .eq("id", report.id);
    setSaving(false);
    if (error) {
      showToast("保存に失敗しました: " + error.message, "error");
      return;
    }
    const updated = { ...report, ...update };
    if (nextStatus) setStatus(nextStatus);
    onUpdated(updated as LessonReport);
    if (nextStatus === "sent") {
      triggerConfetti();
      showToast("報告書を送信完了しました！", "success", 4000);
    } else {
      showToast("保存しました", "success");
    }
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

        {/* 教材進捗（正式入力＝単一の真実）を参照表示。これで「報告書でわかる」 */}
        <ProgressBlock report={report} />

        {report.report_html ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div id="report-html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(report.report_html) }} />
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400">
            レポートHTMLがありません。
          </div>
        )}

        {/* 送信済みの場合の案内 */}
        {status === "sent" && (
          <div className="no-print rounded-2xl border border-green-200 bg-green-50 px-5 py-3 flex items-start gap-3">
            <span className="text-green-500 text-lg shrink-0">✅</span>
            <div className="text-sm text-green-800">
              <p className="font-semibold">この報告書は送信済みです（保護者に届いています）</p>
              <p className="mt-0.5 text-xs">「お子様へのメッセージ」や「講師コメント」を追加・編集して
              <strong>「保存する」</strong>を押すと、保護者の画面にすぐ反映されます。</p>
            </div>
          </div>
        )}

        <div className="no-print rounded-3xl border-2 border-yellow-300 bg-yellow-50 p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xl">⭐</span>
            <h3 className="font-bold text-yellow-900">お子様に伝えて欲しいこと</h3>
          </div>
          <p className="mb-3 text-xs text-yellow-800">
            保護者が報告書を開いたとき<strong>最初に目に入る場所</strong>に表示されます。褒め・成長を具体的に。
          </p>
          <textarea
            value={messageToChild}
            onChange={(e) => setMessageToChild(e.target.value)}
            rows={3}
            placeholder="例：今日は難しい問題でも諦めずに最後まで取り組めました。途中式を丁寧に書く習慣がついてきています。"
            className="w-full rounded-2xl border border-yellow-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-yellow-400"
          />
        </div>

        <div className="no-print rounded-3xl border border-indigo-200 bg-indigo-50 p-6 shadow-sm">
          <h3 className="mb-3 font-semibold text-indigo-900">講師コメント・補足</h3>
          <p className="mb-3 text-xs text-indigo-600">
            AIレポートに追加したいコメント・修正事項・保護者への連絡事項を記入してください。
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="例：今回の授業で特に頑張っていた点、次回に向けた具体的なアドバイス..."
            className="w-full rounded-2xl border border-indigo-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {/* 下書きに戻す */}
            {status === "sent" && (
              <button onClick={() => save("draft")} disabled={saving}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs text-slate-400 hover:bg-slate-50 disabled:opacity-40 transition">
                下書きに戻す
              </button>
            )}
            <div className="flex flex-wrap gap-3 ml-auto">
              {status === "sent" ? (
                <button onClick={() => save()} disabled={saving}
                  className="rounded-xl bg-green-600 px-6 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40 transition">
                  {saving ? "保存中..." : "保存する（保護者に即反映）"}
                </button>
              ) : (
                <>
                  <button onClick={() => save()} disabled={saving}
                    className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                    {saving ? "保存中..." : "コメントを保存"}
                  </button>
                  <button onClick={() => save("sent")} disabled={saving || !report.report_html}
                    className="rounded-xl bg-green-600 px-6 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40">
                    {saving ? "処理中..." : "✓ 送信完了にする"}
                  </button>
                </>
              )}
            </div>
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
  const [studentFilter, setStudentFilter] = useState<string>("all");
  const [showManualForm, setShowManualForm] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [latestProg, setLatestProg] = useState<{ byId: Map<string, ProgressRow>; byName: Map<string, ProgressRow> }>(
    { byId: new Map(), byName: new Map() }
  );

  // 生徒ごとの最新の教材進捗（単一の真実）を読み込み、一覧カードにも反映する
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("textbook_progress")
        .select("id,student_id,student_name,lesson_date,subject,textbook,progress_where,amount,understanding,comment,teacher_name")
        .order("lesson_date", { ascending: false })
        .limit(2000);
      const byId = new Map<string, ProgressRow>();
      const byName = new Map<string, ProgressRow>();
      for (const p of (data as ProgressRow[]) ?? []) {
        if (p.student_id && !byId.has(p.student_id)) byId.set(p.student_id, p);
        if (p.student_name && !byName.has(p.student_name)) byName.set(p.student_name, p);
      }
      setLatestProg({ byId, byName });
    })();
  }, []);

  const latestFor = (r: LessonReport): ProgressRow | null =>
    (r.student_id ? latestProg.byId.get(r.student_id) : undefined) ?? latestProg.byName.get(r.student_name) ?? null;

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

  // 一覧から1クリックで保護者に送信（開かずに送れる）
  const sendOne = async (r: LessonReport) => {
    if (!r.report_html) { showToast("本文が未生成です。開いて編集してから送信してください", "info"); return; }
    if (!confirm(`${r.student_name} の報告書を保護者に送信します。よろしいですか？`)) return;
    setSendingId(r.id);
    const { error } = await supabase.from("lesson_reports").update({ status: "sent" }).eq("id", r.id);
    setSendingId(null);
    if (error) { showToast(error.message, "error"); return; }
    setReports((prev) => prev.map((x) => x.id === r.id ? { ...x, status: "sent" } : x));
    showToast(`${r.student_name} の報告書を送信しました`, "success");
    triggerConfetti();
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

  const studentNames = [...new Set(reports.map((r) => r.student_name))].sort();

  const filtered = reports.filter((r) => {
    if (filter === "draft" && r.status !== "draft") return false;
    if (filter === "sent"  && r.status !== "sent")  return false;
    if (studentFilter !== "all" && r.student_name !== studentFilter) return false;
    return true;
  });

  const draftCount = reports.filter((r) => r.status === "draft").length;

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <main className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">報告書</h1>
            <p className="mt-1 text-slate-600">一覧・一括用（作成／送信）。ひとりの子の全体像は「生徒一覧」→生徒名の操作卓で。</p>
          </div>
          <button
            onClick={() => setShowManualForm(true)}
            className="rounded-2xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 transition"
          >
            + 手動で報告書を作成
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
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

        {studentNames.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">生徒:</span>
            <button
              onClick={() => setStudentFilter("all")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                studentFilter === "all" ? "bg-slate-800 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}>
              全員
            </button>
            {studentNames.map((name) => (
              <button key={name} onClick={() => setStudentFilter(name)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  studentFilter === name ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}>
                {name}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map((i) => (
              <div key={i} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex gap-2"><Skeleton className="h-5 w-14" /><Skeleton className="h-5 w-20" /></div>
                    <Skeleton className="h-6 w-36" />
                    <Skeleton className="h-4 w-56" />
                  </div>
                  <Skeleton className="h-10 w-24 rounded-2xl" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-4xl mb-3">📄</p>
            <p className="font-semibold text-slate-700">
              {studentFilter !== "all" ? `${studentFilter} さんの報告書がありません` : "報告書がありません"}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              テストの採点後「報告書を保存」を押すか、手動で作成してください。
            </p>
            <button onClick={() => setShowManualForm(true)}
              className="mt-5 rounded-2xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition">
              + 手動で報告書を作成
            </button>
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
                    {(() => {
                      const p = latestFor(r);
                      return p ? (
                        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">📘 {progressSummary(p)}</span>
                          <UnderstandingPill u={p.understanding} />
                          <span className="text-slate-300">{p.lesson_date}</span>
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-slate-300">📘 教材進捗：未入力</p>
                      );
                    })()}
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
                  <div className="flex shrink-0 flex-col gap-2">
                    <button onClick={() => setSelected(r)}
                      className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition shadow-sm ${
                        r.status === "sent"
                          ? "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                          : "bg-indigo-600 text-white hover:bg-indigo-700"
                      }`}>
                      {r.status === "sent" ? "確認する" : "開いて編集"}
                    </button>
                    {r.status === "draft" && r.report_html && (
                      <button onClick={() => sendOne(r)} disabled={sendingId === r.id}
                        className="rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50">
                        {sendingId === r.id ? "送信中…" : "✓ 送信"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ── テンプレート管理（localStorage）──────────────────────────
const TEMPLATE_KEY = "manabi_report_templates";
type Template = { id: string; name: string; subject: string; learningContent: string; learningMethod: string };

function loadTemplates(): Template[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? "[]"); } catch { return []; }
}
function saveTemplateToStorage(name: string, data: Omit<Template, "id" | "name">) {
  const all = loadTemplates().filter((t) => t.name !== name);
  all.unshift({ id: Date.now().toString(), name, ...data });
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(all.slice(0, 6)));
}
function deleteTemplateFromStorage(id: string) {
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(loadTemplates().filter((t) => t.id !== id)));
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
  const [studentId, setStudentId] = useState<string | null>(null);
  const [grade, setGrade] = useState("中1");
  const [subject, setSubject] = useState("数学");
  const [learningContent, setLearningContent] = useState("");
  const [learningMethod, setLearningMethod] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [messageToChild, setMessageToChild] = useState("");
  const [teacherNotes, setTeacherNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [error, setError] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [estimateNote, setEstimateNote] = useState("");

  useEffect(() => {
    supabase.from("students").select("id, name, grade").order("name").then(({ data }) => {
      setStudents(data ?? []);
    });
    setTemplates(loadTemplates());
  }, []);

  const toggleItem = (item: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  // 学力診断・テスト結果から17項目をAI推定して下書きチェックを入れる（講師が確認・調整する前提）
  const estimateChecks = async () => {
    if (!studentName.trim()) { setError("生徒名を入力してください"); return; }
    setEstimating(true);
    setEstimateNote("");
    try {
      const res = await authFetch("/api/reports/estimate-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentName: studentName.trim(), studentId: studentId || undefined, subject }),
      });
      const data = await res.json();
      if (data.error) { setEstimateNote(data.error); return; }
      if (Array.isArray(data.checkedItems)) {
        setCheckedItems(new Set(data.checkedItems));
        setEstimateNote(
          data.message ??
            `17項目中${data.checkedItems.length}項目を「できている」と推定しました（下書き）。確認・調整してください。`
        );
      }
    } catch (e) {
      setEstimateNote("推定に失敗しました: " + String(e));
    } finally {
      setEstimating(false);
    }
  };

  const selectStudent = (name: string) => {
    setStudentName(name);
    const s = students.find((s) => s.name === name);
    if (s) { setGrade(s.grade); setStudentId(s.id); }
    else setStudentId(null);
  };

  const generate = async () => {
    if (!studentName.trim()) { setError("生徒名を入力してください"); return; }
    setError("");
    setGenerating(true);
    setPreviewHtml("");
    try {
      // Step1: Claude でHTMLを生成
      const res = await authFetch("/api/reports/generate-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: studentName.trim(),
          grade,
          subject,
          learningContent,
          learningMethod,
          checkedItems: Array.from(checkedItems),
          messageToChild: messageToChild || undefined,
          teacherNotes: teacherNotes || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }

      // Step2: 認証済みセッションでクライアントから直接INSERT（RLS対応）
      const { error: dbErr } = await supabase.from("lesson_reports").insert({
        test_title: data.title,
        test_subject: subject,
        test_grade: grade,
        student_name: studentName.trim(),
        student_id: studentId || null,
        report_html: data.reportHtml,
        teacher_notes: teacherNotes || null,
        message_to_child: messageToChild || null,
        status: "draft",
        report_source: "manual",
        learning_content: learningContent || null,
        learning_method: learningMethod || null,
        checked_items: Array.from(checkedItems),
      });
      if (dbErr) { setError("報告書の保存に失敗しました: " + dbErr.message); return; }

      setPreviewHtml(data.reportHtml);
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

        {/* テンプレート */}
        {templates.length > 0 && (
          <div className="no-print rounded-3xl border border-indigo-100 bg-indigo-50 p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-indigo-900">保存済みテンプレート</h2>
              <span className="text-xs text-indigo-500">{templates.length}件</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center gap-1 rounded-2xl border border-indigo-200 bg-white px-3 py-1.5 text-xs shadow-sm">
                  <button onClick={() => {
                    setSubject(t.subject);
                    setLearningContent(t.learningContent);
                    setLearningMethod(t.learningMethod);
                    showToast(`「${t.name}」を読み込みました`, "success");
                  }} className="font-semibold text-indigo-700 hover:text-indigo-900">
                    {t.name}
                  </button>
                  <button onClick={() => {
                    deleteTemplateFromStorage(t.id);
                    setTemplates(loadTemplates());
                    showToast("テンプレートを削除しました", "info");
                  }} className="ml-1 text-slate-300 hover:text-red-400">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 学習内容・方法 */}
        <div className="no-print rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">授業内容</h2>
            {!showTemplateSave ? (
              <button onClick={() => setShowTemplateSave(true)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 transition">
                テンプレートに保存
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input value={templateName} onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="テンプレート名" autoFocus
                  className="w-36 rounded-xl border border-slate-200 px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-400" />
                <button onClick={() => {
                  if (!templateName.trim()) return;
                  saveTemplateToStorage(templateName.trim(), { subject, learningContent, learningMethod });
                  setTemplates(loadTemplates());
                  setShowTemplateSave(false);
                  setTemplateName("");
                  showToast("テンプレートを保存しました", "success");
                }} className="rounded-xl bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700">
                  保存
                </button>
                <button onClick={() => setShowTemplateSave(false)} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
              </div>
            )}
          </div>
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">学習スキルチェック（17項目）</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                チェック済み: {checkedItems.size} / 17
              </span>
              <button
                type="button"
                onClick={estimateChecks}
                disabled={estimating || !studentName.trim()}
                className="rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 transition"
              >
                {estimating ? "推定中..." : "診断・テストから17項目を推定（下書き）"}
              </button>
            </div>
          </div>
          {estimateNote && (
            <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
              {estimateNote}
            </div>
          )}
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

        {/* お子様に伝えて欲しいこと */}
        <div className="no-print rounded-3xl border-2 border-yellow-300 bg-yellow-50 p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-2xl">⭐</span>
            <h2 className="font-bold text-yellow-900">お子様に伝えて欲しいこと</h2>
          </div>
          <p className="mb-3 text-xs text-yellow-800">
            保護者が報告書を開いたとき<strong>最初に目に入る場所</strong>に大きく表示されます。<br />
            お子さんの頑張りや成長を具体的に書くと、保護者が繰り返し読み、お子さんに伝えてくれます。
          </p>
          <textarea
            value={messageToChild}
            onChange={(e) => setMessageToChild(e.target.value)}
            rows={3}
            placeholder="例：今日は難しい問題でも諦めずに最後まで取り組めました。特に途中式を丁寧に書く習慣がついてきています。このまま続けていきましょう！"
            className="w-full rounded-xl border border-yellow-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-400"
          />
        </div>

        {/* 講師メモ */}
        <div className="no-print rounded-3xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-700">講師メモ（任意・保護者非公開）</h2>
          <textarea
            value={teacherNotes}
            onChange={(e) => setTeacherNotes(e.target.value)}
            rows={2}
            placeholder="例：次回は英語の単語テストを実施予定"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
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
              <div id="manual-report-preview" dangerouslySetInnerHTML={{ __html: sanitizeHtml(previewHtml) }} />
            </div>
            <div className="no-print flex justify-end gap-3">
              <button onClick={onCreated}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                報告書一覧へ
              </button>
              <button
                onClick={() => {
                  setPreviewHtml("");
                  setStudentName("");
                  setLearningContent("");
                  setLearningMethod("");
                  setCheckedItems(new Set());
                  setMessageToChild("");
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
