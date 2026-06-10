import { supabase } from "@/lib/supabase";

/**
 * ログイン中ユーザーのアクセストークンを Authorization ヘッダに付けて fetch する。
 * 認証が必要な API ルート（service role 系など）の呼び出しに使う。
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  return fetch(input, { ...init, headers });
}
