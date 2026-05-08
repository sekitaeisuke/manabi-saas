import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { student_id, login_id, password } = await req.json();
  if (!student_id || !login_id || !password) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const email = `${login_id}@students.local`;

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const authUserId = data.user?.id;
  if (!authUserId) {
    return NextResponse.json({ error: "アカウント作成に失敗しました" }, { status: 500 });
  }

  const { error: updateErr } = await supabase
    .from("students")
    .update({ login_id, auth_user_id: authUserId })
    .eq("id", student_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, login_id });
}
