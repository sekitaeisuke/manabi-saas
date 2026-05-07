import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { test_id } = await req.json();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);

  const { data, error } = await supabase
    .from("test_sessions")
    .insert({ test_id, url_token: token, expires_at: null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("tests").update({ status: "published" }).eq("id", test_id);

  return NextResponse.json({ token: data.url_token });
}
