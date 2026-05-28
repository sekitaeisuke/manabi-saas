import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const maxDuration = 30;

async function callClaude(prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: "あなたはJSONのみを返すAPIです。説明文・前置き・コードブロック・マークダウンは一切含めず、純粋なJSONオブジェクト { ... } のみを返してください。",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "(読み取り不可)");
    throw new Error(`Claude API ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

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

  // 期間情報を取得
  const { data: period, error: pErr } = await admin
    .from("shift_periods")
    .select("*, schools(id, name, group_name)")
    .eq("id", period_id)
    .single();
  if (pErr || !period) {
    return NextResponse.json({ error: "期間が見つかりません" }, { status: 404 });
  }

  // 希望提出を全件取得（講師名・メール付き）
  const { data: requests, error: rErr } = await admin
    .from("shift_requests")
    .select("*, teachers(id, name, email, school_id, schools(name))")
    .eq("period_id", period_id)
    .order("date")
    .order("slot_start");
  if (rErr) {
    return NextResponse.json({ error: "希望データの取得に失敗: " + rErr.message }, { status: 500 });
  }

  // 同グループの教室一覧を取得
  const groupName = (period.schools as { group_name: string | null } | null)?.group_name;
  let schoolsQuery = admin.from("schools").select("id, name, group_name");
  if (groupName) {
    schoolsQuery = schoolsQuery.eq("group_name", groupName);
  } else if (period.school_id) {
    schoolsQuery = schoolsQuery.eq("id", period.school_id);
  }
  const { data: schools } = await schoolsQuery;

  // プロンプト構築
  const modeLabel = period.assignment_mode === "flexible"
    ? "縦断型（同グループ内の複数教室をまたいで配置可能）"
    : "専属型（各講師は自分の所属教室のみに配置）";

  const schoolLines = (schools ?? []).map((s: { id: string; name: string; group_name: string | null }) =>
    `・${s.name} [school_id: ${s.id}]${s.group_name ? `（グループ: ${s.group_name}）` : ""}`
  ).join("\n");

  // 講師ごとに希望をまとめる
  const teacherMap = new Map<string, {
    name: string; school: string; requests: typeof requests;
  }>();
  for (const r of requests ?? []) {
    const t = r.teachers as { id: string; name: string; email: string; schools: { name: string } | null } | null;
    if (!t) continue;
    if (!teacherMap.has(t.id)) {
      teacherMap.set(t.id, { name: t.name, school: t.schools?.name ?? "未所属", requests: [] });
    }
    teacherMap.get(t.id)!.requests.push(r);
  }

  const teacherLines = Array.from(teacherMap.entries()).map(([tid, v]) => {
    const reqs = v.requests.map((r: { date: string; slot_start: string; slot_end: string; availability: string; note: string | null }) =>
      `    ${r.date} ${r.slot_start}〜${r.slot_end}: ${
        r.availability === "preferred" ? "◎優先希望"
        : r.availability === "available" ? "○可"
        : "×不可"
      }${r.note ? ` (備考: ${r.note})` : ""}`
    ).join("\n");
    return `【${v.name}】所属: ${v.school} [teacher_id: ${tid}]\n${reqs || "  希望なし（未提出）"}`;
  }).join("\n\n");

  const prompt = `あなたは学習塾のシフト管理の専門家です。
以下の情報をもとに、最適なシフト表を作成してください。

【シフト期間】
期間名: ${period.label}
対象日: ${period.start_date} 〜 ${period.end_date}
配置モード: ${modeLabel}

【教室一覧】
${schoolLines || "（教室情報なし）"}

【講師の希望一覧】
${teacherLines || "（希望提出なし）"}

【配置ルール】
- "◎優先希望"を最大限優先してください
- "×不可"は絶対に配置しないでください
- "○可"は必要に応じて配置してください
- 同一講師を同日同時刻に複数教室に配置しないでください
${period.assignment_mode === "dedicated"
  ? "- 専属型: 各講師は自分の所属教室のみに配置してください"
  : "- 縦断型: 同グループ内の複数教室をまたいで配置して構いません"
}

【管理者からの追加指示】
${custom_prompt?.trim() || "なし"}

以下のJSON形式のみで返してください（説明文・コードブロック不要）:
{
  "shifts": [
    {
      "date": "YYYY-MM-DD",
      "slot_start": "HH:MM",
      "slot_end": "HH:MM",
      "school_id": "教室のUUID（教室一覧から選択）",
      "school_name": "教室名",
      "teacher_id": "講師のUUID",
      "teacher_name": "講師名",
      "note": "備考（任意）"
    }
  ],
  "unassigned_slots": ["配置できなかったスロットの説明"],
  "warnings": ["注意点・懸念事項"],
  "summary": "シフト調整の概要（200字程度）"
}`;

  let rawResponse = "";
  try {
    rawResponse = await callClaude(prompt);
  } catch (err) {
    return NextResponse.json({ error: "AI呼び出しに失敗しました: " + String(err) }, { status: 500 });
  }

  // JSON抽出（コードブロック・前後テキストを除去して最初の {...} を取り出す）
  let content = rawResponse.trim();
  content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json({
      error: "AIの出力からJSONを取り出せませんでした",
      raw: rawResponse.slice(0, 800),
    }, { status: 500 });
  }

  let resultJson: Record<string, unknown>;
  try {
    resultJson = JSON.parse(match[0]);
  } catch {
    return NextResponse.json({
      error: "AIレスポンスのJSONパースに失敗しました",
      raw: match[0].slice(0, 800),
    }, { status: 500 });
  }

  // 実行履歴を保存（失敗しても結果は返す）
  const { data: aiRun, error: runErr } = await admin.from("shift_ai_runs").insert({
    period_id,
    custom_prompt: custom_prompt ?? null,
    assignment_mode: period.assignment_mode,
    raw_response: rawResponse,
    result_json: resultJson,
  }).select("id").single();
  if (runErr) console.error("AI実行履歴の保存失敗（非致命的）:", runErr);

  return NextResponse.json({
    run_id: aiRun?.id ?? null,
    ...resultJson,
  });
}
