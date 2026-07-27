"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import { showToast } from "@/lib/toast";
import { Skeleton } from "@/components/Skeleton";
import { ECON } from "@/lib/economyFeatures";
import { FEATURES } from "@/lib/features";
import type { StudentKarteJson } from "@/lib/supabase";

type Counts = {
  pendingReschedules: number;
  unreadParentMessages: number;
  unreadStudentMessages: number;
  pendingDiagnoses: number;
  draftReports: number;
  concerns: number;
  economyApprovals: number;
  economyVoices: number;
  economyReferrals: number;
};

type ActivityItem = {
  id: string;
  kind: "report" | "diagnosis" | "reschedule" | "parent_msg";
  title: string;
  body: string;
  created_at: string;
  href: string;
};

type TodayStudent = {
  id: string;
  name: string;
  grade: string;
  firstAt: string | null;   // 授業予定の時刻（出席曜日のみの生徒は null）
  subjects: string[];
  karte: StudentKarteJson | null;
  karteAt: string | null;
  tasksDone: number;
  tasksTotal: number;
  lastProgress: string | null;
};

type EventRow = { id: string; title: string; event_type: string; date: string };

const EVENT_ICON: Record<string, string> = { event: "🎉", exam: "📝", holiday: "🏖", class: "📚", info: "ℹ️" };

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function endOfToday() { const d = new Date(); d.setHours(23, 59, 59, 999); return d; }
function daysSince(date: string | null): number | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const then = new Date(y, m - 1, d).getTime();
  return Math.floor((startOfToday().getTime() - then) / 86_400_000);
}

const QUICK_ACTIONS = [
  { title: "テスト作成", desc: "AIでボタン1つで問題作成・配布", href: "/teacher/dashboard/tests" },
  { title: "報告書を書く", desc: "手動作成・未送信の送信", href: "/teacher/dashboard/reports" },
  { title: "教材進捗を入力", desc: "何をどこまで・理解度", href: "/teacher/dashboard/progress" },
  ...(FEATURES.dailyKarte ? [{ title: "カルテ（日次）", desc: "現状＋今日やることの一覧・一括生成", href: "/teacher/dashboard/karte-daily" }] : []),
  { title: "生徒・講師管理", desc: "生徒一覧から操作卓へ", href: "/teacher/dashboard/schools" },
  { title: "メッセージ", desc: "保護者・生徒との連絡", href: "/teacher/dashboard/messages" },
  { title: "多層診断", desc: "学力・学習習慣・学習の質", href: "/teacher/dashboard/diagnosis" },
  { title: "塾内経済（AC・株）", desc: "承認・株主の声・株価", href: "/teacher/dashboard/economy" },
];

export default function TeacherDashboardPage() {
  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  const [counts, setCounts] = useState<Counts | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [todayStudents, setTodayStudents] = useState<TodayStudent[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [failedNotifications, setFailedNotifications] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyKarte, setBusyKarte] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const todayStart = startOfToday().toISOString();
    const todayEnd = endOfToday().toISOString();
    const todayKey = keyOf(new Date());

    // ── B: さばくインボックスの件数 ──
    const [
      { count: pendingReschedules },
      { count: unreadParent },
      { count: unreadStudent },
      { count: pendingDiagnoses },
      { count: draftReports },
      { count: concerns },
      { count: ecoApprovals },
      { count: ecoVoices },
      { count: ecoReferrals },
    ] = await Promise.all([
      supabase.from("reschedule_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("parent_messages").select("*", { count: "exact", head: true }).eq("status", "unread").eq("direction", "parent_to_teacher"),
      supabase.from("student_messages").select("*", { count: "exact", head: true }).eq("status", "unread").eq("direction", "student_to_teacher"),
      supabase.from("questionnaire_responses").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("lesson_reports").select("*", { count: "exact", head: true }).eq("status", "draft"),
      supabase.from("collaboration_tasks").select("*", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("reward_exchanges").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("shareholder_voices").select("*", { count: "exact", head: true }).neq("status", "done"),
      supabase.from("referral_rewards").select("*", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    setCounts({
      pendingReschedules: pendingReschedules ?? 0,
      unreadParentMessages: unreadParent ?? 0,
      unreadStudentMessages: unreadStudent ?? 0,
      pendingDiagnoses: pendingDiagnoses ?? 0,
      draftReports: draftReports ?? 0,
      concerns: concerns ?? 0,
      economyApprovals: ecoApprovals ?? 0,
      economyVoices: ecoVoices ?? 0,
      economyReferrals: ecoReferrals ?? 0,
    });

    // ── A: 今日授業する生徒 × カルテ ──
    const { data: lessonRows } = await supabase
      .from("lessons")
      .select("student_id, subject, scheduled_at, students(name, grade)")
      .gte("scheduled_at", todayStart).lte("scheduled_at", todayEnd).neq("status", "canceled")
      .order("scheduled_at", { ascending: true });

    const map = new Map<string, TodayStudent>();
    for (const l of (lessonRows ?? []) as {
      student_id: string | null; subject: string | null; scheduled_at: string;
      students: { name: string; grade: string } | { name: string; grade: string }[] | null;
    }[]) {
      if (!l.student_id) continue;
      const stu = Array.isArray(l.students) ? l.students[0] : l.students;
      if (!map.has(l.student_id)) {
        map.set(l.student_id, {
          id: l.student_id, name: stu?.name ?? "—", grade: stu?.grade ?? "",
          firstAt: l.scheduled_at, subjects: [], karte: null, karteAt: null,
          tasksDone: 0, tasksTotal: 0, lastProgress: null,
        });
      }
      const e = map.get(l.student_id)!;
      if (l.subject && !e.subjects.includes(l.subject)) e.subjects.push(l.subject);
    }

    // 出席曜日が今日を含む生徒も加える（授業予定が無くても拾う。カレンダー画面と同じ論理）
    const todayLabel = ["日", "月", "火", "水", "木", "金", "土"][new Date().getDay()];
    const { data: attStudents } = await supabase
      .from("students")
      .select("id, name, grade, attendance_days")
      .contains("attendance_days", [todayLabel]);
    for (const s of (attStudents ?? []) as { id: string; name: string; grade: string; attendance_days: string[] | null }[]) {
      if (!map.has(s.id)) {
        map.set(s.id, { id: s.id, name: s.name, grade: s.grade, firstAt: null, subjects: [], karte: null, karteAt: null, tasksDone: 0, tasksTotal: 0, lastProgress: null });
      }
    }

    const ids = [...map.keys()];
    if (ids.length > 0) {
      const [{ data: karteRows }, { data: taskRows }, { data: progRows }] = await Promise.all([
        supabase.from("student_karte").select("student_id, karte_json, generated_at").in("student_id", ids),
        supabase.from("daily_tasks").select("student_id, done").eq("task_date", todayKey).in("student_id", ids),
        supabase.from("textbook_progress").select("student_id, lesson_date").in("student_id", ids).order("lesson_date", { ascending: false }),
      ]);
      for (const k of (karteRows ?? []) as { student_id: string; karte_json: StudentKarteJson | null; generated_at: string }[]) {
        const e = map.get(k.student_id); if (e) { e.karte = k.karte_json; e.karteAt = k.generated_at; }
      }
      for (const t of (taskRows ?? []) as { student_id: string; done: boolean }[]) {
        const e = map.get(t.student_id); if (e) { e.tasksTotal++; if (t.done) e.tasksDone++; }
      }
      for (const p of (progRows ?? []) as { student_id: string; lesson_date: string }[]) {
        const e = map.get(p.student_id); if (e && !e.lastProgress) e.lastProgress = p.lesson_date;
      }
    }
    // 授業予定あり（時刻順）→ 出席曜日のみ（氏名順）
    setTodayStudents([...map.values()].sort((a, b) => {
      if (a.firstAt && b.firstAt) return a.firstAt.localeCompare(b.firstAt);
      if (a.firstAt) return -1;
      if (b.firstAt) return 1;
      return a.name.localeCompare(b.name, "ja");
    }));

    // ── C: 今日の教室（行事・テスト） ──
    const { data: evRows } = await supabase
      .from("shift_events")
      .select("id, title, event_type, date")
      .eq("date", todayKey)
      .eq("visible_to_teachers", true);
    setEvents((evRows as EventRow[]) ?? []);

    // 直近のアクティビティ
    const [{ data: reports }, { data: diags }, { data: rescheds }, { data: pmsgs }] = await Promise.all([
      supabase.from("lesson_reports").select("id, student_name, test_title, created_at").order("created_at", { ascending: false }).limit(5),
      supabase.from("questionnaire_responses").select("id, student_name, subject, created_at, status").order("created_at", { ascending: false }).limit(5),
      supabase.from("reschedule_requests").select("id, parents(name), lessons(subject), proposed_at, status, created_at").order("created_at", { ascending: false }).limit(5),
      supabase.from("parent_messages").select("id, parent_name, subject, created_at, direction").eq("direction", "parent_to_teacher").order("created_at", { ascending: false }).limit(5),
    ]);
    const items: ActivityItem[] = [];
    for (const r of reports ?? []) items.push({ id: `r-${r.id}`, kind: "report", title: `${r.student_name} の報告書`, body: r.test_title, created_at: r.created_at, href: "/teacher/dashboard/reports" });
    for (const d of diags ?? []) items.push({ id: `d-${d.id}`, kind: "diagnosis", title: `${d.student_name} の多層診断（${d.status === "pending" ? "未分析" : d.status === "analyzed" ? "分析済" : "承認済"}）`, body: d.subject ?? "—", created_at: d.created_at, href: "/teacher/dashboard/diagnosis" });
    for (const r of rescheds ?? []) {
      const p = Array.isArray(r.parents) ? r.parents[0] : r.parents;
      const l = Array.isArray(r.lessons) ? r.lessons[0] : r.lessons;
      items.push({ id: `s-${r.id}`, kind: "reschedule", title: `振替申請（${r.status === "pending" ? "申請中" : r.status === "approved" ? "承認" : "不可"}）`, body: `${p?.name ?? "—"} ・ ${l?.subject ?? "—"}`, created_at: r.created_at, href: FEATURES.separateSchedulePages ? "/teacher/dashboard/reschedules" : "/teacher/dashboard/calendar" });
    }
    for (const m of pmsgs ?? []) items.push({ id: `m-${m.id}`, kind: "parent_msg", title: `保護者メッセージ：${m.parent_name ?? "—"}`, body: m.subject ?? "(件名なし)", created_at: m.created_at, href: "/teacher/dashboard/messages" });
    items.sort((a, b) => b.created_at.localeCompare(a.created_at));
    setActivity(items.slice(0, 8));

    const past24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: failedCount } = await supabase.from("notification_log").select("*", { count: "exact", head: true }).eq("status", "failed").gte("created_at", past24h);
    setFailedNotifications(failedCount ?? 0);

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const regenerateKarte = async (id: string, name: string) => {
    setBusyKarte(id);
    try {
      const res = await authFetch("/api/karte/daily-view/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: id }),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error, "error"); return; }
      showToast(`${name} のカルテを更新しました`, "success");
      await load();
    } catch (e) {
      showToast("再生成に失敗しました: " + String(e), "error");
    } finally {
      setBusyKarte(null);
    }
  };

  const inbox = counts ? [
    { label: "保護者からの未読", count: counts.unreadParentMessages, href: "/teacher/dashboard/messages" },
    { label: "生徒からの未読", count: counts.unreadStudentMessages, href: "/teacher/dashboard/messages" },
    { label: "申請中の振替", count: counts.pendingReschedules, href: FEATURES.separateSchedulePages ? "/teacher/dashboard/reschedules" : "/teacher/dashboard/calendar" },
    { label: "未分析の診断", count: counts.pendingDiagnoses, href: "/teacher/dashboard/diagnosis" },
    { label: "未送信の報告書", count: counts.draftReports, href: "/teacher/dashboard/reports" },
    { label: "気がかりな生徒", count: counts.concerns, href: "/teacher/dashboard/collaboration" },
    { label: "報酬交換の承認", count: counts.economyApprovals, href: "/teacher/dashboard/economy" },
    ...(ECON.voice ? [{ label: "株主の声", count: counts.economyVoices, href: "/teacher/dashboard/economy" }] : []),
    ...(ECON.referral ? [{ label: "友達紹介の申請", count: counts.economyReferrals, href: "/teacher/dashboard/economy" }] : []),
  ].filter((i) => i.count > 0) : [];

  return (
    <div className="px-4 py-4 sm:px-8 sm:py-8">
      <div className="mb-6">
        <p className="text-sm text-slate-400">{today}</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">今日のホーム</h1>
        <p className="mt-1 text-sm text-slate-500">今日授業する生徒と、さばくことをここから。</p>
      </div>

      {failedNotifications > 0 && (
        <Link href="/teacher/dashboard/notifications?status=failed"
          className="mb-6 block rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 transition hover:bg-red-100">
          <p className="text-sm font-semibold">直近24時間に通知の送信失敗が {failedNotifications} 件あります → 通知ログで確認</p>
        </Link>
      )}

      {/* ── B: 今日さばくこと ── */}
      <section className="mb-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">今日さばくこと</h2>
        {loading ? (
          <div className="flex flex-wrap gap-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-9 w-32 rounded-full" />)}</div>
        ) : inbox.length === 0 ? (
          <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">今さばくものはありません 🎉</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {inbox.map((i) => (
              <Link key={i.label} href={i.href}
                className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100">
                {i.label}
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">{i.count}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── A: 今日の授業（生徒 × カルテ） ── */}
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-bold text-slate-900">
          今日の生徒{!loading && `（${todayStudents.length}人）`}
        </h2>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[1,2,3].map((i) => (
              <div key={i} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        ) : todayStudents.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white py-12 text-center text-slate-500">
            <p className="text-3xl mb-2">🗓️</p>
            <p className="font-semibold text-slate-700">今日来る生徒がいません</p>
            <p className="mt-1 text-sm text-slate-400">生徒管理で「出席曜日」を入れると、その曜日に自動でここへ並びます。</p>
            <Link href="/teacher/dashboard/schools" className="mt-4 inline-block rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">生徒の出席曜日を入力する →</Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {todayStudents.map((s) => {
              const stale = daysSince(s.lastProgress);
              const isStale = stale == null || stale >= 7;
              return (
                <div key={s.id} className="flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <Link href={`/teacher/dashboard/students/${s.id}`} className="block px-5 pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-slate-900">{s.name} <span className="text-xs font-normal text-slate-400">{s.grade}</span></p>
                      <span className="shrink-0 text-xs text-slate-400">
                        {s.firstAt ? new Date(s.firstAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "出席予定"}
                        {s.subjects.length > 0 && ` ・ ${s.subjects.join("・")}`}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        s.tasksTotal === 0 ? "bg-slate-100 text-slate-500"
                        : s.tasksDone === s.tasksTotal ? "bg-emerald-100 text-emerald-700" : "bg-emerald-50 text-emerald-700"
                      }`}>
                        今日のTODO {s.tasksTotal === 0 ? "なし" : `${s.tasksDone}/${s.tasksTotal}`}
                      </span>
                      {isStale && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                          進捗{stale == null ? "未入力" : `${stale}日空き`}
                        </span>
                      )}
                      {FEATURES.dailyKarte && !s.karte && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">カルテ未生成</span>
                      )}
                    </div>

                    {s.karte?.cautions && (
                      <p className="mt-2 line-clamp-2 text-xs text-slate-600"><span className="font-semibold text-amber-600">⚠️ </span>{s.karte.cautions}</p>
                    )}
                    {s.karte?.textbookPace && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500"><span className="font-semibold text-indigo-500">📖 </span>{s.karte.textbookPace}</p>
                    )}
                    {s.karte?.parentNeeds && (
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500"><span className="font-semibold">👪 </span>{s.karte.parentNeeds}</p>
                    )}
                  </Link>

                  {/* 授業後の締め導線 */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-5 py-2.5">
                    <Link href={`/teacher/dashboard/students/${s.id}`} className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-900">操作卓</Link>
                    <Link href="/teacher/dashboard/progress" className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">進捗入力</Link>
                    <Link href="/teacher/dashboard/reports" className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">報告書</Link>
                    {FEATURES.dailyKarte && (
                      <button onClick={() => regenerateKarte(s.id, s.name)} disabled={busyKarte === s.id}
                        className="ml-auto rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-40">
                        {busyKarte === s.id ? "更新中…" : "カルテ再生成"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── C: 今日の教室 ── */}
      {!loading && (events.length > 0 || todayStudents.some((s) => { const d = daysSince(s.lastProgress); return d == null || d >= 7; })) && (
        <section className="mb-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">今日の行事・テスト</h3>
            {events.length === 0 ? (
              <p className="text-xs text-slate-400">今日の行事はありません。</p>
            ) : (
              <ul className="space-y-1.5">
                {events.map((e) => (
                  <li key={e.id} className="text-sm text-slate-700">{EVENT_ICON[e.event_type] ?? "•"} {e.title}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-amber-900">進捗が空いている子（今日の生徒）</h3>
            {(() => {
              const staleList = todayStudents.filter((s) => { const d = daysSince(s.lastProgress); return d == null || d >= 7; });
              return staleList.length === 0 ? (
                <p className="text-xs text-amber-700">なし。今日の生徒は進捗が新しいです。</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {staleList.map((s) => (
                    <Link key={s.id} href={`/teacher/dashboard/students/${s.id}`}
                      className="rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100">
                      {s.name}
                    </Link>
                  ))}
                </div>
              );
            })()}
          </div>
        </section>
      )}

      {/* 直近のアクティビティ */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">直近のアクティビティ</h2>
        {loading ? (
          <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}</div>
        ) : activity.length === 0 ? (
          <p className="text-sm text-slate-400">記録されたアクティビティはありません。</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {activity.map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="block rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 transition hover:bg-white hover:border-slate-200">
                  <div className="flex items-center gap-2">
                    <KindDot kind={a.kind} />
                    <p className="flex-1 truncate text-sm font-semibold text-slate-800">{a.title}</p>
                    <span className="shrink-0 text-xs text-slate-400">{new Date(a.created_at).toLocaleString("ja-JP", { month: "short", day: "numeric" })}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{a.body}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* クイックアクション */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">その他の操作</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {QUICK_ACTIONS.map((item) => (
            <Link key={item.title} href={item.href}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
              <p className="font-semibold text-slate-900">{item.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">{item.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function KindDot({ kind }: { kind: ActivityItem["kind"] }) {
  const map = { report: "bg-rose-400", diagnosis: "bg-violet-400", reschedule: "bg-amber-400", parent_msg: "bg-indigo-400" };
  return <span className={`h-2 w-2 shrink-0 rounded-full ${map[kind]}`} />;
}
