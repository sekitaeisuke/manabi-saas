import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * service role の Supabase クライアント（RLS を貫通する）。
 * 呼び出し元で必ず requireTeacher / requireAdmin を通してから使う。
 * SUPABASE_SERVICE_ROLE_KEY が無い環境では null を返す。
 */
export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const SERVICE_KEY_MISSING =
  "SUPABASE_SERVICE_ROLE_KEY が未設定のため、サーバ側でアカウントを操作できません。" +
  "Supabase ダッシュボード → Project Settings → API Keys の service_role キーを .env.local（本番は Vercel の環境変数）に設定してください。";

/**
 * Auth ユーザをメールアドレスで探す。
 * listUsers はページングされるため、見つかるまで順に辿る（1000件/ページ）。
 */
export async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string; email: string } | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    const hit = users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return { id: hit.id, email: hit.email ?? target };
    if (users.length < 1000) break; // 最終ページ
  }
  return null;
}
