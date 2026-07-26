"use client";

import { sanitizeHtml } from "@/lib/sanitize";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import { EconomyPanel } from "@/components/EconomyPanel";
import type { Student, ShiftEvent, StudentKarte } from "@/lib/supabase";
import { subscribeWebPush, unsubscribeWebPush, checkWebPushSupport, getCurrentSubscriptionEndpoint } from "@/lib/webPush";

type Tab = "todo" | "tests" | "messages" | "calendar" | "karte" | "economy" | "settings";

type DailyTask = {
  id: string;
  learning_plan_id: string;
  task_date: string;
  subject: string | null;
  content: string;
  amount: string | null;
  sort_order: number;
  done: boolean;
};

type KartePlan = {
  id: string;
  subject: string;
  grade: string;
  test_percentage: number | null;
  teacher_notes: string | null;
  plan_html: string;
  created_at: string;
};

const EVENT_COLORS: Record<string, string> = {
  event: "bg-purple-100 text-purple-700", exam: "bg-red-100 text-red-700",
  holiday: "bg-slate-100 text-slate-500", class: "bg-teal-100 text-teal-700", info: "bg-amber-100 text-amber-700",
};
const EVENT_ICON: Record<string, string> = {
  event: "🎉", exam: "📝", holiday: "🏖", class: "📚", info: "ℹ️",
};
const WEEKDAY = ["日","月","火","水","木","金","土"];

type ShiftDay = { date: string; teacher_names: string[]; events: ShiftEvent[] };

type AssignedTest = {
  assignment_id: string;
  test_session_id: string;
  url_token: string;
  test_title: string;
  test_subject: string;
  test_grade: string;
  completed: boolean;
  percentage: number | null;
};

type StudentMessage = {
  id: string;
  subject: string | null;
  message: string;
  status: string;
  direction: "student_to_teacher" | "teacher_to_student";
  thread_id: string | null;
  student_read: boolean;
  created_at: string;
};

export default function StudentDashboardPage() {
  const [student, setStudent] = useState<Student | null>(null);
  const [tests, setTests] = useState<AssignedTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("todo");
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [messages, setMessages] = useState<StudentMessage[]>([]);
  const [msgForm, setMsgForm] = useState({ subject: "", message: "" });
  const [sending, setSending] = useState(false);
  const [msgSent, setMsgSent] = useState(false);
  const [studentRef, setStudentRef] = useState<Student | null>(null);
  const [kartes, setKartes] = useState<KartePlan[]>([]);
  const [selectedKarte, setSelectedKarte] = useState<KartePlan | null>(null);
  const [myKarte, setMyKarte] = useState<StudentKarte | null>(null);
  const [activeMessageThread, setActiveMessageThread] = useState<string | null>(null);
  const [threadReply, setThreadReply] = useState("");
  const [calMonth, setCalMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [shiftDays, setShiftDays] = useState<ShiftDay[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const router = useRouter();

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/student/login");
  };

  const toggleTask = async (taskId: string, next: boolean) => {
    setDailyTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, done: next } : t)));
    await supabase
      .from("daily_tasks")
      .update({ done: next, done_at: next ? new Date().toISOString() : null })
      .eq("id", taskId);
  };

  const fetchMessages = async (s: Student) => {
    const { data } = await supabase
      .from("student_messages")
      .select("id, subject, message, status, direction, thread_id, student_read, created_at")
      .eq("student_id", s.id)
      .order("created_at", { ascending: true });
    setMessages((data as StudentMessage[]) ?? []);
  };

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: studentData } = await supabase
        .from("students")
        .select("*")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!studentData) return;
      setStudent(studentData as Student);
      setStudentRef(studentData as Student);

      // テスト取得
      const { data: assignments } = await supabase
        .from("test_assignments")
        .select("id, test_session_id")
        .eq("student_id", studentData.id);

      if (assignments && assignments.length > 0) {
        const sessionIds = assignments.map((a: { id: string; test_session_id: string }) => a.test_session_id);

        const [{ data: sessions }, { data: results }] = await Promise.all([
          supabase
            .from("test_sessions")
            .select("id, url_token, tests(title, subject, grade)")
            .in("id", sessionIds),
          supabase
            .from("results")
            .select("session_id, percentage")
            .in("session_id", sessionIds)
            .eq("student_name", studentData.name),
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const assembled: AssignedTest[] = (sessions ?? []).map((s: any) => {
          const testInfo = Array.isArray(s.tests) ? s.tests[0] : s.tests;
          const assignment = assignments.find((a: { id: string; test_session_id: string }) => a.test_session_id === s.id);
          const result = (results ?? []).find((r: { session_id: string; percentage: number | null }) => r.session_id === s.id);
          return {
            assignment_id: assignment?.id ?? "",
            test_session_id: s.id,
            url_token: s.url_token,
            test_title: testInfo?.title ?? "テスト",
            test_subject: testInfo?.subject ?? "",
            test_grade: testInfo?.grade ?? "",
            completed: !!result,
            percentage: result?.percentage ?? null,
          };
        });
        setTests(assembled);
      }

      await fetchMessages(studentData as Student);

      // 3か月ビジョン取得（共有済みのみ）
      const { data: karteData } = await supabase
        .from("learning_plans")
        .select("id, subject, grade, test_percentage, teacher_notes, plan_html, created_at")
        .eq("student_name", studentData.name)
        .eq("status", "shared")
        .order("created_at", { ascending: false });
      setKartes((karteData as KartePlan[]) ?? []);

      // 日次カルテ（自分の shared 1件）
      const { data: myKarteData } = await supabase
        .from("student_karte")
        .select("*")
        .eq("student_id", studentData.id)
        .eq("status", "shared")
        .order("generated_at", { ascending: false })
        .limit(1);
      setMyKarte(((myKarteData as StudentKarte[]) ?? [])[0] ?? null);

      // 毎日のTODO（共有済みカルテのぶんのみ）
      const planIds = (karteData ?? []).map((k: { id: string }) => k.id);
      if (planIds.length > 0) {
        const { data: dt } = await supabase
          .from("daily_tasks")
          .select("id, learning_plan_id, task_date, subject, content, amount, sort_order, done")
          .in("learning_plan_id", planIds)
          .order("task_date", { ascending: true })
          .order("sort_order", { ascending: true });
        setDailyTasks((dt as DailyTask[]) ?? []);
      }

      setLoading(false);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // カレンダータブ用データ取得
  useEffect(() => {
    if (tab !== "calendar" || !student?.school_id) return;
    const schoolId = student.school_id;
    const y = calMonth.getFullYear();
    const m = calMonth.getMonth();
    const startDate = `${y}-${String(m+1).padStart(2,"0")}-01`;
    const endDate   = `${y}-${String(m+1).padStart(2,"0")}-${new Date(y,m+1,0).getDate()}`;
    setCalLoading(true);
    Promise.all([
      supabase.from("shift_assignments")
        .select("date,teachers(name)")
        .eq("school_id", schoolId).eq("status","confirmed")
        .gte("date",startDate).lte("date",endDate),
      supabase.from("shift_events")
        .select("*")
        .or(`school_id.eq.${schoolId},school_id.is.null`)
        .eq("visible_to_students",true)
        .gte("date",startDate).lte("date",endDate).order("date"),
    ]).then(([saRes, evRes]) => {
      const saData = saRes.data ?? [];
      const evData = (evRes.data ?? []) as ShiftEvent[];
      const dayMap = new Map<string, { teachers: Set<string>; events: ShiftEvent[] }>();
      for (const r of saData) {
        const row = r as { date: string; teachers: { name: string } | { name: string }[] | null };
        if (!dayMap.has(row.date)) dayMap.set(row.date, { teachers: new Set(), events: [] });
        const tName = Array.isArray(row.teachers) ? row.teachers[0]?.name : row.teachers?.name;
        if (tName) dayMap.get(row.date)!.teachers.add(tName);
      }
      for (const ev of evData) {
        if (!dayMap.has(ev.date)) dayMap.set(ev.date, { teachers: new Set(), events: [] });
        dayMap.get(ev.date)!.events.push(ev);
      }
      const days: ShiftDay[] = Array.from(dayMap.entries()).map(([date, v]) => ({
        date, teacher_names: Array.from(v.teachers), events: v.events,
      }));
      setShiftDays(days);
      setCalLoading(false);
    }).catch((err) => {
      console.error("カレンダーデータ取得エラー:", err);
      setCalLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, calMonth, student?.school_id]);

  const sendMessage = async () => {
    const s = studentRef;
    if (!msgForm.message || !s) return;
    setSending(true);
    await supabase.from("student_messages").insert({
      student_id: s.id,
      student_name: s.name,
      subject: msgForm.subject || null,
      message: msgForm.message,
      status: "unread",
      direction: "student_to_teacher",
      thread_id: crypto.randomUUID(),
      student_read: true,
    });
    setMsgForm({ subject: "", message: "" });
    setMsgSent(true);
    setTimeout(() => setMsgSent(false), 3000);
    try {
      await fetchMessages(s);
    } finally {
      setSending(false);
    }
  };

  const sendThreadReply = async (threadId: string, body: string) => {
    const s = studentRef;
    if (!s || !body.trim()) return;
    const firstSubject = messages.find((m) => (m.thread_id ?? m.id) === threadId)?.subject ?? null;
    await supabase.from("student_messages").insert({
      student_id: s.id,
      student_name: s.name,
      subject: firstSubject ? `Re: ${firstSubject.replace(/^Re:\s*/, "")}` : null,
      message: body.trim(),
      status: "unread",
      direction: "student_to_teacher",
      thread_id: threadId,
      student_read: true,
    });
    await fetchMessages(s);
  };

  const openMessageThread = async (threadId: string) => {
    const s = studentRef;
    if (!s) return;
    const unreadIds = messages
      .filter((m) => (m.thread_id ?? m.id) === threadId && m.direction === "teacher_to_student" && !m.student_read)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;
    await supabase.from("student_messages").update({ student_read: true }).in("id", unreadIds);
    await fetchMessages(s);
  };

  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
  const pendingTests = tests.filter((t) => !t.completed);
  const completedTests = tests.filter((t) => t.completed);

  // 今日のTODO / これから1週間
  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const weekEndKey = (() => {
    const d = new Date(); d.setDate(d.getDate() + 6);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const todayTasks = dailyTasks.filter((t) => t.task_date === todayKey);
  const todayDone = todayTasks.filter((t) => t.done).length;
  const upcomingTasks = dailyTasks.filter((t) => t.task_date > todayKey && t.task_date <= weekEndKey);
  const upcomingByDate = upcomingTasks.reduce<Record<string, DailyTask[]>>((acc, t) => {
    (acc[t.task_date] ??= []).push(t); return acc;
  }, {});
  const dateLabel = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return `${m}月${d}日（${WEEKDAY[dt.getDay()]}）`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50">
      <header className="sticky top-0 z-10 border-b border-white/60 bg-white/80 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Logo size="sm" />
          <button
            onClick={logout}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            ログアウト
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        {/* あいさつ */}
        <div className="mb-8">
          <p className="text-sm text-slate-400">{today}</p>
          {student && (
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              {student.name}さん、こんにちは！
            </h1>
          )}
          <p className="mt-1 text-sm text-slate-500">
            {student?.grade} ・ 今日も頑張りましょう。
          </p>
        </div>

        {/* タブ */}
        <div className="mb-6 flex gap-2 flex-wrap">
          <button
            onClick={() => setTab("todo")}
            className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
              tab === "todo"
                ? "bg-emerald-600 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            カルテ
            {todayTasks.length - todayDone > 0 && tab !== "todo" && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-xs font-bold text-white">
                {todayTasks.length - todayDone}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("tests")}
            className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
              tab === "tests"
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            テスト
            {pendingTests.length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                {pendingTests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setTab("messages"); setActiveMessageThread(null); }}
            className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
              tab === "messages"
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            先生へのメッセージ
            {(() => {
              const c = messages.filter((m) => m.direction === "teacher_to_student" && !m.student_read).length;
              return c > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                  {c}
                </span>
              ) : null;
            })()}
          </button>
          <button
            onClick={() => { setTab("karte"); setSelectedKarte(null); }}
            className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
              tab === "karte"
                ? "bg-violet-600 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            3か月ビジョン
            {kartes.length > 0 && tab !== "karte" && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-500 px-1.5 text-xs font-bold text-white">
                {kartes.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("economy")}
            className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
              tab === "economy"
                ? "bg-amber-500 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            経済（AC・自塾株）
          </button>
          <button
            onClick={() => setTab("calendar")}
            className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
              tab === "calendar"
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            カレンダー
          </button>
          <button
            onClick={() => setTab("settings")}
            className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
              tab === "settings"
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            通知設定
          </button>
        </div>

        {/* カルテタブ（現状・進め方・注意・保護者ニーズ＋毎日のTODO） */}
        {tab === "todo" && (
          <div className="space-y-5">
            {myKarte?.karte_html && (
              <div className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm">
                <style>{`
                  #student-karte h2 { font-size:1rem; font-weight:700; margin:16px 0 6px; padding:6px 12px; background:#f5f3ff; border-left:4px solid #7c3aed; color:#3730a3; border-radius:0 6px 6px 0; }
                  #student-karte h2:first-child { margin-top:0; }
                  #student-karte p { line-height:1.85; font-size:0.9rem; color:#374151; margin:4px 0; }
                `}</style>
                <div id="student-karte" dangerouslySetInnerHTML={{ __html: sanitizeHtml(myKarte.karte_html) }} />
                <p className="mt-2 text-right text-[11px] text-slate-400">更新 {new Date(myKarte.generated_at).toLocaleString("ja-JP")}</p>
              </div>
            )}
            {dailyTasks.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white py-16 text-center text-slate-500">
                <p className="text-5xl mb-3">📝</p>
                <p className="font-semibold text-slate-700">まだTODOはありません</p>
                <p className="mt-1 text-sm">先生が3か月ビジョンを共有すると、毎日のやることがここに表示されます。</p>
              </div>
            ) : (
              <>
                {/* 今日 */}
                <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">今日のTODO</h2>
                      <p className="text-xs text-slate-500">{dateLabel(todayKey)}</p>
                    </div>
                    {todayTasks.length > 0 && (
                      <span className={`rounded-full px-3 py-1 text-sm font-bold ${
                        todayDone === todayTasks.length ? "bg-emerald-100 text-emerald-700" : "bg-emerald-50 text-emerald-700"
                      }`}>
                        {todayDone}/{todayTasks.length} 完了
                      </span>
                    )}
                  </div>
                  {todayTasks.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-400">今日のタスクはありません。ゆっくり休もう／苦手の復習をしよう。</p>
                  ) : (
                    <ul className="space-y-2">
                      {todayTasks.map((t) => (
                        <li key={t.id}>
                          <label className={`flex items-start gap-3 rounded-2xl border px-4 py-3 cursor-pointer transition ${
                            t.done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}>
                            <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id, !t.done)}
                              className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600" />
                            <span className="flex-1 min-w-0">
                              <span className={`block text-sm font-medium ${t.done ? "text-slate-400 line-through" : "text-slate-900"}`}>{t.content}</span>
                              <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                {t.subject && <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-600">{t.subject}</span>}
                                {t.amount && <span className="text-slate-400">{t.amount}</span>}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* これから1週間 */}
                {Object.keys(upcomingByDate).length > 0 && (
                  <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-lg font-bold text-slate-900">これから1週間</h2>
                    <div className="space-y-4">
                      {Object.entries(upcomingByDate).map(([date, items]) => (
                        <div key={date}>
                          <p className="mb-1.5 text-xs font-semibold text-slate-500">{dateLabel(date)}</p>
                          <ul className="space-y-1.5">
                            {items.map((t) => (
                              <li key={t.id} className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2">
                                <span className={`h-2 w-2 shrink-0 rounded-full ${t.done ? "bg-emerald-400" : "bg-slate-300"}`} />
                                <span className={`flex-1 text-sm ${t.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{t.content}</span>
                                {t.subject && <span className="shrink-0 text-xs text-slate-400">{t.subject}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === "economy" && student && <EconomyPanel student={student} />}

        {tab === "settings" && studentRef && <StudentSettings student={studentRef} />}

        {/* カレンダータブ */}
        {tab === "calendar" && (
          <StudentCalendar
            calMonth={calMonth}
            setCalMonth={setCalMonth}
            shiftDays={shiftDays}
            loading={calLoading}
            hasSchool={!!student?.school_id}
          />
        )}

        {/* テストタブ */}
        {tab === "tests" && (
          <section>
            {loading ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">
                読み込み中...
              </div>
            ) : tests.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <p className="text-slate-500">まだテストが割り当てられていません</p>
                <p className="mt-1 text-sm text-slate-400">
                  先生からテストが届いたら、ここに表示されます
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {pendingTests.length > 0 && (
                  <div>
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      受験するテスト
                    </h2>
                    <div className="space-y-3">
                      {pendingTests.map((t) => (
                        <div
                          key={t.assignment_id}
                          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-900">{t.test_title}</p>
                              <p className="mt-0.5 text-sm text-slate-500">
                                {t.test_subject} ・ {t.test_grade}
                              </p>
                            </div>
                            <a
                              href={`/test/${t.url_token}?studentName=${encodeURIComponent(student?.name ?? "")}`}
                              className="shrink-0 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                            >
                              受験する →
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {completedTests.length > 0 && (
                  <div>
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      提出済みテスト
                    </h2>
                    <div className="space-y-3">
                      {completedTests.map((t) => (
                        <div
                          key={t.assignment_id}
                          className="rounded-3xl border border-green-200 bg-white p-6 opacity-80 shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-700">{t.test_title}</p>
                              <p className="mt-0.5 text-sm text-slate-400">
                                {t.test_subject} ・ {t.test_grade}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
                                提出済み ✓
                              </span>
                              {t.percentage != null && (
                                <p className="mt-1 text-xs text-slate-400">
                                  {Math.round(t.percentage)}点
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* 3か月ビジョンタブ */}
        {tab === "karte" && (
          <section>
            {selectedKarte ? (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-900">{selectedKarte.subject} 3か月ビジョン</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedKarte.grade} ・ {selectedKarte.created_at.slice(0, 10)}
                      {selectedKarte.test_percentage != null && (
                        <span className="ml-2 font-semibold text-violet-700">診断 {selectedKarte.test_percentage}%</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedKarte(null)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    一覧に戻る
                  </button>
                </div>
                {selectedKarte.teacher_notes && (
                  <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-semibold text-amber-700 mb-1">先生より</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{selectedKarte.teacher_notes}</p>
                  </div>
                )}
                <div className="rounded-3xl border border-violet-100 bg-white px-6 py-8 shadow-sm">
                  <style>{`
                    #karte-student h1 { font-size:1.2rem; font-weight:800; color:#1e1b4b; margin-bottom:16px; padding-bottom:8px; border-bottom:2px solid #7c3aed; }
                    #karte-student h2 { font-size:1rem; font-weight:700; margin:20px 0 8px; padding:6px 12px; background:#f5f3ff; border-left:4px solid #7c3aed; color:#3730a3; border-radius:0 6px 6px 0; }
                    #karte-student h3 { font-size:0.9rem; font-weight:600; margin:14px 0 4px; color:#1e293b; }
                    #karte-student p, #karte-student li { line-height:1.85; font-size:0.875rem; color:#374151; }
                    #karte-student ul, #karte-student ol { padding-left:1.4rem; margin:4px 0; }
                    #karte-student table { border-collapse:collapse; width:100%; margin:8px 0; font-size:0.8rem; }
                    #karte-student td, #karte-student th { border:1px solid #e5e7eb; padding:5px 8px; }
                    #karte-student th { background:#f5f3ff; font-weight:700; color:#3730a3; }
                    #karte-student strong { color:#1e293b; }
                  `}</style>
                  <div id="karte-student" dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedKarte.plan_html) }} />
                </div>
              </div>
            ) : kartes.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <p className="text-3xl mb-3">📋</p>
                <p className="font-semibold text-slate-700">まだ3か月ビジョンがありません</p>
                <p className="mt-1 text-sm text-slate-400">
                  先生が診断結果をもとに3か月ビジョンを作成・共有すると、ここに表示されます。
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {kartes.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => setSelectedKarte(k)}
                    className="w-full group rounded-3xl border border-violet-200 bg-white p-5 text-left shadow-sm transition hover:border-violet-400 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900">{k.subject} 3か月ビジョン</span>
                          <span className="text-sm text-slate-500">{k.grade}</span>
                          {k.test_percentage != null && (
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              k.test_percentage >= 80 ? "bg-green-100 text-green-700" :
                              k.test_percentage >= 60 ? "bg-blue-100 text-blue-700" :
                              "bg-red-100 text-red-700"
                            }`}>診断 {k.test_percentage}%</span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{k.created_at.slice(0, 10)}</p>
                        {k.teacher_notes && (
                          <p className="mt-2 text-xs text-slate-500 line-clamp-1">
                            先生より: {k.teacher_notes}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-medium text-violet-600 group-hover:underline">
                        開く →
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* メッセージタブ */}
        {tab === "messages" && (
          <section>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-semibold text-slate-900">先生へメッセージを送る</h2>
              <div className="space-y-3">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">件名（任意）</span>
                  <input
                    value={msgForm.subject}
                    onChange={(e) => setMsgForm({ ...msgForm, subject: e.target.value })}
                    placeholder="例：宿題について"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">メッセージ *</span>
                  <textarea
                    value={msgForm.message}
                    onChange={(e) => setMsgForm({ ...msgForm, message: e.target.value })}
                    placeholder="先生への質問や連絡を入力してください..."
                    rows={5}
                    className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </label>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={sendMessage}
                  disabled={!msgForm.message || sending}
                  className="rounded-2xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
                >
                  {sending ? "送信中..." : "送信する"}
                </button>
                {msgSent && (
                  <span className="text-sm font-medium text-green-600">送信しました！</span>
                )}
              </div>
            </div>

            {messages.length > 0 && (() => {
              const threadMap = new Map<string, StudentMessage[]>();
              for (const m of messages) {
                const key = m.thread_id ?? m.id;
                if (!threadMap.has(key)) threadMap.set(key, []);
                threadMap.get(key)!.push(m);
              }
              const threadList = Array.from(threadMap.entries())
                .map(([id, msgs]) => ({
                  id,
                  msgs,
                  last: msgs[msgs.length - 1],
                  subject: msgs.find((m) => m.subject)?.subject ?? "(件名なし)",
                  hasUnread: msgs.some((m) => m.direction === "teacher_to_student" && !m.student_read),
                }))
                .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
              const active = threadList.find((t) => t.id === activeMessageThread) ?? null;
              return (
                <div className="mt-6">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    やりとり
                  </h3>
                  {active ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="font-semibold text-slate-900">{active.subject}</p>
                        <button onClick={() => { setActiveMessageThread(null); setThreadReply(""); }}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
                          一覧に戻る
                        </button>
                      </div>
                      <div className="space-y-2">
                        {active.msgs.map((m) => {
                          const fromTeacher = m.direction === "teacher_to_student";
                          return (
                            <div key={m.id} className={`flex ${fromTeacher ? "justify-start" : "justify-end"}`}>
                              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                                fromTeacher ? "bg-slate-100 text-slate-900" : "bg-indigo-600 text-white"
                              }`}>
                                <p className={`mb-1 text-[10px] font-semibold ${fromTeacher ? "text-slate-500" : "text-indigo-100"}`}>
                                  {fromTeacher ? "先生" : "自分"} ・ {new Date(m.created_at).toLocaleString("ja-JP")}
                                </p>
                                <p className="whitespace-pre-wrap leading-6">{m.message}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-4 border-t border-slate-100 pt-3">
                        <textarea
                          value={threadReply}
                          onChange={(e) => setThreadReply(e.target.value)}
                          rows={3}
                          placeholder="返信を入力..."
                          className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        <div className="mt-2 flex justify-end">
                          <button
                            onClick={async () => {
                              if (!threadReply.trim()) return;
                              await sendThreadReply(active.id, threadReply);
                              setThreadReply("");
                            }}
                            disabled={!threadReply.trim()}
                            className="rounded-xl bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                            返信
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {threadList.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => { setActiveMessageThread(t.id); openMessageThread(t.id); }}
                          className="block w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200"
                        >
                          <div className="flex items-center gap-2">
                            {t.hasUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                            <p className={`flex-1 truncate text-sm font-semibold ${t.hasUnread ? "text-slate-900" : "text-slate-700"}`}>
                              {t.subject}
                            </p>
                            <span className="shrink-0 text-xs text-slate-400">
                              {new Date(t.last.created_at).toLocaleDateString("ja-JP")}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-500">{t.last.message}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </section>
        )}
      </main>
    </div>
  );
}

type StudentPrefs = {
  id?: string;
  push_enabled: boolean;
  push_endpoint: string | null;
};

function StudentSettings({ student }: { student: Student }) {
  const [prefs, setPrefs] = useState<StudentPrefs>({ push_enabled: false, push_endpoint: null });
  const [loading, setLoading] = useState(true);
  const [pushDeviceActive, setPushDeviceActive] = useState(false);
  const [pushSupport, setPushSupport] = useState<{ ok: boolean; reason?: string }>({ ok: true });
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("actor_kind", "student")
        .eq("actor_id", student.id)
        .maybeSingle();
      if (data) setPrefs(data as StudentPrefs);
      const support = checkWebPushSupport();
      setPushSupport(support.ok ? { ok: true } : { ok: false, reason: support.reason });
      if (support.ok) {
        const endpoint = await getCurrentSubscriptionEndpoint();
        setPushDeviceActive(!!endpoint);
      }
      setLoading(false);
    };
    load();
  }, [student.id]);

  const enablePush = async () => {
    setPushBusy(true);
    setPushError("");
    const r = await subscribeWebPush();
    if (!r.ok) { setPushError(r.error); setPushBusy(false); return; }
    const subscriptionJson = JSON.stringify(r.subscription);
    const payload = {
      actor_kind: "student",
      actor_id: student.id,
      email_enabled: false,
      line_enabled: false,
      push_enabled: true,
      push_endpoint: subscriptionJson,
    };
    if (prefs.id) {
      await supabase.from("notification_preferences").update(payload).eq("id", prefs.id);
    } else {
      const { data } = await supabase.from("notification_preferences").insert(payload).select("id").single();
      if (data) setPrefs((p) => ({ ...p, id: data.id }));
    }
    setPrefs((p) => ({ ...p, push_enabled: true, push_endpoint: subscriptionJson }));
    setPushDeviceActive(true);
    setPushBusy(false);
  };

  const disablePush = async () => {
    setPushBusy(true);
    setPushError("");
    await unsubscribeWebPush();
    if (prefs.id) {
      await supabase.from("notification_preferences")
        .update({ push_enabled: false, push_endpoint: null })
        .eq("id", prefs.id);
    }
    setPrefs((p) => ({ ...p, push_enabled: false, push_endpoint: null }));
    setPushDeviceActive(false);
    setPushBusy(false);
  };

  if (loading) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中...</div>;
  }

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">ブラウザのプッシュ通知</p>
            <p className="mt-1 text-xs text-slate-500">
              {pushDeviceActive
                ? "この端末で有効化されています。"
                : "先生からのメッセージなどをこの端末で受け取れます。"}
            </p>
            {!pushSupport.ok && (
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                この環境では Web Push は利用できません：{pushSupport.reason}
              </p>
            )}
            {pushError && (
              <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{pushError}</p>
            )}
          </div>
          {pushDeviceActive ? (
            <button onClick={disablePush} disabled={pushBusy}
              className="shrink-0 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40">
              この端末で無効化
            </button>
          ) : (
            <button onClick={enablePush} disabled={pushBusy || !pushSupport.ok}
              className="shrink-0 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
              {pushBusy ? "処理中..." : "この端末で有効化"}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500">
        ※ メール通知は生徒アカウントには使われない設計です。Push 通知のみが対象です。
      </p>
    </section>
  );
}

// ─── カレンダーコンポーネント ─────────────────────────────────
function StudentCalendar({
  calMonth, setCalMonth, shiftDays, loading, hasSchool,
}: {
  calMonth: Date;
  setCalMonth: (d: Date) => void;
  shiftDays: ShiftDay[];
  loading: boolean;
  hasSchool: boolean;
}) {
  const today = new Date();
  const year  = calMonth.getFullYear();
  const month = calMonth.getMonth();

  const dayMap = useMemo(() => {
    const m = new Map<string, ShiftDay>();
    for (const d of shiftDays) m.set(d.date, d);
    return m;
  }, [shiftDays]);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const arr: (Date | null)[] = [];
    for (let i = 0; i < first.getDay(); i++) arr.push(null);
    for (let d = 1; d <= new Date(year, month + 1, 0).getDate(); d++) arr.push(new Date(year, month, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month]);

  const dk = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  if (!hasSchool) return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center text-sm text-amber-700">
      教室情報が設定されていません。先生にご確認ください。
    </div>
  );

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* ヘッダー */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">教室カレンダー</h2>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setCalMonth(new Date(year, month - 1, 1))}
            className="rounded-xl border border-slate-200 px-2.5 py-1 text-sm hover:bg-slate-50">←</button>
          <span className="min-w-[6rem] text-center text-sm font-semibold text-slate-700">{year}年{month+1}月</span>
          <button onClick={() => setCalMonth(new Date(year, month + 1, 1))}
            className="rounded-xl border border-slate-200 px-2.5 py-1 text-sm hover:bg-slate-50">→</button>
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400">読み込み中...</p>
      ) : (
        <>
          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs font-semibold text-slate-400 mb-1">
            {WEEKDAY.map((w, i) => (
              <div key={w} className={`py-1 ${i===0?"text-red-400":i===6?"text-blue-400":""}`}>{w}</div>
            ))}
          </div>
          {/* グリッド */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, idx) => {
              if (!d) return <div key={idx} className="min-h-[5rem] rounded-lg bg-slate-50/30" />;
              const k = dk(d);
              const day = dayMap.get(k);
              const isToday = dk(today) === k;
              const dow = d.getDay();
              return (
                <div key={k} className={`min-h-[5rem] rounded-xl border p-1 ${
                  isToday ? "border-indigo-400 bg-indigo-50/30" : "border-slate-100"
                }`}>
                  <p className={`mb-0.5 text-xs font-bold ${
                    isToday ? "text-indigo-600" : dow===0?"text-red-400":dow===6?"text-blue-400":"text-slate-600"
                  }`}>{d.getDate()}</p>
                  <div className="space-y-0.5 overflow-y-auto max-h-[4.5rem]">
                    {day?.events.map((ev) => (
                      <div key={ev.id} className={`truncate rounded px-1 py-0.5 text-[10px] font-semibold ${EVENT_COLORS[ev.event_type]}`}>
                        {EVENT_ICON[ev.event_type]} {ev.title}
                      </div>
                    ))}
                    {day?.teacher_names.map((name) => (
                      <div key={name} className="truncate rounded bg-indigo-50 px-1 py-0.5 text-[10px] text-indigo-600">
                        👤 {name}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {/* 凡例 */}
          <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
            <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-600">👤 出勤講師</span>
            {Object.entries(EVENT_ICON).map(([type, icon]) => (
              <span key={type} className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${EVENT_COLORS[type]}`}>
                {icon} {type==="event"?"行事":type==="exam"?"テスト":type==="holiday"?"休校":type==="class"?"特別授業":"お知らせ"}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
