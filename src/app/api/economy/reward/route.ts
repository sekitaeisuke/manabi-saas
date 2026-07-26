import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireStudent } from "@/lib/apiAuth";

function svcClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET: 交換可能な報酬アイテム一覧（自校＋全校共通・有効なもの）。
export async function GET(req: NextRequest) {
  const auth = await requireStudent(req);
  if (auth instanceof NextResponse) return auth;
  const svc = svcClient();
  let q = svc.from("reward_items").select("id, title, description, cost, stock, school_id, category")
    .eq("active", true).order("cost", { ascending: true });
  // 自校 or 全校共通(school_id is null)
  if (auth.schoolId) q = q.or(`school_id.is.null,school_id.eq.${auth.schoolId}`);
  else q = q.is("school_id", null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// POST: 報酬交換申請（AC を前引き→承認待ち）。body: { reward_id }
export async function POST(req: NextRequest) {
  const auth = await requireStudent(req);
  if (auth instanceof NextResponse) return auth;
  const { reward_id } = await req.json().catch(() => ({}));
  if (!reward_id) return NextResponse.json({ error: "reward_id が必要です" }, { status: 400 });

  const svc = svcClient();
  const { data, error } = await svc.rpc("redeem_reward", { p_student: auth.studentId, p_reward: reward_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data && data.ok === false) return NextResponse.json(data, { status: 400 });
  return NextResponse.json(data);
}
