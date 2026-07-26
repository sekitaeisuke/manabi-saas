"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import { showToast } from "@/lib/toast";
import { triggerConfetti } from "@/lib/confetti";
import { maxBuyableShares, holdingValuation } from "@/lib/classStock";
import { StockChart, type StockPoint } from "@/components/StockChart";
import type { Student } from "@/lib/supabase";

type Wallet = { balance: number; locked_balance: number };
type Holding = { shares: number; avg_price: number };
type HistRow = { price: number; calculated_at: string };
type Chart = { current_price: number; school_name: string | null; history: HistRow[] };
type Reward = { id: string; title: string; description: string; cost: number; stock: number | null; category: string | null };

const CATEGORY_LABEL: Record<string, string> = {
  goods: "グッズ", card: "紹介カード", pass: "通い放題", online: "オンライン授業", other: "その他",
};
type Txn = { id: string; amount: number; type: string; description: string; created_at: string };
type SchoolRow = { id: string; name: string; price: number; support: number };
type Benchmark = { name: string; price: number; prev_price: number | null; note: string | null };
type EarnRule = { event_key: string; label: string; points: number };

// 株価が下がる行動（講師がマイナス評価として記録＝みんなの株価が下がる）
const PENALTY_HINTS = [
  "宿題未提出", "忘れ物", "遅刻", "テスト不合格",
  "私語", "こっそりスマホ", "こっそり息抜き", "ちょっと良くない",
];
const EARN_EMOJI: Record<string, string> = {
  attend: "🏫", testpass: "💯", manabi: "📗", clean: "🧹", report: "📝", refer: "🤝", refereed: "🎁",
};

const TYPE_LABEL: Record<string, string> = {
  EARN_CHECKIN: "チェックイン", EARN_TASK: "課題", EARN_TEST: "テスト",
  EARN_CONTRIBUTION: "貢献", INVEST_BUY_STOCK: "株 買付", INVEST_SELL_STOCK: "株 売却",
  INVEST_DIVIDEND: "配当", EXCHANGE_REWARD: "報酬交換", ADMIN_ADJUSTMENT: "調整",
};

export function EconomyPanel({ student }: { student: Student }) {
  const [wallet, setWallet] = useState<Wallet>({ balance: 0, locked_balance: 0 });
  const [holding, setHolding] = useState<Holding>({ shares: 0, avg_price: 0 });
  const [chart, setChart] = useState<Chart>({ current_price: 1000, school_name: null, history: [] });
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [checkedIn, setCheckedIn] = useState(false);
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [earnRules, setEarnRules] = useState<EarnRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qty, setQty] = useState(1);
  const [voiceText, setVoiceText] = useState("");
  const [voiceSent, setVoiceSent] = useState(false);

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [w, h, ci, tx, chartRes, rw, lb, rl] = await Promise.all([
      supabase.from("student_wallets").select("balance, locked_balance").eq("student_id", student.id).maybeSingle(),
      supabase.from("class_stock_holdings").select("shares, avg_price").eq("student_id", student.id).maybeSingle(),
      supabase.from("check_ins").select("id").eq("student_id", student.id).eq("checkin_on", today).maybeSingle(),
      supabase.from("ac_transactions").select("id, amount, type, description, created_at")
        .eq("student_id", student.id).order("created_at", { ascending: false }).limit(20),
      authFetch("/api/stock/chart").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      authFetch("/api/economy/reward").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      authFetch("/api/stock/leaderboard").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      authFetch("/api/economy/rules").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (w.data) setWallet(w.data as Wallet);
    setHolding((h.data as Holding) ?? { shares: 0, avg_price: 0 });
    setCheckedIn(!!ci.data);
    setTxns((tx.data as Txn[]) ?? []);
    if (chartRes) setChart({
      current_price: chartRes.current_price, school_name: chartRes.school_name,
      history: chartRes.history ?? [],
    });
    if (rw?.items) setRewards(rw.items as Reward[]);
    if (lb) { setSchools((lb.schools as SchoolRow[]) ?? []); setBenchmarks((lb.benchmarks as Benchmark[]) ?? []); }
    if (rl?.rules) setEarnRules(rl.rules as EarnRule[]);
    setLoading(false);
  }, [student.id]);

  useEffect(() => { load(); }, [load]);

  const price = chart.current_price;
  const val = holdingValuation(holding.shares, holding.avg_price, price);
  const maxBuy = maxBuyableShares(wallet.balance, wallet.locked_balance, price);
  const netWorth = wallet.balance + val.marketValue;
  const ownSupport = schools.find((s) => s.id === student.school_id)?.support ?? 0;

  const points: StockPoint[] = useMemo(() => {
    const hist = chart.history.map((r) => ({
      price: r.price,
      label: new Date(r.calculated_at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }),
    }));
    // 履歴の最後に「現在値」を必ず置く
    hist.push({ price, label: "現在" });
    return hist;
  }, [chart.history, price]);

  // 株価ランキング（自塾各教室＋ライバル塾）。自塾は投資可、ライバルは目標(投資不可)。
  const ranking = useMemo(() => {
    const rows = [
      ...schools.map((s) => ({ name: s.name, price: s.price, kind: "school" as const, own: s.id === student.school_id, change: 0 })),
      ...benchmarks.map((b) => ({ name: b.name, price: b.price, kind: "rival" as const, own: false,
        change: b.prev_price == null ? 0 : b.price - b.prev_price })),
    ].sort((a, b) => b.price - a.price);
    const maxP = Math.max(price, ...rows.map((r) => r.price), 1);
    return { rows, maxP };
  }, [schools, benchmarks, price, student.school_id]);

  // 次の目標（自塾の現在株価をまだ超えていない、一番近いライバル）
  const nextGoal = useMemo(() => {
    const above = benchmarks.filter((b) => b.price > price).sort((a, b) => a.price - b.price)[0];
    return above ? { name: above.name, gap: above.price - price } : null;
  }, [benchmarks, price]);

  async function checkin() {
    setBusy(true);
    const r = await authFetch("/api/economy/checkin", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return showToast(d.error ?? "失敗しました", "error");
    if (d.already) showToast("本日はチェックイン済みです", "info");
    else { showToast(`＋${d.awarded} AC をゲット！`, "success"); triggerConfetti(); }
    load();
  }

  async function trade(action: "buy" | "sell") {
    const shares = Math.floor(qty);
    if (shares <= 0) return;
    setBusy(true);
    const r = await authFetch("/api/stock/trade", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, shares }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || d.ok === false) return showToast(d.error ?? "取引に失敗しました", "error");
    if (action === "buy") showToast(`${shares}株 買付（${d.cost} AC）`, "success");
    else {
      const pl = d.pl ?? 0;
      showToast(`${shares}株 売却（${d.proceeds} AC・損益 ${pl >= 0 ? "+" : ""}${pl}）`, pl >= 0 ? "success" : "info");
    }
    load();
  }

  async function submitVoice() {
    if (!voiceText.trim()) return;
    setBusy(true);
    const r = await authFetch("/api/economy/voice", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: voiceText.trim() }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || d.ok === false) return showToast(d.error ?? "送信に失敗しました", "error");
    showToast("株主の声を先生に届けました", "success");
    setVoiceText(""); setVoiceSent(true);
  }

  async function redeem(reward: Reward) {
    if (wallet.balance < reward.cost) return showToast("ACが足りません", "error");
    if (!confirm(`「${reward.title}」を ${reward.cost} AC で交換しますか？（先生の承認後に受け取れます）`)) return;
    setBusy(true);
    const r = await authFetch("/api/economy/reward", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ reward_id: reward.id }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || d.ok === false) return showToast(d.error ?? "交換に失敗しました", "error");
    showToast("交換を申請しました（先生の承認待ち）", "success");
    load();
  }

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">読み込み中…</div>;

  return (
    <div className="space-y-5">
      {/* 資産サマリー */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="保有 AC" value={wallet.balance} accent="text-emerald-600" suffix="AC" />
        <StatCard label="投資中 AC" value={wallet.locked_balance} accent="text-amber-600" suffix="AC" />
        <StatCard label="株の評価額" value={val.marketValue} accent="text-indigo-600" suffix="AC" />
        <StatCard label="純資産" value={netWorth} accent="text-slate-800" suffix="AC" />
      </div>

      {/* チェックイン */}
      <div className="flex items-center justify-between rounded-3xl border border-emerald-100 bg-emerald-50/50 p-5">
        <div>
          <p className="text-sm font-bold text-emerald-800">今日のチェックイン</p>
          <p className="text-xs text-emerald-700/80">毎日ログインで AC がもらえます</p>
        </div>
        <button
          onClick={checkin}
          disabled={busy || checkedIn}
          className={`rounded-2xl px-5 py-2.5 text-sm font-bold transition ${
            checkedIn ? "bg-slate-200 text-slate-500" : "bg-emerald-600 text-white hover:bg-emerald-700"
          }`}
        >
          {checkedIn ? "✓ チェックイン済み" : "チェックイン"}
        </button>
      </div>

      {/* 🛒 ポイント商店（陳列棚）── 最初に見える */}
      <div className="rounded-3xl border border-amber-200 bg-amber-50/40 p-6 shadow-sm">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-base font-extrabold text-amber-900">🛒 ポイント商店</p>
            <p className="text-xs text-amber-700/80">ためた AC で交換しよう（交換は先生の承認後にうけとり）</p>
          </div>
          <p className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-extrabold text-emerald-600 shadow-sm">
            のこり {wallet.balance.toLocaleString()} AC
          </p>
        </div>
        {rewards.length === 0 ? (
          <p className="rounded-2xl bg-white/70 px-4 py-6 text-center text-sm text-slate-400">
            いまは商品がありません
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rewards.map((r) => {
              const affordable = wallet.balance >= r.cost;
              const soldOut = r.stock !== null && r.stock <= 0;
              return (
                <div key={r.id} className="flex items-center justify-between rounded-2xl border border-amber-100 bg-white p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {r.category && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          {CATEGORY_LABEL[r.category] ?? r.category}
                        </span>
                      )}
                      <p className="truncate text-sm font-semibold text-slate-800">{r.title}</p>
                    </div>
                    {r.description && <p className="truncate text-xs text-slate-400">{r.description}</p>}
                    <p className={`mt-1 text-sm font-extrabold ${affordable ? "text-amber-600" : "text-slate-400"}`}>{r.cost.toLocaleString()} AC</p>
                  </div>
                  <button
                    onClick={() => redeem(r)}
                    disabled={busy || !affordable || soldOut}
                    className="ml-3 shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {soldOut ? "在庫切れ" : !affordable ? "AC不足" : "交換する"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 📈 AC の増やし方・減り方 */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-3 text-sm font-bold text-slate-800">AC の増やし方・減り方</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-bold text-emerald-700">⬆ こうすると AC が増える</p>
            <ul className="space-y-1.5">
              {earnRules.map((r) => (
                <li key={r.event_key} className="flex items-center justify-between rounded-xl bg-emerald-50/60 px-3 py-1.5 text-sm">
                  <span className="text-slate-700">{EARN_EMOJI[r.event_key] ?? "⭐"} {r.label}</span>
                  <span className="font-bold text-emerald-600">＋{r.points} AC</span>
                </li>
              ))}
              {earnRules.length === 0 && <li className="text-xs text-slate-400">出席・確認テスト合格・まなび・掃除 など</li>}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold text-red-600">⬇ みんなの株価が下がること</p>
            <div className="flex flex-wrap gap-1.5">
              {PENALTY_HINTS.map((p) => (
                <span key={p} className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">{p}</span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">これらが増えると教室の株価が下がります。気をつけよう。</p>
          </div>
        </div>
      </div>

      {/* 自塾株チャート */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-sm font-bold text-slate-800">
              {chart.school_name ?? "自塾"} 株価
            </p>
            <p className="text-xs text-slate-400">みんなの学習・貢献・成長で毎週動きます</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-slate-800">{price.toLocaleString()}<span className="ml-1 text-sm font-semibold text-slate-400">AC</span></p>
          </div>
        </div>
        <StockChart points={points} />
      </div>

      {/* みんなの株価ランキング＆ライバル塾（目標） */}
      {ranking.rows.length > 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3">
            <p className="text-sm font-bold text-slate-800">みんなの株価ランキング</p>
            <p className="text-xs text-slate-400">自分の教室（緑）を、他の教室やライバル塾（🎯目標）とくらべよう。投資できるのは自分の教室だけ。</p>
          </div>

          {nextGoal && (
            <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
              🎯 {nextGoal.name} まであと <span className="text-amber-600">{nextGoal.gap.toLocaleString()}</span> AC！みんなで目指そう
            </div>
          )}
          {!nextGoal && benchmarks.length > 0 && (
            <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
              🎉 ライバル塾をすべて超えました！
            </div>
          )}

          <div className="space-y-2">
            {ranking.rows.map((r, i) => {
              const pct = Math.max(3, Math.round((r.price / ranking.maxP) * 100));
              const isRival = r.kind === "rival";
              const barCls = r.own ? "bg-emerald-500" : isRival ? "bg-amber-400" : "bg-slate-300";
              return (
                <div key={`${r.kind}-${r.name}-${i}`} className="flex items-center gap-3">
                  <div className="w-28 shrink-0 truncate text-xs font-semibold text-slate-600">
                    {isRival ? "🎯 " : ""}{r.name}
                    {r.own && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">自分</span>}
                  </div>
                  <div className="relative h-6 flex-1 overflow-hidden rounded-lg bg-slate-100">
                    <div className={`h-full rounded-lg ${barCls} ${isRival ? "opacity-70" : ""}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-20 shrink-0 text-right text-xs font-bold tabular-nums text-slate-700">
                    {r.change !== 0 && (
                      <span className={r.change > 0 ? "text-emerald-600" : "text-red-500"}>
                        {r.change > 0 ? "▲" : "▼"}
                      </span>
                    )}{" "}{r.price.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-slate-400">🎯＝ライバル塾（目標・投資はできません）／緑＝あなたの教室</p>
        </div>
      )}

      {/* 保有＆売買 */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-3 text-sm font-bold text-slate-800">自塾株の売買</p>
        <div className="mb-4 grid grid-cols-3 gap-3 text-center">
          <div><p className="text-xs text-slate-400">保有株数</p><p className="text-lg font-bold text-slate-800">{holding.shares}</p></div>
          <div><p className="text-xs text-slate-400">平均取得</p><p className="text-lg font-bold text-slate-800">{holding.avg_price.toLocaleString()}</p></div>
          <div>
            <p className="text-xs text-slate-400">評価損益</p>
            <p className={`text-lg font-bold ${val.unrealizedPL >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {val.unrealizedPL >= 0 ? "+" : ""}{val.unrealizedPL.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-10 w-10 rounded-xl border border-slate-200 text-lg font-bold text-slate-600">−</button>
          <input
            type="number" min={1} value={qty}
            onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            className="h-10 w-20 rounded-xl border border-slate-200 text-center text-sm font-semibold"
          />
          <button onClick={() => setQty((q) => q + 1)} className="h-10 w-10 rounded-xl border border-slate-200 text-lg font-bold text-slate-600">＋</button>
          <span className="ml-1 text-xs text-slate-400">＝ {(qty * price).toLocaleString()} AC</span>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => trade("buy")}
            disabled={busy || qty > maxBuy}
            className="flex-1 rounded-2xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400"
          >
            買う（あと{maxBuy}株まで）
          </button>
          <button
            onClick={() => trade("sell")}
            disabled={busy || qty > holding.shares}
            className="flex-1 rounded-2xl bg-white py-2.5 text-sm font-bold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 disabled:text-slate-300 disabled:ring-slate-100"
          >
            売る
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">※ 破産防止のため、投資はウォレット全体の50%までに制限されています。</p>

        {/* 教室の応援金（みんなの投資＝教室の充実） */}
        <div className="mt-4 rounded-2xl bg-indigo-50 p-4">
          <div className="flex items-end justify-between">
            <p className="text-sm font-bold text-indigo-900">🏫 この教室の応援金</p>
            <p className="text-xl font-extrabold text-indigo-700 tabular-nums">{ownSupport.toLocaleString()} <span className="text-xs font-semibold text-indigo-400">AC</span></p>
          </div>
          <p className="mt-1 text-[11px] text-indigo-700/80">
            みんなが自塾株に投資しているACの合計です。投資が増えるほど、教室の充実（新しい備品など）につながります。
            自分たちのがんばりが、自分たちの教室をよくしていきます。
          </p>
        </div>
      </div>

      {/* 🗳 株主の声（自塾株を持っている人だけ） */}
      {holding.shares > 0 && (
        <div className="rounded-3xl border border-violet-100 bg-violet-50/40 p-6 shadow-sm">
          <p className="text-sm font-bold text-violet-900">🗳 株主の声</p>
          <p className="mb-3 text-xs text-violet-700/80">あなたは自塾株の株主です（{holding.shares}株）。教室への意見・要望を先生に伝えられます。</p>
          <textarea
            value={voiceText} onChange={(e) => { setVoiceText(e.target.value); setVoiceSent(false); }}
            rows={3} maxLength={500} placeholder="例：自習室にホワイトボードがほしい／英検の対策コマを増やしてほしい"
            className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-violet-400">{voiceSent ? "送信しました。ありがとう！" : "先生が読みます"}</span>
            <button onClick={submitVoice} disabled={busy || !voiceText.trim()}
              className="rounded-2xl bg-violet-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400">
              意見を送る
            </button>
          </div>
        </div>
      )}

      {/* 取引履歴 */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-3 text-sm font-bold text-slate-800">AC の履歴</p>
        {txns.length === 0 ? (
          <p className="text-sm text-slate-400">まだ履歴がありません</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {txns.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-700">{t.description || TYPE_LABEL[t.type] || t.type}</p>
                  <p className="text-[11px] text-slate-400">
                    {TYPE_LABEL[t.type] ?? t.type} ・ {new Date(t.created_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
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
    </div>
  );
}

function StatCard({ label, value, accent, suffix }: { label: string; value: number; accent: string; suffix?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xl font-extrabold ${accent}`}>
        {value.toLocaleString()}<span className="ml-0.5 text-xs font-semibold text-slate-400">{suffix}</span>
      </p>
    </div>
  );
}
