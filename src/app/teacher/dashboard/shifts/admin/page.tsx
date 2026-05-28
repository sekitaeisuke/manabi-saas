"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { ShiftPeriod, ShiftRequest, ShiftAssignment, ShiftEvent, EventType, AssignmentMode } from "@/lib/supabase";
import { showToast } from "@/lib/toast";

// ─── 型 ──────────────────────────────────────────────────────
type Teacher = { id: string; name: string; email: string | null; school_id: string | null };
type School  = { id: string; name: string; group_name: string | null };

type AiShiftRow = {
  date: string; slot_start: string; slot_end: string;
  school_id: string; school_name: string;
  teacher_id: string; teacher_name: string;
  note?: string | null;
};

type Step = "periods" | "requests" | "ai" | "confirm" | "events";

const EVENT_TYPE_OPTIONS: { value: EventType; label: string; icon: string; color: string }[] = [
  { value: "event",   label: "行事",      icon: "🎉", color: "bg-purple-100 text-purple-700" },
  { value: "exam",    label: "テスト",    icon: "📝", color: "bg-red-100 text-red-700"       },
  { value: "holiday", label: "休校",      icon: "🏖", color: "bg-slate-100 text-slate-500"   },
  { value: "class",   label: "特別授業",  icon: "📚", color: "bg-teal-100 text-teal-700"     },
  { value: "info",    label: "お知らせ",  icon: "ℹ️", color: "bg-amber-100 text-amber-700"   },
];

const SLOTS = [
  { start: "10:00", end: "12:00" },
  { start: "12:00", end: "14:00" },
  { start: "14:00", end: "16:00" },
  { start: "16:00", end: "18:00" },
  { start: "18:00", end: "20:00" },
  { start: "20:00", end: "22:00" },
];
const AVAIL_COLOR: Record<string, string> = {
  preferred:   "bg-green-100 text-green-700",
  available:   "bg-blue-100  text-blue-700",
  unavailable: "bg-red-50    text-red-400",
};
const AVAIL_LABEL: Record<string, string> = {
  preferred: "◎", available: "○", unavailable: "×",
};

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
function dow(iso: string) {
  return ["日","月","火","水","木","金","土"][new Date(iso).getDay()];
}

// ─── メインコンポーネント ─────────────────────────────────────
export default function ShiftAdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>("periods");

  // 管理者チェック
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setIsAdmin(false); return; }
      supabase.from("teachers").select("role").eq("email", session.user.email!).maybeSingle()
        .then(({ data }) => setIsAdmin(data?.role === "admin"));
    });
  }, []);

  if (isAdmin === null) return <div className="flex h-screen items-center justify-center text-slate-400">確認中...</div>;
  if (!isAdmin) return (
    <div className="flex h-screen flex-col items-center justify-center gap-2 text-slate-500">
      <span className="text-4xl">🔒</span>
      <p className="font-semibold">管理者のみアクセスできます</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-2 text-2xl font-bold text-slate-950">シフト管理（管理者）</h1>

        {/* ステップタブ */}
        <nav className="mb-8 overflow-x-auto">
          <div className="flex min-w-max gap-0 rounded-2xl bg-white p-1 shadow-sm">
            {(["periods","requests","ai","confirm","events"] as Step[]).map((s, i) => {
              const labels: Record<Step, { short: string; full: string }> = {
                periods:  { short: "期間設定",    full: "① 期間設定" },
                requests: { short: "希望確認",    full: "② 希望確認" },
                ai:       { short: "AI調整",      full: "③ AI調整"   },
                confirm:  { short: "確認・確定",  full: "④ 確認・確定" },
                events:   { short: "イベント",    full: "⑤ イベント管理" },
              };
              const stepOrder: Step[] = ["periods","requests","ai","confirm","events"];
              const currentIdx = stepOrder.indexOf(step);
              const thisIdx = stepOrder.indexOf(s);
              const isPast = thisIdx < currentIdx;
              return (
                <button key={s} onClick={() => setStep(s)}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition whitespace-nowrap
                    ${step === s
                      ? "bg-blue-600 text-white shadow"
                      : isPast
                        ? "text-green-600 hover:bg-green-50"
                        : "text-slate-400 hover:bg-slate-50"}`}>
                  {isPast && step !== s && <span className="text-green-500">✓</span>}
                  <span className="hidden sm:inline">{labels[s].full}</span>
                  <span className="sm:hidden">{labels[s].short}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {step === "periods"  && <PeriodsStep  onNext={() => setStep("requests")} />}
        {step === "requests" && <RequestsStep onNext={() => setStep("ai")} />}
        {step === "ai"       && <AiStep       onNext={() => setStep("confirm")} />}
        {step === "confirm"  && <ConfirmStep onGoToAi={() => setStep("ai")} />}
        {step === "events"   && <EventsStep />}
      </div>
    </div>
  );
}

// ─── STEP 1: 期間設定 ─────────────────────────────────────────
function PeriodsStep({ onNext }: { onNext: () => void }) {
  const [periods, setPeriods] = useState<ShiftPeriod[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [form, setForm] = useState({
    label: "", start_date: "", end_date: "", deadline: "",
    school_id: "", assignment_mode: "flexible" as AssignmentMode,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("shift_periods").select("*").order("created_at", { ascending: false })
      .then(({ data }) => setPeriods((data ?? []) as ShiftPeriod[]));
    supabase.from("schools").select("id, name, group_name").order("name")
      .then(({ data }) => setSchools((data ?? []) as School[]));
  }, []);

  const handleCreate = async () => {
    if (!form.label || !form.start_date || !form.end_date) {
      showToast("期間名・開始日・終了日は必須です", "info"); return;
    }
    setSaving(true);
    const { error } = await supabase.from("shift_periods").insert({
      label: form.label,
      start_date: form.start_date,
      end_date: form.end_date,
      deadline: form.deadline || null,
      school_id: form.school_id || null,
      assignment_mode: form.assignment_mode,
      status: "open",
    });
    setSaving(false);
    if (error) { showToast("作成失敗: " + error.message, "error"); return; }
    showToast("期間を作成しました", "success");
    setForm({ label: "", start_date: "", end_date: "", deadline: "", school_id: "", assignment_mode: "flexible" });
    supabase.from("shift_periods").select("*").order("created_at", { ascending: false })
      .then(({ data }) => setPeriods((data ?? []) as ShiftPeriod[]));
  };

  const updateStatus = async (id: string, status: ShiftPeriod["status"]) => {
    await supabase.from("shift_periods").update({ status }).eq("id", id);
    setPeriods((prev) => prev.map((p) => p.id === id ? { ...p, status } : p));
    showToast("ステータスを更新しました", "success");
  };

  const STATUS_LABEL: Record<string, string> = { open: "募集中", closed: "締め切り", published: "公開済" };
  const STATUS_COLOR: Record<string, string> = { open: "bg-green-100 text-green-700", closed: "bg-amber-100 text-amber-700", published: "bg-blue-100 text-blue-700" };

  return (
    <div className="space-y-6">
      {/* ライフサイクル説明 */}
      <div className="rounded-2xl bg-blue-50 border border-blue-200 px-5 py-4 text-sm text-blue-800">
        <p className="font-bold mb-2">📋 シフト管理の流れ</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded-full bg-green-100 text-green-700 px-2.5 py-1 font-semibold">① 募集中</span>
          <span className="text-blue-400">→ 講師が希望を提出</span>
          <span className="text-blue-300 mx-1">▶</span>
          <span className="rounded-full bg-amber-100 text-amber-700 px-2.5 py-1 font-semibold">② 締め切り</span>
          <span className="text-blue-400">→ ②希望確認 → ③AI調整</span>
          <span className="text-blue-300 mx-1">▶</span>
          <span className="rounded-full bg-blue-100 text-blue-700 px-2.5 py-1 font-semibold">③ 公開済</span>
          <span className="text-blue-400">→ 講師に通知・表示</span>
        </div>
      </div>

      {/* 新規作成フォーム */}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-slate-900">新規期間を作成</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">期間名 *</label>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="例: 2026年7月シフト"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">対象教室（任意）</label>
            <select value={form.school_id} onChange={(e) => setForm({ ...form, school_id: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">全教室（グループ内）</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">開始日 *</label>
            <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">終了日 *</label>
            <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">希望提出の締め切り（任意）</label>
            <input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">配置モード</label>
            <div className="flex gap-3 pt-2">
              {(["flexible","dedicated"] as AssignmentMode[]).map((m) => (
                <label key={m} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" name="mode" value={m} checked={form.assignment_mode === m}
                    onChange={() => setForm({ ...form, assignment_mode: m })} />
                  <span>
                    {m === "flexible" ? "縦断型（複数教室をまたいで配置）" : "専属型（教室ごとに固定）"}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={handleCreate} disabled={saving}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "作成中..." : "期間を作成"}
          </button>
        </div>
      </section>

      {/* 既存期間一覧 */}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">期間一覧</h2>
          <button onClick={onNext} className="rounded-xl bg-slate-800 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            次へ: 希望確認 →
          </button>
        </div>
        {periods.length === 0 ? (
          <p className="text-sm text-slate-400">まだ期間がありません。</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {periods.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold text-slate-800">{p.label}</p>
                  <p className="text-xs text-slate-400">{p.start_date} 〜 {p.end_date}
                    {p.assignment_mode === "flexible" ? " / 縦断型" : " / 専属型"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${STATUS_COLOR[p.status]}`}>
                    {STATUS_LABEL[p.status]}
                  </span>
                  <select value={p.status}
                    onChange={(e) => updateStatus(p.id, e.target.value as ShiftPeriod["status"])}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs">
                    <option value="open">募集中</option>
                    <option value="closed">締め切り</option>
                    <option value="published">公開済</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── STEP 2: 希望確認 ─────────────────────────────────────────
function RequestsStep({ onNext }: { onNext: () => void }) {
  const [periods, setPeriods] = useState<ShiftPeriod[]>([]);
  const [periodId, setPeriodId] = useState<string>("");
  const [period, setPeriod] = useState<ShiftPeriod | null>(null);
  const [requests, setRequests] = useState<(ShiftRequest & { teachers: Teacher })[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("shift_periods").select("*").order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as ShiftPeriod[];
        setPeriods(list);
        if (list.length > 0) setPeriodId(list[0].id);
      });
    supabase.from("teachers").select("id,name,email,school_id").order("name")
      .then(({ data }) => setTeachers((data ?? []) as Teacher[]));
  }, []);

  useEffect(() => {
    if (!periodId) return;
    setLoading(true);
    const p = periods.find((x) => x.id === periodId) ?? null;
    setPeriod(p);
    supabase.from("shift_requests").select("*, teachers(id,name,email,school_id)")
      .eq("period_id", periodId)
      .then(({ data }) => {
        setRequests((data ?? []) as (ShiftRequest & { teachers: Teacher })[]);
        setLoading(false);
      });
  }, [periodId, periods]);

  const getCell = (teacherId: string, date: string, slotStart: string) =>
    requests.find((r) => r.teacher_id === teacherId && r.date === date && r.slot_start.slice(0, 5) === slotStart);

  const dates = period ? dateRange(period.start_date, period.end_date) : [];
  const submittedIds = new Set(requests.map((r) => r.teacher_id));

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">希望一覧</h2>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm">
              {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <button onClick={onNext} className="rounded-xl bg-slate-800 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            次へ: AI調整 →
          </button>
        </div>

        {/* 提出状況サマリー */}
        <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-slate-700">提出済: {submittedIds.size}/{teachers.length}名</span>
          {submittedIds.size < teachers.length && (
            <span className="text-slate-400">未提出:</span>
          )}
          {teachers.filter((t) => !submittedIds.has(t.id)).map((t) => (
            <span key={t.id} className="rounded-full bg-red-100 border border-red-200 px-2.5 py-0.5 text-xs font-semibold text-red-600">{t.name}</span>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">読み込み中...</p>
        ) : dates.length === 0 ? (
          <p className="text-sm text-slate-400">期間を選択してください</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="sticky left-0 bg-white py-2 pr-3 text-left text-slate-500 min-w-[100px]">講師</th>
                  {dates.map((d) => (
                    <th key={d} colSpan={SLOTS.length}
                      className={`border-l border-slate-100 px-1 py-2 text-center text-slate-500 whitespace-nowrap
                        ${dow(d) === "日" ? "text-red-400" : dow(d) === "土" ? "text-blue-400" : ""}`}>
                      {d.slice(5).replace("-","/")}({dow(d)})
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="sticky left-0 bg-slate-50 py-1 pr-3" />
                  {dates.map((d) =>
                    SLOTS.map((s) => (
                      <th key={`${d}_${s.start}`} className="border-l border-slate-100 px-1 py-1 text-center text-slate-400">
                        {s.start.slice(0,2)}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {teachers.map((t) => (
                  <tr key={t.id} className="border-b border-slate-50">
                    <td className="sticky left-0 bg-white py-1.5 pr-3 font-medium text-slate-700 whitespace-nowrap">
                      {t.name}
                    </td>
                    {dates.map((d) =>
                      SLOTS.map((s) => {
                        const cell = getCell(t.id, d, s.start);
                        return (
                          <td key={`${d}_${s.start}`} className={`border-l border-slate-100 px-1 py-1.5 text-center
                            ${cell ? AVAIL_COLOR[cell.availability] : ""}`}>
                            {cell ? AVAIL_LABEL[cell.availability] : <span className="text-slate-200">─</span>}
                          </td>
                        );
                      })
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── STEP 3: AI調整 ───────────────────────────────────────────
function AiStep({ onNext }: { onNext: () => void }) {
  const [periods, setPeriods] = useState<ShiftPeriod[]>([]);
  const [periodId, setPeriodId] = useState<string>("");
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ shifts: AiShiftRow[]; warnings: string[]; summary: string } | null>(null);

  useEffect(() => {
    supabase.from("shift_periods").select("*").in("status", ["open","closed"])
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as ShiftPeriod[];
        setPeriods(list);
        if (list.length > 0) setPeriodId(list[0].id);
      });
  }, []);

  const handleRun = async () => {
    if (!periodId) { showToast("期間を選択してください", "info"); return; }
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/shifts/ai-adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId, custom_prompt: customPrompt }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        showToast("AI調整に失敗しました: " + (data.error ?? ""), "error");
        return;
      }
      setResult(data);
      showToast("AIシフト案を生成しました", "success");
    } catch (err) {
      showToast("通信エラー: " + String(err), "error");
    } finally {
      setRunning(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!result || !periodId) return;
    const res = await fetch("/api/shifts/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period_id: periodId, shifts: result.shifts, status: "draft" }),
    });
    const data = await res.json();
    if (!res.ok || data.error) { showToast("保存失敗: " + data.error, "error"); return; }
    showToast(`ドラフトを保存しました（${data.count}件）`, "success");
    onNext();
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-slate-900">AIシフト調整</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">対象期間</label>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {periods.length === 0 && <option value="">対象期間がありません</option>}
              {periods.map((p) => <option key={p.id} value={p.id}>{p.label}（{p.assignment_mode === "flexible" ? "縦断型" : "専属型"}）</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            追加指示（任意）
            <span className="ml-2 font-normal text-slate-400">— AIへの特別な指示があれば入力してください</span>
          </label>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={4}
            placeholder="例: 田中先生は毎週木曜日に必ず柏の葉に入れてください。土日は関田先生を優先してください。"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm placeholder:text-slate-300"
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleRun}
            disabled={running || !periodId}
            className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {running ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                AI調整中...
              </>
            ) : "✦ AIシフト調整を実行"}
          </button>
        </div>
      </section>

      {result && (
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">AI生成シフト案</h3>
            <button onClick={handleSaveDraft}
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              ドラフト保存 → 確認ステップへ
            </button>
          </div>

          {result.summary && (
            <div className="mb-4 rounded-xl bg-purple-50 p-4 text-sm text-purple-800">
              {result.summary}
            </div>
          )}

          {result.warnings?.length > 0 && (
            <div className="mb-4 rounded-xl border-2 border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="mb-2 font-bold">⚠️ 確認が必要な警告（{result.warnings.length}件）</p>
              <ul className="space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 text-red-400">•</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-red-500">上記を確認した上でドラフト保存してください。</p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="py-2 pr-4">日付</th>
                  <th className="py-2 pr-4">スロット</th>
                  <th className="py-2 pr-4">教室</th>
                  <th className="py-2 pr-4">講師</th>
                  <th className="py-2">備考</th>
                </tr>
              </thead>
              <tbody>
                {result.shifts.map((s, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="py-1.5 pr-4 text-slate-700 whitespace-nowrap">
                      {s.date.slice(5).replace("-","/")}({["日","月","火","水","木","金","土"][new Date(s.date).getDay()]})
                    </td>
                    <td className="py-1.5 pr-4 text-slate-600 whitespace-nowrap">{s.slot_start}〜{s.slot_end}</td>
                    <td className="py-1.5 pr-4 font-medium text-slate-800">{s.school_name}</td>
                    <td className="py-1.5 pr-4 text-slate-700">{s.teacher_name}</td>
                    <td className="py-1.5 text-xs text-slate-400">{s.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── STEP 4: 確認・確定 ───────────────────────────────────────
function ConfirmStep({ onGoToAi }: { onGoToAi?: () => void }) {
  const [periods, setPeriods] = useState<ShiftPeriod[]>([]);
  const [periodId, setPeriodId] = useState<string>("");
  const [assignments, setAssignments] = useState<(ShiftAssignment & { teachers?: Teacher; schools?: School })[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("shift_periods").select("*").order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as ShiftPeriod[];
        setPeriods(list);
        if (list.length > 0) setPeriodId(list[0].id);
      });
    supabase.from("teachers").select("id,name,email,school_id").order("name")
      .then(({ data }) => setTeachers((data ?? []) as Teacher[]));
    supabase.from("schools").select("id,name,group_name").order("name")
      .then(({ data }) => setSchools((data ?? []) as School[]));
  }, []);

  const loadAssignments = useCallback(async () => {
    if (!periodId) return;
    setLoading(true);
    const { data } = await supabase.from("shift_assignments")
      .select("*, teachers(id,name,email,school_id), schools(id,name,group_name)")
      .eq("period_id", periodId)
      .order("date").order("slot_start");
    setAssignments((data ?? []) as (ShiftAssignment & { teachers?: Teacher; schools?: School })[]);
    setLoading(false);
  }, [periodId]);

  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  const handleDelete = async (id: string) => {
    if (!confirm("このシフトを削除しますか？")) return;
    await supabase.from("shift_assignments").delete().eq("id", id);
    setAssignments((prev) => prev.filter((a) => a.id !== id));
    showToast("削除しました", "success");
  };

  const handleConfirm = async () => {
    if (!confirm(`このシフトを確定・公開しますか？\n講師全員に確定シフトとして表示されます。`)) return;
    setConfirming(true);
    const rows = assignments.map((a) => ({
      date: a.date, slot_start: a.slot_start, slot_end: a.slot_end,
      school_id: a.school_id, teacher_id: a.teacher_id, note: a.note,
    }));
    const res = await fetch("/api/shifts/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period_id: periodId, shifts: rows, status: "confirmed" }),
    });
    const data = await res.json();
    setConfirming(false);
    if (!res.ok || data.error) { showToast("確定失敗: " + data.error, "error"); return; }
    const notifiedCount = new Set(rows.map((r) => r.teacher_id)).size;
    showToast(`シフトを確定・公開しました（${data.count}件）。${notifiedCount}名の講師に通知を送信しました。`, "success");
    loadAssignments();
  };

  const teacherName = (id: string) => teachers.find((t) => t.id === id)?.name ?? id;
  const schoolName  = (id: string) => schools.find((s) => s.id === id)?.name ?? id;

  const isPublished = periods.find((p) => p.id === periodId)?.status === "published";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">シフト確認・確定</h2>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm">
              {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          {!isPublished && assignments.length > 0 && (
            <button onClick={handleConfirm} disabled={confirming}
              className="rounded-2xl bg-green-600 px-8 py-3.5 text-base font-bold text-white shadow-md hover:bg-green-700 active:scale-95 disabled:opacity-50">
              {confirming
                ? <span className="flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"/>確定中...</span>
                : "✓ シフトを確定・公開する"}
            </button>
          )}
          {isPublished && (
            <span className="rounded-full bg-green-100 px-4 py-1.5 text-sm font-semibold text-green-700">
              ✓ 公開済み
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">読み込み中...</p>
        ) : assignments.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 px-5 py-10 text-center">
            <p className="text-3xl mb-3">🤖</p>
            <p className="font-semibold text-slate-700">まだシフト案がありません</p>
            <p className="mt-1 text-sm text-slate-400">AI調整でシフト案を生成し、ドラフト保存してください。</p>
            {onGoToAi && (
              <button onClick={onGoToAi}
                className="mt-4 rounded-2xl bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-purple-700">
                ③ AI調整へ →
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="py-2 pr-4">日付</th>
                  <th className="py-2 pr-4">スロット</th>
                  <th className="py-2 pr-4">教室</th>
                  <th className="py-2 pr-4">講師</th>
                  <th className="py-2 pr-4">ステータス</th>
                  <th className="py-2">備考</th>
                  {!isPublished && <th className="py-2" />}
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50">
                    <td className="py-1.5 pr-4 text-slate-700 whitespace-nowrap">
                      {a.date.slice(5).replace("-","/")}({["日","月","火","水","木","金","土"][new Date(a.date).getDay()]})
                    </td>
                    <td className="py-1.5 pr-4 text-slate-600 whitespace-nowrap">{a.slot_start}〜{a.slot_end}</td>
                    <td className="py-1.5 pr-4 font-medium text-slate-800">
                      {(a.schools as School | undefined)?.name ?? schoolName(a.school_id)}
                    </td>
                    <td className="py-1.5 pr-4 text-slate-700">
                      {(a.teachers as Teacher | undefined)?.name ?? teacherName(a.teacher_id)}
                    </td>
                    <td className="py-1.5 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold
                        ${a.status === "confirmed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {a.status === "confirmed" ? "確定" : "ドラフト"}
                      </span>
                    </td>
                    <td className="py-1.5 pr-4 text-xs text-slate-400">{a.note ?? ""}</td>
                    {!isPublished && (
                      <td className="py-1.5">
                        <button onClick={() => handleDelete(a.id)}
                          className="rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-50">削除</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}


// ─── STEP 5: イベント管理 ─────────────────────────────────────
function EventsStep() {
  const [schools, setSchools] = useState<School[]>([]);
  const [events, setEvents] = useState<ShiftEvent[]>([]);
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [aiRunning, setAiRunning] = useState(false);
  const [aiDraft, setAiDraft] = useState<Partial<ShiftEvent>[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    school_id: "", date: "", start_time: "", end_time: "",
    title: "", description: "", event_type: "event" as EventType,
    visible_to_teachers: true, visible_to_parents: true, visible_to_students: true,
  });

  useEffect(() => {
    supabase.from("schools").select("id,name,group_name").order("name")
      .then(({ data }) => setSchools((data ?? []) as School[]));
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = () => {
    supabase.from("shift_events").select("*").order("date").order("start_time")
      .then(({ data }) => setEvents((data ?? []) as ShiftEvent[]));
  };

  const runAi = async () => {
    if (!aiPrompt.trim()) { showToast("指示を入力してください", "info"); return; }
    setAiRunning(true); setAiDraft([]);
    const res = await fetch("/api/shifts/ai-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: aiPrompt, schools }),
    });
    const data = await res.json();
    setAiRunning(false);
    if (!res.ok || data.error) { showToast("AI生成失敗: " + (data.error ?? ""), "error"); return; }
    setAiDraft(data.events ?? []);
    showToast((data.events?.length ?? 0) + "件生成しました", "success");
  };

  const saveDraft = async () => {
    setSaving(true);
    const { error } = await supabase.from("shift_events").insert(
      aiDraft.map((ev) => ({
        school_id: ev.school_id ?? null, date: ev.date,
        start_time: ev.start_time ?? null, end_time: ev.end_time ?? null,
        title: ev.title ?? "イベント", description: ev.description ?? null,
        event_type: ev.event_type ?? "event",
        visible_to_teachers: ev.visible_to_teachers ?? true,
        visible_to_parents: ev.visible_to_parents ?? true,
        visible_to_students: ev.visible_to_students ?? true,
      }))
    );
    setSaving(false);
    if (error) { showToast("保存失敗: " + error.message, "error"); return; }
    showToast(aiDraft.length + "件保存しました", "success");
    setAiDraft([]); setAiPrompt(""); load();
  };

  const saveManual = async () => {
    if (!form.title || !form.date) { showToast("タイトルと日付は必須です", "info"); return; }
    setSaving(true);
    const { error } = await supabase.from("shift_events").insert({
      school_id: form.school_id || null, date: form.date,
      start_time: form.start_time || null, end_time: form.end_time || null,
      title: form.title, description: form.description || null,
      event_type: form.event_type,
      visible_to_teachers: form.visible_to_teachers,
      visible_to_parents: form.visible_to_parents,
      visible_to_students: form.visible_to_students,
    });
    setSaving(false);
    if (error) { showToast("保存失敗: " + error.message, "error"); return; }
    showToast("追加しました", "success");
    setForm({ school_id:"",date:"",start_time:"",end_time:"",title:"",description:"",event_type:"event",
      visible_to_teachers:true, visible_to_parents:true, visible_to_students:true });
    load();
  };

  const del = async (id: string) => {
    if (!confirm("削除しますか?")) return;
    await supabase.from("shift_events").delete().eq("id", id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
    showToast("削除しました", "success");
  };

  const sn = (id: string | null) => id ? schools.find((s) => s.id === id)?.name ?? id : "全教室";
  const ti = (et: string) => EVENT_TYPE_OPTIONS.find((t) => t.value === et) ?? EVENT_TYPE_OPTIONS[0];

  return (
    <div className="space-y-6">
      {/* AI入力 */}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-bold text-slate-900">AIにイベントを登録させる</h2>
        <p className="mb-4 text-sm text-slate-500">自然言語で指示するとAIがイベントデータを生成します。</p>
        <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={4}
          placeholder="例: 6月15日（土）に漢字検定があります。10:00〜13:00、全教室対象、生徒・保護者に見せてください。"
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm placeholder:text-slate-300" />
        <div className="mt-3 flex justify-end">
          <button onClick={runAi} disabled={aiRunning || !aiPrompt.trim()}
            className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50">
            {aiRunning ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent inline-block" />生成中...</>) : "AIでイベントを生成"}
          </button>
        </div>
        {aiDraft.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-semibold text-slate-700">生成されたイベント案（{aiDraft.length}件）</p>
            {aiDraft.map((ev, i) => {
              const t = ti(ev.event_type ?? "event");
              return (
                <div key={i} className={"flex items-start gap-3 rounded-xl border px-4 py-3 text-sm " + t.color}>
                  <span>{t.icon}</span>
                  <div className="flex-1">
                    <p className="font-semibold">{ev.title}</p>
                    <p className="text-xs opacity-80">{ev.date}{ev.start_time ? " " + ev.start_time + "〜" + (ev.end_time ?? "") : ""} / {sn(ev.school_id ?? null)}</p>
                    {ev.description && <p className="mt-0.5 text-xs opacity-70">{ev.description}</p>}
                  </div>
                  <button onClick={() => setAiDraft(aiDraft.filter((_, j) => j !== i))} className="text-xs opacity-60 hover:opacity-100">✕</button>
                </div>
              );
            })}
            <div className="flex justify-end pt-2">
              <button onClick={saveDraft} disabled={saving}
                className="rounded-xl bg-green-600 px-6 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                {saving ? "保存中..." : aiDraft.length + "件を保存する"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 手動入力 */}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-slate-900">手動でイベントを追加</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-xs font-semibold text-slate-600">タイトル *</label>
            <input value={form.title} onChange={(e) => setForm({...form,title:e.target.value})} placeholder="例: 夏期講習申込開始"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div>
          <div><label className="mb-1 block text-xs font-semibold text-slate-600">種別</label>
            <select value={form.event_type} onChange={(e) => setForm({...form,event_type:e.target.value as EventType})}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {EVENT_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
            </select></div>
          <div><label className="mb-1 block text-xs font-semibold text-slate-600">日付 *</label>
            <input type="date" value={form.date} onChange={(e) => setForm({...form,date:e.target.value})}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div>
          <div><label className="mb-1 block text-xs font-semibold text-slate-600">対象教室</label>
            <select value={form.school_id} onChange={(e) => setForm({...form,school_id:e.target.value})}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">全教室</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div><label className="mb-1 block text-xs font-semibold text-slate-600">開始時間</label>
            <input type="time" value={form.start_time} onChange={(e) => setForm({...form,start_time:e.target.value})}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div>
          <div><label className="mb-1 block text-xs font-semibold text-slate-600">終了時間</label>
            <input type="time" value={form.end_time} onChange={(e) => setForm({...form,end_time:e.target.value})}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div>
          <div className="sm:col-span-2"><label className="mb-1 block text-xs font-semibold text-slate-600">詳細</label>
            <textarea value={form.description} onChange={(e) => setForm({...form,description:e.target.value})} rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-600">表示対象</label>
            <div className="flex flex-wrap gap-4 text-sm">
              {([["visible_to_teachers","講師"],["visible_to_parents","保護者"],["visible_to_students","生徒"]] as const).map(([k,l]) => (
                <label key={k} className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={form[k]} onChange={(e) => setForm({...form,[k]:e.target.checked})} />
                  {l}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={saveManual} disabled={saving}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "保存中..." : "追加する"}
          </button>
        </div>
      </section>

      {/* イベント一覧 */}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-slate-900">登録済みイベント（{events.length}件）</h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-400">まだイベントがありません。</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {events.map((ev) => {
              const t = ti(ev.event_type);
              return (
                <div key={ev.id} className="flex items-start gap-3 py-3">
                  <span className={"mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm " + t.color}>{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800">{ev.title}</p>
                    <p className="text-xs text-slate-400">{ev.date}{ev.start_time ? " " + ev.start_time + "〜" + (ev.end_time ?? "") : ""} / {sn(ev.school_id)} / {[ev.visible_to_teachers&&"講師",ev.visible_to_parents&&"保護者",ev.visible_to_students&&"生徒"].filter(Boolean).join("・")}に表示</p>
                    {ev.description && <p className="mt-0.5 text-xs text-slate-500">{ev.description}</p>}
                  </div>
                  <button onClick={() => del(ev.id)} className="shrink-0 rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-50">削除</button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
