import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/apiAuth";

// 報酬交換の承認/却下（講師）。却下時は AC を返金・在庫を戻す（decide_reward_exchange RPC）。
// body: { exchange_id, approve: boolean }
export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;

  const { exchange_id, approve } = await req.json().catch(() => ({}));
  if (!exchange_id || typeof approve !== "boolean") {
    return NextResponse.json({ error: "exchange_id と approve(boolean) が必要です" }, { status: 400 });
  }

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data, error } = await svc.rpc("decide_reward_exchange", {
    p_exchange: exchange_id, p_approve: approve, p_by: auth.email,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data && data.ok === false) return NextResponse.json(data, { status: 400 });
  return NextResponse.json(data);
}
