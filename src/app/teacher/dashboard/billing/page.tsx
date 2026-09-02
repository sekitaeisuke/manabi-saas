"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/lib/toast";
import type { BillingItem, BillingMonth, BillingPlan, School, Student } from "@/lib/supabase";
import { ymLabel, yen } from "@/lib/supabase";
import {
  ITEM_KINDS, CARRIED_KINDS, addItem, updateItem, deleteItem, deleteMonth,
  carryForward, createEmptyMonth, exclFromIncl, prevYm,
} from "@/lib/billing";

type Row = BillingMonth & { student: Student | null; items: BillingItem[] };

function monthOptions(): string[] {
  const t = new Date();
  const out: string[] = [];
  for (let d = 2; d >= -6; d--) {
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
  const [students, setStudents] = useState<Student[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState("");
  const [search, setSearch] = useState("");
  const [onlyUnpublished, setOnlyUnpublished] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: sc }, { data: st }, { data: pl }, { data: ms }] = await Promise.all([
      supabase.from("schools").select("*").order("name"),
      supabase.from("students").select("*"),
      supabase.from("billing_plans").select("*").eq("retired", false).order("kind"),
      supabase.from("billing_months")
        .select("*, student:students(*), items:billing_items(*)")
        .eq("year_month", ym),
    ]);
    setSchools(sc ?? []);
    setStudents(st ?? []);
    setPlans(pl ?? []);
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
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMe(data.session?.user.email ?? null));
  }, []);

  const schoolOf = (s: Student | null) => schools.find((x) => x.id === s?.school_id)?.name ?? "—";

  const filtered = useMemo(() => rows.filter((r) => {
    if (schoolId && (r.student?.school_id ?? "") !== schoolId) return false;
    if (onlyUnpublished && r.published) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (r.student?.name ?? "").toLowerCase().includes(q)
        || (r.student?.furigana ?? "").toLowerCase().includes(q);
  }), [rows, schoolId, onlyUnpublished, search]);

  // その月の月謝がまだ無い生徒（校舎の絞り込みに従う）
  const missing = useMemo(() => {
    const has = new Set(rows.map((r) => r.student_id));
    return students
      .filter((s) => !has.has(s.id))
      .filter((s) => !schoolId || s.school_id === schoolId)
      .sort((a, b) => (a.furigana ?? a.name).localeCompare(b.furigana ?? b.name, "ja"));
  }, [rows, students, schoolId]);

  const total = filtered.reduce((n, r) => n + r.total_incl, 0);
  const unpublished = filtered.filter((r) => !r.published).length;

  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    try { await fn(); if (done) showToast(done, "info"); }
    catch (e) { showToast("エラー: " + (e as Error).message, "error"); }
    finally { setBusy(false); await load(); }
  };

  const setPublished = (ids: string[], value: boolean) => run(async () => {
    const { error } = await supabase.from("billing_months")
      .update({ published: value, published_at: value ? new Date().toISOString() : null })
      .in("id", ids);
    if (error) throw error;
  }, value ? `${ids.length}件を保護者に公開しました` : `${ids.length}件の公開を取り消しました`);

  const publishAllShown = () => {
    const ids = filtered.filter((r) => !r.published).map((r) => r.id);
    if (!ids.length) return;
    const label = schoolId ? schools.find((s) => s.id === schoolId)?.name : "すべての校舎";
    if (!confirm(`${label}の${ymLabel(ym)} ${ids.length}名を保護者に公開します。\n`
      + "公開すると、保護者の画面に金額と内訳が出ます。よろしいですか？")) return;
    setPublished(ids, true);
  };

  const doCarry = () => {
    if (missing.length === 0) return;
    if (!confirm(
      `${prevYm(ym).replace("-", "年")}月分を引き継いで、${ymLabel(ym)}を ${missing.length}名ぶん作ります。\n\n`
      + `引き継ぐのは ${CARRIED_KINDS.join("・")}。\n`
      + "その他・自由入力（テキスト代や単発の講座）は引き継ぎません。\n"
      + "作ったあとは公開せず、金額を確かめてから公開してください。")) return;
    run(async () => {
      const r = await carryForward(missing.map((s) => s.id), ym, me);
      const msg = [`${r.created}名ぶん作成`];
      if (r.noSource.length) msg.push(`先月分が無い ${r.noSource.length}名は作れませんでした`);
      showToast(msg.join(" / "), "info");
    });
  };

  return (
    <div className="px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">お月謝</h1>
            <p className="mt-1 text-sm text-slate-500">
              {ymLabel(ym)}は <b>{ym.split("-")[1] === "01"
                ? `${Number(ym.split("-")[0]) - 1}年12月27日`
                : `${Number(ym.split("-")[1]) - 1}月27日`}</b> に口座振替です。
            </p>
          </div>
          <select value={ym} onChange={(e) => { setYm(e.target.value); setOpen(null); }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400">
            {monthOptions().map((m) => <option key={m} value={m}>{m.replace("-", "年")}月分</option>)}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="対象人数" value={`${filtered.length}名`} />
          <Stat label="合計（税込）" value={yen(total)} />
          <Stat label="保護者に未公開" value={`${unpublished}名`} warn={unpublished > 0} />
          <Stat label="未作成" value={`${missing.length}名`} warn={missing.length > 0} />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400">
            <option value="">校舎（すべて）</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="氏名で検索"
            className="min-w-36 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
          <label className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold ${onlyUnpublished ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
            <input type="checkbox" className="sr-only" checked={onlyUnpublished}
              onChange={() => setOnlyUnpublished(!onlyUnpublished)} />
            未公開だけ
          </label>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button onClick={doCarry} disabled={busy || missing.length === 0}
              className="rounded-xl border border-indigo-300 bg-white px-4 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">
              先月分を引き継いで{missing.length}名ぶん作る
            </button>
            <button onClick={publishAllShown} disabled={busy || unpublished === 0}
              className="rounded-xl bg-slate-950 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
              表示中の{unpublished}名を公開
            </button>
          </div>
        </div>

        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-6 text-amber-900">
          いつもの流れは <b>先月分を引き継ぐ → 季節講習・教材費・テスト代を足す → 16日ごろ公開 → 27日に口座振替</b> です。
          金額に手を入れた月は「まなびが正」に切り替わり、つなぐの同期では上書きされなくなります。
          <b>まなびで足した金額はつなぐには入りません。</b>口座振替に載せるには、つなぐ側にも入れてください。
        </p>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中…</div>
        ) : (
          <>
            {filtered.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
                {ymLabel(ym)}の月謝がまだありません。
                <br />
                <span className="text-xs">「先月分を引き継いで作る」から始められます。</span>
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
                    {filtered.map((r) => (
                      <MonthRow key={r.id} row={r} open={open === r.id} busy={busy}
                        schoolName={schoolOf(r.student)} plans={plans} me={me}
                        onToggle={() => setOpen(open === r.id ? null : r.id)}
                        onRun={run} onPublish={(v) => setPublished([r.id], v)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {missing.length > 0 && (
              <details className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                  {ymLabel(ym)}がまだ無い生徒（{missing.length}名）
                </summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {missing.map((s) => (
                    <button key={s.id} disabled={busy}
                      onClick={() => run(async () => { await createEmptyMonth(s.id, ym, me); },
                        `${s.name}の${ymLabel(ym)}を作りました`)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                      + {s.name}
                      <span className="ml-1 text-slate-400">{s.grade}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  押すと金額0で作られます。明細はそのあと足してください。
                </p>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── 1人ぶんの行 ────────────────────────────────────

function MonthRow({ row, open, busy, schoolName, plans, me, onToggle, onRun, onPublish }: {
  row: Row; open: boolean; busy: boolean; schoolName: string;
  plans: BillingPlan[]; me: string | null;
  onToggle: () => void;
  onRun: (fn: () => Promise<void>, done?: string) => Promise<void>;
  onPublish: (v: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<string>("その他");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [planId, setPlanId] = useState("");

  const reset = () => { setAdding(false); setLabel(""); setAmount(""); setPlanId(""); setKind("その他"); };

  const pickPlan = (id: string) => {
    setPlanId(id);
    const p = plans.find((x) => x.id === id);
    if (p) { setLabel(p.name); setAmount(String(p.price_incl ?? 0)); setKind(p.kind); }
  };

  const submit = () => {
    const incl = Number(amount);
    if (!label.trim() || Number.isNaN(incl)) return;
    onRun(async () => {
      await addItem(row.id, {
        kind, label: label.trim(), amount_incl: incl,
        amount_excl: exclFromIncl(incl), plan_id: planId || null,
      }, me);
      reset();
    }, "明細を足しました");
  };

  return (
    <>
      <tr onClick={onToggle}
        className={`cursor-pointer border-t border-slate-100 ${open ? "bg-indigo-50/50" : "hover:bg-slate-50/70"}`}>
        <td className="whitespace-nowrap px-4 py-2.5">
          <span className="font-semibold text-slate-900">{row.student?.name ?? "（不明）"}</span>
          <span className="ml-1.5 text-xs text-slate-400">{row.student?.grade}</span>
          {row.source === "manual" && (
            <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">手入力</span>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{schoolName}</td>
        <td className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold ${row.total_incl < 0 ? "text-red-600" : "text-slate-900"}`}>
          {yen(row.total_incl)}
        </td>
        <td className="whitespace-nowrap px-4 py-2.5">
          {row.published
            ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">公開済み</span>
            : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">未公開</span>}
        </td>
        <td className="px-2 py-2.5 text-center text-slate-400">{open ? "▲" : "▼"}</td>
      </tr>

      {open && (
        <tr className="border-t border-indigo-100 bg-indigo-50/30">
          <td colSpan={5} className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
            {row.published && (
              <p className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                この月はすでに保護者に公開されています。金額を変えると、保護者の画面もその場で変わります。
              </p>
            )}

            <table className="w-full max-w-3xl text-sm">
              <tbody>
                {row.items.map((it) => (
                  <ItemRow key={it.id} item={it} monthId={row.id} busy={busy} me={me} onRun={onRun} />
                ))}
                {row.items.length === 0 && (
                  <tr><td className="py-2 text-slate-400">明細がありません。下から足してください。</td></tr>
                )}
                <tr className="border-t-2 border-slate-300">
                  <td colSpan={3} className="py-1.5 font-semibold">合計（税込）</td>
                  <td className="py-1.5 text-right font-bold">{yen(row.total_incl)}</td>
                  <td />
                </tr>
              </tbody>
            </table>

            {adding ? (
              <div className="mt-3 max-w-3xl rounded-2xl border border-slate-200 bg-white p-3">
                <div className="grid gap-2 sm:grid-cols-[9rem_1fr_8rem]">
                  <select value={kind} onChange={(e) => setKind(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
                    {ITEM_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <input value={label} onChange={(e) => setLabel(e.target.value)}
                    placeholder="内容（例：夏期講習 / テキスト代 英語）"
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm" />
                  <input value={amount} onChange={(e) => setAmount(e.target.value)}
                    inputMode="numeric" placeholder="税込金額"
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-right text-sm" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select value={planId} onChange={(e) => pickPlan(e.target.value)}
                    className="max-w-72 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
                    <option value="">料金プランから選ぶ…</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>[{p.kind}] {p.name}　{yen(p.price_incl)}</option>
                    ))}
                  </select>
                  <span className="text-xs text-slate-400">割引はマイナスで入力（例：-1000）</span>
                  <button onClick={submit} disabled={busy || !label.trim() || amount === ""}
                    className="ml-auto rounded-xl bg-slate-950 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
                    足す
                  </button>
                  <button onClick={reset}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    やめる
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} disabled={busy}
                className="mt-3 rounded-xl border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">
                ＋ 明細を足す
              </button>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {row.student && (
                <Link href={`/teacher/dashboard/students/${row.student.id}`}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50">
                  この生徒を見る
                </Link>
              )}
              <button disabled={busy} onClick={() => onPublish(!row.published)}
                className={`rounded-lg px-2.5 py-1 font-semibold disabled:opacity-40 ${row.published
                  ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  : "bg-slate-950 text-white hover:bg-slate-800"}`}>
                {row.published ? "公開を取り消す" : "この子を公開"}
              </button>
              <button disabled={busy}
                onClick={() => {
                  if (!confirm(`${row.student?.name ?? ""}の${ymLabel(row.year_month)}を、明細ごと削除します。よろしいですか？`)) return;
                  onRun(async () => { await deleteMonth(row.id); }, "削除しました");
                }}
                className="ml-auto rounded-lg border border-red-200 bg-white px-2.5 py-1 text-red-600 hover:bg-red-50 disabled:opacity-40">
                この月を削除
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── 明細1行（その場で編集・削除）──────────────────

function ItemRow({ item, monthId, busy, me, onRun }: {
  item: BillingItem; monthId: string; busy: boolean; me: string | null;
  onRun: (fn: () => Promise<void>, done?: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label);
  const [amount, setAmount] = useState(String(item.amount_incl));

  const save = () => {
    const incl = Number(amount);
    if (!label.trim() || Number.isNaN(incl)) return;
    onRun(async () => {
      await updateItem(monthId, item.id, { label: label.trim(), amount_incl: incl }, me);
      setEditing(false);
    }, "直しました");
  };

  if (editing) {
    return (
      <tr className="border-b border-slate-200/70">
        <td className="py-1.5 pr-3 align-middle text-xs text-slate-400">{item.kind}</td>
        <td className="py-1.5 pr-3" colSpan={2}>
          <input value={label} onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
        </td>
        <td className="py-1.5">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric"
            className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-sm" />
        </td>
        <td className="whitespace-nowrap py-1.5 pl-2 text-right">
          <button onClick={save} disabled={busy}
            className="rounded-lg bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40">保存</button>
          <button onClick={() => { setEditing(false); setLabel(item.label); setAmount(String(item.amount_incl)); }}
            className="ml-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-600">やめる</button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-slate-200/70">
      <td className="py-1.5 pr-3 align-top text-xs text-slate-400">{item.kind}</td>
      <td className="py-1.5 pr-3">
        {item.label}
        {item.source === "manual" && (
          <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">つなぐ未反映</span>
        )}
      </td>
      <td className="py-1.5 pr-3 text-xs text-slate-400">{item.lesson_count ? `${item.lesson_count}回` : ""}</td>
      <td className={`py-1.5 text-right font-medium ${item.amount_incl < 0 ? "text-red-600" : ""}`}>
        {yen(item.amount_incl)}
      </td>
      <td className="whitespace-nowrap py-1.5 pl-2 text-right">
        <button onClick={() => setEditing(true)} disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40">
          直す
        </button>
        <button disabled={busy}
          onClick={() => {
            if (!confirm(`「${item.label}（${yen(item.amount_incl)}）」を消します。よろしいですか？`)) return;
            onRun(async () => { await deleteItem(monthId, item.id, me); }, "消しました");
          }}
          className="ml-1.5 rounded-lg border border-red-200 bg-white px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40">
          消す
        </button>
      </td>
    </tr>
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
