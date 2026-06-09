"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

/**
 * 同一オリジンの /api/ 宛 fetch に、ログイン中ユーザの access token を
 * Authorization: Bearer として自動付与する。
 *
 * これにより各ダッシュボードの fetch 呼び出しを個別に書き換えなくても、
 * 保護された API ルート（requireTeacher / requireUser）を認証付きで叩ける。
 * Supabase 等の外部オリジンや RSC のリクエストには触れない。
 */
let installed = false;

export function AuthFetchProvider() {
  useEffect(() => {
    if (installed || typeof window === "undefined") return;
    installed = true;

    const orig = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string" || input instanceof URL) {
        const url = input.toString();
        const sameOriginApi =
          url.startsWith("/api/") ||
          url.startsWith(`${window.location.origin}/api/`);
        if (sameOriginApi) {
          try {
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            if (token) {
              const headers = new Headers(init?.headers);
              if (!headers.has("Authorization")) {
                headers.set("Authorization", `Bearer ${token}`);
              }
              init = { ...init, headers };
            }
          } catch {
            // トークン取得に失敗してもリクエスト自体は通す
          }
        }
      }
      return orig(input, init);
    };

    return () => {
      window.fetch = orig;
      installed = false;
    };
  }, []);

  return null;
}
