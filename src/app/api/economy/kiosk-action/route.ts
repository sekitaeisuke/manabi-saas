import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// kiosk（匿名端末）からの「掃除した」等のワンタップ記録。
//   悪用防止: 直前に顔認証で入室(student_room_logs entry)した生徒に限定（直近RECENT_MIN分）。
//   さらに ac_award_once の source key で当日1回のみ加算（何度押しても増えない）。
const RECENT_MIN = 15;
const KINDS = new Set(["clean", "disinfect", "rule"]);
const RULE_KEY: Record<string, string> = { clean: "clean", disinfect: "clean", rule: "clean" };

export async function POST(req: NextRequest) {
  const { student_id, kind } = await req.json().catch(() => ({}));
  const k = String(kind ?? "clean");
  if (!student_id || !KINDS.has(k)) {
    return NextResponse.json({ error: "student_id と有効な kind が必要です" }, { status: 400 });
  }
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 生徒実在＋直近の顔認証入室を確認（なりすまし/遠隔連打防止）
  const { data: student } = await svc.from("students").select("id, name, school_id").eq("id", student_id).maybeSingle();
  if (!student) return NextResponse.json({ error: "生徒が見つかりません" }, { status: 404 });
  const since = new Date(Date.now() - RECENT_MIN * 60_000).toISOString();
  const { count: recent } = await svc.from("student_room_logs")
    .select("id", { count: "exact", head: true })
    .eq("student_id", student_id).eq("type", "entry").gte("recorded_at", since);
  if (!recent) {
    return NextResponse.json({ error: "先に顔認証でチェックインしてください" }, { status: 403 });
  }

  // ルール（pt・ON/OFF）
  const { data: rule } = await svc.from("ac_rules").select("points, enabled").eq("event_key", RULE_KEY[k]).maybeSingle();
  if (rule && rule.enabled === false) {
    return NextResponse.json({ ok: true, awarded: 0, disabled: true });
  }
  const points = rule?.points ?? 1;
  const day = new Date().toISOString().slice(0, 10);

  // 貢献ログ（source は当日1回キー）＋ 冪等付与
  await svc.from("contribution_events").insert({
    student_id, student_name: student.name, school_id: student.school_id,
    kind: k, polarity: "positive", note: "kiosk",
  });
  const { data, error } = await svc.rpc("ac_award_once", {
    p_student: student_id, p_amount: points, p_type: "EARN_CONTRIBUTION",
    p_desc: `掃除（kiosk）`, p_source_type: "clean", p_source_id: `${student_id}:${day}`,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const awarded = Number(data) || 0;
  return NextResponse.json({ ok: true, awarded, already: awarded === 0 });
}
