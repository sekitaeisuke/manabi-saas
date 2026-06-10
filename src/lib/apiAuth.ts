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
