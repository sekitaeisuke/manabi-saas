"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";

type Role = {
  href: string;
  title: string;
  desc: string;
  icon: string;
  /** 主導線かどうか。生徒がいちばん多く触るので生徒を主にする */
  primary?: boolean;
};

const ROLES: Role[] = [
  {
    href: "/student/login",
    title: "生徒ログイン",
    desc: "先生から教えてもらったIDでログイン",
    icon: "✏️",
    primary: true,
  },
  {
    href: "/login/parent",
    title: "保護者ログイン",
    desc: "学習状況・報告書・3か月ビジョンを確認",
    icon: "👨‍👩‍👧",
  },
  {
    href: "/login",
    title: "講師ログイン",
    desc: "メールアドレスとパスワードでログイン",
    icon: "📋",
  },
];

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // 生徒かどうか確認
      const { data: student } = await supabase
        .from("students")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (student) {
        router.replace("/student/dashboard");
        return;
      }

      // 講師かどうか確認
      const { data: teacher } = await supabase
        .from("teachers")
        .select("id")
        .eq("email", session.user.email)
        .maybeSingle();

      if (teacher) {
        router.replace("/teacher/dashboard");
        return;
      }

      // 保護者かどうか確認
      const { data: parent } = await supabase
        .from("parents")
        .select("id")
        .eq("email", session.user.email)
        .maybeSingle();

      if (parent) {
        router.replace("/parent/dashboard");
      }
    };
    check();
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas-glow px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-10 flex flex-col items-center gap-4 text-center">
          <Logo size="lg" />
          <p className="text-sm text-ink-muted">学習管理システム</p>
        </div>

        <div className="space-y-3">
          {ROLES.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className={
                r.primary
                  ? "group flex items-center gap-4 rounded-card bg-brand-gradient px-5 py-4 text-white shadow-brand transition duration-200 ease-out-soft hover:-translate-y-0.5 hover:shadow-pop active:translate-y-0 active:scale-[0.99]"
                  : "group flex items-center gap-4 rounded-card border border-line bg-surface px-5 py-4 shadow-card transition duration-200 ease-out-soft hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover active:translate-y-0 active:scale-[0.99]"
              }
            >
              <span
                className={
                  r.primary
                    ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-white/15 text-xl"
                    : "flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-canvas-sunken text-xl"
                }
                aria-hidden
              >
                {r.icon}
              </span>

              <span className="min-w-0 flex-1">
                <span className={r.primary ? "block font-bold" : "block font-bold text-ink"}>
                  {r.title}
                </span>
                <span
                  className={
                    r.primary
                      ? "mt-0.5 block text-xs leading-5 text-white/75"
                      : "mt-0.5 block text-xs leading-5 text-ink-faint"
                  }
                >
                  {r.desc}
                </span>
              </span>

              <svg
                className={
                  r.primary
                    ? "h-5 w-5 shrink-0 text-white/70 transition-transform duration-200 group-hover:translate-x-0.5"
                    : "h-5 w-5 shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5"
                }
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-ink-faint">© 2025 つながるまなび</p>
      </div>
    </div>
  );
}
