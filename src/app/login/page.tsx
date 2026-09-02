"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { toLoginEmail } from "@/lib/teacherLogin";
import { Logo } from "@/components/Logo";
import { Button, Field, inputClass, Spinner } from "@/components/ui";

const POINTS = [
  { icon: "📊", text: "AIによる多層診断レポート自動生成" },
  { icon: "📝", text: "診断テストの作成・配布・採点を一元管理" },
  { icon: "👥", text: "生徒・講師・校舎の階層管理" },
];

export default function LoginPage() {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const login = async () => {
    if (!account || !password) return;
    setLoading(true);
    setError("");
    // メールを持たない講師には短いログインID（t001 など）を発行している。
    // 「@」が無い入力はそのIDとみなし、内部のメール形式に組み立て直す。
    const email = toLoginEmail(account);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(
        err.message.includes("Email not confirmed")
          ? "メールの確認が完了していません"
          : "ログインIDまたはパスワードが正しくありません"
      );
      setLoading(false);
      return;
    }
    router.push("/teacher/dashboard");
  };

  return (
    <div className="flex min-h-screen">
      {/* 左：ブランドパネル */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-gradient p-12 text-white lg:flex lg:w-1/2">
        {/* うっすら光を置いて、べたっとした一色に見えないように */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(38rem 24rem at 15% 8%, rgba(255,255,255,.18), transparent 60%), radial-gradient(30rem 30rem at 95% 100%, rgba(255,255,255,.10), transparent 60%)",
          }}
        />
        <div className="relative">
          <Logo size="sm" tone="light" />
        </div>

        <div className="relative">
          <h1 className="text-[2.5rem] font-bold leading-[1.35] tracking-tight">
            生徒の成長を、
            <br />
            データで見える化する。
          </h1>
          <p className="mt-5 text-base leading-8 text-white/75">
            学力・学習習慣・学習法を多角的に診断し、
            <br />
            一人ひとりに最適な指導を実現します。
          </p>

          <ul className="mt-10 space-y-3">
            {POINTS.map((item) => (
              <li
                key={item.text}
                className="flex items-center gap-3 rounded-field bg-white/10 px-4 py-3 backdrop-blur-sm"
              >
                <span className="text-xl" aria-hidden>
                  {item.icon}
                </span>
                <span className="text-sm text-white/90">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">© 2025 つながるまなび. All rights reserved.</p>
      </div>

      {/* 右：フォームパネル */}
      <div className="flex w-full flex-col items-center justify-center bg-canvas-glow px-5 py-12 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo size="md" />
          </div>

          <div className="rounded-card border border-line bg-surface p-7 shadow-card sm:p-8">
            <h2 className="text-2xl font-bold tracking-tight text-ink">講師ログイン</h2>
            <p className="mt-1 text-sm text-ink-muted">配布されたログインID（例: t001）でも、メールアドレスでも入れます</p>

            {error && (
              <p
                role="alert"
                className="mt-5 flex items-start gap-2 rounded-field border border-critical-200 bg-critical-50 px-4 py-3 text-sm text-critical-700"
              >
                <span aria-hidden>⚠</span>
                <span>{error}</span>
              </p>
            )}

            <div className="mt-6 space-y-4">
              <Field label="ログインID または メールアドレス">
                <input
                  type="text"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && login()}
                  placeholder="t001 または example@school.jp"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className={inputClass}
                  autoFocus
                />
              </Field>
              <Field label="パスワード">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && login()}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={inputClass}
                />
              </Field>
            </div>

            <Button
              onClick={login}
              disabled={!account || !password || loading}
              size="lg"
              className="mt-6 w-full"
            >
              {loading ? (
                <>
                  <Spinner className="h-4 w-4 border-white/40 border-t-white" />
                  ログイン中...
                </>
              ) : (
                "ログイン"
              )}
            </Button>
          </div>

          <p className="mt-6 text-center text-sm leading-6 text-ink-faint">
            アカウントをお持ちでない方・ログインできない方は、管理者までご連絡ください。
          </p>
          <p className="mt-3 text-center text-sm">
            <Link href="/" className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
              ← ログイン画面をえらび直す
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
