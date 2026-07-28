"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import { Button, Field, inputClass, Spinner } from "@/components/ui";

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
    <div className="flex min-h-screen items-center justify-center bg-canvas-glow px-5 py-12">
      <main className="w-full max-w-md">
        <div className="mb-7 flex justify-center">
          <Logo size="md" />
        </div>

        <div className="rounded-card border border-line bg-surface p-7 shadow-card sm:p-8">
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-brand-50 text-xl"
              aria-hidden
            >
              👨‍👩‍👧
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-ink">保護者ログイン</h1>
              <p className="text-sm text-ink-muted">お子さまの学習状況や報告書を確認できます。</p>
            </div>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <Field label="メールアドレス">
              <input
                className={inputClass}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
              />
            </Field>
            <Field label="パスワード">
              <input
                className={inputClass}
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </Field>

            {error && (
              <p
                role="alert"
                className="rounded-field border border-critical-200 bg-critical-50 px-4 py-3 text-sm leading-6 text-critical-700"
              >
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} size="lg" className="w-full">
              {loading ? (
                <>
                  <Spinner className="h-4 w-4 border-white/40 border-t-white" />
                  ログイン中...
                </>
              ) : (
                "ログイン"
              )}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm">
          <Link href="/" className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
            ← ログイン画面をえらび直す
          </Link>
        </p>
      </main>
    </div>
  );
}
