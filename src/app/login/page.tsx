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
      const msg = err.message.includes("Email not confirmed")
        ? "メールの確認が完了していません。受信箱のリンクをクリックするか、Supabaseで「Confirm email」をOFFにしてください"
        : err.message.includes("Invalid login credentials")
        ? "メールアドレスまたはパスワードが正しくありません"
        : `ログインエラー: ${err.message}`;
      setError(msg);
      setLoading(false);
      return;
    }
    router.push("/teacher/dashboard");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* ロゴ・タイトル */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">つながるまなび</h1>
          <p className="mt-2 text-slate-500 text-sm">学習管理システム 講師ログイン</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
          <h2 className="mb-6 text-xl font-bold text-slate-900">ログイン</h2>

          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              メールアドレス
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && login()}
                placeholder="example@school.jp"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 text-slate-900"
                autoFocus
              />
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              パスワード
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && login()}
                placeholder="パスワードを入力"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 text-slate-900"
              />
            </label>
          </div>

          <button
            onClick={login}
            disabled={!email || !password || loading}
            className="mt-6 w-full rounded-2xl bg-blue-600 py-3.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition"
          >
            {loading ? "ログイン中..." : "ログイン"}
          </button>

          <div className="mt-6 text-center text-sm text-slate-500">
            アカウントをお持ちでない方は{" "}
            <Link href="/register" className="font-semibold text-blue-600 hover:underline">
              新規登録
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
