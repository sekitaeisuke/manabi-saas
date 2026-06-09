import { NextRequest, NextResponse } from "next/server";
import { requireTeacher, adminClient, authErrorResponse } from "@/lib/serverAuth";

export async function POST(req: NextRequest) {
  try {
    await requireTeacher(req);
  } catch (e) {
    return authErrorResponse(e);
  }

  const { test_id } = await req.json();
  const supabase = adminClient();

  const token = crypto.randomUUID().replace(/-/g, "");

  const { data, error } = await supabase
    .from("test_sessions")
    .insert({ test_id, url_token: token, expires_at: null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: updateErr } = await supabase
    .from("tests").update({ status: "published" }).eq("id", test_id);
  if (updateErr) {
    console.error("tests status update failed:", updateErr);
    return NextResponse.json({ error: "テストの公開状態更新に失敗しました: " + updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ token: data.url_token });
}
