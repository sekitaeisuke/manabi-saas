"use client";
import { sanitizeHtml } from "@/lib/sanitize";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { LearningPlan } from "@/lib/supabase";
import { useSelectedStudentId } from "@/lib/useSelectedStudent";

export default function ParentKartePage() {
  const [selectedId] = useSelectedStudentId();
  const [plans, setPlans] = useState<LearningPlan[]>([]);
  const [selected, setSelected] = useState<LearningPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    const { data: stu } = await supabase.from("students").select("name").eq("id", selectedId).maybeSingle();
    if (!stu) { setLoading(false); return; }
    const { data } = await supabase
      .from("learning_plans")
      .select("*")
      .eq("student_name", stu.name)
      .eq("status", "shared")
      .order("created_at", { ascending: false });
    setPlans((data as LearningPlan[]) ?? []);
    setLoading(false);
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  if (selected) {
    return (
      <div className="px-6 py-10 text-slate-900">
        <style>{`
          #plan-html h2 { font-size:1.05rem; font-weight:700; margin:20px 0 8px; border-left:4px solid #2563eb; padding-left:10px; color:#1e293b; }
          #plan-html h3 { font-size:0.95rem; font-weight:600; margin:14px 0 6px; color:#334155; }
          #plan-html p, #plan-html li { line-height:1.8; font-size:0.9rem; color:#475569; }
          #plan-html ul { padding-left:1.5rem; }
          #plan-html table { border-collapse:collapse; width:100%; margin:10px 0; font-size:0.875rem; }
          #plan-html td, #plan-html th { border:1px solid #e2e8f0; padding:6px 10px; }
          #plan-html th { background:#f8fafc; font-weight:600; }
        `}</style>
        <main className="mx-auto max-w-4xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-950">
                {selected.student_name} ・ {selected.subject} 3か月ビジョン
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                {selected.grade} ・ {selected.created_at.slice(0, 10)}
              </p>
            </div>
            <button onClick={() => setSelected(null)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              一覧に戻る
            </button>
          </div>

          {selected.test_percentage != null && (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap gap-3">
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                  診断時の正答率：{selected.test_percentage}%
                </span>
                {selected.test_score != null && selected.test_total != null && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    得点：{selected.test_score} / {selected.test_total}点
                  </span>
                )}
              </div>
            </div>
          )}

          {selected.selected_textbooks && selected.selected_textbooks.length > 0 && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-slate-900">使用教材</h2>
              <ul className="space-y-1 text-sm text-slate-700">
                {selected.selected_textbooks.map((t) => (
                  <li key={t.id}>・ {t.name}{t.publisher && `（${t.publisher}）`}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div id="plan-html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(selected.plan_html) }} />
          </div>

          {selected.teacher_notes && (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
              <h3 className="mb-2 font-semibold text-amber-900">【講師より】</h3>
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
          <h1 className="text-3xl font-bold text-slate-950">3か月ビジョン</h1>
          <p className="mt-1 text-slate-600">講師から共有された3か月ビジョン（3か月後の到達イメージ）を確認できます。</p>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中...</div>
        ) : plans.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            共有された3か月ビジョンはまだありません。
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map((p) => (
              <button key={p.id} onClick={() => setSelected(p)}
                className="block w-full rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md">
                <p className="mb-1 text-xs text-slate-400">{p.created_at.slice(0, 10)}</p>
                <p className="text-lg font-bold text-slate-900">{p.subject} 3か月ビジョン</p>
                <p className="mt-0.5 text-sm text-slate-500">{p.grade}</p>
                {p.test_percentage != null && (
                  <span className="mt-3 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                    診断時 正答率 {p.test_percentage}%
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
