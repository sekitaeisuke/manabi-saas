import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/apiAuth";

// 生徒向け：AC の「増やし方」を見せるための獲得ルール一覧。
// ac_rules は RLS で講師のみ閲覧なので、service role で読んで公開する（有効・加点のみ）。
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data } = await svc.from("ac_rules")
    .select("event_key, label, points, threshold, enabled").eq("enabled", true).gt("points", 0);

  return NextResponse.json({ rules: (data ?? []).sort((a, b) => b.points - a.points) });
}
