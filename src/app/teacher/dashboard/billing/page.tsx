"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/lib/toast";
import type { BillingItem, BillingMonth, School, Student } from "@/lib/supabase";
import { ymLabel, yen } from "@/lib/supabase";

type Row = BillingMonth & { student: Student | null; items: BillingItem[] };

// 直近の月を新しい順に。既定は「来月分」＝今月27日に引き落とす分。
function monthOptions(): string[] {
  const t = new Date();
  const out: string[] = [];
  for (let d = 2; d >= -4; d--) {
    const x = new Date(t.getFullYear(), t.getMonth() + d, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function defaultMonth(): string {
  const t = new Date();
  const x = new Date(t.getFullYear(), t.getMonth() + 1, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}

export default function BillingPage() {
  const [ym, setYm] = useState(defaultMonth());
  const [rows, setRows] = useState<Row[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [search, setSearch] = useState("");
  const [onlyUnpublished, setOnlyUnpublished] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: sc }, { data: ms }] = await Promise.all([
      supabase.from("schools").select("*").order("name"),
      supabase.from("billing_months")
        .select("*, student:students(*), items:billing_items(*)")
        .eq("year_month", ym),
    ]);
    setSchools(sc ?? []);
    const list = ((ms ?? []) as unknown as Row[]).map((r) => ({
      ...r,
      items: [...(r.items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    }));
    list.sort((a, b) =>
      (a.student?.furigana ?? a.student?.name ?? "").localeCompare(
        b.student?.furigana ?? b.student?.name ?? "", "ja"));
    setRows(list);
    setLoading(false);
  }, [ym]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (schoolId && (r.student?.school_id ?? "") !== schoolId) return false;
    if (onlyUnpublished && r.published) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (r.student?.name ?? "").toLowerCase().includes(q)
        || (r.student?.furigana ?? "").toLowerCase().includes(q);
  }), [rows, schoolId, onlyUnpublished, search]);

  const total = filtered.reduce((n, r) => n + r.total_incl, 0);
  const unpublished = filtered.filter((r) => !r.published).length;
  const debit = rows[0]?.debit_date ?? null;

  const setPublished = async (ids: string[], value: boolean) => {
    if (!ids.length) return;
    setBusy(true);
    const { error } = await supabase.from("billing_months")
      .update({ published: value, published_at: value ? new Date().toISOString() : null })
      .in("id", ids);
    setBusy(false);
    if (error) { showToast("エラー: " + error.message, "error"); return; }
    showToast(value ? `${ids.length}件を保護者に公開しました` : `${ids.length}件の公開を取り消しました`, "info");
    load();
  };

  const publishAllShown = () => {
    const ids = filtered.filter((r) => !r.published).map((r) => r.id);
    if (!ids.length) return;
    const label = schoolId ? schools.find((s) => s.id === schoolId)?.name : "すべての校舎";
    if (!confirm(
      `${label}の${ymLabel(ym)} ${ids.length}名を保護者に公開します。\n`
      + `公開すると、保護者の画面に金額と内訳が出ます。よろしいですか？`)) return;
    setPublished(ids, true);
  };

  return (
    <div className="px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">お月謝</h1>
            <p className="mt-1 text-sm text-slate-500">
              つなぐの契約内容をそのまま取り込んでいます。
              {debit && <>　{ymLabel(ym)}は <b>{debit}</b> に口座振替です。</>}
            </p>
          </div>
          <select value={ym} onChange={(e) => { setYm(e.target.value); setOpen(null); }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400">
            {monthOptions().map((m) => <option key={m} value={m}>{m.replace("-", "年")}月分</option>)}
          </select>
        </div>

        {/* 未公開が残っているうちは、それが一番大事な情報 */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="対象人数" value={`${filtered.length}名`} />
          <Stat label="合計（税込）" value={yen(total)} />
          <Stat label="保護者に未公開" value={`${unpublished}名`} warn={unpublished > 0} />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400">
            <option value="">校舎（すべて）</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="氏名で検索"
            className="min-w-40 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
          <label className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold ${onlyUnpublished ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
            <input type="checkbox" className="sr-only" checked={onlyUnpublished}
              onChange={() => setOnlyUnpublished(!onlyUnpublished)} />
            未公開だけ
          </label>
          <button onClick={publishAllShown} disabled={busy || unpublished === 0}
            className="ml-auto rounded-xl bg-slate-950 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
            表示中の{unpublished}名を保護者に公開
          </button>
        </div>

        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-6 text-amber-900">
          いつもの流れは <b>毎月16日ごろに翌月分を公開 → 27日に口座振替</b> です。
          公開すると、保護者の画面に金額と内訳がそのまま出ます。つなぐ側の入力が途中だと不足した金額のまま見えてしまうので、
          季節講習・教材費・テスト代まで入り切っているか確かめてから押してください。
        </p>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            {ymLabel(ym)}の月謝データがありません。
            <br />
            <span className="text-xs">ai-system の scripts/sync_tsunagu_billing.py --apply で取り込みます。</span>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left font-semibold">氏名</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left font-semibold">校舎</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">金額（税込）</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left font-semibold">保護者</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isOpen = open === r.id;
                  const school = schools.find((s) => s.id === r.student?.school_id);
                  return (
                    <>
                      <tr key={r.id} onClick={() => setOpen(isOpen ? null : r.id)}
                        className={`cursor-pointer border-t border-slate-100 ${isOpen ? "bg-indigo-50/50" : "hover:bg-slate-50/70"}`}>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <span className="font-semibold text-slate-900">{r.student?.name ?? "（不明）"}</span>
                          <span className="ml-1.5 text-xs text-slate-400">{r.student?.grade}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{school?.name ?? "—"}</td>
                        <td className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold ${r.total_incl < 0 ? "text-red-600" : "text-slate-900"}`}>
                          {yen(r.total_incl)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          {r.published
                            ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">公開済み</span>
                            : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">未公開</span>}
                        </td>
                        <td className="px-2 py-2.5 text-center text-slate-400">{isOpen ? "▲" : "▼"}</td>
                      </tr>
                      {isOpen && (
                        <tr key={r.id + "-d"} className="border-t border-indigo-100 bg-indigo-50/30">
                          <td colSpan={5} className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                            <table className="w-full max-w-2xl text-sm">
                              <tbody>
                                {r.items.map((it) => (
                                  <tr key={it.id} className="border-b border-slate-200/70 last:border-0">
                                    <td className="py-1.5 pr-3 align-top text-xs text-slate-400">{it.kind}</td>
                                    <td className="py-1.5 pr-3">{it.label}</td>
                                    <td className="py-1.5 pr-3 text-xs text-slate-400">
                                      {it.lesson_count ? `${it.lesson_count}回` : ""}
                                    </td>
                                    <td className={`py-1.5 text-right font-medium ${it.amount_incl < 0 ? "text-red-600" : ""}`}>
                                      {yen(it.amount_incl)}
                                    </td>
                                  </tr>
                                ))}
                                <tr className="border-t-2 border-slate-300">
                                  <td colSpan={3} className="py-1.5 font-semibold">合計（税込）</td>
                                  <td className="py-1.5 text-right font-bold">{yen(r.total_incl)}</td>
                                </tr>
                              </tbody>
                            </table>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-slate-400">つなぐ側の状態：{r.status}</span>
                              {r.published && r.published_at && (
                                <span className="text-slate-400">公開：{r.published_at.slice(0, 10)}</span>
                              )}
                              {r.student && (
                                <Link href={`/teacher/dashboard/students/${r.student.id}`}
                                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50">
                                  この生徒を見る
                                </Link>
                              )}
                              <button disabled={busy} onClick={() => setPublished([r.id], !r.published)}
                                className={`rounded-lg px-2.5 py-1 font-semibold disabled:opacity-40 ${r.published
                                  ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                  : "bg-slate-950 text-white hover:bg-slate-800"}`}>
                                {r.published ? "公開を取り消す" : "この子を公開"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${warn ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${warn ? "text-amber-800" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
