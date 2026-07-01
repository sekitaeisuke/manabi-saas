"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Logo, LogoIcon } from "@/components/Logo";
import { supabase } from "@/lib/supabase";

type BadgeKey = "pending" | "unread" | "resched";
type NavLeaf = { href: string; label: string; iconKey: IconKey; badge?: BadgeKey; adminOnly?: boolean };
type NavGroup = { key: string; label: string; iconKey: IconKey; items: NavLeaf[] };

// ── アイコン（line/path 部分のみ。Svg でラップ） ───────────────
type IconKey =
  | "home" | "doc" | "chart" | "bars" | "checkDoc" | "users" | "parents"
  | "card" | "book" | "calendar" | "clockCal" | "refresh" | "shiftAdmin"
  | "clock" | "table" | "face" | "mail" | "bell" | "gear" | "collab";

const ICONS: Record<IconKey, React.ReactNode> = {
  home: <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
  doc: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
  chart: <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
  bars: <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />,
  checkDoc: <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />,
  users: <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />,
  parents: <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
  card: <path strokeLinecap="round" strokeLinejoin="round" d="M16 4v12l-4-2-4 2V4M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />,
  book: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />,
  calendar: <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />,
  clockCal: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />,
  refresh: <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M5 15a9 9 0 0014.65 3.36M19 9a9 9 0 00-14.65-3.36" />,
  shiftAdmin: <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />,
  clock: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />,
  table: <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />,
  face: <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zM12 2a10 10 0 100 20A10 10 0 0012 2z" />,
  mail: <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />,
  bell: <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />,
  gear: <><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>,
  collab: <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />,
};

function Svg({ k, className = "h-5 w-5" }: { k: IconKey; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      {ICONS[k]}
    </svg>
  );
}

// ── ダッシュボード（単独・最上部） ───────────────────────────
const DASHBOARD: NavLeaf = { href: "/teacher/dashboard", label: "ダッシュボード", iconKey: "home" };

// ── 6グループ（マウスon でフライアウト展開） ──────────────────
const GROUPS: NavGroup[] = [
  { key: "tests", label: "テスト", iconKey: "doc", items: [
    { href: "/teacher/dashboard/tests",       label: "診断テスト",        iconKey: "doc",      badge: "pending" },
    { href: "/teacher/dashboard/diagnosis",   label: "多層診断",          iconKey: "chart",    badge: "pending" },
    { href: "/teacher/dashboard/analysis",    label: "分析",              iconKey: "bars" },
    { href: "/teacher/dashboard/results",     label: "テスト結果・答案",  iconKey: "checkDoc" },
  ]},
  { key: "students", label: "生徒", iconKey: "users", items: [
    { href: "/teacher/dashboard/schools",       label: "生徒・講師管理", iconKey: "users" },
    { href: "/teacher/dashboard/parents",       label: "保護者管理",     iconKey: "parents" },
    { href: "/teacher/dashboard/karte",         label: "3か月ビジョン",  iconKey: "card" },
    { href: "/teacher/dashboard/karte-daily",   label: "カルテ",         iconKey: "card" },
    { href: "/teacher/dashboard/reports",       label: "報告書",         iconKey: "doc" },
    { href: "/teacher/dashboard/progress",      label: "教材進捗",       iconKey: "book" },
    { href: "/teacher/dashboard/collaboration", label: "講師連携",       iconKey: "collab" },
  ]},
  { key: "schedule", label: "予定", iconKey: "calendar", items: [
    { href: "/teacher/dashboard/calendar",     label: "来塾カレンダー", iconKey: "calendar",   badge: "resched" },
    { href: "/teacher/dashboard/lessons",      label: "授業予定",       iconKey: "clockCal",   badge: "resched" },
    { href: "/teacher/dashboard/reschedules",  label: "振替リクエスト", iconKey: "refresh",    badge: "resched" },
    { href: "/teacher/dashboard/shifts",       label: "シフト希望",     iconKey: "calendar" },
    { href: "/teacher/dashboard/shifts/admin", label: "シフト管理",     iconKey: "shiftAdmin", adminOnly: true },
  ]},
  { key: "attendance", label: "勤怠", iconKey: "clock", items: [
    { href: "/teacher/dashboard/attendance",       label: "出退勤",       iconKey: "clock" },
    { href: "/teacher/dashboard/attendance/admin", label: "出勤怠集計",   iconKey: "table", adminOnly: true },
    { href: "/teacher/dashboard/face-enrollment",  label: "顔登録",       iconKey: "face" },
  ]},
  { key: "comms", label: "連絡", iconKey: "mail", items: [
    { href: "/teacher/dashboard/messages",      label: "メッセージ", iconKey: "mail", badge: "unread" },
    { href: "/teacher/dashboard/notifications", label: "通知ログ",   iconKey: "bell", badge: "unread" },
    { href: "/teacher/dashboard/settings",      label: "通知設定",   iconKey: "gear" },
  ]},
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState<"admin" | "teacher" | "part-time">("teacher");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingReschedules, setPendingReschedules] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace("/login"); return; }
      const email = session.user.email ?? "";
      setUserEmail(email);
      const { data: teacher } = await supabase.from("teachers").select("role").eq("email", email).single();
      if (teacher) setUserRole(teacher.role);
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) router.replace("/");
    });
    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    const fetchCounts = async () => {
      const [{ count: pending }, { count: unread }, { count: resched }] = await Promise.all([
        supabase.from("questionnaire_responses").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("parent_messages").select("*", { count: "exact", head: true }).eq("status", "unread"),
        supabase.from("reschedule_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      setPendingCount(pending ?? 0);
      setUnreadMessages(unread ?? 0);
      setPendingReschedules(resched ?? 0);
    };
    fetchCounts();
    const timer = setInterval(fetchCounts, 60000);
    return () => clearInterval(timer);
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  const badgeMap: Record<BadgeKey, number> = {
    pending: pendingCount, unread: unreadMessages, resched: pendingReschedules,
  };
  const leafBadge = (item: NavLeaf) => (item.badge ? badgeMap[item.badge] : 0);
  const visibleItems = (g: NavGroup) => g.items.filter((it) => !it.adminOnly || userRole === "admin");
  const groupBadge = (g: NavGroup) => visibleItems(g).reduce((sum, it) => sum + leafBadge(it), 0);

  const isActive = (href: string) =>
    href === "/teacher/dashboard" ? pathname === href : pathname.startsWith(href);
  const groupActive = (g: NavGroup) => visibleItems(g).some((it) => isActive(it.href));

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-slate-400">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
          読み込み中...
        </div>
      </div>
    );
  }

  // 1件の子メニュー行（フライアウト／モバイルドロワー共通）
  const renderLeaf = (item: NavLeaf, onClick?: () => void) => {
    const active = isActive(item.href);
    const badge = leafBadge(item);
    return (
      <Link key={item.href} href={item.href} onClick={onClick}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
          active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`}>
        <span className={active ? "text-indigo-600" : "text-slate-400"}><Svg k={item.iconKey} /></span>
        {item.label}
        {badge > 0 && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
            {badge}
          </span>
        )}
        {active && badge === 0 && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-600" />}
      </Link>
    );
  };

  // ── PC：アイコン細レール＋ホバーで右にフライアウト ──────────
  const renderRail = () => (
    <aside className="flex h-full w-20 flex-col items-center bg-white">
      {/* ロゴ（アイコンのみ） */}
      <div className="flex h-16 w-full items-center justify-center border-b border-slate-100">
        <Link href="/teacher/dashboard" aria-label="ホーム">
          <LogoIcon size={34} />
        </Link>
      </div>

      <nav className="flex w-full flex-1 flex-col items-center gap-1 px-2 py-4">
        {/* ダッシュボード（単独・直リンク） */}
        <Link href={DASHBOARD.href} title={DASHBOARD.label}
          className={`flex w-full flex-col items-center gap-1 rounded-xl py-2 transition-colors ${
            isActive(DASHBOARD.href) ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          }`}>
          <Svg k={DASHBOARD.iconKey} />
          <span className="text-[10px] font-medium">ホーム</span>
        </Link>

        {GROUPS.map((g) => {
          const items = visibleItems(g);
          if (items.length === 0) return null;
          const active = groupActive(g);
          const badge = groupBadge(g);
          return (
            <div key={g.key} className="group relative w-full">
              <button
                className={`flex w-full flex-col items-center gap-1 rounded-xl py-2 transition-colors ${
                  active ? "bg-indigo-50 text-indigo-700" : "text-slate-500 group-hover:bg-slate-50 group-hover:text-slate-900"
                }`}>
                <span className="relative">
                  <Svg k={g.iconKey} />
                  {badge > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {badge}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium">{g.label}</span>
              </button>

              {/* フライアウト（左端からはみ出して右に表示・ホバー中だけ） */}
              <div className="invisible absolute left-full top-0 z-50 pl-2 opacity-0 transition-all duration-100 group-hover:visible group-hover:opacity-100">
                <div className="w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">{g.label}</p>
                  <div className="space-y-0.5">
                    {items.map((it) => renderLeaf(it))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* ユーザー・ログアウト */}
      <div className="group relative flex w-full flex-col items-center gap-2 border-t border-slate-100 p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700" title={userEmail}>
          {userEmail.slice(0, 1).toUpperCase()}
        </div>
        <button onClick={logout} title="ログアウト"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
        {/* ホバーでメール／役割 */}
        <div className="invisible absolute bottom-2 left-full z-50 pl-2 opacity-0 transition-all duration-100 group-hover:visible group-hover:opacity-100">
          <div className="w-56 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
            <p className="truncate text-xs font-medium text-slate-700">{userEmail}</p>
            <p className="text-xs text-slate-400">
              {userRole === "admin" ? "管理者" : userRole === "part-time" ? "非常勤講師" : "講師"}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );

  // ── モバイル：ドロワー（グループ見出し＋全項目） ──────────────
  const renderMobileMenu = () => (
    <aside className="flex h-full w-72 flex-col bg-white">
      <div className="flex h-16 items-center border-b border-slate-100 px-5">
        <Link href="/teacher/dashboard" onClick={() => setMobileOpen(false)}><Logo size="sm" /></Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-2">{renderLeaf(DASHBOARD, () => setMobileOpen(false))}</div>
        {GROUPS.map((g) => {
          const items = visibleItems(g);
          if (items.length === 0) return null;
          return (
            <div key={g.key} className="mb-3">
              <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{g.label}</p>
              <div className="space-y-0.5">{items.map((it) => renderLeaf(it, () => setMobileOpen(false)))}</div>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-slate-100 p-4 space-y-2">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
            {userEmail.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-slate-700">{userEmail}</p>
            <p className="text-xs text-slate-400">
              {userRole === "admin" ? "管理者" : userRole === "part-time" ? "非常勤講師" : "講師"}
            </p>
          </div>
        </div>
        <button onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          ログアウト
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* PC アイコンレール */}
      <div className="fixed inset-y-0 left-0 z-30 hidden w-20 border-r border-slate-200 shadow-sm lg:block">
        {renderRail()}
      </div>

      {/* モバイル オーバーレイ */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72">
            {renderMobileMenu()}
          </div>
        </div>
      )}

      {/* メインコンテンツ */}
      <div className="flex-1 lg:pl-20">
        {/* モバイル用トップバー */}
        <div className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white px-4 lg:hidden">
          <Link href="/teacher/dashboard"><Logo size="sm" /></Link>
        </div>

        <main className="min-h-screen pb-16 lg:pb-0">
          {children}
        </main>
      </div>

      {/* ボトムナビ（モバイル専用） */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 border-t border-slate-200 bg-white lg:hidden">
        <Link href="/teacher/dashboard"
          onClick={() => setMobileOpen(false)}
          className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
            isActive("/teacher/dashboard") ? "text-indigo-600" : "text-slate-500"
          }`}>
          {isActive("/teacher/dashboard") && (
            <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-indigo-600" />
          )}
          <Svg k="home" />
          <span className="text-[10px] font-medium">ホーム</span>
        </Link>

        <Link href="/teacher/dashboard/calendar"
          onClick={() => setMobileOpen(false)}
          className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
            isActive("/teacher/dashboard/calendar") ? "text-indigo-600" : "text-slate-500"
          }`}>
          {isActive("/teacher/dashboard/calendar") && (
            <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-indigo-600" />
          )}
          <span className="relative">
            <Svg k="calendar" />
            {pendingReschedules > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {pendingReschedules}
              </span>
            )}
          </span>
          <span className="text-[10px] font-medium">カレンダー</span>
        </Link>

        <Link href="/teacher/dashboard/tests"
          onClick={() => setMobileOpen(false)}
          className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
            isActive("/teacher/dashboard/tests") ? "text-indigo-600" : "text-slate-500"
          }`}>
          {isActive("/teacher/dashboard/tests") && (
            <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-indigo-600" />
          )}
          <span className="relative">
            <Svg k="doc" />
            {pendingCount > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </span>
          <span className="text-[10px] font-medium">テスト</span>
        </Link>

        <Link href="/teacher/dashboard/messages"
          onClick={() => setMobileOpen(false)}
          className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
            isActive("/teacher/dashboard/messages") ? "text-indigo-600" : "text-slate-500"
          }`}>
          {isActive("/teacher/dashboard/messages") && (
            <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-indigo-600" />
          )}
          <span className="relative">
            <Svg k="mail" />
            {unreadMessages > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {unreadMessages}
              </span>
            )}
          </span>
          <span className="text-[10px] font-medium">メッセージ</span>
        </Link>

        <button onClick={() => setMobileOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-slate-500 transition-colors hover:text-slate-700">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="text-[10px] font-medium">メニュー</span>
        </button>
      </nav>
    </div>
  );
}
