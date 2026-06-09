"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function TeacherLoginPage() {
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

    // 講師として登録済みか検証（保護者/生徒アカウントの流入を防ぐ）
    const { data: teacher } = await supabase
      .from("teachers")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!teacher) {
      await supabase.auth.signOut();
      setError("この アカウントには講師権限がありません");
      setLoading(false);
      return;
    }

    router.push("/teacher/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-green-50 px-6 py-10">
      <main className="w-full max-w-2xl rounded-3xl border border-green-200 bg-white p-10 shadow-2xl">
        <div className="inline-flex items-center justify-center rounded-full bg-green-100 p-3 mb-4">
          <p className="text-2xl">👨‍🏫</p>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">講師ログイン</h1>
        <p className="mt-4 text-slate-700">講師用のダッシュボードにログインして、生徒管理や分析を開始します。</p>

        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span className="mt-0.5">⚠</span>
            <span>{error}</span>
          </div>
        )}

        <div className="mt-8 grid gap-6">
          <label className="grid gap-2 text-sm text-slate-700">
            メールアドレス
            <input
              className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-green-400"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              autoFocus
            />
          </label>
          <label className="grid gap-2 text-sm text-slate-700">
            パスワード
            <input
              className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-green-400"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
            />
          </label>
          <button
            onClick={login}
            disabled={!email || !password || loading}
            className="inline-flex items-center justify-center rounded-2xl bg-green-600 px-6 py-3 text-white transition hover:bg-green-700 disabled:opacity-40"
          >
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </div>

        <div className="mt-8 text-sm text-slate-600">
          <Link href="/" className="font-medium text-green-600 hover:text-green-700 underline">トップに戻る</Link>
        </div>
      </main>
    </div>
  );
}
