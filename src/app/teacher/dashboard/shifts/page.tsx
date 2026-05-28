"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { ShiftPeriod, ShiftRequest, ShiftAvailability, ShiftAssignment, ShiftEvent } from "@/lib/supabase";

const EVENT_COLORS: Record<string, string> = {
  event: "bg-purple-100 text-purple-700", exam: "bg-red-100 text-red-700",
  holiday: "bg-slate-100 text-slate-500", class: "bg-teal-100 text-teal-700", info: "bg-amber-100 text-amber-700",
};
const EVENT_ICON: Record<string, string> = {
  event: "🎉", exam: "📝", holiday: "🏖", class: "📚", info: "ℹ️",
};
import { showToast } from "@/lib/toast";

const SLOTS: { start: string; end: string; label: string }[] = [
  { start: "15:00", end: "17:00", label: "15:00〜17:00" },
  { start: "17:00", end: "19:00", label: "17:00〜19:00" },
  { start: "19:00", end: "21:00", label: "19:00〜21:00" },
];

const AVAIL_OPTIONS: { value: ShiftAvailability; label: string; color: string }[] = [
  { value: "preferred",   label: "◎優先", color: "bg-green-100 text-green-800 border-green-300" },
  { value: "available",   label: "○可",   color: "bg-blue-100 text-blue-800 border-blue-300"   },
  { value: "unavailable", label: "×不可", color: "bg-red-100 text-red-800 border-red-300"       },
];

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

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return ["日","月","火","水","木","金","土"][d.getDay()];
}

type CellKey = `${string}_${string}`;

type PageTab = "request" | "schedule";

export default function ShiftRequestPage() {
  const [pageTab, setPageTab] = useState<PageTab>("request");
  const [periods, setPeriods] = useState<ShiftPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [period, setPeriod] = useState<ShiftPeriod | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState<string>("");
  const [cells, setCells] = useState<Map<CellKey, ShiftAvailability>>(new Map());
  const [notes, setNotes] = useState<Map<CellKey, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // 自分のteacher_idを取得
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      supabase.from("teachers").select("id,name,school_id").eq("email", session.user.email!).maybeSingle()
        .then(({ data }) => {
          setTeacherId(data?.id ?? null);
          setTeacherName(data?.name ?? "");
        });
    });
  }, []);

  // 公開中の期間一覧（初回のみ取得）
  useEffect(() => {
    supabase.from("shift_periods")
      .select("*")
      .in("status", ["open","published"])
      .order("start_date", { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as ShiftPeriod[];
        setPeriods(list);
        if (list.length > 0) setSelectedPeriodId((prev) => prev || list[0].id);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 期間が変わったら期間詳細と既存希望を取得
  const loadRequests = useCallback(async () => {
    if (!selectedPeriodId || !teacherId) return;
    setLoading(true);
    const p = periods.find((x) => x.id === selectedPeriodId) ?? null;
    setPeriod(p);

    const { data: existing } = await supabase
      .from("shift_requests")
      .select("*")
      .eq("period_id", selectedPeriodId)
      .eq("teacher_id", teacherId);

    const newCells = new Map<CellKey, ShiftAvailability>();
    const newNotes = new Map<CellKey, string>();
    for (const r of (existing ?? []) as ShiftRequest[]) {
      const key: CellKey = `${r.date}_${r.slot_start}`;
      newCells.set(key, r.availability);
      if (r.note) newNotes.set(key, r.note);
    }
    setCells(newCells);
    setNotes(newNotes);
    setLoading(false);
  }, [selectedPeriodId, teacherId, periods]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const toggle = (date: string, slot_start: string) => {
    const key: CellKey = `${date}_${slot_start}`;
    const cur = cells.get(key);
    const next: ShiftAvailability =
      cur === undefined    ? "available"
      : cur === "available"  ? "preferred"
      : cur === "preferred"  ? "unavailable"
      : undefined as never;
    if (next === undefined) {
      const m = new Map(cells);
      m.delete(key);
      setCells(m);
    } else {
      setCells(new Map(cells).set(key, next));
    }
  };

  const cycleOrder: (ShiftAvailability | "none")[] = ["none","available","preferred","unavailable"];

  const handleCellClick = (date: string, slot_start: string) => {
    const key: CellKey = `${date}_${slot_start}`;
    const cur = cells.get(key);
    const curIdx = cur ? cycleOrder.indexOf(cur) : 0;
    const nextIdx = (curIdx + 1) % cycleOrder.length;
    const next = cycleOrder[nextIdx];
    const m = new Map(cells);
    const n = new Map(notes);
    if (next === "none") {
      m.delete(key);
      n.delete(key); // notesも同時に削除して同期
    } else {
      m.set(key, next as ShiftAvailability);
    }
    setCells(m);
    setNotes(n);
  };

  const handleSave = async () => {
    if (!teacherId || !period) return;
    setSaving(true);

    const rows = Array.from(cells.entries()).map(([key, availability]) => {
      const [date, slot_start] = key.split("_") as [string, string];
      const slot = SLOTS.find((s) => s.start === slot_start);
      if (!slot) return null;
      return {
        period_id: period.id,
        teacher_id: teacherId,
        date,
        slot_start,
        slot_end: slot.end,
        availability,
        note: notes.get(key) ?? null,
      };
    });

    const validRows = rows.filter((r): r is NonNullable<typeof r> => r !== null);

    // 既存を削除してから再挿入
    await supabase.from("shift_requests")
      .delete()
      .eq("period_id", period.id)
      .eq("teacher_id", teacherId);

    if (validRows.length > 0) {
      const { error } = await supabase.from("shift_requests").insert(validRows);
      if (error) {
        showToast("保存に失敗しました: " + error.message, "error");
        setSaving(false);
        return;
      }
    }

    showToast("シフト希望を保存しました", "success");
    setSaving(false);
  };

  const dates = period ? dateRange(period.start_date, period.end_date) : [];
  const isPast = period && period.deadline ? new Date(period.deadline) < new Date() : false;

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-4 text-2xl font-bold text-slate-950">シフト</h1>

        {/* タブ */}
        <div className="mb-6 flex gap-1 rounded-2xl bg-white p-1 shadow-sm">
          {(["request","schedule"] as PageTab[]).map((t) => (
            <button key={t} onClick={() => setPageTab(t)}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition
                ${pageTab === t ? "bg-blue-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>
              {t === "request" ? "希望提出" : "確定シフト・イベント"}
            </button>
          ))}
        </div>

        {pageTab === "schedule" && <ShiftScheduleView teacherId={teacherId} />}

        {pageTab === "request" && <>
        <p className="mb-6 text-sm text-slate-500">
          各スロットをクリックして希望を入力してください。
          クリックするたびに「○可 → ◎優先 → ×不可 → 未入力」と切り替わります。
        </p>

        {/* 期間選択 */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold text-slate-700">期間:</label>
          <select
            value={selectedPeriodId}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
          >
            {periods.length === 0 && <option value="">募集中の期間がありません</option>}
            {periods.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          {period?.deadline && (
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${
              isPast ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
            }`}>
              締め切り: {new Date(period.deadline).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              {isPast && "（締め切り済み）"}
            </span>
          )}
        </div>

        {/* 凡例 */}
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="text-xs text-slate-500 self-center">凡例:</span>
          {AVAIL_OPTIONS.map((o) => (
            <span key={o.value} className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${o.color}`}>
              {o.label}
            </span>
          ))}
          <span className="rounded-full border border-slate-200 bg-white px-3 py-0.5 text-xs text-slate-400">未入力</span>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center text-slate-400">読み込み中...</div>
        ) : periods.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <p className="text-3xl mb-3">📅</p>
            <p className="font-semibold text-slate-700">現在、シフト希望の募集期間がありません</p>
            <p className="mt-2 text-sm text-slate-400">管理者がシフト期間を作成するまでお待ちください。</p>
          </div>
        ) : isPast ? (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-6 text-center">
            <p className="font-semibold text-amber-700">⏰ 提出期限が過ぎています</p>
            <p className="mt-1 text-sm text-amber-600">この期間の希望提出は締め切られました。変更が必要な場合は管理者にご連絡ください。</p>
          </div>
        ) : (
          <>
            {/* マトリクス表 */}
            <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left text-xs text-slate-500">日付</th>
                    {SLOTS.map((s) => (
                      <th key={s.start} className="px-3 py-3 text-center text-xs text-slate-500 whitespace-nowrap">
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dates.map((date) => {
                    const dow = dayLabel(date);
                    const isWeekend = dow === "土" || dow === "日";
                    return (
                      <tr key={date} className={`border-b border-slate-50 ${isWeekend ? "bg-slate-50" : ""}`}>
                        <td className="sticky left-0 z-10 bg-inherit px-4 py-2 font-medium text-slate-700 whitespace-nowrap">
                          {date.slice(5).replace("-", "/")}
                          <span className={`ml-1 text-xs ${dow === "日" ? "text-red-500" : dow === "土" ? "text-blue-500" : "text-slate-400"}`}>
                            ({dow})
                          </span>
                        </td>
                        {SLOTS.map((slot) => {
                          const key: CellKey = `${date}_${slot.start}`;
                          const val = cells.get(key);
                          const opt = AVAIL_OPTIONS.find((o) => o.value === val);
                          return (
                            <td key={slot.start} className="px-3 py-2 text-center">
                              <button
                                onClick={() => handleCellClick(date, slot.start)}
                                disabled={!!isPast}
                                className={`w-full min-w-[4rem] rounded-xl border py-3 text-sm font-semibold transition-all
                                  ${opt ? opt.color : "border-slate-200 bg-white text-slate-300"}
                                  ${isPast ? "cursor-not-allowed opacity-60" : "hover:opacity-80 active:scale-95"}`}
                              >
                                {opt ? opt.label : "─"}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!isPast && (
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-2xl bg-blue-600 px-8 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "希望を保存する"}
                </button>
              </div>
            )}
          </>
        )}
        </>}
      </div>
    </div>
  );
}

// ─── 確定シフト・イベントビュー ──────────────────────────────
function ShiftScheduleView({ teacherId }: { teacherId: string | null }) {
  const today = new Date();
  const [calMonth, setCalMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [assignments, setAssignments] = useState<(ShiftAssignment & { schools?: { name: string } | null })[]>([]);
  const [events, setEvents] = useState<ShiftEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const year  = calMonth.getFullYear();
  const month = calMonth.getMonth();

  useEffect(() => {
    if (!teacherId) return;
    setLoading(true);
    const startDate = `${year}-${String(month+1).padStart(2,"0")}-01`;
    const endDate   = `${year}-${String(month+1).padStart(2,"0")}-${new Date(year,month+1,0).getDate()}`;
    Promise.all([
      supabase.from("shift_assignments")
        .select("*, schools(name)")
        .eq("teacher_id", teacherId).eq("status","confirmed")
        .gte("date",startDate).lte("date",endDate).order("date").order("slot_start"),
      supabase.from("shift_events")
        .select("*").eq("visible_to_teachers",true)
        .gte("date",startDate).lte("date",endDate).order("date"),
    ]).then(([aRes, eRes]) => {
      setAssignments((aRes.data ?? []) as (ShiftAssignment & { schools?: { name: string } | null })[]);
      setEvents((eRes.data ?? []) as ShiftEvent[]);
      setLoading(false);
    });
  }, [teacherId, year, month]);

  const dk = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  const byDay = new Map<string, { assignments: typeof assignments; events: ShiftEvent[] }>();
  for (const a of assignments) {
    if (!byDay.has(a.date)) byDay.set(a.date, { assignments: [], events: [] });
    byDay.get(a.date)!.assignments.push(a);
  }
  for (const e of events) {
    if (!byDay.has(e.date)) byDay.set(e.date, { assignments: [], events: [] });
    byDay.get(e.date)!.events.push(e);
  }

  const cells: (Date | null)[] = [];
  const first = new Date(year, month, 1);
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= new Date(year,month+1,0).getDate(); d++) cells.push(new Date(year,month,d));
  while (cells.length % 7 !== 0) cells.push(null);

  const WEEKDAY = ["日","月","火","水","木","金","土"];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">確定済みの自分の担当シフトと教室イベントを表示します。</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setCalMonth(new Date(year, month-1, 1))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">←</button>
          <span className="min-w-[7rem] text-center text-sm font-semibold text-slate-700">{year}年{month+1}月</span>
          <button onClick={() => setCalMonth(new Date(year, month+1, 1))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">→</button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center text-slate-400">読み込み中...</div>
      ) : !teacherId ? (
        <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-400">ログイン情報を読み込み中...</div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="grid grid-cols-7 gap-0.5 bg-slate-50 px-2 pt-2 text-center text-xs font-semibold text-slate-500">
              {WEEKDAY.map((w, i) => (
                <div key={w} className={`py-1.5 ${i===0?"text-red-500":i===6?"text-blue-500":""}`}>{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5 bg-slate-100 p-2">
              {cells.map((d, idx) => {
                if (!d) return <div key={idx} className="min-h-[4.5rem] rounded-lg bg-slate-50/50" />;
                const k = dk(d);
                const day = byDay.get(k);
                const isToday = dk(today) === k;
                const dow = d.getDay();
                return (
                  <div key={k} className={`min-h-[4.5rem] rounded-xl border bg-white p-1 ${
                    isToday ? "border-blue-400 ring-1 ring-blue-400" : "border-transparent"
                  }`}>
                    <p className={`mb-0.5 text-xs font-bold ${
                      isToday?"text-blue-600":dow===0?"text-red-500":dow===6?"text-blue-500":"text-slate-600"
                    }`}>{d.getDate()}</p>
                    <div className="space-y-0.5 overflow-y-auto max-h-[4rem]">
                      {day?.events.map((ev) => (
                        <div key={ev.id} className={"truncate rounded px-1 py-0.5 text-[10px] font-medium " + (EVENT_COLORS[ev.event_type] ?? "")}>
                          {EVENT_ICON[ev.event_type]} {ev.title}
                        </div>
                      ))}
                      {day?.assignments.map((a) => (
                        <div key={a.id} className="truncate rounded bg-indigo-100 px-1 py-0.5 text-[10px] font-medium text-indigo-700">
                          {a.slot_start.slice(0,5)} {(a.schools as { name: string } | null)?.name ?? ""}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {assignments.length > 0 && (
            <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-slate-800">{month+1}月の担当シフト一覧</h3>
              <div className="divide-y divide-slate-100">
                {assignments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                    <span className="font-medium text-slate-700">
                      {a.date.slice(5).replace("-","/")}({WEEKDAY[new Date(a.date).getDay()]})
                    </span>
                    <span className="text-slate-500">{a.slot_start.slice(0,5)}〜{a.slot_end.slice(0,5)}</span>
                    <span className="font-semibold text-indigo-700">{(a.schools as { name: string } | null)?.name ?? "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {assignments.length === 0 && events.length === 0 && (
            <div className="mt-4 rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-400">
              <p className="font-medium">{month+1}月の確定シフトはまだありません。</p>
              <p className="mt-1">管理者がシフトを確定すると、ここに表示されます。</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
