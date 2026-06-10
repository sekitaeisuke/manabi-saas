import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { test_id } = await req.json();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const token = crypto.randomUUID().replace(/-/g, "");
  // 受験URLは無期限にせず、既定30日で失効させる
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("test_sessions")
    .insert({ test_id, url_token: token, expires_at: expiresAt })
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
