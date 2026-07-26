import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/apiAuth";

// 自塾株の推移チャートデータ。?school_id= 省略時はログイン中の生徒の所属校舎。
// 講師は任意の school_id を指定できる。
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let schoolId = req.nextUrl.searchParams.get("school_id");
  if (!schoolId) {
    // 生徒本人の所属校舎を解決
    const { data: { user } } = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ).auth.getUser((req.headers.get("authorization") ?? "").slice(7));
    if (user?.id) {
      const { data: st } = await svc.from("students").select("school_id").eq("auth_user_id", user.id).maybeSingle();
      schoolId = (st?.school_id as string) ?? null;
    }
  }
  if (!schoolId) return NextResponse.json({ error: "school_id を特定できません" }, { status: 400 });

  const limit = Math.min(104, Number(req.nextUrl.searchParams.get("limit") ?? 52));
  const [{ data: school }, { data: history }] = await Promise.all([
    svc.from("schools").select("id, name, current_stock_price").eq("id", schoolId).maybeSingle(),
    svc.from("class_stock_history")
      .select("price, prev_price, study_score, contrib_score, growth_score, penalty_score, calculated_at")
      .eq("school_id", schoolId).order("calculated_at", { ascending: true }).limit(limit),
  ]);

  return NextResponse.json({
    school_id: schoolId,
    school_name: school?.name ?? null,
    current_price: school?.current_stock_price ?? 1000,
    history: history ?? [],
  });
}
