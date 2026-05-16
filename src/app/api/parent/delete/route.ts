import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { parent_id } = await req.json();
  if (!parent_id) {
    return NextResponse.json({ error: "parent_id は必須です" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 1) parents 行を取得して auth_user_id を確認
  const supabase = createClient(url, anonKey);
  const { data: parent, error: getErr } = await supabase
    .from("parents")
    .select("id, auth_user_id")
    .eq("id", parent_id)
    .maybeSingle();

  if (getErr) {
    return NextResponse.json({ error: getErr.message }, { status: 500 });
  }
  if (!parent) {
    return NextResponse.json({ error: "対象の保護者が見つかりません" }, { status: 404 });
  }

  // 2) parents 行を削除（ON DELETE CASCADE で parent_student_links も消える）
  const { error: delErr } = await supabase.from("parents").delete().eq("id", parent_id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // 3) service role があれば Supabase Auth ユーザも削除
  let auth_user_deleted = false;
  let auth_error: string | null = null;
  if (serviceRoleKey && parent.auth_user_id) {
    const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: adminErr } = await admin.auth.admin.deleteUser(parent.auth_user_id);
    if (adminErr) {
      auth_error = adminErr.message;
    } else {
      auth_user_deleted = true;
    }
  }

  return NextResponse.json({
    success: true,
    auth_user_deleted,
    auth_error,
    note: serviceRoleKey
      ? null
      : "SUPABASE_SERVICE_ROLE_KEY が設定されていないため、Supabase Auth のユーザは残っています。Supabase Dashboard から手動削除してください。",
  });
}
