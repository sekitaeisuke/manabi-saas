"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { supabase } from "@/lib/supabase";
import type { Student } from "@/lib/supabase";
import { useSelectedStudentId } from "@/lib/useSelectedStudent";

type ParentRow = { id: string; name: string; email: string };

const NAV = [
  { href: "/parent/dashboard",            label: "ダッシュボード" },
  { href: "/parent/dashboard/messages",   label: "メッセージ" },
  { href: "/parent/dashboard/calendar",   label: "授業カレンダー" },
  { href: "/parent/dashboard/reschedule", label: "振替リクエスト" },
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

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login/parent");
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-slate-400">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
          読み込み中...
        </div>
      </div>
    );
  }

  const isActive = (href: string) =>
    href === "/parent/dashboard" ? pathname === href : pathname.startsWith(href);

  const sidebar = (
    <aside className="flex h-full flex-col bg-white">
      <div className="flex h-16 items-center border-b border-slate-100 px-5">
        <Link href="/parent/dashboard"><Logo size="sm" /></Link>
      </div>

      <div className="border-b border-slate-100 bg-blue-50/60 p-4">
        <p className="mb-2 text-xs font-semibold text-blue-600">現在表示中のお子さま</p>
        {students.length === 0 ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            ひも付けされたお子さまがいません。塾にご連絡ください。
          </p>
        ) : students.length === 1 ? (
          <div className="rounded-xl border border-blue-200 bg-white px-3 py-2.5 shadow-sm">
            <p className="text-sm font-bold text-slate-900">{students[0].name}</p>
            <p className="text-xs text-slate-500">{students[0].grade}</p>
          </div>
        ) : (
          <>
            <p className="mb-1.5 text-xs text-slate-500">お子さまを切り替え：</p>
            <select
              value={selectedId ?? ""}
              onChange={(e) => selectStudent(e.target.value)}
              className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}（{s.grade}）</option>
              ))}
            </select>
          </>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto space-y-1 px-3 py-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">メニュー</p>
        {NAV.map((item) => {
          const active = isActive(item.href);
          const showBadge = item.href === "/parent/dashboard/messages" && unreadCount > 0;
          return (
            <Link key={item.href} href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}>
              <span>{item.label}</span>
              {showBadge && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-4 space-y-2">
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <p className="truncate text-xs font-medium text-slate-700">{parent?.name}</p>
          <p className="truncate text-xs text-slate-400">{parent?.email}</p>
        </div>
        <button onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100">
          ログアウト
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <div className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-slate-200 shadow-sm lg:block">
        {sidebar}
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-60">
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex-1 lg:pl-60">
        <div className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white px-4 lg:hidden">
          <Link href="/parent/dashboard"><Logo size="sm" /></Link>
        </div>

        <main className="min-h-screen pb-16 lg:pb-0">{children}</main>
      </div>

      {/* ボトムナビ（モバイル専用） */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 border-t border-slate-200 bg-white lg:hidden">
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
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? "text-blue-600" : "text-slate-500"
              }`}>
              {active && <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-blue-600" />}
              <span className="relative">
                {item.icon}
                {item.badge > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                    {item.badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
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
