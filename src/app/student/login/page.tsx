"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import { Button, Field, inputClass, Spinner } from "@/components/ui";

export default function StudentLoginPage() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const login = async () => {
    if (!loginId || !password) { setError("ログインIDとパスワードを入力してください"); return; }
    setError(""); setLoading(true);

    const email = `${loginId.trim()}@students.local`;
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });

    if (authErr) {
      setError("ログインIDまたはパスワードが正しくありません");
      setLoading(false); return;
    }

    router.replace("/student/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas-glow px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo size="md" />
          <p className="text-sm font-medium text-ink-muted">生徒ログイン</p>
        </div>

        <div className="rounded-card border border-line bg-surface p-7 shadow-card">
          {error && (
            <p
              role="alert"
              className="mb-5 flex items-start gap-2 rounded-field border border-critical-200 bg-critical-50 px-4 py-3 text-sm leading-6 text-critical-700"
            >
              <span aria-hidden>⚠</span>
              <span>{error}</span>
            </p>
          )}

          <div className="space-y-4">
            <Field label="ログインID">
              <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="先生から教えてもらったID"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                autoFocus
                className={inputClass}
              />
            </Field>
            <Field label="パスワード">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワード"
                autoComplete="current-password"
                onKeyDown={(e) => e.key === "Enter" && login()}
                className={inputClass}
              />
            </Field>
          </div>

          <Button
            onClick={login}
            disabled={!loginId || !password || loading}
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

        <p className="mt-6 text-center text-xs leading-6 text-ink-faint">
          ログインIDとパスワードは担当の先生に聞いてください
        </p>
        <p className="mt-3 text-center text-sm">
          <Link href="/" className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
            ← ログイン画面をえらび直す
          </Link>
        </p>
      </div>
    </div>
  );
}
