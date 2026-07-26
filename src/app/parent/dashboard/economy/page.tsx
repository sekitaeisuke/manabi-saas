"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSelectedStudentId } from "@/lib/useSelectedStudent";

type Wallet = { balance: number; locked_balance: number };
type Exchange = { id: string; reward_title: string | null; cost: number; status: string; created_at: string };
type Txn = { id: string; amount: number; type: string; description: string; created_at: string };
type RewardItem = { id: string; title: string; description: string; cost: number; category: string | null; school_id: string | null };

const CATEGORY_LABEL: Record<string, string> = {
  goods: "グッズ", card: "紹介カード", pass: "通い放題", online: "オンライン授業", other: "その他",
};
const EX_STATUS: Record<string, string> = {
  pending: "承認待ち", approved: "承認済み（受け渡し待ち）", rejected: "却下（返金）", completed: "受け取り済み",
};
const TYPE_LABEL: Record<string, string> = {
  EARN_CHECKIN: "チェックイン", EARN_TASK: "課題", EARN_TEST: "テスト合格", EARN_ATTENDANCE: "出席",
  EARN_MANABI: "まなび", EARN_CONTRIBUTION: "貢献", EARN_REPORT: "報告書", EARN_REFERRAL: "紹介",
  EARN_REFERRED: "紹介ボーナス", INVEST_BUY_STOCK: "自塾株の購入", INVEST_SELL_STOCK: "自塾株の売却",
  EXCHANGE_REWARD: "商店で交換", ADMIN_ADJUSTMENT: "調整",
};

export default function ParentEconomyPage() {
  const [selectedId] = useSelectedStudentId();
  const [childName, setChildName] = useState("");
  const [wallet, setWallet] = useState<Wallet>({ balance: 0, locked_balance: 0 });
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [shop, setShop] = useState<RewardItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (sid: string) => {
    setLoading(true);
    const { data: student } = await supabase.from("students").select("name, school_id").eq("id", sid).maybeSingle();
    setChildName(student?.name ?? "");
    const schoolId = (student?.school_id as string) ?? null;

    let shopQ = supabase.from("reward_items").select("id, title, description, cost, category, school_id")
      .eq("active", true).order("cost", { ascending: true });
    shopQ = schoolId ? shopQ.or(`school_id.is.null,school_id.eq.${schoolId}`) : shopQ.is("school_id", null);

    const [w, ex, tx, sh] = await Promise.all([
      supabase.from("student_wallets").select("balance, locked_balance").eq("student_id", sid).maybeSingle(),
      supabase.from("reward_exchanges").select("id, reward_title, cost, status, created_at")
        .eq("student_id", sid).order("created_at", { ascending: false }).limit(50),
      supabase.from("ac_transactions").select("id, amount, type, description, created_at")
        .eq("student_id", sid).order("created_at", { ascending: false }).limit(30),
      shopQ,
    ]);
    setWallet((w.data as Wallet) ?? { balance: 0, locked_balance: 0 });
    setExchanges((ex.data as Exchange[]) ?? []);
    setTxns((tx.data as Txn[]) ?? []);
    setShop((sh.data as RewardItem[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { if (selectedId) load(selectedId); else setLoading(false); }, [selectedId, load]);

  if (!selectedId) {
    return <div className="p-6 text-sm text-slate-500">お子さまを選択してください。</div>;
  }
  if (loading) return <div className="p-6 text-sm text-slate-400">読み込み中…</div>;

  const spends = exchanges; // 交換・購入したもの
  const supportOrInvest = txns.filter((t) => t.type === "INVEST_BUY_STOCK");

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">ポイント・商店</h1>
        <p className="text-sm text-slate-500">
          {childName} さんの塾内ポイント（AC）の残高・使いみち・商店の品揃えです。ACは塾内ポイントで現金価値はありません。
        </p>
      </div>

      {/* 残高 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
          <p className="text-xs text-emerald-700">いまの残高</p>
          <p className="text-2xl font-extrabold text-emerald-700 tabular-nums">{wallet.balance.toLocaleString()}<span className="ml-1 text-xs">AC</span></p>
        </div>
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
          <p className="text-xs text-indigo-700">自塾株に投資中</p>
          <p className="text-2xl font-extrabold text-indigo-700 tabular-nums">{wallet.locked_balance.toLocaleString()}<span className="ml-1 text-xs">AC</span></p>
        </div>
      </div>

      {/* 使いみち（交換・購入） */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-800">ポイントの使いみち（交換・購入）</h2>
        {spends.length === 0 ? (
          <p className="text-sm text-slate-400">まだ交換はありません</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {spends.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{e.reward_title}</p>
                  <p className="text-[11px] text-slate-400">
                    {new Date(e.created_at).toLocaleDateString("ja-JP")} ・ {EX_STATUS[e.status] ?? e.status}
                  </p>
                </div>
                <span className="text-sm font-bold text-amber-600">−{e.cost.toLocaleString()} AC</span>
              </li>
            ))}
          </ul>
        )}
        {supportOrInvest.length > 0 && (
          <p className="mt-3 text-[11px] text-indigo-500">
            ※ このほか、自塾株への投資（教室の応援）にも使っています。
          </p>
        )}
      </div>

      {/* AC の動き（全体） */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-800">最近の AC の動き</h2>
        {txns.length === 0 ? (
          <p className="text-sm text-slate-400">まだ動きがありません</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {txns.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-700">{t.description || TYPE_LABEL[t.type] || t.type}</p>
                  <p className="text-[11px] text-slate-400">
                    {TYPE_LABEL[t.type] ?? t.type} ・ {new Date(t.created_at).toLocaleDateString("ja-JP")}
                  </p>
                </div>
                <span className={`ml-3 shrink-0 text-sm font-bold ${t.amount >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {t.amount >= 0 ? "+" : ""}{t.amount.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 商店の品揃え */}
      <div className="rounded-3xl border border-amber-100 bg-amber-50/40 p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-amber-900">商店の品揃え</h2>
        {shop.length === 0 ? (
          <p className="text-sm text-slate-400">いまは商品がありません</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {shop.map((r) => (
              <div key={r.id} className="rounded-2xl border border-amber-100 bg-white p-3">
                <div className="flex items-center gap-1.5">
                  {r.category && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{CATEGORY_LABEL[r.category] ?? r.category}</span>
                  )}
                  <p className="truncate text-sm font-semibold text-slate-800">{r.title}</p>
                </div>
                {r.description && <p className="mt-0.5 truncate text-xs text-slate-400">{r.description}</p>}
                <p className="mt-1 text-xs font-bold text-amber-600">{r.cost.toLocaleString()} AC</p>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-400">※ 交換はお子さま本人が塾内で行います（保護者の方は閲覧のみ）。</p>
      </div>
    </div>
  );
}
