import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/apiAuth";

// 報酬交換の承認/却下/受け渡し完了（講師）。却下時は AC を返金・在庫を戻す。
// body: { exchange_id, approve: boolean }  … 承認/却下
//       { exchange_id, complete: true }    … 承認済み→受け渡し/実施 完了(completed)
export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;

  const { exchange_id, approve, complete } = await req.json().catch(() => ({}));
  if (!exchange_id) {
    return NextResponse.json({ error: "exchange_id が必要です" }, { status: 400 });
  }

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 受け渡し/実施の完了（承認済みのものだけ completed に）
  if (complete === true) {
    const { error } = await svc.from("reward_exchanges")
      .update({ status: "completed", decided_by: auth.email })
      .eq("id", exchange_id).eq("status", "approved");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: "completed" });
  }

  if (typeof approve !== "boolean") {
    return NextResponse.json({ error: "approve(boolean) または complete(true) が必要です" }, { status: 400 });
  }
  const { data, error } = await svc.rpc("decide_reward_exchange", {
    p_exchange: exchange_id, p_approve: approve, p_by: auth.email,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data && data.ok === false) return NextResponse.json(data, { status: 400 });
  return NextResponse.json(data);
}
