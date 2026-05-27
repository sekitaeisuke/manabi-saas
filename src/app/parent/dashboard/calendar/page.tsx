"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useSelectedStudentId } from "@/lib/useSelectedStudent";

type Lesson = {
  id: string;
  subject: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  status: string;
  notes: string | null;
  teacher_id: string | null;
};

type Teacher = { id: string; name: string };

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ParentCalendarPage() {
  const [selectedId] = useSelectedStudentId();
  const today = new Date();
  const [current, setCurrent] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Lesson | null>(null);

  const year = current.getFullYear();
  const month = current.getMonth();

  const fetchLessons = useCallback(async () => {
    if (!selectedId) {
      setLessons([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const start = new Date(year, month, 1).toISOString();
    const end = new Date(year, month + 1, 1).toISOString();
    const [lsRes, tsRes] = await Promise.allSettled([
      supabase
        .from("lessons")
        .select("id, subject, scheduled_at, duration_minutes, location, status, notes, teacher_id")
        .eq("student_id", selectedId)
        .gte("scheduled_at", start)
        .lt("scheduled_at", end)
        .order("scheduled_at", { ascending: true }),
      supabase.from("teachers").select("id, name"),
    ]);
    const ls = lsRes.status === "fulfilled" ? lsRes.value.data : null;
    const ts = tsRes.status === "fulfilled" ? tsRes.value.data : null;
    setLessons((ls as Lesson[]) ?? []);
    setTeachers((ts as Teacher[]) ?? []);
    setLoading(false);
  }, [selectedId, year, month]);

  useEffect(() => { fetchLessons(); }, [fetchLessons]);

  const lessonsByDay = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const l of lessons) {
      const k = dateKey(new Date(l.scheduled_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(l);
    }
    return map;
  }, [lessons]);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(year, month, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month]);

  const teacherName = (id: string | null) => id ? teachers.find((t) => t.id === id)?.name ?? "—" : "—";

  return (
    <div className="px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">授業カレンダー</h1>
            <p className="mt-1 text-slate-600">月単位で授業予定を確認できます。</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrent(new Date(year, month - 1, 1))}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">←</button>
            <span className="min-w-[8rem] text-center font-semibold text-slate-800">{year}年{month + 1}月</span>
            <button onClick={() => setCurrent(new Date(year, month + 1, 1))}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">→</button>
            <button onClick={() => setCurrent(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="ml-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">今月</button>
          </div>
        </div>

        {!selectedId ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-12 text-center text-amber-700">
            お子さまが紐付けられていません。塾にご連絡ください。
          </div>
        ) : loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中...</div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500">
              {WEEKDAY.map((w, i) => (
                <div key={w} className={`py-2 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : ""}`}>{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, idx) => {
                if (!d) return <div key={idx} className="h-24 rounded-lg bg-slate-50/50" />;
                const k = dateKey(d);
                const dayLessons = lessonsByDay.get(k) ?? [];
                const isToday = dateKey(today) === k;
                return (
                  <div key={k} className={`h-24 rounded-lg border p-1.5 text-left ${
                    isToday ? "border-blue-400 bg-blue-50/40" : "border-slate-100"
                  }`}>
                    <p className={`text-xs font-semibold ${isToday ? "text-blue-600" : "text-slate-600"}`}>
                      {d.getDate()}
                    </p>
                    <div className="mt-1 space-y-0.5 overflow-y-auto">
                      {dayLessons.map((l) => (
                        <button key={l.id} onClick={() => setSelected(l)}
                          className={`w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold ${
                            l.status === "canceled" ? "bg-slate-100 text-slate-400 line-through"
                            : l.status === "completed" ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                          }`}>
                          {new Date(l.scheduled_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} {l.subject ?? ""}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selected && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}>
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-4 text-lg font-bold text-slate-950">授業の詳細</h3>
              <dl className="space-y-3 text-sm">
                <Row label="日時">
                  {new Date(selected.scheduled_at).toLocaleString("ja-JP", {
                    year: "numeric", month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
                  })}（{selected.duration_minutes}分）
                </Row>
                <Row label="科目">{selected.subject ?? "—"}</Row>
                <Row label="担当">{teacherName(selected.teacher_id)}</Row>
                <Row label="場所">{selected.location ?? "—"}</Row>
                <Row label="ステータス">
                  <StatusBadge status={selected.status} />
                </Row>
                {selected.notes && <Row label="備考">{selected.notes}</Row>}
              </dl>
              <div className="mt-6 flex justify-between gap-3">
                <button onClick={() => setSelected(null)}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  閉じる
                </button>
                {selected.status !== "canceled" && selected.status !== "completed" && (
                  <Link
                    href={`/parent/dashboard/reschedule?lesson=${selected.id}`}
                    className="rounded-2xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    振替を申請する
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-slate-500">{label}</dt>
      <dd className="flex-1 text-slate-900">{children}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    scheduled:    { label: "予定",   cls: "bg-blue-100 text-blue-700" },
    completed:    { label: "実施済", cls: "bg-green-100 text-green-700" },
    canceled:     { label: "中止",   cls: "bg-slate-100 text-slate-600" },
    rescheduled:  { label: "振替済", cls: "bg-amber-100 text-amber-700" },
  };
  const v = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${v.cls}`}>{v.label}</span>;
}
