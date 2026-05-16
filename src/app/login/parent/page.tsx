"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ParentLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !authData.session) {
      setError(authError?.message ?? "ログインに失敗しました");
      setLoading(false);
      return;
    }

    const { data: parent } = await supabase
      .from("parents")
      .select("id")
      .eq("email", authData.session.user.email!)
      .maybeSingle();

    if (!parent) {
      await supabase.auth.signOut();
      setError("この Email に対応する保護者アカウントが見つかりません。管理者にご連絡ください。");
      setLoading(false);
      return;
    }

    router.replace("/parent/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-green-50 px-6 py-10">
      <main className="w-full max-w-2xl rounded-3xl border border-blue-200 bg-white p-10 shadow-2xl">
        <div className="inline-flex items-center justify-center rounded-full bg-blue-100 p-3 mb-4">
          <p className="text-2xl">👨‍👩‍👧</p>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">保護者ログイン</h1>
        <p className="mt-4 text-slate-700">お子さまの学習状況や報告書を確認するためにログインしてください。</p>

        <form className="mt-8 grid gap-6" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm text-slate-700">
            メールアドレス
            <input
              className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-400"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="grid gap-2 text-sm text-slate-700">
            パスワード
            <input
              className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-400"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>

        <div className="mt-8 text-sm text-slate-600">
          <Link href="/" className="font-medium text-blue-600 hover:text-blue-700 underline">トップに戻る</Link>
        </div>
      </main>
    </div>
  );
}
