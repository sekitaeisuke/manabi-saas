import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/apiAuth";

// 友人紹介（講師確認型）。
//   action:'create' … 紹介を登録（紹介者=生徒・友人名）
//   action:'enroll' … 入塾確定→紹介者に1000付与（status=enrolled）
//   action:'link'   … 友人が生徒登録された→紐付け＋被紹介者に100付与（status=completed）
export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  if (action === "create") {
    const { referrer_student_id, friend_name, note } = body;
    if (!referrer_student_id || !friend_name) {
      return NextResponse.json({ error: "紹介者(生徒)と友人名が必要です" }, { status: 400 });
    }
    const { data: st } = await svc.from("students").select("name").eq("id", referrer_student_id).maybeSingle();
    const { data, error } = await svc.from("referral_rewards").insert({
      referrer_student_id, referrer_name: st?.name ?? null, friend_name,
      note: note ?? null, created_by: auth.email,
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (action === "enroll") {
    if (!body.referral_id) return NextResponse.json({ error: "referral_id が必要です" }, { status: 400 });
    const { data, error } = await svc.rpc("award_referral", { p_referral: body.referral_id, p_stage: "refer" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data?.ok === false) return NextResponse.json(data, { status: 400 });
    return NextResponse.json(data);
  }

  if (action === "link") {
    const { referral_id, friend_student_id } = body;
    if (!referral_id || !friend_student_id) {
      return NextResponse.json({ error: "referral_id と friend_student_id が必要です" }, { status: 400 });
    }
    const { error: upErr } = await svc.from("referral_rewards")
      .update({ friend_student_id }).eq("id", referral_id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    const { data, error } = await svc.rpc("award_referral", { p_referral: referral_id, p_stage: "friend" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data?.ok === false) return NextResponse.json(data, { status: 400 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "action は create / enroll / link" }, { status: 400 });
}
