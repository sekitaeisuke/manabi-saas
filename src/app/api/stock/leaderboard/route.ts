import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/apiAuth";

// 自塾株ランキング＋ライバル塾（目標）。生徒「経済」タブの比較表示に使う。
// 自塾各教室の現在株価と、stock_benchmarks（M塾・月光G塾 等の目標株価）を返す。
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const [{ data: schools }, { data: benchmarks }] = await Promise.all([
    svc.from("schools").select("id, name, current_stock_price").order("current_stock_price", { ascending: false }),
    svc.from("stock_benchmarks").select("name, price, note").eq("active", true).order("price", { ascending: true }),
  ]);

  return NextResponse.json({
    schools: (schools ?? []).map((s) => ({ id: s.id, name: s.name, price: s.current_stock_price ?? 1000 })),
    benchmarks: benchmarks ?? [],
  });
}
