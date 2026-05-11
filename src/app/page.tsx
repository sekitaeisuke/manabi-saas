"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";

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
      }
    };
    check();
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50 px-4">
      <div className="w-full max-w-sm">
        {/* ロゴ */}
        <div className="mb-10 flex flex-col items-center gap-3">
          <Logo size="lg" />
          <p className="text-sm text-slate-500">学習管理システム</p>
        </div>

        <div className="space-y-3">
          {/* 生徒ログイン */}
          <Link
            href="/student/login"
            className="flex w-full items-center justify-between rounded-2xl bg-indigo-600 px-6 py-4 text-white shadow-sm transition hover:bg-indigo-700 active:scale-95"
          >
            <div>
              <p className="font-bold text-lg">生徒ログイン</p>
              <p className="mt-0.5 text-sm text-indigo-200">先生から教えてもらったIDでログイン</p>
            </div>
            <span className="text-2xl">→</span>
          </Link>

          {/* 講師ログイン */}
          <Link
            href="/login"
            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-6 py-4 text-slate-900 shadow-sm transition hover:bg-slate-50 active:scale-95"
          >
            <div>
              <p className="font-bold text-lg">講師ログイン</p>
              <p className="mt-0.5 text-sm text-slate-500">メールアドレスとパスワードでログイン</p>
            </div>
            <span className="text-2xl text-slate-400">→</span>
          </Link>
        </div>

        <p className="mt-10 text-center text-xs text-slate-400">
          © 2025 つながるまなび
        </p>
      </div>
    </div>
  );
}
