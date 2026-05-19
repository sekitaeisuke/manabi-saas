"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { Student, School, Test, Teacher } from "@/lib/supabase";

type RescheduleReq = {
  id: string;
  lesson_id: string;
  parent_id: string | null;
  student_id: string;
  proposed_at: string;
  reason: string | null;
  parents?: { name: string; email: string } | null;
};

const DAY_JS: Record<string, number> = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

type Assignment = {
  id: string;
  student_id: string;
  test_id: string;
  session_id: string | null;
  scheduled_date: string;
  url_token: string | null;
  test_title: string;
  completed_at: string | null;
};

type LessonRow = {
  id: string;
  student_id: string;
  teacher_id: string | null;
  subject: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  status: string;
  notes: string | null;
};

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type CalendarView = "grid" | "list";

export default function CalendarPage() {
  const today = new Date();
  const [current, setCurrent] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = useState<CalendarView>("grid");
  const [students, setStudents] = useState<Student[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSchool, setFilterSchool] = useState("");

  const [modal, setModal] = useState<{ student: Student; date: Date } | null>(null);
  const [selectedTestId, setSelectedTestId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState("");

  const [editingLesson, setEditingLesson] = useState<LessonRow | null>(null);
  const [lessonForm, setLessonForm] = useState({
    teacher_id: "",
    subject: "",
    scheduled_at: "",
    duration_minutes: 60,
    location: "",
    status: "scheduled",
    notes: "",
  });
  const [lessonBusy, setLessonBusy] = useState(false);
  const [lessonError, setLessonError] = useState("");

  // 手動振替（日時直接指定）
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  // 保護者からの振替リクエスト
  const [rescheduleReqs, setRescheduleReqs] = useState<RescheduleReq[]>([]);
  const [reqResponse, setReqResponse] = useState("");
  const [reqActing, setReqActing] = useState(false);

  const year = current.getFullYear();
  const month = current.getMonth();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const start = dateKey(new Date(year, month, 1));
    const end = dateKey(new Date(year, month + 1, 0));

    const lessonStart = new Date(year, month, 1).toISOString();
    const lessonEnd = new Date(year, month + 1, 1).toISOString();

    const [{ data: s }, { data: sc }, { data: t }, { data: a }, { data: ls }, { data: tch }, { data: rr }] = await Promise.all([
      supabase.from("students").select("*").order("name"),
      supabase.from("schools").select("*").order("name"),
      supabase.from("tests").select("*").order("grade").order("subject"),
      supabase
        .from("student_test_assignments")
        .select("*, test_sessions(url_token, completed_at:created_at), tests(title)")
        .gte("scheduled_date", start)
        .lte("scheduled_date", end),
      supabase
        .from("lessons")
        .select("id, student_id, teacher_id, subject, scheduled_at, duration_minutes, location, status, notes")
        .gte("scheduled_at", lessonStart)
        .lt("scheduled_at", lessonEnd),
      supabase.from("teachers").select("*").order("name"),
      supabase
        .from("reschedule_requests")
        .select("id, lesson_id, parent_id, student_id, proposed_at, reason, parents(name, email)")
        .eq("status", "pending"),
    ]);

    setStudents(s ?? []);
    setSchools(sc ?? []);
    setTests(t ?? []);
    setTeachers((tch as Teacher[]) ?? []);
    setRescheduleReqs((rr as unknown as RescheduleReq[]) ?? []);
    setAssignments(
      (a ?? []).map((x: any) => ({
        id: x.id,
        student_id: x.student_id,
        test_id: x.test_id,
        session_id: x.session_id,
        scheduled_date: x.scheduled_date,
        url_token: x.test_sessions?.url_token ?? null,
        test_title: x.tests?.title ?? "（不明）",
        completed_at: x.completed_at ?? null,
      }))
    );
    setLessons((ls as LessonRow[]) ?? []);
    setLoading(false);
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // カレンダーグリッド生成
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  // 6週分になるよう末尾を埋める
  while (cells.length % 7 !== 0) cells.push(null);

  const filteredStudents = filterSchool
    ? students.filter((s) => s.school_id === filterSchool)
    : students;

  const lessonsFor = (studentId: string, date: Date) => {
    const k = dateKey(date);
    return lessons.filter((l) => l.student_id === studentId && dateKey(new Date(l.scheduled_at)) === k);
  };

  const studentsForDay = (date: Date) => {
    const jsDay = date.getDay();
    const k = dateKey(date);
    const lessonStudentIds = new Set(
      lessons
        .filter((l) => dateKey(new Date(l.scheduled_at)) === k)
        .map((l) => l.student_id)
    );
    return filteredStudents.filter(
      (s) => s.attendance_days?.some((d) => DAY_JS[d] === jsDay) || lessonStudentIds.has(s.id)
    );
  };

  const assignmentsFor = (studentId: string, date: Date) =>
    assignments.filter((a) => a.student_id === studentId && a.scheduled_date === dateKey(date));

  const openModal = (student: Student, date: Date) => {
    setModal({ student, date });
    setSelectedTestId("");
    setGeneratedUrl("");
  };

  const pendingByLessonId = useMemo(() => {
    const m = new Map<string, RescheduleReq>();
    for (const r of rescheduleReqs) m.set(r.lesson_id, r);
    return m;
  }, [rescheduleReqs]);

  const notifyRescheduleDecision = async (r: RescheduleReq, decision: "approved" | "rejected") => {
    if (!r.parent_id) return;
    const { data: { session } } = await supabase.auth.getSession();
    let teacherId: string | null = null;
    if (session?.user?.email) {
      const { data: tc } = await supabase.from("teachers").select("id").eq("email", session.user.email).maybeSingle();
      teacherId = tc?.id ?? null;
    }
    const stu = students.find((s) => s.id === r.student_id);
    const subject = decision === "approved" ? "振替申請を承認しました" : "振替申請への返答";
    const head = decision === "approved"
      ? `振替申請を承認しました。\n新しい授業日時：${new Date(r.proposed_at).toLocaleString("ja-JP")}`
      : "振替申請にお返事します。（元の日時のまま実施予定です）";
    const body = reqResponse.trim() ? `${head}\n\n【講師より】\n${reqResponse.trim()}` : head;
    await supabase.from("parent_messages").insert({
      thread_id: crypto.randomUUID(),
      parent_id: r.parent_id,
      teacher_id: teacherId,
      student_id: r.student_id,
      direction: "teacher_to_parent",
      parent_name: r.parents?.name ?? null,
      student_name: stu?.name ?? null,
      email: r.parents?.email ?? null,
      subject,
      message: body,
      status: "read",
      parent_read: false,
    });
  };

  const approveRequest = async (r: RescheduleReq) => {
    setReqActing(true);
    await supabase.from("reschedule_requests").update({
      status: "approved", teacher_response: reqResponse || null, responded_at: new Date().toISOString(),
    }).eq("id", r.id);
    await supabase.from("lessons").update({ scheduled_at: r.proposed_at, status: "rescheduled" }).eq("id", r.lesson_id);
    await notifyRescheduleDecision(r, "approved");
    setReqActing(false);
    setEditingLesson(null);
    fetchData();
  };

  const rejectRequest = async (r: RescheduleReq) => {
    setReqActing(true);
    await supabase.from("reschedule_requests").update({
      status: "rejected", teacher_response: reqResponse || null, responded_at: new Date().toISOString(),
    }).eq("id", r.id);
    await notifyRescheduleDecision(r, "rejected");
    setReqActing(false);
    setEditingLesson(null);
    fetchData();
  };

  const openLessonEdit = (l: LessonRow) => {
    setEditingLesson(l);
    setLessonForm({
      teacher_id: l.teacher_id ?? "",
      subject: l.subject ?? "",
      scheduled_at: toLocalInput(new Date(l.scheduled_at)),
      duration_minutes: l.duration_minutes,
      location: l.location ?? "",
      status: l.status,
      notes: l.notes ?? "",
    });
    setLessonError("");
    setRescheduleAt("");
    setReqResponse("");
  };

  const executeReschedule = async () => {
    if (!editingLesson || !rescheduleAt) return;
    setRescheduleBusy(true);
    await supabase.from("lessons").update({ status: "rescheduled" }).eq("id", editingLesson.id);
    await supabase.from("lessons").insert({
      student_id: editingLesson.student_id,
      teacher_id: editingLesson.teacher_id,
      subject: editingLesson.subject,
      duration_minutes: editingLesson.duration_minutes,
      location: editingLesson.location,
      scheduled_at: new Date(rescheduleAt).toISOString(),
      status: "scheduled",
    });
    setRescheduleBusy(false);
    setEditingLesson(null);
    fetchData();
  };

  const saveLesson = async () => {
    if (!editingLesson) return;
    if (!lessonForm.scheduled_at) { setLessonError("日時は必須です"); return; }
    setLessonBusy(true);
    setLessonError("");
    const { error } = await supabase.from("lessons").update({
      teacher_id: lessonForm.teacher_id || null,
      subject: lessonForm.subject || null,
      scheduled_at: new Date(lessonForm.scheduled_at).toISOString(),
      duration_minutes: Number(lessonForm.duration_minutes) || 60,
      location: lessonForm.location || null,
      status: lessonForm.status,
      notes: lessonForm.notes || null,
    }).eq("id", editingLesson.id);
    setLessonBusy(false);
    if (error) { setLessonError(error.message); return; }
    setEditingLesson(null);
    fetchData();
  };

  const deleteLesson = async () => {
    if (!editingLesson) return;
    if (!confirm("この授業を削除しますか？")) return;
    setLessonBusy(true);
    const { error } = await supabase.from("lessons").delete().eq("id", editingLesson.id);
    setLessonBusy(false);
    if (error) { setLessonError(error.message); return; }
    setEditingLesson(null);
    fetchData();
  };

  const assignTest = async () => {
    if (!modal || !selectedTestId) return;
    setAssigning(true);

    const token =
      Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    const { data: session, error } = await supabase
      .from("test_sessions")
      .insert({ test_id: selectedTestId, url_token: token })
      .select()
      .single();

    if (error || !session) { alert("エラー: " + error?.message); setAssigning(false); return; }

    await supabase.from("student_test_assignments").insert({
      student_id: modal.student.id,
      test_id: selectedTestId,
      session_id: session.id,
      scheduled_date: dateKey(modal.date),
    });

    setGeneratedUrl(`${window.location.origin}/test/${token}`);
    setAssigning(false);
    fetchData();
  };

  const deleteAssignment = async (id: string) => {
    if (!confirm("このテスト割当を削除しますか？")) return;
    await supabase.from("student_test_assignments").delete().eq("id", id);
    fetchData();
  };

  // 当月の生徒ごと来塾日数
  const attendanceCounts = filteredStudents.reduce<Record<string, number>>((acc, s) => {
    const count = cells.filter(
      (d) => d !== null && s.attendance_days?.some((wd) => DAY_JS[wd] === d.getDay())
    ).length;
    if (count > 0) acc[s.id] = count;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <main className="mx-auto max-w-[1400px]">
        {/* ヘッダー */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">来塾カレンダー</h1>
            <p className="mt-0.5 text-sm text-slate-500">来塾予定の生徒とテスト割当を管理します</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <button
                onClick={() => setView("grid")}
                className={`px-3 py-2 text-sm font-medium transition ${view === "grid" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                カレンダー
              </button>
              <button
                onClick={() => setView("list")}
                className={`px-3 py-2 text-sm font-medium transition ${view === "list" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                一覧
              </button>
            </div>
            <select
              value={filterSchool}
              onChange={(e) => setFilterSchool(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none shadow-sm"
            >
              <option value="">全校舎</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <Link
              href="/teacher/dashboard/schools"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
            >
              曜日設定
            </Link>
            <Link
              href="/teacher/dashboard"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
            >
              ダッシュボード
            </Link>
          </div>
        </div>

        {/* 月ナビゲーション */}
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => setCurrent(new Date(year, month - 1, 1))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-slate-50"
          >
            ◀
          </button>
          <h2 className="min-w-[120px] text-center text-lg font-bold text-slate-900">
            {year}年{month + 1}月
          </h2>
          <button
            onClick={() => setCurrent(new Date(year, month + 1, 1))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-slate-50"
          >
            ▶
          </button>
          <button
            onClick={() => setCurrent(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 shadow-sm hover:bg-slate-50"
          >
            今月
          </button>
          {!loading && (
            <span className="ml-2 text-xs text-slate-400">
              来塾生徒 {Object.keys(attendanceCounts).length}名
            </span>
          )}
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-16 text-center text-slate-400">
            読み込み中...
          </div>
        ) : view === "list" ? (
          /* ── 一覧ビュー ── */
          (() => {
            const filteredLesson = lessons.filter((l) => {
              if (!filterSchool) return true;
              const s = students.find((st) => st.id === l.student_id);
              return s?.school_id === filterSchool;
            });
            const sorted = [...filteredLesson].sort(
              (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
            );

            // 日付ごとにグループ
            const groups: { key: string; date: Date; items: LessonRow[] }[] = [];
            for (const l of sorted) {
              const d = new Date(l.scheduled_at);
              const key = dateKey(d);
              const last = groups.at(-1);
              if (last?.key === key) {
                last.items.push(l);
              } else {
                groups.push({ key, date: d, items: [l] });
              }
            }

            if (groups.length === 0) {
              return (
                <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
                  この月に授業予定がありません
                </div>
              );
            }

            return (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">日付</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">時刻</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">生徒</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">科目</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">講師</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(({ key, date, items }) => (
                      items.map((l, li) => {
                        const student = students.find((s) => s.id === l.student_id);
                        const teacher = teachers.find((t) => t.id === l.teacher_id);
                        const isToday = date.toDateString() === today.toDateString();
                        const jsDay = date.getDay();
                        const statusStyle =
                          l.status === "completed" ? "bg-emerald-100 text-emerald-700"
                          : l.status === "canceled" ? "bg-slate-100 text-slate-400"
                          : l.status === "rescheduled" ? "bg-amber-100 text-amber-700"
                          : "bg-indigo-100 text-indigo-700";
                        const statusLabel =
                          l.status === "completed" ? "実施済"
                          : l.status === "canceled" ? "中止"
                          : l.status === "rescheduled" ? "振替済"
                          : "予定";
                        return (
                          <tr
                            key={l.id}
                            onClick={() => openLessonEdit(l)}
                            className={`cursor-pointer border-b border-slate-50 transition hover:bg-indigo-50 ${
                              isToday ? "bg-teal-50/40" : ""
                            }`}
                          >
                            {li === 0 ? (
                              <td className="px-4 py-3 font-semibold text-slate-700" rowSpan={items.length}>
                                <span className={`font-bold ${isToday ? "text-teal-600" : jsDay === 0 ? "text-red-500" : jsDay === 6 ? "text-blue-500" : "text-slate-700"}`}>
                                  {date.getMonth() + 1}/{date.getDate()}（{WEEKDAY_LABELS[jsDay]}）
                                </span>
                                {isToday && <span className="ml-1 text-[10px] font-normal text-teal-500">今日</span>}
                              </td>
                            ) : null}
                            <td className="px-4 py-3 text-slate-600">
                              {new Date(l.scheduled_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                              <span className="ml-1 text-xs text-slate-400">
                                {l.duration_minutes === 0 ? "無制限" : `${l.duration_minutes}分`}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-medium text-slate-800">{student?.name ?? "—"}</span>
                              <span className="ml-1.5 text-xs text-slate-400">{student?.grade}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{l.subject ?? "—"}</td>
                            <td className="px-4 py-3 text-slate-500">{teacher?.name ?? "—"}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyle}`}>
                                {statusLabel}
                              </span>
                              {pendingByLessonId.has(l.id) && (
                                <div className="mt-1">
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                    振替希望 → {new Date(pendingByLessonId.get(l.id)!.proposed_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()
        ) : (
          /* ── グリッドビュー（従来） ── */
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
              {WEEKDAY_LABELS.map((label, i) => (
                <div
                  key={label}
                  className={`py-2 text-center text-xs font-bold tracking-widest ${
                    i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-500"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* カレンダーグリッド */}
            <div className="grid grid-cols-7">
              {cells.map((date, i) => {
                const isToday = date?.toDateString() === today.toDateString();
                const isPast = date && date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const dayStudents = date ? studentsForDay(date) : [];
                const jsDay = date?.getDay();

                return (
                  <div
                    key={i}
                    className={`min-h-[110px] border-b border-r border-slate-100 p-1 ${
                      !date ? "bg-slate-50/60" : isPast ? "bg-slate-50/30" : ""
                    }`}
                  >
                    {date && (
                      <>
                        {/* 日付 */}
                        <div className="mb-1 flex items-center justify-between px-0.5">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                              isToday
                                ? "bg-teal-500 text-white"
                                : jsDay === 0
                                ? "text-red-400"
                                : jsDay === 6
                                ? "text-blue-400"
                                : "text-slate-600"
                            }`}
                          >
                            {date.getDate()}
                          </span>
                          {dayStudents.length > 0 && (
                            <span className="text-[10px] text-slate-400">{dayStudents.length}名</span>
                          )}
                        </div>

                        {/* 生徒リスト */}
                        <div className="space-y-0.5">
                          {dayStudents.map((student) => {
                            const dayAssignments = assignmentsFor(student.id, date);
                            const dayLessons = lessonsFor(student.id, date);
                            return (
                              <div
                                key={student.id}
                                className="group cursor-pointer rounded-lg px-1.5 py-1 transition hover:bg-teal-50"
                                onClick={() => openModal(student, date)}
                              >
                                <div className="flex items-center gap-1">
                                  <span className="truncate text-[11px] font-semibold text-slate-700 group-hover:text-teal-700">
                                    {student.name}
                                  </span>
                                  <span className="flex-shrink-0 text-[10px] text-slate-400">
                                    {student.grade}
                                  </span>
                                </div>
                                {dayLessons.map((l) => (
                                  <button
                                    key={l.id}
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); openLessonEdit(l); }}
                                    className="mt-0.5 flex w-full items-center gap-1 rounded px-0.5 text-left hover:bg-indigo-50"
                                  >
                                    <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                                      l.status === "canceled" ? "bg-slate-300"
                                      : l.status === "completed" ? "bg-emerald-400"
                                      : "bg-indigo-400"
                                    }`} />
                                    <span className={`truncate text-[10px] font-medium ${
                                      l.status === "canceled" ? "text-slate-400 line-through" : "text-indigo-700"
                                    }`}>
                                      {new Date(l.scheduled_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                                      {l.subject && ` ${l.subject}`}
                                    </span>
                                    {pendingByLessonId.has(l.id) && (
                                      <span className="ml-auto flex-shrink-0 rounded bg-amber-400 px-1 py-0.5 text-[8px] font-bold text-white">振替希望</span>
                                    )}
                                  </button>
                                ))}
                                {dayAssignments.map((a) => (
                                  <div
                                    key={a.id}
                                    className="mt-0.5 flex items-center gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-teal-400" />
                                    <span className="truncate text-[10px] text-teal-700 font-medium">
                                      {a.test_title}
                                    </span>
                                    {a.url_token && (
                                      <a
                                        href={`/test/${a.url_token}`}
                                        target="_blank"
                                        className="ml-auto flex-shrink-0 rounded bg-teal-500 px-1 py-0.5 text-[9px] font-bold text-white hover:bg-teal-600"
                                      >
                                        受験
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 凡例 */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-teal-400" />
            テスト割当済み
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-indigo-400" />
            授業予定
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            実施済
          </span>
          <span className="text-slate-300">｜</span>
          <span>生徒クリック → テスト割当 ／ 授業の編集は「授業予定」ページ</span>
        </div>
      </main>

      {/* テスト割当モーダル */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-900">テスト割当</h3>
              <p className="text-sm text-slate-500">
                <span className="font-semibold text-slate-700">{modal.student.name}</span>
                　{modal.student.grade}
                　{schools.find((s) => s.id === modal.student.school_id)?.name}
              </p>
              <p className="mt-1 text-sm font-semibold text-teal-600">
                {year}年{modal.date.getMonth() + 1}月{modal.date.getDate()}日（{WEEKDAY_LABELS[modal.date.getDay()]}）
              </p>
            </div>

            {/* 割当済みテスト */}
            {assignmentsFor(modal.student.id, modal.date).length > 0 && (
              <div className="mb-5 rounded-2xl border border-teal-100 bg-teal-50 p-4">
                <p className="mb-2 text-xs font-bold text-teal-700">割当済みテスト</p>
                <div className="space-y-2">
                  {assignmentsFor(modal.student.id, modal.date).map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-teal-800">{a.test_title}</span>
                      <div className="flex flex-shrink-0 gap-1.5">
                        {a.url_token && (
                          <a
                            href={`/test/${a.url_token}`}
                            target="_blank"
                            className="rounded-xl bg-teal-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-600"
                          >
                            テスト受験
                          </a>
                        )}
                        <button
                          onClick={() => deleteAssignment(a.id)}
                          className="rounded-xl border border-red-200 px-2 py-1.5 text-xs text-red-500 hover:bg-red-50"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 新規割当フォーム */}
            {generatedUrl ? (
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                <p className="mb-2 text-sm font-bold text-indigo-700">テストURLを発行しました</p>
                <p className="mb-3 break-all rounded-xl bg-white px-3 py-2 font-mono text-xs text-indigo-900">
                  {generatedUrl}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { navigator.clipboard.writeText(generatedUrl); }}
                    className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    URLをコピー
                  </button>
                  <a
                    href={generatedUrl}
                    target="_blank"
                    className="flex-1 rounded-xl border border-indigo-300 py-2.5 text-center text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
                  >
                    テスト受験
                  </a>
                </div>
                <button
                  onClick={() => setGeneratedUrl("")}
                  className="mt-2 w-full text-center text-xs text-slate-400 hover:text-slate-600"
                >
                  さらに追加する
                </button>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  テストを割り当てる
                </label>
                <select
                  value={selectedTestId}
                  onChange={(e) => setSelectedTestId(e.target.value)}
                  className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-400"
                >
                  <option value="">-- テストを選択してください --</option>
                  <optgroup label={`▼ ${modal.student.grade}のテスト`}>
                    {tests
                      .filter((t) => t.grade === modal.student.grade)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.subject}　{t.title}
                        </option>
                      ))}
                  </optgroup>
                  {tests.some((t) => t.grade !== modal.student.grade) && (
                    <optgroup label="▼ 他学年のテスト">
                      {tests
                        .filter((t) => t.grade !== modal.student.grade)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.grade}　{t.subject}　{t.title}
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={assignTest}
                    disabled={!selectedTestId || assigning}
                    className="flex-1 rounded-2xl bg-teal-500 py-3 font-semibold text-white hover:bg-teal-600 disabled:opacity-40"
                  >
                    {assigning ? "発行中..." : "URLを発行してテスト割当"}
                  </button>
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 rounded-2xl border border-slate-200 py-3 text-slate-600 hover:bg-slate-50"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            )}

            {generatedUrl && (
              <button
                onClick={() => setModal(null)}
                className="mt-3 w-full rounded-2xl border border-slate-200 py-2.5 text-sm text-slate-500 hover:bg-slate-50"
              >
                閉じる
              </button>
            )}
          </div>
        </div>
      )}

      {/* 授業編集モーダル */}
      {editingLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => !lessonBusy && setEditingLesson(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">授業を編集</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {students.find((s) => s.id === editingLesson.student_id)?.name ?? "—"}
                </p>
              </div>
            </div>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-600">日時
                  <input type="datetime-local" value={lessonForm.scheduled_at}
                    onChange={(e) => setLessonForm({ ...lessonForm, scheduled_at: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-slate-600">所要（分）
                  <input type="number" min={15} step={15} value={lessonForm.duration_minutes}
                    onChange={(e) => setLessonForm({ ...lessonForm, duration_minutes: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                </label>
              </div>
              <label className="text-xs text-slate-600">担当講師
                <select value={lessonForm.teacher_id}
                  onChange={(e) => setLessonForm({ ...lessonForm, teacher_id: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <option value="">未指定</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-600">科目
                  <input value={lessonForm.subject}
                    onChange={(e) => setLessonForm({ ...lessonForm, subject: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-slate-600">ステータス
                  <select value={lessonForm.status}
                    onChange={(e) => setLessonForm({ ...lessonForm, status: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <option value="scheduled">予定</option>
                    <option value="completed">実施済</option>
                    <option value="canceled">中止</option>
                    <option value="rescheduled">振替済</option>
                  </select>
                </label>
              </div>
              <label className="text-xs text-slate-600">場所
                <input value={lessonForm.location}
                  onChange={(e) => setLessonForm({ ...lessonForm, location: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600">備考
                <textarea value={lessonForm.notes} rows={3}
                  onChange={(e) => setLessonForm({ ...lessonForm, notes: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
              </label>
              {lessonError && <p className="text-xs text-red-600">{lessonError}</p>}
            </div>

            {/* 保護者からの振替リクエスト */}
            {editingLesson && pendingByLessonId.has(editingLesson.id) && (() => {
              const req = pendingByLessonId.get(editingLesson.id)!;
              return (
                <div className="mt-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                  <p className="mb-2 text-xs font-bold text-amber-800">保護者から振替希望が届いています</p>
                  <p className="text-sm font-semibold text-amber-900">
                    希望日時：{new Date(req.proposed_at).toLocaleString("ja-JP")}
                  </p>
                  {req.reason && <p className="mt-1 text-xs text-amber-700 bg-white rounded-lg px-3 py-2">{req.reason}</p>}
                  {req.parents && <p className="mt-1 text-xs text-amber-600">申請者：{req.parents.name}</p>}
                  <textarea
                    value={reqResponse}
                    onChange={(e) => setReqResponse(e.target.value)}
                    rows={2}
                    placeholder="保護者への返答（任意）"
                    className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => rejectRequest(req)} disabled={reqActing}
                      className="flex-1 rounded-xl border border-red-200 bg-white py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40">
                      不可で返答
                    </button>
                    <button onClick={() => approveRequest(req)} disabled={reqActing}
                      className="flex-1 rounded-xl bg-green-600 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40">
                      {reqActing ? "処理中..." : "承認して日時を更新"}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* 手動振替セクション */}
            {lessonForm.status !== "rescheduled" && lessonForm.status !== "completed" && (
              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <p className="mb-2 text-xs font-semibold text-amber-700">振替</p>
                <label className="text-xs text-amber-700">
                  振替先の日時
                  <input
                    type="datetime-local"
                    value={rescheduleAt}
                    onChange={(e) => setRescheduleAt(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700"
                  />
                </label>
                <button
                  onClick={executeReschedule}
                  disabled={!rescheduleAt || rescheduleBusy}
                  className="mt-2 w-full rounded-xl bg-amber-500 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
                >
                  {rescheduleBusy ? "処理中..." : "振替を実行（元の授業を振替済にして新規作成）"}
                </button>
              </div>
            )}

            <div className="mt-4 flex justify-between gap-3">
              <button onClick={deleteLesson} disabled={lessonBusy}
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40">
                削除
              </button>
              <div className="flex gap-2">
                <button onClick={() => setEditingLesson(null)} disabled={lessonBusy}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  キャンセル
                </button>
                <button onClick={saveLesson} disabled={lessonBusy}
                  className="rounded-2xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                  {lessonBusy ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
