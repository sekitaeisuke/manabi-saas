import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const maxDuration = 30;

type School   = { id: string; name: string; group_name: string | null };
type Teacher  = { id: string; name: string; school_id: string | null };
type ReqRow   = {
  date: string; slot_start: string; slot_end: string; availability: string;
  teachers: (Teacher & { schools?: { name: string } | null }) | null;
};
type ShiftRow = {
  date: string; slot_start: string; slot_end: string;
  school_id: string; school_name: string;
  teacher_id: string; teacher_name: string;
  note?: string | null;
};

// ─── アルゴリズムによるシフト自動割り当て ──────────────────────
function assignShifts(
  requests: ReqRow[],
  schools: School[],
  mode: string,
  customInstruction: string,
): { shifts: ShiftRow[]; warnings: string[] } {
  const warnings: string[] = [];

  // ◎優先→○可の順にソート
  const sorted = [...requests]
    .filter((r) => r.availability !== "unavailable" && r.teachers)
    .sort((a, b) => {
      if (a.availability === "preferred" && b.availability !== "preferred") return -1;
      if (b.availability === "preferred" && a.availability !== "preferred") return 1;
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.slot_start.localeCompare(b.slot_start);
    });

  const teacherSlotUsed  = new Set<string>(); // "teacher_id|date|slot_start" — 同時刻の重複防止
  const schoolSlotFilled = new Set<string>(); // "school_id|date|slot_start"  — 教室ごとに1枠
  const shifts: ShiftRow[] = [];

  for (const r of sorted) {
    const t = r.teachers!;
    const slotStart = r.slot_start.slice(0, 5);
    const slotEnd   = r.slot_end.slice(0, 5);
    const teacherKey = `${t.id}|${r.date}|${slotStart}`;
    if (teacherSlotUsed.has(teacherKey)) continue; // この講師はこの時間すでに配置済み

    // 配置先教室を決定
    let targetSchools: School[];
    if (mode === "dedicated") {
      targetSchools = t.school_id ? schools.filter((s) => s.id === t.school_id) : [];
    } else {
      // 縦断型: 自校を優先し、埋まっていれば他校へ
      const homeFirst = [
        ...schools.filter((s) => s.id === t.school_id),
        ...schools.filter((s) => s.id !== t.school_id),
      ];
      targetSchools = homeFirst;
    }

    let assigned = false;
    for (const school of targetSchools) {
      const schoolKey = `${school.id}|${r.date}|${slotStart}`;
      if (schoolSlotFilled.has(schoolKey)) continue; // この教室×時間はすでに埋まっている

      teacherSlotUsed.add(teacherKey);
      schoolSlotFilled.add(schoolKey);
      shifts.push({
        date: r.date,
        slot_start: slotStart,
        slot_end: slotEnd,
        school_id: school.id,
        school_name: school.name,
        teacher_id: t.id,
        teacher_name: t.name,
        note: null,
      });
      assigned = true;
      break;
    }

    if (!assigned) {
      warnings.push(`${t.name} の ${r.date} ${slotStart} は配置できませんでした（教室が埋まっているか未所属）`);
    }
  }

  return { shifts, warnings };
}

// ─── Claude による短い要約のみ ─────────────────────────────────
async function summarize(shifts: ShiftRow[], warnings: string[], customInstruction: string): Promise<string> {
  const instructionPart = customInstruction.trim()
    ? `\n管理者追加指示（参考）: 「${customInstruction.slice(0, 100)}」`
    : "";
  const body = JSON.stringify({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system: "50字以内の日本語テキストのみ返してください。",
    messages: [{
      role: "user",
      content: `シフト自動割り当て結果: ${shifts.length}件配置、未配置警告${warnings.length}件。${instructionPart}\n一言で要約してください。`,
    }],
  });
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body,
    });
    if (!res.ok) return `${shifts.length}件のシフトを自動生成しました。`;
    const data = await res.json();
    return (data.content?.[0]?.text ?? "").trim() || `${shifts.length}件のシフトを自動生成しました。`;
  } catch {
    return `${shifts.length}件のシフトを自動生成しました。`;
  }
}

// ─── POST ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { period_id, custom_prompt } = await req.json() as {
    period_id: string;
    custom_prompt?: string;
  };

  if (!period_id) {
    return NextResponse.json({ error: "period_id は必須です" }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 期間情報
  const { data: period, error: pErr } = await admin
    .from("shift_periods")
    .select("*, schools(id, name, group_name)")
    .eq("id", period_id)
    .single();
  if (pErr || !period) {
    return NextResponse.json({ error: "期間が見つかりません" }, { status: 404 });
  }

  // 希望データ
  const { data: requests, error: rErr } = await admin
    .from("shift_requests")
    .select("*, teachers(id, name, school_id, schools(name))")
    .eq("period_id", period_id)
    .order("date").order("slot_start");
  if (rErr) {
    return NextResponse.json({ error: "希望データの取得に失敗: " + rErr.message }, { status: 500 });
  }

  // 教室一覧
  const groupName = (period.schools as { group_name: string | null } | null)?.group_name;
  let schoolsQuery = admin.from("schools").select("id, name, group_name");
  if (groupName) {
    schoolsQuery = schoolsQuery.eq("group_name", groupName);
  } else if (period.school_id) {
    schoolsQuery = schoolsQuery.eq("id", period.school_id);
  } else {
    // フォールバック: 希望を提出した講師の所属教室に絞る
    const teacherSchoolIds = [...new Set(
      (requests ?? []).map((r) => (r.teachers as { school_id: string | null } | null)?.school_id).filter(Boolean) as string[]
    )];
    if (teacherSchoolIds.length > 0) {
      schoolsQuery = schoolsQuery.in("id", teacherSchoolIds);
    }
  }
  const { data: schools } = await schoolsQuery;

  // アルゴリズムでシフト割り当て
  const { shifts, warnings } = assignShifts(
    (requests ?? []) as ReqRow[],
    (schools  ?? []) as School[],
    period.assignment_mode,
    custom_prompt?.trim() ?? "",
  );

  // Claude で短い要約
  const summary = await summarize(shifts, warnings, custom_prompt?.trim() ?? "");

  // 実行履歴保存
  await admin.from("shift_ai_runs").insert({
    period_id,
    custom_prompt: custom_prompt ?? null,
    assignment_mode: period.assignment_mode,
    raw_response: summary,
    result_json: { shifts, warnings, summary },
  }).select("id").single();

  return NextResponse.json({ shifts, warnings, summary, unassigned_slots: [] });
}
