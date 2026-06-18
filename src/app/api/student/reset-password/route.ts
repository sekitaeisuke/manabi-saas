import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/apiAuth";

// 生徒のパスワードは取得（復号）できないため、再設定のみ可能。
// 講師が新しいパスワードを決めて上書きする。
export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;

  const { student_id, password } = await req.json();
  if (!student_id || !password) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 6) {
    return NextResponse.json({ error: "パスワードは6文字以上にしてください" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY が未設定です" }, { status: 500 });
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 生徒の auth_user_id を取得（呼び出し元は requireTeacher 済み）
  const { data: student, error: fetchErr } = await admin
    .from("students")
    .select("auth_user_id, login_id")
    .eq("id", student_id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!student?.auth_user_id) {
    return NextResponse.json({ error: "この生徒はまだアカウント未発行です。先にアカウント発行してください" }, { status: 400 });
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(student.auth_user_id, { password });
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, login_id: student.login_id });
}
