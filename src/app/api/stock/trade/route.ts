import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireStudent } from "@/lib/apiAuth";

// 自塾株の買付・売却。50%アロケーション制限・残高/保有チェックは RPC 内で原子的に行う。
// body: { action: "buy" | "sell", shares: number }
export async function POST(req: NextRequest) {
  const auth = await requireStudent(req);
  if (auth instanceof NextResponse) return auth;

  const { action, shares } = await req.json().catch(() => ({}));
  const n = Number(shares);
  if ((action !== "buy" && action !== "sell") || !Number.isInteger(n) || n <= 0) {
    return NextResponse.json({ error: "action(buy/sell)と正の整数 shares が必要です" }, { status: 400 });
  }

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const fn = action === "buy" ? "buy_class_stock" : "sell_class_stock";
  const { data, error } = await svc.rpc(fn, { p_student: auth.studentId, p_shares: n });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // RPC は {ok:false,error} を返しうる（残高不足など）→ 400 で返す
  if (data && data.ok === false) return NextResponse.json(data, { status: 400 });
  return NextResponse.json(data);
}
