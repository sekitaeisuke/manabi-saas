"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { ShiftEvent } from "@/lib/supabase";
import { useSelectedStudentId } from "@/lib/useSelectedStudent";

type Lesson = {
  id: string; subject: string | null; scheduled_at: string;
  duration_minutes: number; location: string | null;
  status: string; notes: string | null; teacher_id: string | null;
};
type Teacher = { id: string; name: string };
type ShiftTeacher = {
  date: string; slot_start: string; slot_end: string;
  teacher_name: string; school_name: string;
};

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const EVENT_COLORS: Record<string, string> = {
  event:   "bg-purple-100 text-purple-700",
  exam:    "bg-red-100 text-red-700",
  holiday: "bg-slate-100 text-slate-500",
  class:   "bg-teal-100 text-teal-700",
  info:    "bg-amber-100 text-amber-700",
};
const EVENT_ICON: Record<string, string> = {
  event: "🎉", exam: "📝", holiday: "🏖", class: "📚", info: "ℹ️",
};

export default function ParentCalendarPage() {
  const [selectedId] = useSelectedStudentId();
  const today = new Date();
  const [current, setCurrent] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [shiftTeachers, setShiftTeachers] = useState<ShiftTeacher[]>([]);
  const [events, setEvents] = useState<ShiftEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ShiftEvent | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);

  const year = current.getFullYear();
  const month = current.getMonth();

  // 生徒の学校IDを取得
  useEffect(() => {
    if (!selectedId) return;
    supabase.from("students").select("school_id").eq("id", selectedId).maybeSingle()
      .then(({ data }) => setSchoolId(data?.school_id ?? null));
  }, [selectedId]);

  const fetchData = useCallback(async () => {
    if (!selectedId) { setLessons([]); setLoading(false); return; }
    setLoading(true);

    const startIso = new Date(year, month, 1).toISOString();
    const endIso   = new Date(year, month + 1, 1).toISOString();
    const startDate = `${year}-${String(month + 1).padStart(2,"0")}-01`;
    const endDate   = `${year}-${String(month + 1).padStart(2,"0")}-${new Date(year, month + 1, 0).getDate()}`;

    // 常に取得する2クエリ
    const [lsRes, tsRes] = await Promise.allSettled([
      supabase.from("lessons")
        .select("id,subject,scheduled_at,duration_minutes,location,status,notes,teacher_id")
        .eq("student_id", selectedId).gte("scheduled_at", startIso).lt("scheduled_at", endIso)
        .order("scheduled_at"),
      supabase.from("teachers").select("id,name"),
    ]);

    const ls = lsRes.status === "fulfilled" ? lsRes.value.data : null;
    const ts = tsRes.status === "fulfilled" ? tsRes.value.data : null;
    setLessons((ls ?? []) as Lesson[]);
    setTeachers((ts ?? []) as Teacher[]);

    // シフト確定データ（学校IDが確定している場合のみ取得）
    if (schoolId && typeof schoolId === "string" && schoolId.length > 0) {
      const [saRes, evRes] = await Promise.allSettled([
        supabase.from("shift_assignments")
          .select("date,slot_start,slot_end,teachers(name),schools(name)")
          .eq("school_id", schoolId).eq("status", "confirmed")
          .gte("date", startDate).lte("date", endDate),
        supabase.from("shift_events").select("*")
          .or(`school_id.eq.${schoolId},school_id.is.null`)
          .eq("visible_to_parents", true)
          .gte("date", startDate).lte("date", endDate).order("date"),
      ]);

      const sa = saRes.status === "fulfilled" ? saRes.value.data : null;
      const ev = evRes.status === "fulfilled" ? evRes.value.data : null;

      const stList: ShiftTeacher[] = (sa ?? []).map((r: unknown) => {
        const row = r as { date: string; slot_start: string; slot_end: string;
          teachers: { name: string } | { name: string }[] | null;
          schools:  { name: string } | { name: string }[] | null };
        const tName = Array.isArray(row.teachers) ? row.teachers[0]?.name : row.teachers?.name;
        const sName = Array.isArray(row.schools)  ? row.schools[0]?.name  : row.schools?.name;
        return {
          date: row.date, slot_start: row.slot_start, slot_end: row.slot_end,
          teacher_name: tName ?? "—",
          school_name:  sName ?? "—",
        };
      });
      setShiftTeachers(stList);
      setEvents((ev ?? []) as ShiftEvent[]);
    }

    setLoading(false);
  }, [selectedId, schoolId, year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const lessonsByDay   = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const l of lessons) {
      const k = dateKey(new Date(l.scheduled_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(l);
    }
    return map;
  }, [lessons]);

  const shiftByDay = useMemo(() => {
    const map = new Map<string, ShiftTeacher[]>();
    for (const s of shiftTeachers) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date)!.push(s);
    }
    return map;
  }, [shiftTeachers]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ShiftEvent[]>();
    for (const e of events) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return map;
  }, [events]);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const arr: (Date | null)[] = [];
    for (let i = 0; i < first.getDay(); i++) arr.push(null);
    for (let d = 1; d <= new Date(year, month + 1, 0).getDate(); d++) arr.push(new Date(year, month, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month]);

  const teacherName = (id: string | null) => id ? teachers.find((t) => t.id === id)?.name ?? "—" : "—";

  return (
    <div className="px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-6xl">
        {/* ヘッダー */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">授業カレンダー</h1>
            <p className="mt-1 text-sm text-slate-500">授業・先生の出勤・イベントを確認できます。</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrent(new Date(year, month - 1, 1))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">←</button>
            <span className="min-w-[7rem] text-center text-sm font-semibold text-slate-800">{year}年{month + 1}月</span>
            <button onClick={() => setCurrent(new Date(year, month + 1, 1))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">→</button>
            <button onClick={() => setCurrent(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="ml-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">今月</button>
          </div>
        </div>

        {/* 凡例 */}
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-blue-700 font-medium">● 授業</span>
          <span className="flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-indigo-700 font-medium">👤 出勤講師</span>
          {["event","exam","holiday","class","info"].map((t) => (
            <span key={t} className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium ${EVENT_COLORS[t]}`}>
              {EVENT_ICON[t]} {t === "event" ? "行事" : t === "exam" ? "テスト" : t === "holiday" ? "休校" : t === "class" ? "特別授業" : "お知らせ"}
            </span>
          ))}
        </div>

        {!selectedId ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-12 text-center text-amber-700">
            お子さまが紐付けられていません。塾にご連絡ください。
          </div>
        ) : loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中...</div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500 mb-1">
              {WEEKDAY.map((w, i) => (
                <div key={w} className={`py-1.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : ""}`}>{w}</div>
              ))}
            </div>
            {/* カレンダーグリッド */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, idx) => {
                if (!d) return <div key={idx} className="min-h-[6rem] rounded-lg bg-slate-50/40" />;
                const k = dateKey(d);
                const dayLessons  = lessonsByDay.get(k) ?? [];
                const dayShifts   = shiftByDay.get(k) ?? [];
                const dayEvents   = eventsByDay.get(k) ?? [];
                const isToday = dateKey(today) === k;
                const dow = d.getDay();
                return (
                  <div key={k} className={`min-h-[6rem] rounded-xl border p-1.5 text-left ${
                    isToday ? "border-blue-400 bg-blue-50/30" : "border-slate-100"
                  }`}>
                    <p className={`mb-1 text-xs font-bold ${
                      isToday ? "text-blue-600" : dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-slate-600"
                    }`}>{d.getDate()}</p>

                    <div className="space-y-0.5 overflow-y-auto max-h-[7rem]">
                      {/* イベント */}
                      {dayEvents.map((ev) => (
                        <button key={ev.id} onClick={() => setSelectedEvent(ev)}
                          className={`w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-semibold ${EVENT_COLORS[ev.event_type]}`}>
                          {EVENT_ICON[ev.event_type]} {ev.title}
                        </button>
                      ))}
                      {/* 授業 */}
                      {dayLessons.map((l) => (
                        <button key={l.id} onClick={() => setSelected(l)}
                          className={`w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-semibold ${
                            l.status === "canceled" ? "bg-slate-100 text-slate-400 line-through"
                            : l.status === "completed" ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                          }`}>
                          {new Date(l.scheduled_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} {l.subject ?? ""}
                        </button>
                      ))}
                      {/* 出勤講師（ユニーク表示） */}
                      {Array.from(new Set(dayShifts.map((s) => s.teacher_name))).map((name) => (
                        <div key={name} className="truncate rounded bg-indigo-50 px-1 py-0.5 text-[10px] text-indigo-600">
                          👤 {name}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 授業詳細モーダル */}
      {selected && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-bold text-slate-950">授業の詳細</h3>
            <dl className="space-y-3 text-sm">
              <Row label="日時">
                {new Date(selected.scheduled_at).toLocaleString("ja-JP", {
                  year:"numeric",month:"short",day:"numeric",weekday:"short",hour:"2-digit",minute:"2-digit",
                })}（{selected.duration_minutes}分）
              </Row>
              <Row label="科目">{selected.subject ?? "—"}</Row>
              <Row label="担当">{teacherName(selected.teacher_id)}</Row>
              <Row label="場所">{selected.location ?? "—"}</Row>
              <Row label="ステータス"><StatusBadge status={selected.status} /></Row>
              {selected.notes && <Row label="備考">{selected.notes}</Row>}
            </dl>
            <div className="mt-6 flex justify-between gap-3">
              <button onClick={() => setSelected(null)}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">閉じる</button>
              {selected.status !== "canceled" && selected.status !== "completed" && (
                <Link href={`/parent/dashboard/reschedule?lesson=${selected.id}`}
                  className="rounded-2xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                  振替を申請する
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* イベント詳細モーダル */}
      {selectedEvent && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedEvent(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className={`mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${EVENT_COLORS[selectedEvent.event_type]}`}>
              {EVENT_ICON[selectedEvent.event_type]} {selectedEvent.title}
            </div>
            <dl className="space-y-3 text-sm">
              <Row label="日付">{selectedEvent.date}</Row>
              {selectedEvent.start_time && (
                <Row label="時間">{selectedEvent.start_time}{selectedEvent.end_time ? `〜${selectedEvent.end_time}` : ""}</Row>
              )}
              {selectedEvent.description && <Row label="詳細">{selectedEvent.description}</Row>}
            </dl>
            <button onClick={() => setSelectedEvent(null)}
              className="mt-6 w-full rounded-2xl border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50">閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-slate-500">{label}</dt>
      <dd className="flex-1 text-slate-900">{children}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    scheduled:   { label: "予定",   cls: "bg-blue-100 text-blue-700" },
    completed:   { label: "実施済", cls: "bg-green-100 text-green-700" },
    canceled:    { label: "中止",   cls: "bg-slate-100 text-slate-500" },
    rescheduled: { label: "振替済", cls: "bg-amber-100 text-amber-700" },
  };
  const v = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-500" };
  return <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${v.cls}`}>{v.label}</span>;
}
