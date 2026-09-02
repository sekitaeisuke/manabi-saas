// お月謝の操作をここに集める。画面から直接テーブルを触ると、
// 合計と明細がずれたり、手入力の月が同期で消えたりしやすいため。
//
// つなぐは2026年10月末で連携を終える予定。以後はまなびが唯一の入力口になる。
// つなぐと同じく「先月分を引き継いで当月分を作る」流れを持たせてある。

import { supabase } from "@/lib/supabase";
import type { BillingItem, BillingMonth } from "@/lib/supabase";

/** 明細の種別。つなぐの分類をそのまま使う。 */
export const ITEM_KINDS = ["基本", "オプション", "設備費", "パック", "その他", "自由入力"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/**
 * 翌月へ繰り越す種別。つなぐの仕様に合わせている:
 *   「その他：…ただし翌月のプランに自動反映されません。単発の特別講座などへの使用を想定」
 * 自由入力（テキスト代など）も単発なので繰り越さない。
 */
export const CARRIED_KINDS: string[] = ["基本", "オプション", "設備費", "パック"];

/** 消費税10%。つなぐの税抜は切り捨てなのでそれに合わせる。 */
export function exclFromIncl(incl: number): number {
  return Math.trunc(incl / 1.1);
}

/** 「2026-10」→「2026-09」 */
export function prevYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** ◯月分は前月27日に口座振替。 */
export function debitDateOf(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, "0")}-27`;
}

/**
 * 明細から合計を計算し直して月に書き戻す。
 * 金額に手を入れたら必ずこれを通す。source は manual に倒し、
 * 以後つなぐの同期で上書きされないようにする。
 */
export async function recalcMonth(monthId: string, editor?: string | null): Promise<void> {
  const { data: items } = await supabase
    .from("billing_items").select("amount_incl, amount_excl").eq("billing_month_id", monthId);
  const incl = (items ?? []).reduce((n, i) => n + (i.amount_incl ?? 0), 0);
  const excl = (items ?? []).reduce((n, i) => n + (i.amount_excl ?? 0), 0);
  await supabase.from("billing_months").update({
    total_incl: incl,
    total_excl: excl,
    source: "manual",
    edited_at: new Date().toISOString(),
    edited_by: editor ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", monthId);
}

export type NewItem = {
  kind: string;
  label: string;
  amount_incl: number;
  amount_excl?: number | null;
  lesson_count?: number | null;
  plan_id?: string | null;
  note?: string | null;
};

export async function addItem(monthId: string, item: NewItem, editor?: string | null) {
  const incl = Math.round(item.amount_incl || 0);
  const { data: last } = await supabase
    .from("billing_items").select("sort_order")
    .eq("billing_month_id", monthId).order("sort_order", { ascending: false }).limit(1);
  const { error } = await supabase.from("billing_items").insert({
    billing_month_id: monthId,
    kind: item.kind,
    label: item.label,
    plan_id: item.plan_id ?? null,
    lesson_count: item.lesson_count ?? null,
    amount_incl: incl,
    amount_excl: item.amount_excl ?? exclFromIncl(incl),
    note: item.note ?? null,
    source: "manual",
    sort_order: ((last?.[0]?.sort_order as number | undefined) ?? -1) + 1,
  });
  if (error) throw error;
  await recalcMonth(monthId, editor);
}

export async function updateItem(
  monthId: string, itemId: string,
  patch: Partial<Pick<BillingItem, "kind" | "label" | "amount_incl" | "amount_excl" | "lesson_count">>,
  editor?: string | null,
) {
  const body: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if (patch.amount_incl != null && patch.amount_excl == null) {
    body.amount_excl = exclFromIncl(patch.amount_incl);
  }
  const { error } = await supabase.from("billing_items").update(body).eq("id", itemId);
  if (error) throw error;
  await recalcMonth(monthId, editor);
}

export async function deleteItem(monthId: string, itemId: string, editor?: string | null) {
  const { error } = await supabase.from("billing_items").delete().eq("id", itemId);
  if (error) throw error;
  await recalcMonth(monthId, editor);
}

/** 月ごと消す。明細はカスケードで消える。 */
export async function deleteMonth(monthId: string) {
  const { error } = await supabase.from("billing_months").delete().eq("id", monthId);
  if (error) throw error;
}

export type CarryResult = { created: number; skipped: number; noSource: string[] };

/**
 * 先月分を引き継いで当月分を作る。つなぐと同じ流れ。
 *   ・すでにその月がある生徒は触らない（作りかけを壊さない）
 *   ・繰り越すのは CARRIED_KINDS だけ。単発のテキスト代や講座は持ち越さない
 *   ・公開はしない。金額を確かめてから人が公開する
 */
export async function carryForward(
  studentIds: string[], ym: string, editor?: string | null,
): Promise<CarryResult> {
  const from = prevYm(ym);
  const [{ data: prev }, { data: already }] = await Promise.all([
    supabase.from("billing_months")
      .select("student_id, items:billing_items(*)")
      .eq("year_month", from).in("student_id", studentIds),
    supabase.from("billing_months")
      .select("student_id").eq("year_month", ym).in("student_id", studentIds),
  ]);

  const done = new Set((already ?? []).map((r) => r.student_id as string));
  const prevByStudent = new Map<string, BillingItem[]>();
  for (const r of (prev ?? []) as unknown as { student_id: string; items: BillingItem[] }[]) {
    prevByStudent.set(r.student_id, r.items ?? []);
  }

  const targets = studentIds.filter((id) => !done.has(id));
  const noSource = targets.filter((id) => !prevByStudent.has(id));
  const makeable = targets.filter((id) => prevByStudent.has(id));

  let created = 0;
  for (const sid of makeable) {
    const items = (prevByStudent.get(sid) ?? [])
      .filter((i) => CARRIED_KINDS.includes(i.kind))
      .sort((a, b) => a.sort_order - b.sort_order);
    if (items.length === 0) continue;

    const incl = items.reduce((n, i) => n + i.amount_incl, 0);
    const excl = items.reduce((n, i) => n + i.amount_excl, 0);
    const { data: month, error } = await supabase.from("billing_months").insert({
      student_id: sid,
      year_month: ym,
      debit_date: debitDateOf(ym),
      total_incl: incl,
      total_excl: excl,
      status: "未確定",
      published: false,
      source: "manual",
      edited_at: new Date().toISOString(),
      edited_by: editor ?? null,
    }).select("id").single();
    if (error || !month) continue;

    await supabase.from("billing_items").insert(items.map((i, n) => ({
      billing_month_id: month.id,
      kind: i.kind,
      label: i.label,
      plan_id: i.plan_id,
      price_revision_id: i.price_revision_id,
      lesson_count: i.lesson_count,
      amount_incl: i.amount_incl,
      amount_excl: i.amount_excl,
      source: "manual",
      sort_order: n,
    })));
    created++;
  }

  return { created, skipped: done.size, noSource };
}

/** その月がまだ無い生徒に、空の月謝を作る（新規生徒など）。 */
export async function createEmptyMonth(
  studentId: string, ym: string, editor?: string | null,
): Promise<BillingMonth | null> {
  const { data, error } = await supabase.from("billing_months").insert({
    student_id: studentId,
    year_month: ym,
    debit_date: debitDateOf(ym),
    total_incl: 0,
    total_excl: 0,
    status: "未確定",
    published: false,
    source: "manual",
    edited_at: new Date().toISOString(),
    edited_by: editor ?? null,
  }).select("*").single();
  if (error) return null;
  return data as BillingMonth;
}
