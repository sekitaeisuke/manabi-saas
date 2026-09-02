"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { BillingItem, BillingMonth, Student } from "@/lib/supabase";
import { ymLabel, yen } from "@/lib/supabase";

type Row = BillingMonth & { student: Student | null; items: BillingItem[] };

// 「2026-09-27」→「9月27日（土）」
function debitLabel(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  const w = ["日", "月", "火", "水", "木", "金", "土"][dt.getDay()];
  return `${dt.getMonth() + 1}月${dt.getDate()}日（${w}）`;
}

export default function ParentBillingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // RLS で「公開済みの自分の子ぶん」だけが返る。ここでの絞り込みは並べ替えだけ。
    const { data } = await supabase
      .from("billing_months")
      .select("*, student:students(id, name, grade), items:billing_items(*)")
      .order("year_month", { ascending: false });
    const list = ((data ?? []) as unknown as Row[]).map((r) => ({
      ...r,
      items: [...(r.items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    }));
    setRows(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="px-6 py-16 text-center text-slate-400">読み込み中…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="px-6 py-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-bold text-slate-950">お月謝</h1>
          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            まだお知らせできる金額がありません。
            <br />
            <span className="text-sm">確定しましたら、こちらに表示されます。</span>
          </div>
        </div>
      </div>
    );
  }

  // 一番新しい月＝これから引き落とされる分を大きく出す
  const [latest, ...past] = rows;

  return (
    <div className="px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold text-slate-950">お月謝</h1>

        <section className="rounded-3xl border border-indigo-200 bg-indigo-50/50 p-6 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-indigo-700">
                {ymLabel(latest.year_month)}
                {latest.student && <span className="ml-2 text-slate-500">{latest.student.name}</span>}
              </p>
              {latest.debit_date && (
                <p className="mt-0.5 text-sm text-slate-600">
                  {debitLabel(latest.debit_date)} に口座振替
                </p>
              )}
            </div>
            <p className="text-3xl font-bold text-slate-950">{yen(latest.total_incl)}</p>
          </div>

          <table className="mt-5 w-full text-sm">
            <tbody>
              {latest.items.map((it) => (
                <tr key={it.id} className="border-b border-indigo-100 last:border-0">
                  <td className="py-2 pr-3">{it.label}</td>
                  <td className="py-2 pr-3 text-xs text-slate-400">
                    {it.lesson_count ? `${it.lesson_count}回` : ""}
                  </td>
                  <td className={`py-2 text-right font-medium ${it.amount_incl < 0 ? "text-red-600" : ""}`}>
                    {yen(it.amount_incl)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-indigo-200">
                <td colSpan={2} className="py-2 font-semibold">合計（税込）</td>
                <td className="py-2 text-right text-lg font-bold">{yen(latest.total_incl)}</td>
              </tr>
            </tbody>
          </table>

          {latest.note && <p className="mt-3 text-sm text-slate-600">{latest.note}</p>}
        </section>

        {past.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-sm font-semibold text-slate-500">これまでのお月謝</h2>
            <div className="space-y-2">
              {past.map((r) => (
                <details key={r.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-slate-800">
                      {ymLabel(r.year_month)}
                      {r.student && <span className="ml-2 font-normal text-slate-400">{r.student.name}</span>}
                    </span>
                    <span className="font-bold text-slate-900">{yen(r.total_incl)}</span>
                  </summary>
                  <table className="mt-3 w-full text-sm">
                    <tbody>
                      {r.items.map((it) => (
                        <tr key={it.id} className="border-b border-slate-100 last:border-0">
                          <td className="py-1.5 pr-3 text-slate-600">{it.label}</td>
                          <td className={`py-1.5 text-right ${it.amount_incl < 0 ? "text-red-600" : "text-slate-700"}`}>
                            {yen(it.amount_incl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {r.debit_date && (
                    <p className="mt-2 text-xs text-slate-400">{debitLabel(r.debit_date)} に口座振替</p>
                  )}
                </details>
              ))}
            </div>
          </section>
        )}

        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs leading-6 text-slate-500">
          金額に見覚えのないものがありましたら、教室までお気軽にお問い合わせください。
          季節講習・教材費・テスト代は、その月にお申し込みいただいた分だけが加算されます。
        </p>
      </div>
    </div>
  );
}
