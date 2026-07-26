import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/apiAuth";

// 講師による AC 付与 ／ 貢献イベント記録。
//   モードA（貢献記録）: { student_id, contribution: { kind, polarity?, note?, occurred_on? }, award? }
//     → contribution_events に記録（週次Δcontrib の源泉）＋ award(既定100AC) を EARN_CONTRIBUTION で付与
//   モードB（直接付与）: { student_id, amount, type?, description? }
//     → ac_award（type 既定は EARN_TASK。負値=ADMIN_ADJUSTMENT 調整も可）
export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const studentId = body.student_id as string | undefined;
  if (!studentId) return NextResponse.json({ error: "student_id が必要です" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 講師の id/name と生徒の school_id/name を解決
  const [{ data: teacher }, { data: student }] = await Promise.all([
    svc.from("teachers").select("id, name").eq("email", auth.email).maybeSingle(),
    svc.from("students").select("id, name, school_id").eq("id", studentId).maybeSingle(),
  ]);
  if (!student) return NextResponse.json({ error: "生徒が見つかりません" }, { status: 404 });

  // モードA: 貢献記録
  if (body.contribution) {
    const c = body.contribution;
    if (!c.kind) return NextResponse.json({ error: "contribution.kind が必要です" }, { status: 400 });
    const polarity = c.polarity === "negative" ? "negative" : "positive";
    const { error: ceErr } = await svc.from("contribution_events").insert({
      student_id: studentId,
      student_name: student.name,
      school_id: student.school_id,
      teacher_id: teacher?.id ?? null,
      teacher_name: teacher?.name ?? null,
      kind: c.kind,
      polarity,
      note: c.note ?? null,
      occurred_on: c.occurred_on ?? undefined,
    });
    if (ceErr) return NextResponse.json({ error: ceErr.message }, { status: 500 });

    // ポジティブな貢献にはACを付与（負イベントは記録のみ）
    let balance: number | null = null;
    const awardAmt = polarity === "positive" ? Number(body.award ?? 100) : 0;
    if (awardAmt > 0) {
      const { data, error } = await svc.rpc("ac_award", {
        p_student: studentId, p_amount: awardAmt, p_type: "EARN_CONTRIBUTION",
        p_desc: `貢献: ${c.kind}${c.note ? "（" + c.note + "）" : ""}`, p_meta: null,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      balance = data as number;
    }
    return NextResponse.json({ ok: true, awarded: awardAmt, balance });
  }

  // モードB: 直接付与
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount === 0) {
    return NextResponse.json({ error: "amount（0以外の整数）が必要です" }, { status: 400 });
  }
  const type = (body.type as string) || (amount < 0 ? "ADMIN_ADJUSTMENT" : "EARN_TASK");
  const { data, error } = await svc.rpc("ac_award", {
    p_student: studentId, p_amount: amount, p_type: type,
    p_desc: body.description ?? "", p_meta: null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, balance: data as number });
}
