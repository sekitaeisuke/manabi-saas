"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const login = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(
        err.message.includes("Email not confirmed")
          ? "メールの確認が完了していません"
          : "メールアドレスまたはパスワードが正しくありません"
      );
      setLoading(false);
      return;
    }
    router.push("/teacher/dashboard");
  };

  return (
    <div className="flex min-h-screen">
      {/* 左：ブランドパネル */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-12 text-white">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 text-xl font-bold">つ</div>
            <span className="text-xl font-bold tracking-tight">つながるまなび</span>
          </div>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">
            生徒の成長を、<br />データで見える化する。
          </h1>
          <p className="mt-4 text-lg text-indigo-200">
            学力・学習習慣・学習法を多角的に診断し、<br />
            一人ひとりに最適な指導を実現します。
          </p>
          <div className="mt-10 space-y-4">
            {[
              { icon: "📊", text: "AIによる多層診断レポート自動生成" },
              { icon: "📝", text: "診断テストの作成・配布・採点を一元管理" },
              { icon: "👥", text: "生徒・講師・校舎の階層管理" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3 text-indigo-100">
                <span className="text-2xl">{item.icon}</span>
                <span className="text-sm">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-indigo-300">© 2025 つながるまなび. All rights reserved.</p>
      </div>

      {/* 右：フォームパネル */}
      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-md">
          {/* モバイル用ロゴ */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white">つ</div>
            <span className="text-xl font-bold text-slate-900">つながるまなび</span>
          </div>

          <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-2xl font-bold text-slate-900">ログイン</h2>
            <p className="mt-1 text-sm text-slate-500">アカウント情報を入力してください</p>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span className="mt-0.5">⚠</span>
                <span>{error}</span>
              </div>
            )}

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">メールアドレス</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && login()}
                  placeholder="example@school.jp"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">パスワード</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && login()}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>

            <button
              onClick={login}
              disabled={!email || !password || loading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-40"
            >
              {loading ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />ログイン中...</>
              ) : "ログイン →"}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            アカウントをお持ちでない方は{" "}
            <Link href="/register" className="font-semibold text-indigo-600 hover:underline">
              新規登録
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
