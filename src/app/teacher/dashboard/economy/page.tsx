"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import { showToast } from "@/lib/toast";

type Student = { id: string; name: string; grade: string; school_id: string | null };
type School = { id: string; name: string; current_stock_price: number };
type WalletRow = { student_id: string; balance: number; locked_balance: number };
type RewardItem = { id: string; title: string; description: string; cost: number; stock: number | null; active: boolean; school_id: string | null };
type ExchangeRow = { id: string; student_name: string | null; reward_title: string | null; cost: number; created_at: string };
type CalcResult = {
  school_id: string; school_name: string;
  prev_price: number; new_price: number; change_rate: number;
  deltas: { study: number; contrib: number; growth: number; penalty: number };
  agg: Record<string, number>;
};

const CONTRIB_KINDS = [
  { key: "clean", label: "清掃" }, { key: "disinfect", label: "消毒" },
  { key: "rule", label: "自習室ルール遵守" }, { key: "help", label: "仲間のサポート" },
] as const;
const NEG_KINDS = [
  { key: "tardy", label: "無断遅刻" }, { key: "homework_missing", label: "宿題未提出" },
] as const;

export default function TeacherEconomyPage() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [wallets, setWallets] = useState<Record<string, WalletRow>>({});
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [pending, setPending] = useState<ExchangeRow[]>([]);
  const [busy, setBusy] = useState(false);

  // 付与フォーム
  const [studentId, setStudentId] = useState("");
  const [awardMode, setAwardMode] = useState<"contribution" | "direct">("contribution");
  const [kind, setKind] = useState<string>("clean");
  const [negative, setNegative] = useState(false);
  const [note, setNote] = useState("");
  const [awardAmount, setAwardAmount] = useState(100);

  // 報酬作成フォーム
  const [rTitle, setRTitle] = useState("");
  const [rDesc, setRDesc] = useState("");
  const [rCost, setRCost] = useState(500);

  // 週次計算プレビュー
  const [preview, setPreview] = useState<CalcResult[] | null>(null);

  const load = useCallback(async () => {
    const [st, sc, wl, rw, ex] = await Promise.all([
      supabase.from("students").select("id, name, grade, school_id").order("name"),
      supabase.from("schools").select("id, name, current_stock_price").order("name"),
      supabase.from("student_wallets").select("student_id, balance, locked_balance"),
      supabase.from("reward_items").select("id, title, description, cost, stock, active, school_id").order("cost"),
      supabase.from("reward_exchanges").select("id, student_name, reward_title, cost, created_at")
        .eq("status", "pending").order("created_at", { ascending: true }),
    ]);
    setStudents((st.data as Student[]) ?? []);
    setSchools((sc.data as School[]) ?? []);
    const wmap: Record<string, WalletRow> = {};
    for (const w of (wl.data as WalletRow[]) ?? []) wmap[w.student_id] = w;
    setWallets(wmap);
    setRewards((rw.data as RewardItem[]) ?? []);
    setPending((ex.data as ExchangeRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const studentName = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s.name])),
    [students]
  );

  async function submitAward() {
    if (!studentId) return showToast("生徒を選んでください", "error");
    setBusy(true);
    let body: Record<string, unknown>;
    if (awardMode === "contribution") {
      body = {
        student_id: studentId,
        contribution: { kind, polarity: negative ? "negative" : "positive", note: note || null },
        award: awardAmount,
      };
    } else {
      body = { student_id: studentId, amount: awardAmount, description: note || "" };
    }
    const r = await authFetch("/api/economy/award", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return showToast(d.error ?? "失敗しました", "error");
    showToast(`${studentName[studentId]} に記録しました${d.awarded ? `（+${d.awarded} AC）` : ""}`, "success");
    setNote("");
    load();
  }

  async function createReward() {
    if (!rTitle.trim() || rCost <= 0) return showToast("タイトルと正の必要ACが必要です", "error");
    setBusy(true);
    const { error } = await supabase.from("reward_items").insert({
      title: rTitle.trim(), description: rDesc.trim(), cost: rCost, active: true,
    });
    setBusy(false);
    if (error) return showToast(error.message, "error");
    showToast("報酬を追加しました", "success");
    setRTitle(""); setRDesc(""); setRCost(500);
    load();
  }

  async function toggleReward(r: RewardItem) {
    const { error } = await supabase.from("reward_items").update({ active: !r.active }).eq("id", r.id);
    if (error) return showToast(error.message, "error");
    load();
  }

  async function decide(exchange_id: string, approve: boolean) {
    setBusy(true);
    const r = await authFetch("/api/economy/exchange/approve", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ exchange_id, approve }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || d.ok === false) return showToast(d.error ?? "失敗しました", "error");
    showToast(approve ? "承認しました" : "却下（返金）しました", "success");
    load();
  }

  async function runCalc(dry: boolean) {
    setBusy(true);
    const r = await authFetch(`/api/cron/calculate-stock${dry ? "?dry=1" : ""}`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return showToast(d.error ?? "計算に失敗しました", "error");
    setPreview(d.schools as CalcResult[]);
    if (!dry) { showToast("株価を更新しました", "success"); load(); }
  }

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">読み込み中…</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">塾内経済（アカデミーコイン・自塾株）</h1>
        <p className="text-sm text-slate-500">AC はゲーム内ポイントで現金価値はありません。生徒の学習・貢献・成長で自塾株が動きます。</p>
      </div>

      {/* 自塾株の株価 & 週次計算 */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">自塾株の株価</h2>
          <div className="flex gap-2">
            <button onClick={() => runCalc(true)} disabled={busy}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              週次計算プレビュー
            </button>
            <button onClick={() => { if (confirm("株価を実際に更新します。よろしいですか？")) runCalc(false); }} disabled={busy}
              className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700">
              いま更新
            </button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {schools.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
              <span className="truncate text-sm font-semibold text-slate-700">{s.name}</span>
              <span className="text-lg font-extrabold text-slate-800">{s.current_stock_price.toLocaleString()}<span className="ml-1 text-xs text-slate-400">AC</span></span>
            </div>
          ))}
        </div>
        {preview && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400">
                  <th className="p-2 text-left">校舎</th><th className="p-2 text-right">現在→新</th><th className="p-2 text-right">変化</th>
                  <th className="p-2 text-right">学習</th><th className="p-2 text-right">貢献</th><th className="p-2 text-right">成長</th><th className="p-2 text-right">罰</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.school_id} className="border-t border-slate-100">
                    <td className="p-2 font-semibold text-slate-700">{p.school_name}</td>
                    <td className="p-2 text-right">{p.prev_price.toLocaleString()} → <b>{p.new_price.toLocaleString()}</b></td>
                    <td className={`p-2 text-right font-bold ${p.change_rate >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {(p.change_rate * 100).toFixed(2)}%
                    </td>
                    <td className="p-2 text-right text-slate-500">{(p.deltas.study * 100).toFixed(2)}</td>
                    <td className="p-2 text-right text-slate-500">{(p.deltas.contrib * 100).toFixed(2)}</td>
                    <td className="p-2 text-right text-slate-500">{(p.deltas.growth * 100).toFixed(2)}</td>
                    <td className="p-2 text-right text-slate-500">-{(p.deltas.penalty * 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-slate-400">プレビューは保存されません。数値は各成分の寄与率（%）です。</p>
          </div>
        )}
      </section>

      {/* AC付与・貢献記録 */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-800">AC を付与・貢献を記録</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-500">生徒</span>
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">選択…</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}（{s.grade}）</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-500">種別</span>
            <select value={awardMode} onChange={(e) => setAwardMode(e.target.value as "contribution" | "direct")}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="contribution">貢献記録（清掃・消毒・ルール等）</option>
              <option value="direct">直接付与（課題・テスト・調整）</option>
            </select>
          </label>
        </div>

        {awardMode === "contribution" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={negative} onChange={(e) => { setNegative(e.target.checked); setKind(e.target.checked ? "tardy" : "clean"); }} />
              マイナス評価（罰）
            </label>
            <select value={kind} onChange={(e) => setKind(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {(negative ? NEG_KINDS : CONTRIB_KINDS).map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-500">{awardMode === "direct" ? "付与AC（負値=調整）" : "付与AC（マイナス評価は0推奨）"}</span>
            <input type="number" value={awardAmount} onChange={(e) => setAwardAmount(Math.floor(Number(e.target.value) || 0))}
              className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-500">メモ（任意）</span>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="例: 授業後に自習室を清掃" />
          </label>
          <button onClick={submitAward} disabled={busy}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700">
            記録
          </button>
        </div>
      </section>

      {/* 交換申請の承認 */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-800">報酬交換の承認待ち（{pending.length}件）</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">承認待ちはありません</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{p.student_name} → {p.reward_title}</p>
                  <p className="text-[11px] text-slate-400">{p.cost.toLocaleString()} AC ・ {new Date(p.created_at).toLocaleString("ja-JP")}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => decide(p.id, true)} disabled={busy}
                    className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">承認</button>
                  <button onClick={() => decide(p.id, false)} disabled={busy}
                    className="rounded-xl border border-red-200 px-4 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50">却下（返金）</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 報酬マスタ */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-800">報酬アイテム</h2>
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <input value={rTitle} onChange={(e) => setRTitle(e.target.value)} placeholder="タイトル（例: 文房具と交換）"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <input value={rDesc} onChange={(e) => setRDesc(e.target.value)} placeholder="説明（任意）"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <input type="number" value={rCost} onChange={(e) => setRCost(Math.floor(Number(e.target.value) || 0))}
            className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <button onClick={createReward} disabled={busy}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600">追加</button>
        </div>
        {rewards.length === 0 ? (
          <p className="text-sm text-slate-400">まだ報酬がありません</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rewards.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <p className={`truncate text-sm font-semibold ${r.active ? "text-slate-800" : "text-slate-400 line-through"}`}>{r.title}</p>
                  <p className="text-[11px] text-slate-400">{r.cost.toLocaleString()} AC{r.description ? ` ・ ${r.description}` : ""}</p>
                </div>
                <button onClick={() => toggleReward(r)}
                  className="ml-3 shrink-0 rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  {r.active ? "無効化" : "有効化"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 生徒ウォレット一覧 */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-800">生徒ウォレット</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400">
                <th className="p-2 text-left">生徒</th><th className="p-2 text-right">保有AC</th><th className="p-2 text-right">投資中AC</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const w = wallets[s.id];
                return (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="p-2 font-semibold text-slate-700">{s.name}<span className="ml-1 text-xs text-slate-400">{s.grade}</span></td>
                    <td className="p-2 text-right text-emerald-600">{(w?.balance ?? 0).toLocaleString()}</td>
                    <td className="p-2 text-right text-amber-600">{(w?.locked_balance ?? 0).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
