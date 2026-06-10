import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/apiAuth";

type ShiftRow = {
  date:        string;
  slot_start:  string;
  slot_end:    string;
  school_id:   string;
  teacher_id:  string;
  note?:       string | null;
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { period_id, shifts, status = "draft" } = await req.json() as {
    period_id: string;
    shifts: ShiftRow[];
    status?: "draft" | "confirmed";
  };

  if (!period_id || !Array.isArray(shifts)) {
    return NextResponse.json({ error: "period_id と shifts は必須です" }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 既存データを削除してから再挿入
  // confirmed の場合は全ステータスを削除（完全リプレイス）、draft は draft のみ削除
  let delQuery = admin.from("shift_assignments").delete().eq("period_id", period_id);
  if (status === "draft") delQuery = delQuery.eq("status", "draft");
  const { error: delErr } = await delQuery;
  if (delErr) {
    console.error("shift_assignments delete failed:", delErr);
    return NextResponse.json({ error: "既存データの削除に失敗: " + delErr.message }, { status: 500 });
  }

  if (shifts.length === 0) {
    return NextResponse.json({ success: true, count: 0 });
  }

  const rows = shifts.map((s) => ({
    period_id,
    teacher_id: s.teacher_id,
    school_id:  s.school_id,
    date:       s.date,
    slot_start: s.slot_start,
    slot_end:   s.slot_end,
    status,
    note:       s.note ?? null,
  }));

  const { error: insertErr } = await admin.from("shift_assignments").insert(rows);
  if (insertErr) {
    console.error("shift_assignments insert failed:", insertErr);
    return NextResponse.json({ error: "シフトの保存に失敗: " + insertErr.message }, { status: 500 });
  }

  // confirmed の場合: 期間ステータス更新 + 対象講師に通知
  if (status === "confirmed") {
    await admin.from("shift_periods").update({ status: "published" }).eq("id", period_id);

    // 期間ラベルを取得
    const { data: period } = await admin
      .from("shift_periods").select("label").eq("id", period_id).maybeSingle();
    const label = (period as { label?: string } | null)?.label ?? "シフト";

    // 対象講師一覧（重複排除）
    const teacherIds = [...new Set(rows.map((r) => r.teacher_id))];

    // 各講師に push / LINE 通知（ベストエフォート）
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://manabi-saas.vercel.app";
    await Promise.allSettled(
      teacherIds.map((tid) =>
        fetch(`${appUrl}/api/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actor_kind: "teacher",
            actor_id:   tid,
            event_type: "shift_confirmed",
            subject:    `【シフト確定】${label}`,
            body_text:  `${label}のシフトが確定・公開されました。マイページで確認してください。`,
            link:       `${appUrl}/teacher/dashboard/shifts`,
          }),
        }).catch((e) => console.warn("通知送信失敗（ベストエフォート）:", e))
      )
    );
  }

  return NextResponse.json({ success: true, count: rows.length, notified: status === "confirmed" });
}
