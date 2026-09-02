"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { supabase } from "@/lib/supabase";
import type { Student } from "@/lib/supabase";
import { useSelectedStudentId } from "@/lib/useSelectedStudent";
import { FEATURES } from "@/lib/features";
import { CountBadge, FullPageLoader, cx, inputClass } from "@/components/ui";

type ParentRow = { id: string; name: string; email: string };

const NAV = [
  { href: "/parent/dashboard",            label: "ダッシュボード" },
  { href: "/parent/dashboard/messages",   label: "メッセージ" },
  { href: "/parent/dashboard/calendar",   label: FEATURES.separateParentReschedulePage ? "授業カレンダー" : "授業カレンダー・振替" },
  // 振替リクエストは授業カレンダーに統合（false=独立ページを隠す）。
  ...(FEATURES.separateParentReschedulePage ? [{ href: "/parent/dashboard/reschedule", label: "振替リクエスト" }] : []),
  { href: "/parent/dashboard/reports",    label: "報告書" },
  { href: "/parent/dashboard/economy",    label: "ポイント・商店" },
  { href: "/parent/dashboard/karte",      label: "3か月ビジョン" },
  { href: "/parent/dashboard/diagnosis",  label: "多層診断" },
  { href: "/parent/dashboard/settings",   label: "通知設定" },
];

export default function ParentDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [parent, setParent] = useState<ParentRow | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedId, selectStudent] = useSelectedStudentId();
  const [unreadCount, setUnreadCount] = useState(0);
  // お月謝は、公開された月がひとつも無いうちはメニューに出さない。
  // 空の画面を見せて「まだ何も無いのか」と思わせないため。
  const [hasBilling, setHasBilling] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login/parent"); return; }

      const email = session.user.email!;
      const { data: p } = await supabase
        .from("parents")
        .select("id, name, email")
        .eq("email", email)
        .maybeSingle();

      if (!p) {
        await supabase.auth.signOut();
        router.replace("/login/parent");
        return;
      }

      const { data: links } = await supabase
        .from("parent_student_links")
        .select("student:students(*)")
        .eq("parent_id", p.id);

      const studentList: Student[] = (links ?? [])
        .map((l: { student: Student | Student[] | null }) => Array.isArray(l.student) ? l.student[0] : l.student)
        .filter((s): s is Student => Boolean(s));

      if (cancelled) return;

      setParent(p);
      setStudents(studentList);

      if (studentList.length > 0) {
        const stored = localStorage.getItem("parent.selectedStudentId");
        const isValid = stored && studentList.some((s) => s.id === stored);
        if (!isValid) selectStudent(studentList[0].id);
      }

      setChecking(false);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) router.replace("/login/parent");
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [router, selectStudent]);

  useEffect(() => {
    if (!parent) return;
    const fetchUnread = async () => {
      const { count } = await supabase
        .from("parent_messages")
        .select("*", { count: "exact", head: true })
        .eq("parent_id", parent.id)
        .eq("direction", "teacher_to_parent")
        .eq("parent_read", false);
      setUnreadCount(count ?? 0);
    };
    fetchUnread();
    const t = setInterval(fetchUnread, 60000);
    return () => clearInterval(t);
  }, [parent]);

  useEffect(() => {
    if (!parent) return;
    // RLS で「公開済みの自分の子ぶん」しか返らないので、1件でもあれば見せてよい。
    supabase.from("billing_months").select("id", { count: "exact", head: true })
      .then(({ count }) => setHasBilling((count ?? 0) > 0));
  }, [parent]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login/parent");
  };

  if (checking) return <FullPageLoader />;

  const isActive = (href: string) =>
    href === "/parent/dashboard" ? pathname === href : pathname.startsWith(href);

  const sidebar = (
    <aside className="flex h-full flex-col bg-surface">
      <div className="flex h-16 items-center border-b border-line px-5">
        <Link href="/parent/dashboard"><Logo size="sm" /></Link>
      </div>

      <div className="border-b border-line bg-canvas p-4">
        <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-ink-faint">
          表示中のお子さま
        </p>
        {students.length === 0 ? (
          <p className="rounded-field border border-caution-200 bg-caution-50 px-3 py-2 text-xs leading-5 text-caution-700">
            ひも付けされたお子さまがいません。塾にご連絡ください。
          </p>
        ) : students.length === 1 ? (
          <div className="flex items-center gap-3 rounded-field border border-line bg-surface px-3 py-2.5 shadow-card">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-brand-gradient text-sm font-bold text-white">
              {students[0].name.slice(0, 1)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-ink">{students[0].name}</span>
              <span className="block text-xs text-ink-faint">{students[0].grade}</span>
            </span>
          </div>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-xs text-ink-faint">お子さまを切り替え</span>
            <select
              value={selectedId ?? ""}
              onChange={(e) => selectStudent(e.target.value)}
              className={cx(inputClass, "font-semibold")}
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}（{s.grade}）</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <nav aria-label="メインナビゲーション" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-ink-faint">
          メニュー
        </p>
        {[
          ...NAV.slice(0, NAV.findIndex((n) => n.href === "/parent/dashboard/reports") + 1),
          ...(hasBilling ? [{ href: "/parent/dashboard/billing", label: "お月謝" }] : []),
          ...NAV.slice(NAV.findIndex((n) => n.href === "/parent/dashboard/reports") + 1),
        ].map((item) => {
          const active = isActive(item.href);
          const showBadge = item.href === "/parent/dashboard/messages" && unreadCount > 0;
          return (
            <Link key={item.href} href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex items-center gap-3 rounded-field px-3 py-2.5 text-sm transition duration-150",
                active
                  ? "bg-brand-50 font-semibold text-brand-700"
                  : "font-medium text-ink-muted hover:bg-canvas-sunken hover:text-ink",
              )}>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {showBadge ? <CountBadge count={unreadCount} /> : active ? (
                <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-brand-600" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-line p-4">
        <div className="rounded-field bg-canvas-sunken px-3 py-2.5">
          <p className="truncate text-xs font-semibold text-ink">{parent?.name}</p>
          <p className="truncate text-xs text-ink-faint">{parent?.email}</p>
        </div>
        <button onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-field border border-line-strong bg-surface py-2.5 text-sm font-semibold text-ink-muted transition hover:border-critical-200 hover:bg-critical-50 hover:text-critical-600">
          ログアウト
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line lg:block">
        {sidebar}
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 shadow-pop">
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex-1 lg:pl-60">
        <div className="sticky top-0 z-20 flex h-14 items-center border-b border-line bg-surface/85 px-4 backdrop-blur-md lg:hidden">
          <Link href="/parent/dashboard"><Logo size="sm" /></Link>
        </div>

        <main className="min-h-screen pb-20 lg:pb-0">{children}</main>
      </div>

      {/* ボトムナビ（モバイル専用） */}
      <nav
        aria-label="下部ナビゲーション"
        className="fixed bottom-0 left-0 right-0 z-30 flex h-16 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        {([
          {
            href: "/parent/dashboard",
            label: "ホーム",
            badge: 0,
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            ),
          },
          {
            href: "/parent/dashboard/messages",
            label: "メッセージ",
            badge: unreadCount,
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            ),
          },
          {
            href: "/parent/dashboard/calendar",
            label: "カレンダー",
            badge: 0,
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            ),
          },
          {
            href: "/parent/dashboard/reports",
            label: "報告書",
            badge: 0,
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            ),
          },
        ] as { href: string; label: string; badge: number; icon: React.ReactNode }[]).map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cx(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors",
                active ? "text-brand-600" : "text-ink-faint",
              )}>
              {active && <span aria-hidden className="absolute inset-x-4 top-0 h-0.5 rounded-pill bg-brand-600" />}
              <span className="relative">
                {item.icon}
                {item.badge > 0 && (
                  <CountBadge count={item.badge} className="absolute -right-2.5 -top-1.5 h-4 min-w-4 px-1 text-[0.5625rem]" />
                )}
              </span>
              <span className="text-[0.625rem] font-semibold">{item.label}</span>
            </Link>
          );
        })}
        <button onClick={() => setMobileOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-ink-faint transition-colors hover:text-ink">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="text-[0.625rem] font-semibold">メニュー</span>
        </button>
      </nav>
    </div>
  );
}
