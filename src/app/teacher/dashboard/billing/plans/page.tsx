"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/lib/toast";
import type { BillingPlan } from "@/lib/supabase";
import { yen } from "@/lib/supabase";
import { ITEM_KINDS, exclFromIncl } from "@/lib/billing";
import { GRADE_ORDER } from "@/lib/curriculum";

type Draft = {
  id?: string;
  kind: string;
  name: string;
  grades: string[];
  price_incl: string;
  price_excl: string;
  note: string;
};

const emptyDraft = (): Draft => ({
  kind: "基本", name: "", grades: [], price_incl: "", price_excl: "", note: "",
});

export default function BillingPlansPage() {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [showRetired, setShowRetired] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: items }] = await Promise.all([
      supabase.from("billing_plans").select("*").order("kind").order("name"),
      supabase.from("billing_items").select("plan_id"),
    ]);
    setPlans(data ?? []);
    const used: Record<string, number> = {};
    for (const i of items ?? []) {
      if (i.plan_id) used[i.plan_id] = (used[i.plan_id] ?? 0) + 1;
    }
    setUsage(used);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => plans.filter((p) => {
    if (!showRetired && p.retired) return false;
    if (kind && p.kind !== kind) return false;
    const q = search.trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q);
  }), [plans, kind, search, showRetired]);

  const kinds = useMemo(
    () => Array.from(new Set(plans.map((p) => p.kind))).sort(),
    [plans]);

  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    try { await fn(); if (done) showToast(done, "info"); }
    catch (e) { showToast("エラー: " + (e as Error).message, "error"); }
    finally { setBusy(false); await load(); }
  };

  const startEdit = (p: BillingPlan) => setDraft({
    id: p.id, kind: p.kind, name: p.name, grades: p.grades ?? [],
    price_incl: String(p.price_incl ?? ""), price_excl: String(p.price_excl ?? ""),
    note: p.note ?? "",
  });

  const save = () => {
    if (!draft || !draft.name.trim() || draft.price_incl === "") return;
    const incl = Number(draft.price_incl);
    const excl = draft.price_excl === "" ? exclFromIncl(incl) : Number(draft.price_excl);
    if (Number.isNaN(incl) || Number.isNaN(excl)) return;
    const body = {
      kind: draft.kind,
      name: draft.name.trim(),
      grades: draft.grades.length ? draft.grades : null,
      price_incl: incl,
      price_excl: excl,
      note: draft.note.trim() || null,
      // 手で作った・直したプランは、つなぐの同期で上書きされないようにする
      source: "manual",
      updated_at: new Date().toISOString(),
    };
    run(async () => {
      const { error } = draft.id
        ? await supabase.from("billing_plans").update(body).eq("id", draft.id)
        : await supabase.from("billing_plans").insert({ ...body, retired: false });
      if (error) throw error;
      setDraft(null);
    }, draft.id ? "料金プランを直しました" : "料金プランを足しました");
  };

  const setRetired = (p: BillingPlan, v: boolean) => run(async () => {
    const { error } = await supabase.from("billing_plans")
      .update({ retired: v, updated_at: new Date().toISOString() }).eq("id", p.id);
    if (error) throw error;
  }, v ? "使わないプランにしました" : "使えるように戻しました");

  const remove = (p: BillingPlan) => {
    const n = usage[p.id] ?? 0;
    if (n > 0) {
      showToast(`このプランは月謝の明細 ${n}件で使われています。「使わない」にしてください`, "error");
      return;
    }
    if (!confirm(`「${p.name}」を完全に削除します。よろしいですか？`)) return;
    run(async () => {
      const { error } = await supabase.from("billing_plans").delete().eq("id", p.id);
      if (error) throw error;
    }, "削除しました");
  };

  return (
    <div className="px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">料金プラン</h1>
            <p className="mt-1 text-sm text-slate-500">
              月謝の明細を足すときの選択肢になります。全{plans.length}件。
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/teacher/dashboard/billing"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              お月謝へ戻る
            </Link>
            <button onClick={() => setDraft(emptyDraft())} disabled={busy}
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
              ＋ プランを足す
            </button>
          </div>
        </div>

        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-6 text-amber-900">
          ここで直したプランは <b>まなびが正</b> になり、つなぐの同期で上書きされなくなります。
          <b>金額を変えても、すでに作った月謝の明細は変わりません</b>（その月に決まった金額をそのまま残すため）。
          今月から新しい金額にするときは、月謝の画面で明細を入れ直してください。
        </p>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <select value={kind} onChange={(e) => setKind(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400">
            <option value="">種別（すべて）</option>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="プラン名で検索"
            className="min-w-40 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
          <label className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold ${showRetired ? "border-slate-400 bg-slate-100 text-slate-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
            <input type="checkbox" className="sr-only" checked={showRetired}
              onChange={() => setShowRetired(!showRetired)} />
            使わないものも表示
          </label>
          <span className="ml-auto text-xs text-slate-500">{filtered.length}件</span>
        </div>

        {draft && (
          <div className="rounded-3xl border border-indigo-200 bg-indigo-50/40 p-5">
            <h2 className="mb-3 font-semibold text-slate-900">
              {draft.id ? "プランを直す" : "新しいプラン"}
            </h2>
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <div className="grid gap-1 text-sm text-slate-700">
                種別
                <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  {ITEM_KINDS.filter((k) => k !== "自由入力").map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div className="grid gap-1 text-sm text-slate-700">
                プラン名
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="例：中学3年生（週2回）"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1 text-sm text-slate-700">
                税込金額（割引はマイナス）
                <input value={draft.price_incl} inputMode="numeric"
                  onChange={(e) => {
                    const v = e.target.value;
                    const n = Number(v);
                    setDraft({ ...draft, price_incl: v,
                      price_excl: v === "" || Number.isNaN(n) ? "" : String(exclFromIncl(n)) });
                  }}
                  placeholder="26000"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm" />
              </div>
              <div className="grid gap-1 text-sm text-slate-700">
                税抜（税込から自動計算・直せます）
                <input value={draft.price_excl} inputMode="numeric"
                  onChange={(e) => setDraft({ ...draft, price_excl: e.target.value })}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm" />
              </div>
            </div>
            <div className="mt-3 grid gap-1 text-sm text-slate-700">
              対象学年（選ばなければ全学年）
              <div className="flex flex-wrap gap-1.5">
                {GRADE_ORDER.map((g) => {
                  const on = draft.grades.includes(g);
                  return (
                    <label key={g} className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-semibold ${on ? "border-indigo-400 bg-indigo-100 text-indigo-700" : "border-slate-200 bg-white text-slate-500"}`}>
                      <input type="checkbox" className="sr-only" checked={on}
                        onChange={() => setDraft({ ...draft,
                          grades: on ? draft.grades.filter((x) => x !== g) : [...draft.grades, g] })} />
                      {g}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 grid gap-1 text-sm text-slate-700">
              メモ（任意）
              <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="例：2026年4月から適用"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={save} disabled={busy || !draft.name.trim() || draft.price_incl === ""}
                className="rounded-2xl bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
                {draft.id ? "保存する" : "追加する"}
              </button>
              <button onClick={() => setDraft(null)}
                className="rounded-2xl border border-slate-300 bg-white px-6 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                やめる
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中…</div>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left font-semibold">種別</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left font-semibold">プラン名</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left font-semibold">対象学年</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">税込</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">税抜</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">使用</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className={`border-t border-slate-100 ${p.retired ? "bg-slate-50/70 text-slate-400" : "hover:bg-slate-50/70"}`}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">{p.kind}</td>
                    <td className="px-4 py-2.5">
                      <span className={p.retired ? "line-through" : "font-medium text-slate-800"}>{p.name}</span>
                      {p.source === "manual" && (
                        <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">まなび</span>
                      )}
                      {p.retired && <span className="ml-2 text-[10px] font-semibold text-slate-400">使わない</span>}
                      {p.note && <div className="text-xs text-slate-400">{p.note}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {p.grades?.length ? p.grades.join("・") : "全学年"}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold ${(p.price_incl ?? 0) < 0 ? "text-red-600" : ""}`}>
                      {yen(p.price_incl)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-slate-500">{yen(p.price_excl)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-slate-500">
                      {usage[p.id] ? `${usage[p.id]}件` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <button onClick={() => startEdit(p)} disabled={busy}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                        直す
                      </button>
                      <button onClick={() => setRetired(p, !p.retired)} disabled={busy}
                        className="ml-1.5 rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                        {p.retired ? "戻す" : "使わない"}
                      </button>
                      <button onClick={() => remove(p)} disabled={busy || (usage[p.id] ?? 0) > 0}
                        title={(usage[p.id] ?? 0) > 0 ? "月謝の明細で使われているため削除できません" : ""}
                        className="ml-1.5 rounded-lg border border-red-200 bg-white px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-30">
                        消す
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
