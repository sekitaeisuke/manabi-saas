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
    setError(""); setSuccess("");
    if (!name || !email || !password) { setError("すべての項目を入力してください"); return; }
    if (password.length < 6) { setError("パスワードは6文字以上で入力してください"); return; }
    if (password !== confirm) { setError("パスワードが一致しません"); return; }
    setLoading(true);

    const { data, error: signUpErr } = await supabase.auth.signUp({ email, password });
    if (signUpErr) {
      setError(signUpErr.message.includes("already registered")
        ? "このメールアドレスはすでに登録されています"
        : `登録エラー: ${signUpErr.message}`);
      setLoading(false); return;
    }
    if (data.user?.identities?.length === 0) {
      setError("このメールアドレスはすでに登録されています");
      setLoading(false); return;
    }
    if (!data.session) {
      setSuccess("確認メールを送信しました。メールのリンクをクリックしてからログインしてください。");
      setLoading(false); return;
    }
    if (data.user) {
      await supabase.from("teachers").insert({ name, email, role });
    }
    setSuccess("登録完了！ログインページへ移動します...");
    setTimeout(() => router.push("/login"), 1500);
  };

  return (
    <div className="flex min-h-screen">
      {/* 左：ブランドパネル */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 text-xl font-bold">つ</div>
          <span className="text-xl font-bold">つながるまなび</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">はじめましょう。<br />無料で始められます。</h1>
          <p className="mt-4 text-indigo-200">アカウントを作成して、AIを活用した学習管理システムをすぐにお試しいただけます。</p>
          <div className="mt-8 rounded-2xl bg-white/10 p-6 backdrop-blur-sm">
            <p className="text-sm font-semibold text-indigo-100">含まれる機能</p>
            <ul className="mt-3 space-y-2 text-sm text-indigo-200">
              <li>✓ 診断テスト作成・配布（無制限）</li>
              <li>✓ AI多層診断レポート生成</li>
              <li>✓ 生徒・講師・校舎管理</li>
              <li>✓ A4印刷対応レポート</li>
            </ul>
          </div>
        </div>
        <p className="text-xs text-indigo-300">© 2025 つながるまなび. All rights reserved.</p>
      </div>

      {/* 右：フォームパネル */}
      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white">つ</div>
            <span className="text-xl font-bold text-slate-900">つながるまなび</span>
          </div>

          <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-2xl font-bold text-slate-900">新規登録</h2>
            <p className="mt-1 text-sm text-slate-500">講師アカウントを作成します</p>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span className="mt-0.5">⚠</span><span>{error}</span>
              </div>
            )}
            {success && (
              <div className="mt-4 flex items-start gap-2 rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
                <span className="mt-0.5">✓</span><span>{success}</span>
              </div>
            )}

            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">氏名</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="山田 太郎"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                    autoFocus />
                </div>
                <div className="col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">メールアドレス</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@school.jp"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100" />
                </div>
                <div className="col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">役職</label>
                  <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "teacher" | "part-time")}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100">
                    <option value="admin">管理者</option>
                    <option value="teacher">講師</option>
                    <option value="part-time">非常勤講師</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">パスワード</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6文字以上"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">確認</label>
                  <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="再入力"
                    onKeyDown={(e) => e.key === "Enter" && register()}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100" />
                </div>
              </div>
            </div>

            <button onClick={register} disabled={!name || !email || !password || !confirm || loading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-40">
              {loading ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />登録中...</>
              ) : "アカウントを作成 →"}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            すでにアカウントをお持ちの方は{" "}
            <Link href="/login" className="font-semibold text-indigo-600 hover:underline">ログイン</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
