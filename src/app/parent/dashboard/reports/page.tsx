"use client";
import { sanitizeHtml } from "@/lib/sanitize";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useSelectedStudentId } from "@/lib/useSelectedStudent";
import { Skeleton } from "@/components/Skeleton";

type Report = {
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
  message_to_child: string | null;
  status: "draft" | "sent";
  created_at: string;
};

function scoreClass(score: number | null) {
  if (score == null) return "bg-slate-100 text-slate-600";
  if (score >= 80) return "bg-green-100 text-green-700";
  if (score >= 60) return "bg-blue-100 text-blue-700";
  if (score >= 40) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

export default function ParentReportsPage() {
  const [selectedId] = useSelectedStudentId();
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    const { data: stu } = await supabase
      .from("students").select("name, grade").eq("id", selectedId).maybeSingle();
    if (!stu) { setLoading(false); return; }
    const { data } = await supabase
      .from("lesson_reports")
      .select("*")
      .eq("student_name", stu.name)
      .eq("test_grade", stu.grade)
      .eq("status", "sent")
      .order("created_at", { ascending: false });
    setReports((data as Report[]) ?? []);
    setLoading(false);
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  if (selected) {
    return (
      <div className="px-6 py-10 text-slate-900">
        <style>{`
          #report-html h2 { font-size:1.05rem; font-weight:700; margin:20px 0 8px; border-left:4px solid #2563eb; padding-left:10px; color:#1e293b; }
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
                {selected.student_name}「{selected.test_title}」報告書
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                {selected.test_grade} / {selected.test_subject} ・ {selected.created_at.slice(0, 10)}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSelected(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                一覧に戻る
              </button>
              <button onClick={() => window.print()}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                印刷 / PDF
              </button>
            </div>
          </div>

          {selected.message_to_child && (
            <div className="rounded-3xl border-2 border-yellow-300 bg-yellow-50 p-6 shadow-md print:border print:border-yellow-300 print:bg-yellow-50">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-2xl">⭐</span>
                <h2 className="text-base font-bold text-yellow-900">お子様に伝えて欲しいこと</h2>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-8 text-yellow-900 font-medium">
                {selected.message_to_child}
              </p>
            </div>
          )}

          {selected.percentage != null && (
            <div className="no-print rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap gap-3">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${scoreClass(selected.percentage)}`}>
                  正答率：{selected.percentage}%
                </span>
                {selected.score != null && selected.total != null && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    得点：{selected.score} / {selected.total}点
                  </span>
                )}
              </div>
            </div>
          )}

          {selected.report_html ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <div id="report-html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(selected.report_html) }} />
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400">
              レポート本文がありません。
            </div>
          )}

          {selected.teacher_notes && (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm print:border print:border-slate-300 print:bg-white">
              <h3 className="mb-2 font-semibold text-amber-900 print:text-slate-900">【講師より】</h3>
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{selected.teacher_notes}</p>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-950">報告書</h1>
          <p className="mt-1 text-slate-600">講師から送信された授業報告書を確認できます。</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-32" />
                    <div className="flex gap-2">
                      <Skeleton className="h-6 w-20 rounded-full" />
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </div>
                  </div>
                  <Skeleton className="h-10 w-16 rounded-2xl" />
                </div>
              </div>
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-4xl mb-3">📄</p>
            <p className="font-semibold text-slate-700">まだ報告書は届いていません</p>
            <p className="mt-2 text-sm text-slate-400">授業後に先生が作成すると、こちらに表示されます。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div key={r.id}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-200 hover:shadow-md cursor-pointer"
                onClick={() => setSelected(r)}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-xs text-slate-400">{r.created_at.slice(0, 10)}</p>
                    <p className="text-lg font-bold text-slate-900">{r.test_title}</p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {r.test_subject && `${r.test_subject} ・ `}{r.test_grade}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {r.percentage != null && (
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${scoreClass(r.percentage)}`}>
                          正答率：{r.percentage}%
                        </span>
                      )}
                      {r.score != null && r.total != null && (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {r.score}/{r.total}点
                        </span>
                      )}
                      {r.message_to_child && (
                        <span className="flex items-center gap-1 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700">
                          ⭐ 先生からのメッセージあり
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">
                    開く
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
