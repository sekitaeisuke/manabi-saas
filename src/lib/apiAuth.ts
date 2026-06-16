import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

/**
 * API ルート用の認証/認可ヘルパー。
 * クライアントは Authorization: Bearer <access_token> を付けて呼ぶ（src/lib/authFetch.ts）。
 * 戻り値が NextResponse の場合はそのまま return してエラー応答する。
 */
export type TeacherAuth = { email: string; role: string };

export async function requireTeacher(req: NextRequest): Promise<TeacherAuth | NextResponse> {
  const authz = req.headers.get("authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  if (!token) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // トークン検証（Supabase Auth サーバで JWT を検証）
  const authClient = createClient(url, anon);
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user?.email) {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }

  // teachers 照合は service role で（RLS の影響を受けず確実に判定）
  const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: teacher } = await svc
    .from("teachers").select("role").eq("email", user.email).maybeSingle();
  if (!teacher) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  return { email: user.email, role: teacher.role as string };
}

export async function requireAdmin(req: NextRequest): Promise<TeacherAuth | NextResponse> {
  const res = await requireTeacher(req);
  if (res instanceof NextResponse) return res;
  if (res.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
  }
  return res;
}

/**
 * ログイン済みユーザー（保護者/生徒/講師のいずれか）であることだけを検証する。
 * notify など、講師に限らずログインユーザー全般が呼ぶルートで使う。
 */
export async function requireUser(req: NextRequest): Promise<{ email: string } | NextResponse> {
  const authz = req.headers.get("authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  if (!token) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const authClient = createClient(url, anon);
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user?.email) {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }
  return { email: user.email };
}

/**
 * サーバ間内部呼び出し（例: notify/announcement → notify）の判定。
 * INTERNAL_API_SECRET が設定され、x-internal-secret ヘッダが一致すれば true。
 */
export function isInternalCall(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false;
  return req.headers.get("x-internal-secret") === secret;
}

/** 内部呼び出し時に付与するヘッダ（未設定なら空オブジェクト） */
export function internalHeaders(): Record<string, string> {
  const secret = process.env.INTERNAL_API_SECRET;
  return secret ? { "x-internal-secret": secret } : {};
}
