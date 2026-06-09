import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** 認可エラー。status を持ち、authErrorResponse で HTTP レスポンス化できる。 */
export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/**
 * RLS をバイパスする service role クライアント。
 * 「呼び出し元の認可はアプリ層（requireTeacher 等）で済ませた」前提でのみ使う。
 */
export function adminClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new AuthError(
      "SUPABASE_SERVICE_ROLE_KEY が未設定のため、この操作を実行できません。" +
        " Supabase ダッシュボード → Project Settings → API Keys から service_role キーを取得し、" +
        " 環境変数 SUPABASE_SERVICE_ROLE_KEY に設定してください。",
      500
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export type AuthedUser = {
  id: string;
  email: string | null;
};

/**
 * Authorization: Bearer <access_token> を検証し、ログイン中ユーザを返す。
 * トークンが無い・無効なら AuthError を投げる。
 * 返り値の userClient はそのユーザの権限（RLS 適用）で DB アクセスできる。
 */
export async function getUser(
  req: NextRequest
): Promise<{ user: AuthedUser; userClient: SupabaseClient }> {
  const token = bearerToken(req);
  if (!token) throw new AuthError("認証が必要です（トークンがありません）", 401);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) {
    throw new AuthError("認証に失敗しました（無効なトークンです）", 401);
  }
  return {
    user: { id: data.user.id, email: data.user.email ?? null },
    userClient,
  };
}

export type TeacherIdentity = {
  id: string;
  role: "admin" | "teacher" | "part-time";
  school_id: string | null;
};

/**
 * ログイン中ユーザが teachers テーブルに存在することを検証する。
 * 存在しなければ 403。AI 課金や個人情報操作を伴う講師専用ルートで使う。
 */
export async function requireTeacher(
  req: NextRequest
): Promise<{ user: AuthedUser; teacher: TeacherIdentity; userClient: SupabaseClient }> {
  const { user, userClient } = await getUser(req);
  if (!user.email) throw new AuthError("講師権限が必要です", 403);

  const { data: teacher } = await userClient
    .from("teachers")
    .select("id, role, school_id")
    .eq("email", user.email)
    .maybeSingle();

  if (!teacher) throw new AuthError("講師権限が必要です", 403);
  return { user, teacher: teacher as TeacherIdentity, userClient };
}

/** ログインさえしていれば良いルート（保護者/講師/生徒いずれか）用。 */
export async function requireUser(
  req: NextRequest
): Promise<{ user: AuthedUser; userClient: SupabaseClient }> {
  return getUser(req);
}

/** AuthError を HTTP レスポンスに変換する。catch 節で使う。 */
export function authErrorResponse(e: unknown): NextResponse {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const msg = e instanceof Error ? e.message : "サーバーエラーが発生しました";
  return NextResponse.json({ error: msg }, { status: 500 });
}
