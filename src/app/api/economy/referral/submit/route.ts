import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireStudent } from "@/lib/apiAuth";

// 生徒が自分で「友達を紹介したい」を申請する。status=pending で作成され、
// 先生が入塾を確認して初めて報酬(1000/100AC)が付与される（講師確認型）。
export async function POST(req: NextRequest) {
  const auth = await requireStudent(req);
  if (auth instanceof NextResponse) return auth;
  const { friend_name } = await req.json().catch(() => ({}));
  const name = String(friend_name ?? "").trim();
  if (!name) return NextResponse.json({ error: "友達の名前を入力してください" }, { status: 400 });

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // スパム抑止：未確認(pending)の申請が溜まりすぎないように上限
  const { count } = await svc.from("referral_rewards")
    .select("id", { count: "exact", head: true })
    .eq("referrer_student_id", auth.studentId).eq("status", "pending");
  if ((count ?? 0) >= 10) {
    return NextResponse.json({ ok: false, error: "確認待ちの紹介が多すぎます。先生に相談してね" }, { status: 400 });
  }

  const { data: student } = await svc.from("students").select("name").eq("id", auth.studentId).maybeSingle();
  const { error } = await svc.from("referral_rewards").insert({
    referrer_student_id: auth.studentId, referrer_name: student?.name ?? null,
    friend_name: name.slice(0, 40), created_by: "student",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
