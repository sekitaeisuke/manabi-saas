"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import { showToast } from "@/lib/toast";

type Student = { id: string; name: string; grade: string; school_id: string | null };
type School = { id: string; name: string; current_stock_price: number };
type WalletRow = { student_id: string; balance: number; locked_balance: number };
type RewardItem = { id: string; title: string; description: string; cost: number; stock: number | null; active: boolean; school_id: string | null; category: string | null };
type ExchangeRow = { id: string; student_name: string | null; reward_title: string | null; cost: number; created_at: string; status?: string };
type Rule = { event_key: string; label: string; points: number; threshold: number | null; enabled: boolean };
type ReferralRow = {
  id: string; referrer_student_id: string; referrer_name: string | null;
  friend_name: string; friend_student_id: string | null; status: string; created_at: string;
};
type ScanResult = { dry: boolean; total_count: number; total_ac: number; detail: Record<string, { count: number; ac: number }> };
type Benchmark = { id: string; name: string; price: number; note: string | null; active: boolean };
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
  { key: "homework_missing", label: "宿題未提出" },
  { key: "forgot_item", label: "忘れ物" },
  { key: "tardy", label: "遅刻" },
  { key: "test_fail", label: "テスト不合格" },
  { key: "chatting", label: "私語" },
  { key: "sneaky_phone", label: "こっそりスマホ" },
  { key: "slacking", label: "こっそり息抜き" },
  { key: "minor_bad", label: "ちょっと良くない" },
] as const;

export default function TeacherEconomyPage() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [wallets, setWallets] = useState<Record<string, WalletRow>>({});
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [pending, setPending] = useState<ExchangeRow[]>([]);
  const [approved, setApproved] = useState<ExchangeRow[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);

  // 紹介フォーム
  const [refStudent, setRefStudent] = useState("");
  const [refFriend, setRefFriend] = useState("");
  const [rCategory, setRCategory] = useState("goods");

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
    const [st, sc, wl, rw, ex, exA, ru, rf, bm] = await Promise.all([
      supabase.from("students").select("id, name, grade, school_id").order("name"),
      supabase.from("schools").select("id, name, current_stock_price").order("name"),
      supabase.from("student_wallets").select("student_id, balance, locked_balance"),
      supabase.from("reward_items").select("id, title, description, cost, stock, active, school_id, category").order("cost"),
      supabase.from("reward_exchanges").select("id, student_name, reward_title, cost, created_at, status")
        .eq("status", "pending").order("created_at", { ascending: true }),
      supabase.from("reward_exchanges").select("id, student_name, reward_title, cost, created_at, status")
        .eq("status", "approved").order("created_at", { ascending: true }),
      supabase.from("ac_rules").select("event_key, label, points, threshold, enabled"),
      supabase.from("referral_rewards")
        .select("id, referrer_student_id, referrer_name, friend_name, friend_student_id, status, created_at")
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("stock_benchmarks").select("id, name, price, note, active").order("sort_order"),
    ]);
    setStudents((st.data as Student[]) ?? []);
    setSchools((sc.data as School[]) ?? []);
    const wmap: Record<string, WalletRow> = {};
    for (const w of (wl.data as WalletRow[]) ?? []) wmap[w.student_id] = w;
    setWallets(wmap);
    setRewards((rw.data as RewardItem[]) ?? []);
    setPending((ex.data as ExchangeRow[]) ?? []);
    setApproved((exA.data as ExchangeRow[]) ?? []);
    setRules((ru.data as Rule[]) ?? []);
    setReferrals((rf.data as ReferralRow[]) ?? []);
    setBenchmarks((bm.data as Benchmark[]) ?? []);
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
      title: rTitle.trim(), description: rDesc.trim(), cost: rCost, active: true, category: rCategory,
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

  // 獲得ルールの編集（pt・合格ライン・ON/OFF）
  async function saveRule(rule: Rule, patch: Partial<Rule>) {
    const next = { ...rule, ...patch };
    setRules((prev) => prev.map((x) => (x.event_key === rule.event_key ? next : x)));
    const { error } = await supabase.from("ac_rules")
      .update({ points: next.points, threshold: next.threshold, enabled: next.enabled })
      .eq("event_key", rule.event_key);
    if (error) showToast(error.message, "error");
  }

  // ライバル塾（目標株価）の編集
  async function saveBenchmark(b: Benchmark, patch: Partial<Benchmark>) {
    const next = { ...b, ...patch };
    setBenchmarks((prev) => prev.map((x) => (x.id === b.id ? next : x)));
    const { error } = await supabase.from("stock_benchmarks")
      .update({ name: next.name, price: next.price, active: next.active }).eq("id", b.id);
    if (error) showToast(error.message, "error");
  }

  // 獲得スキャン（自動付与）
  async function runScan(dry: boolean) {
    setBusy(true);
    const r = await authFetch(`/api/economy/scan-earnings${dry ? "?dry=1" : ""}`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return showToast(d.error ?? "スキャンに失敗しました", "error");
    setScanResult(d as ScanResult);
    if (!dry) { showToast(`自動付与 ${d.total_count}件・計${d.total_ac}AC`, "success"); load(); }
  }

  // 受け渡し完了
  async function completeExchange(exchange_id: string) {
    setBusy(true);
    const r = await authFetch("/api/economy/exchange/approve", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ exchange_id, complete: true }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return showToast(d.error ?? "失敗しました", "error");
    showToast("受け渡し完了にしました", "success");
    load();
  }

  // 紹介
  async function createReferral() {
    if (!refStudent || !refFriend.trim()) return showToast("紹介者(生徒)と友人名が必要です", "error");
    setBusy(true);
    const r = await authFetch("/api/economy/referral", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", referrer_student_id: refStudent, friend_name: refFriend.trim() }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return showToast(d.error ?? "登録に失敗しました", "error");
    showToast("紹介を登録しました", "success");
    setRefFriend("");
    load();
  }

  async function refEnroll(id: string) {
    setBusy(true);
    const r = await authFetch("/api/economy/referral", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "enroll", referral_id: id }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || d.ok === false) return showToast(d.error ?? "失敗しました", "error");
    showToast(`紹介者に +${d.awarded} AC`, "success");
    load();
  }

  async function refLink(id: string, friend_student_id: string) {
    if (!friend_student_id) return;
    setBusy(true);
    const r = await authFetch("/api/economy/referral", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "link", referral_id: id, friend_student_id }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || d.ok === false) return showToast(d.error ?? "失敗しました", "error");
    showToast(`被紹介者に +${d.awarded} AC`, "success");
    load();
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

      {/* ライバル塾（目標株価） */}
      <section className="rounded-3xl border border-amber-100 bg-amber-50/40 p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-bold text-amber-900">ライバル塾（目標株価）</h2>
        <p className="mb-3 text-xs text-amber-700/80">生徒の「経済」タブに🎯目標として表示されます（投資は自塾のみ・ライバルは表示専用）。目標株価は自由に設定してください。</p>
        {benchmarks.length === 0 ? (
          <p className="text-sm text-slate-400">ライバル塾がありません（class-stock-benchmarks-setup.sql を実行してください）</p>
        ) : (
          <div className="space-y-2">
            {benchmarks.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white px-3 py-2">
                <input value={b.name} onChange={(e) => saveBenchmark(b, { name: e.target.value })}
                  className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm font-semibold" />
                <span className="text-xs text-slate-400">目標株価</span>
                <input type="number" value={b.price}
                  onChange={(e) => saveBenchmark(b, { price: Math.floor(Number(e.target.value) || 0) })}
                  className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm" />
                <span className="text-xs text-slate-400">AC</span>
                <label className="ml-auto flex items-center gap-1 text-xs text-slate-600">
                  <input type="checkbox" checked={b.active} onChange={(e) => saveBenchmark(b, { active: e.target.checked })}
                    className="h-4 w-4 accent-amber-500" />表示
                </label>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 獲得ルール & 自動スキャン */}
      <section className="rounded-3xl border border-emerald-100 bg-emerald-50/40 p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-emerald-900">獲得ルール（自動付与）</h2>
            <p className="text-xs text-emerald-700/80">出席・確認テスト合格・まなび使用は自動。掃除は kiosk のボタン。pt は編集できます。</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => runScan(true)} disabled={busy}
              className="rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
              スキャン（プレビュー）
            </button>
            <button onClick={() => { if (confirm("直近の行動から AC を自動付与します。よろしいですか？")) runScan(false); }} disabled={busy}
              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
              今すぐ自動付与
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-emerald-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400">
                <th className="p-2 text-left">ルール</th><th className="p-2 text-right">pt</th>
                <th className="p-2 text-right">合格ライン</th><th className="p-2 text-center">有効</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.event_key} className="border-t border-slate-100">
                  <td className="p-2 font-semibold text-slate-700">{rule.label}</td>
                  <td className="p-2 text-right">
                    <input type="number" value={rule.points}
                      onChange={(e) => saveRule(rule, { points: Math.floor(Number(e.target.value) || 0) })}
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm" />
                  </td>
                  <td className="p-2 text-right">
                    {rule.event_key === "testpass" ? (
                      <input type="number" value={rule.threshold ?? 80}
                        onChange={(e) => saveRule(rule, { threshold: Math.floor(Number(e.target.value) || 0) })}
                        className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm" />
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="p-2 text-center">
                    <input type="checkbox" checked={rule.enabled}
                      onChange={(e) => saveRule(rule, { enabled: e.target.checked })} className="h-4 w-4 accent-emerald-600" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {scanResult && (
          <div className="mt-3 rounded-2xl bg-white p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">
              {scanResult.dry ? "候補（未保存）" : "付与しました"}：合計 {scanResult.total_count}件 / {scanResult.total_ac} AC
            </p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {Object.entries(scanResult.detail).map(([k, v]) => (
                <span key={k}>{k}: {v.count}件 / {v.ac}AC</span>
              ))}
            </div>
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

        {/* 承認済み → 受け渡し/実施の完了 */}
        {approved.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="mb-2 text-xs font-bold text-slate-500">承認済み・受け渡し待ち（{approved.length}件）</h3>
            <ul className="divide-y divide-slate-100">
              {approved.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5">
                  <p className="text-sm text-slate-700">{p.student_name} → {p.reward_title}</p>
                  <button onClick={() => completeExchange(p.id)} disabled={busy}
                    className="rounded-xl bg-slate-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-700">受け渡し完了</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 友人紹介（講師確認型） */}
      <section className="rounded-3xl border border-violet-100 bg-violet-50/40 p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-bold text-violet-900">友人紹介</h2>
        <p className="mb-3 text-xs text-violet-700/80">紹介を登録→入塾確定で紹介者に付与→友人が生徒登録されたら紐付けて被紹介者に付与。</p>
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <select value={refStudent} onChange={(e) => setRefStudent(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="">紹介者（生徒）…</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}（{s.grade}）</option>)}
          </select>
          <input value={refFriend} onChange={(e) => setRefFriend(e.target.value)} placeholder="友人の名前"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <button onClick={createReferral} disabled={busy}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700">登録</button>
        </div>
        {referrals.length === 0 ? (
          <p className="text-sm text-slate-400">まだ紹介はありません</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {referrals.map((rf) => (
              <li key={rf.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{rf.referrer_name} → {rf.friend_name}</p>
                  <p className="text-[11px] text-slate-400">
                    {rf.status === "pending" ? "紹介登録済み" : rf.status === "enrolled" ? "入塾確定・紹介者付与済み" : "完了（両者付与済み）"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {rf.status === "pending" && (
                    <button onClick={() => refEnroll(rf.id)} disabled={busy}
                      className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700">入塾確定（紹介者+）</button>
                  )}
                  {rf.status === "enrolled" && (
                    <select defaultValue="" disabled={busy}
                      onChange={(e) => { if (e.target.value) refLink(rf.id, e.target.value); }}
                      className="rounded-xl border border-violet-200 px-2 py-1.5 text-xs">
                      <option value="">友人を生徒から選び被紹介者付与…</option>
                      {students.map((s) => <option key={s.id} value={s.id}>{s.name}（{s.grade}）</option>)}
                    </select>
                  )}
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
          <select value={rCategory} onChange={(e) => setRCategory(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="goods">グッズ</option>
            <option value="card">紹介カード</option>
            <option value="pass">通い放題</option>
            <option value="online">オンライン授業</option>
            <option value="other">その他</option>
          </select>
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
