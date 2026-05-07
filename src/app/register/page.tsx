"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<"admin" | "teacher" | "part-time">("teacher");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const register = async () => {
    setError("");
    setSuccess("");
    if (!name || !email || !password) { setError("すべての項目を入力してください"); return; }
    if (password.length < 6) { setError("パスワードは6文字以上で入力してください"); return; }
    if (password !== confirm) { setError("パスワードが一致しません"); return; }

    setLoading(true);

    const { data, error: signUpErr } = await supabase.auth.signUp({ email, password });

    if (signUpErr) {
      const msg = signUpErr.message.includes("already registered")
        ? "このメールアドレスはすでに登録されています"
        : `登録エラー: ${signUpErr.message}`;
      setError(msg);
      setLoading(false);
      return;
    }

    // メール確認が必要な場合（identities が空 = 既存ユーザー）
    if (data.user && data.user.identities?.length === 0) {
      setError("このメールアドレスはすでに登録されています");
      setLoading(false);
      return;
    }

    // セッションなし = メール確認待ち
    if (!data.session) {
      setSuccess("確認メールを送信しました。メールのリンクをクリックしてからログインしてください。\n\n※すぐに使う場合は Supabase → Authentication → Providers → Email の「Confirm email」をOFFにしてください。");
      setLoading(false);
      return;
    }

    // 登録成功 → teachers テーブルにも保存
    if (data.user) {
      await supabase.from("teachers").insert({ name, email, role });
    }

    setSuccess("登録完了！ログインページへ移動します...");
    setTimeout(() => router.push("/login"), 1500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">つながるまなび</h1>
          <p className="mt-2 text-slate-500 text-sm">講師アカウント 新規登録</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
          <h2 className="mb-6 text-xl font-bold text-slate-900">新規登録</h2>

          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 whitespace-pre-wrap">
              {success}
            </div>
          )}

          <div className="space-y-4">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              氏名
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：山田 太郎"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 text-slate-900"
                autoFocus
              />
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              メールアドレス
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@school.jp"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 text-slate-900"
              />
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              役職
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "teacher" | "part-time")}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 text-slate-900"
              >
                <option value="admin">管理者</option>
                <option value="teacher">講師</option>
                <option value="part-time">非常勤講師</option>
              </select>
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              パスワード（6文字以上）
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6文字以上"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 text-slate-900"
              />
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              パスワード（確認）
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && register()}
                placeholder="もう一度入力"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-400 text-slate-900"
              />
            </label>
          </div>

          <button
            onClick={register}
            disabled={!name || !email || !password || !confirm || loading}
            className="mt-6 w-full rounded-2xl bg-green-600 py-3.5 font-semibold text-white hover:bg-green-700 disabled:opacity-40 transition"
          >
            {loading ? "登録中..." : "アカウントを作成"}
          </button>

          <div className="mt-6 text-center text-sm text-slate-500">
            すでにアカウントをお持ちの方は{" "}
            <Link href="/login" className="font-semibold text-blue-600 hover:underline">
              ログイン
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
