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

  const [{ data: schools }, { data: benchmarks }, { data: students }, { data: wallets }] = await Promise.all([
    svc.from("schools").select("id, name, current_stock_price").order("current_stock_price", { ascending: false }),
    svc.from("stock_benchmarks").select("name, price, prev_price, note").eq("active", true).order("price", { ascending: true }),
    svc.from("students").select("id, school_id"),
    svc.from("student_wallets").select("student_id, locked_balance"),
  ]);

  // 教室の「応援金」＝在籍生徒の投資運用中AC(locked)の合計
  const schoolOfStudent = new Map((students ?? []).map((s) => [s.id as string, s.school_id as string | null]));
  const support: Record<string, number> = {};
  for (const w of wallets ?? []) {
    const sch = schoolOfStudent.get(w.student_id as string);
    if (sch) support[sch] = (support[sch] ?? 0) + (w.locked_balance ?? 0);
  }

  return NextResponse.json({
    schools: (schools ?? []).map((s) => ({
      id: s.id, name: s.name, price: s.current_stock_price ?? 1000, support: support[s.id] ?? 0,
    })),
    benchmarks: benchmarks ?? [],
  });
}
