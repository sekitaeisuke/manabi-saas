"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type Counts = {
  students: number;
  parents: number;
  todayLessons: number;
  weekLessons: number;
  pendingReschedules: number;
  unreadParentMessages: number;
  unreadStudentMessages: number;
  pendingDiagnoses: number;
};

type ActivityItem = {
  id: string;
  kind: "report" | "diagnosis" | "reschedule" | "parent_msg";
  title: string;
  body: string;
  created_at: string;
  href: string;
};

const QUICK_ACTIONS = [
  {
    title: "来塾カレンダー",
    desc: "生徒の来塾予定・テスト割当・授業予定を一覧",
    href: "/teacher/dashboard/calendar",
    color: "bg-teal-50 border-teal-200 hover:border-teal-400",
    iconBg: "bg-teal-100",
    iconColor: "text-teal-600",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: "授業予定",
    desc: "生徒ごとの授業を作成・編集・状態管理",
    href: "/teacher/dashboard/lessons",
    color: "bg-indigo-50 border-indigo-200 hover:border-indigo-400",
    iconBg: "bg-indigo-100",
    iconColor: "text-indigo-600",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "診断テスト作成",
    desc: "AIで問題を自動生成し、URLで生徒に配布",
    href: "/teacher/dashboard/tests",
    color: "bg-blue-50 border-blue-200 hover:border-blue-400",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: "多層診断システム",
    desc: "学力・学習量・学習の質を多角的に診断",
    href: "/teacher/dashboard/diagnosis",
    color: "bg-violet-50 border-violet-200 hover:border-violet-400",
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    title: "生徒・講師管理",
    desc: "校舎・講師・生徒の登録と管理",
    href: "/teacher/dashboard/schools",
    color: "bg-emerald-50 border-emerald-200 hover:border-emerald-400",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    title: "保護者管理",
    desc: "保護者アカウント作成と生徒との紐付け",
    href: "/teacher/dashboard/parents",
    color: "bg-sky-50 border-sky-200 hover:border-sky-400",
    iconBg: "bg-sky-100",
    iconColor: "text-sky-600",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    title: "メッセージ",
    desc: "保護者・生徒との連絡、お知らせ配信",
    href: "/teacher/dashboard/messages",
    color: "bg-amber-50 border-amber-200 hover:border-amber-400",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    title: "振替リクエスト",
    desc: "保護者からの振替申請を承認 / 不可で返答",
    href: "/teacher/dashboard/reschedules",
    color: "bg-rose-50 border-rose-200 hover:border-rose-400",
    iconBg: "bg-rose-100",
    iconColor: "text-rose-600",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M5 15a9 9 0 0014.65 3.36M19 9a9 9 0 00-14.65-3.36" />
      </svg>
    ),
  },
];

function startOfToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}
function endOfToday() {
  const d = new Date(); d.setHours(23, 59, 59, 999); return d;
}
function startOfWeek() {
  const d = startOfToday();
  d.setDate(d.getDate() - d.getDay()); return d;
}
function endOfWeek() {
  const d = startOfWeek();
  d.setDate(d.getDate() + 7); d.setMilliseconds(-1); return d;
}

export default function TeacherDashboardPage() {
  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  const [counts, setCounts] = useState<Counts | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [failedNotifications, setFailedNotifications] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const todayStart = startOfToday().toISOString();
    const todayEnd = endOfToday().toISOString();
    const weekStart = startOfWeek().toISOString();
    const weekEnd = endOfWeek().toISOString();

    const [
      { count: studentsCount },
      { count: parentsCount },
      { count: todayLessons },
      { count: weekLessons },
      { count: pendingReschedules },
      { count: unreadParent },
      { count: unreadStudent },
      { count: pendingDiagnoses },
    ] = await Promise.all([
      supabase.from("students").select("*", { count: "exact", head: true }),
      supabase.from("parents").select("*", { count: "exact", head: true }),
      supabase.from("lessons").select("*", { count: "exact", head: true }).gte("scheduled_at", todayStart).lte("scheduled_at", todayEnd).neq("status", "canceled"),
      supabase.from("lessons").select("*", { count: "exact", head: true }).gte("scheduled_at", weekStart).lte("scheduled_at", weekEnd).neq("status", "canceled"),
      supabase.from("reschedule_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("parent_messages").select("*", { count: "exact", head: true }).eq("status", "unread").eq("direction", "parent_to_teacher"),
      supabase.from("student_messages").select("*", { count: "exact", head: true }).eq("status", "unread").eq("direction", "student_to_teacher"),
      supabase.from("questionnaire_responses").select("*", { count: "exact", head: true }).eq("status", "pending"),
    ]);

    setCounts({
      students: studentsCount ?? 0,
      parents: parentsCount ?? 0,
      todayLessons: todayLessons ?? 0,
      weekLessons: weekLessons ?? 0,
      pendingReschedules: pendingReschedules ?? 0,
      unreadParentMessages: unreadParent ?? 0,
      unreadStudentMessages: unreadStudent ?? 0,
      pendingDiagnoses: pendingDiagnoses ?? 0,
    });

    const [
      { data: reports },
      { data: diags },
      { data: rescheds },
      { data: pmsgs },
    ] = await Promise.all([
      supabase.from("lesson_reports").select("id, student_name, test_title, created_at").order("created_at", { ascending: false }).limit(5),
      supabase.from("questionnaire_responses").select("id, student_name, subject, created_at, status").order("created_at", { ascending: false }).limit(5),
      supabase.from("reschedule_requests").select("id, parents(name), lessons(subject), proposed_at, status, created_at").order("created_at", { ascending: false }).limit(5),
      supabase.from("parent_messages").select("id, parent_name, subject, created_at, direction").eq("direction", "parent_to_teacher").order("created_at", { ascending: false }).limit(5),
    ]);

    const items: ActivityItem[] = [];
    for (const r of reports ?? []) {
      items.push({
        id: `r-${r.id}`, kind: "report",
        title: `${r.student_name} の報告書`,
        body: r.test_title,
        created_at: r.created_at,
        href: "/teacher/dashboard/reports",
      });
    }
    for (const d of diags ?? []) {
      items.push({
        id: `d-${d.id}`, kind: "diagnosis",
        title: `${d.student_name} の多層診断（${d.status === "pending" ? "未分析" : d.status === "analyzed" ? "分析済" : "承認済"}）`,
        body: d.subject ?? "—",
        created_at: d.created_at,
        href: "/teacher/dashboard/diagnosis",
      });
    }
    for (const r of rescheds ?? []) {
      const p = Array.isArray(r.parents) ? r.parents[0] : r.parents;
      const l = Array.isArray(r.lessons) ? r.lessons[0] : r.lessons;
      items.push({
        id: `s-${r.id}`, kind: "reschedule",
        title: `振替申請（${r.status === "pending" ? "申請中" : r.status === "approved" ? "承認" : "不可"}）`,
        body: `${p?.name ?? "—"} ・ ${l?.subject ?? "—"} → ${new Date(r.proposed_at).toLocaleString("ja-JP")}`,
        created_at: r.created_at,
        href: "/teacher/dashboard/reschedules",
      });
    }
    for (const m of pmsgs ?? []) {
      items.push({
        id: `m-${m.id}`, kind: "parent_msg",
        title: `保護者メッセージ：${m.parent_name ?? "—"}`,
        body: m.subject ?? "(件名なし)",
        created_at: m.created_at,
        href: "/teacher/dashboard/messages",
      });
    }
    items.sort((a, b) => b.created_at.localeCompare(a.created_at));
    setActivity(items.slice(0, 10));

    const past24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: failedCount } = await supabase
      .from("notification_log")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", past24h);
    setFailedNotifications(failedCount ?? 0);

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="px-4 py-4 sm:px-8 sm:py-8">
      <div className="mb-6">
        <p className="text-sm text-slate-400">{today}</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">ダッシュボード</h1>
        <p className="mt-1 text-sm text-slate-500">今日も生徒の成長をサポートしましょう。</p>
      </div>

      {failedNotifications > 0 && (
        <Link href="/teacher/dashboard/notifications?status=failed"
          className="mb-6 block rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 transition hover:bg-red-100">
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold">直近24時間に通知の送信失敗が {failedNotifications} 件あります</p>
              <p className="mt-0.5 text-xs">クリックして通知ログで詳細を確認 →</p>
            </div>
          </div>
        </Link>
      )}

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="今日の授業"     value={counts?.todayLessons}        loading={loading} />
        <KpiCard label="今週の授業"     value={counts?.weekLessons}         loading={loading} />
        <KpiCard label="申請中の振替"   value={counts?.pendingReschedules}  loading={loading} alert  href="/teacher/dashboard/reschedules" />
        <KpiCard label="未分析の診断"   value={counts?.pendingDiagnoses}    loading={loading} alert  href="/teacher/dashboard/diagnosis" />
        <KpiCard label="保護者からの未読" value={counts?.unreadParentMessages} loading={loading} alert href="/teacher/dashboard/messages" />
        <KpiCard label="生徒からの未読"   value={counts?.unreadStudentMessages} loading={loading} alert href="/teacher/dashboard/messages" />
        <KpiCard label="生徒数"         value={counts?.students}            loading={loading} href="/teacher/dashboard/schools" />
        <KpiCard label="保護者数"       value={counts?.parents}             loading={loading} href="/teacher/dashboard/parents" />
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-[2fr_3fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">直近のアクティビティ</h2>
          {loading ? (
            <p className="text-sm text-slate-400">読み込み中...</p>
          ) : activity.length === 0 ? (
            <p className="text-sm text-slate-400">記録されたアクティビティはありません。</p>
          ) : (
            <ul className="space-y-3">
              {activity.map((a) => (
                <li key={a.id}>
                  <Link href={a.href} className="block rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 transition hover:bg-white hover:border-slate-200">
                    <div className="flex items-center gap-2">
                      <KindDot kind={a.kind} />
                      <p className="flex-1 truncate text-sm font-semibold text-slate-800">{a.title}</p>
                      <span className="shrink-0 text-xs text-slate-400">
                        {new Date(a.created_at).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{a.body}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50">
              <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">システム稼働中</p>
              <p className="text-xs text-slate-400">Supabase ・ Claude AI ・ OpenAI GPT-4o</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-medium text-emerald-600">正常</span>
            </div>
          </div>
          <div className="space-y-2 text-xs text-slate-500">
            <p>・ 保護者ポータルは <code>/login/parent</code> から</p>
            <p>・ 振替リクエスト・保護者メッセージは右上のサイドバーバッジで件数を確認できます</p>
            <p>・ 多層診断と報告書は status=approved / sent になって初めて保護者画面に表示されます</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">クイックアクション</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {QUICK_ACTIONS.map((item) => (
            <Link key={item.title} href={item.href}
              className={`group flex items-start gap-4 rounded-2xl border bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${item.color}`}>
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.iconBg}`}>
                <span className={item.iconColor}>{item.icon}</span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{item.title}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  label, value, loading, alert, href,
}: { label: string; value: number | undefined; loading: boolean; alert?: boolean; href?: string }) {
  const v = value ?? 0;
  const tone = alert && v > 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-white";
  const text = alert && v > 0 ? "text-red-700" : "text-slate-900";
  const content = (
    <div className={`rounded-2xl border ${tone} p-4 shadow-sm`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${text}`}>
        {loading ? <span className="inline-block h-6 w-12 animate-pulse rounded bg-slate-200" /> : v.toLocaleString()}
      </p>
    </div>
  );
  return href ? <Link href={href} className="block transition hover:-translate-y-0.5">{content}</Link> : content;
}

function KindDot({ kind }: { kind: ActivityItem["kind"] }) {
  const map = {
    report:     "bg-rose-400",
    diagnosis:  "bg-violet-400",
    reschedule: "bg-amber-400",
    parent_msg: "bg-indigo-400",
  };
  return <span className={`h-2 w-2 shrink-0 rounded-full ${map[kind]}`} />;
}
