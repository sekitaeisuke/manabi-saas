"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import { holdingValuation } from "@/lib/classStock";
import { StockChart, type StockPoint } from "@/components/StockChart";

type Student = { id: string; name: string; grade: string };
type Snapshot = {
  student: { name: string; grade: string; school_name: string | null; current_price: number; support: number };
  wallet: { balance: number; locked_balance: number };
  holding: { shares: number; avg_price: number };
  txns: { id: string; amount: number; type: string; description: string; created_at: string }[];
  exchanges: { id: string; reward_title: string | null; cost: number; status: string; created_at: string }[];
  rewards: { id: string; title: string; description: string; cost: number; stock: number | null; category: string | null }[];
  rules: { event_key: string; label: string; points: number }[];
  voices: { id: string; message: string; status: string; created_at: string; shares: number | null }[];
  history: { price: number; calculated_at: string }[];
};

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
const EARN_EMOJI: Record<string, string> = {
  attend: "🏫", testpass: "💯", manabi: "📗", clean: "🧹", report: "📝", refer: "🤝", refereed: "🎁",
};
const PENALTY_HINTS = ["宿題未提出", "忘れ物", "遅刻", "テスト不合格", "私語", "こっそりスマホ", "こっそり息抜き", "ちょっと良くない"];

export default function EconomyPreviewPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState("");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [view, setView] = useState<"student" | "parent">("student");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("students").select("id, name, grade").order("name").then(({ data }) => {
      setStudents((data as Student[]) ?? []);
    });
  }, []);

  const loadSnap = useCallback(async (sid: string) => {
    setLoading(true); setSnap(null);
    const r = await authFetch(`/api/economy/preview?student_id=${sid}`);
    const d = await r.json().catch(() => null);
    setSnap(r.ok ? (d as Snapshot) : null);
    setLoading(false);
  }, []);

  useEffect(() => { if (studentId) loadSnap(studentId); }, [studentId, loadSnap]);

  const price = snap?.student.current_price ?? 1000;
  const val = snap ? holdingValuation(snap.holding.shares, snap.holding.avg_price, price) : null;
  const points: StockPoint[] = useMemo(() => {
    if (!snap) return [];
    const hist = snap.history.map((h) => ({
      price: h.price, label: new Date(h.calculated_at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }),
    }));
    hist.push({ price, label: "現在" });
    return hist;
  }, [snap, price]);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">🔍 生徒・保護者ビューのプレビュー</h1>
          <p className="text-sm text-slate-500">生徒が見る画面を、ログインし直さずに読み取り専用で確認できます。</p>
        </div>
        <Link href="/teacher/dashboard/economy" className="shrink-0 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">← 経済へ戻る</Link>
      </div>

      {/* 選択 */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
          <option value="">生徒を選ぶ…</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}（{s.grade}）</option>)}
        </select>
        <div className="inline-flex overflow-hidden rounded-xl border border-slate-200">
          <button onClick={() => setView("student")}
            className={`px-3 py-2 text-xs font-bold ${view === "student" ? "bg-indigo-600 text-white" : "bg-white text-slate-600"}`}>生徒ビュー</button>
          <button onClick={() => setView("parent")}
            className={`px-3 py-2 text-xs font-bold ${view === "parent" ? "bg-indigo-600 text-white" : "bg-white text-slate-600"}`}>保護者ビュー</button>
        </div>
      </div>

      {!studentId && <p className="py-10 text-center text-sm text-slate-400">生徒を選ぶとプレビューが表示されます。</p>}
      {loading && <p className="py-10 text-center text-sm text-slate-400">読み込み中…</p>}

      {snap && !loading && (
        <div className="rounded-3xl border-2 border-dashed border-indigo-200 bg-indigo-50/20 p-4">
          <p className="mb-3 text-center text-xs font-bold text-indigo-500">
            ▼ {snap.student.name} さんの{view === "student" ? "生徒" : "保護者"}画面（読み取り専用プレビュー）
          </p>

          <div className="space-y-4">
            {/* 残高 */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="保有 AC" value={snap.wallet.balance} accent="text-emerald-600" />
              <Stat label="投資中 AC" value={snap.wallet.locked_balance} accent="text-amber-600" />
              <Stat label="株の評価額" value={val?.marketValue ?? 0} accent="text-indigo-600" />
              <Stat label="純資産" value={snap.wallet.balance + (val?.marketValue ?? 0)} accent="text-slate-800" />
            </div>

            {view === "student" ? (
              <>
                {/* 商店 */}
                <Section title="🛒 ポイント商店">
                  {snap.rewards.length === 0 ? <Empty text="いまは商品がありません" /> : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {snap.rewards.map((r) => (
                        <div key={r.id} className="rounded-2xl border border-amber-100 bg-white p-3">
                          <div className="flex items-center gap-1.5">
                            {r.category && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{CATEGORY_LABEL[r.category] ?? r.category}</span>}
                            <p className="truncate text-sm font-semibold text-slate-800">{r.title}</p>
                          </div>
                          {r.description && <p className="mt-0.5 truncate text-xs text-slate-400">{r.description}</p>}
                          <p className="mt-1 text-xs font-bold text-amber-600">{r.cost.toLocaleString()} AC</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* 増減 */}
                <Section title="AC の増やし方・減り方">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-bold text-emerald-700">⬆ 増える</p>
                      <ul className="space-y-1.5">
                        {snap.rules.map((r) => (
                          <li key={r.event_key} className="flex items-center justify-between rounded-xl bg-emerald-50/60 px-3 py-1.5 text-sm">
                            <span className="text-slate-700">{EARN_EMOJI[r.event_key] ?? "⭐"} {r.label}</span>
                            <span className="font-bold text-emerald-600">＋{r.points} AC</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-bold text-red-600">⬇ 株価が下がること</p>
                      <div className="flex flex-wrap gap-1.5">
                        {PENALTY_HINTS.map((p) => <span key={p} className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">{p}</span>)}
                      </div>
                    </div>
                  </div>
                </Section>

                {/* 自塾株 */}
                <Section title={`${snap.student.school_name ?? "自塾"} 株価　${price.toLocaleString()} AC`}>
                  <StockChart points={points} />
                  <div className="mt-3 grid grid-cols-3 gap-3 text-center text-sm">
                    <div><p className="text-xs text-slate-400">保有株数</p><p className="font-bold">{snap.holding.shares}</p></div>
                    <div><p className="text-xs text-slate-400">平均取得</p><p className="font-bold">{snap.holding.avg_price.toLocaleString()}</p></div>
                    <div><p className="text-xs text-slate-400">評価損益</p><p className={`font-bold ${(val?.unrealizedPL ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{(val?.unrealizedPL ?? 0) >= 0 ? "+" : ""}{(val?.unrealizedPL ?? 0).toLocaleString()}</p></div>
                  </div>
                  <div className="mt-3 rounded-2xl bg-indigo-50 p-3">
                    <div className="flex items-end justify-between">
                      <p className="text-sm font-bold text-indigo-900">🏫 この教室の応援AC</p>
                      <p className="text-lg font-extrabold text-indigo-700 tabular-nums">{snap.student.support.toLocaleString()} AC</p>
                    </div>
                  </div>
                </Section>

                {/* 株主の声 */}
                {snap.voices.length > 0 && (
                  <Section title="🗳 株主の声（この生徒の投稿）">
                    <ul className="space-y-1.5">
                      {snap.voices.map((v) => (
                        <li key={v.id} className="rounded-xl bg-white p-2.5 text-sm text-slate-700">{v.message}
                          <span className="ml-1 text-[11px] text-slate-400">（{new Date(v.created_at).toLocaleDateString("ja-JP")}）</span></li>
                      ))}
                    </ul>
                  </Section>
                )}
              </>
            ) : (
              <>
                {/* 保護者ビュー：使いみち */}
                <Section title="ポイントの使いみち（交換・購入）">
                  {snap.exchanges.length === 0 ? <Empty text="まだ交換はありません" /> : (
                    <ul className="divide-y divide-slate-100">
                      {snap.exchanges.map((e) => (
                        <li key={e.id} className="flex items-center justify-between py-2.5">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{e.reward_title}</p>
                            <p className="text-[11px] text-slate-400">{new Date(e.created_at).toLocaleDateString("ja-JP")} ・ {EX_STATUS[e.status] ?? e.status}</p>
                          </div>
                          <span className="text-sm font-bold text-amber-600">−{e.cost.toLocaleString()} AC</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
                {/* 商店（閲覧） */}
                <Section title="商店の品揃え">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {snap.rewards.map((r) => (
                      <div key={r.id} className="rounded-2xl border border-amber-100 bg-white p-3">
                        <p className="truncate text-sm font-semibold text-slate-800">{r.title}</p>
                        <p className="mt-1 text-xs font-bold text-amber-600">{r.cost.toLocaleString()} AC</p>
                      </div>
                    ))}
                  </div>
                </Section>
              </>
            )}

            {/* 履歴（両ビュー共通） */}
            <Section title="AC の履歴">
              {snap.txns.length === 0 ? <Empty text="まだ履歴がありません" /> : (
                <ul className="divide-y divide-slate-100">
                  {snap.txns.map((t) => (
                    <li key={t.id} className="flex items-center justify-between py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-700">{t.description || TYPE_LABEL[t.type] || t.type}</p>
                        <p className="text-[11px] text-slate-400">{TYPE_LABEL[t.type] ?? t.type} ・ {new Date(t.created_at).toLocaleDateString("ja-JP")}</p>
                      </div>
                      <span className={`ml-3 shrink-0 text-sm font-bold ${t.amount >= 0 ? "text-emerald-600" : "text-red-500"}`}>{t.amount >= 0 ? "+" : ""}{t.amount.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xl font-extrabold ${accent}`}>{value.toLocaleString()}<span className="ml-0.5 text-xs font-semibold text-slate-400">AC</span></p>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5">
      <p className="mb-3 text-sm font-bold text-slate-800">{title}</p>
      {children}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="text-sm text-slate-400">{text}</p>;
}
