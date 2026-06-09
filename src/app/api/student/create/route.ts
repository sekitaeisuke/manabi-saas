import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTeacher, authErrorResponse } from "@/lib/serverAuth";

export async function POST(req: NextRequest) {
  try {
    await requireTeacher(req);
  } catch (e) {
    return authErrorResponse(e);
  }

  const { student_id, login_id, password } = await req.json();
  if (!student_id || !login_id || !password) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 講師として認可済み。students テーブル更新は RLS をバイパスする必要があるため service role 必須。
  if (!serviceRoleKey) {
    return NextResponse.json({
      error: "SUPABASE_SERVICE_ROLE_KEY が未設定のため生徒アカウントを作成できません。",
    }, { status: 500 });
  }
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `${login_id}@students.local`;

  // 生徒の Auth ユーザは admin API で作成（メール確認済み扱い）
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const authUserId = data.user?.id;
  if (!authUserId) {
    return NextResponse.json({ error: "アカウント作成に失敗しました" }, { status: 500 });
  }

  const { error: updateErr } = await admin
    .from("students")
    .update({ login_id, auth_user_id: authUserId })
    .eq("id", student_id);

  if (updateErr) {
    // auth userが宙に浮かないよう削除
    const { error: deleteErr } = await admin.auth.admin.deleteUser(authUserId);
    if (deleteErr) {
      console.error("ロールバック中のAuth削除失敗（手動対応が必要）:", authUserId, deleteErr);
    }
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, login_id });
}
