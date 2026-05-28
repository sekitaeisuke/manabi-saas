import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { prompt, schools } = await req.json() as {
    prompt: string;
    schools: { id: string; name: string; group_name: string | null }[];
  };

  if (!prompt?.trim()) {
    return NextResponse.json({ error: "prompt は必須です" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const schoolList = schools.map((s) => `・${s.name}（ID: ${s.id}）`).join("\n") || "（教室情報なし）";

  const fullPrompt = `あなたは学習塾のスケジュール管理担当です。
管理者の指示から、カレンダーに登録するイベント情報をJSONで生成してください。

今日の日付: ${today}

【教室一覧】
${schoolList}

【管理者の指示】
${prompt}

以下のJSON形式のみで返してください（説明文・コードブロック不要）:
{
  "events": [
    {
      "school_id": "教室UUID（全教室対象の場合はnull）",
      "date": "YYYY-MM-DD",
      "start_time": "HH:MM（時間がない場合はnull）",
      "end_time": "HH:MM（時間がない場合はnull）",
      "title": "イベントタイトル（簡潔に）",
      "description": "詳細説明（任意、不要ならnull）",
      "event_type": "event|exam|holiday|class|info",
      "visible_to_teachers": true,
      "visible_to_parents": true,
      "visible_to_students": true
    }
  ]
}

event_typeの選択基準:
- event: 運動会・保護者会・発表会など行事全般
- exam: 漢字検定・英検・模擬試験など試験
- holiday: 休校・休業日
- class: 特別授業・補講・夏期講習など
- info: お知らせ・連絡事項など`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: fullPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "(読み取り不可)");
    return NextResponse.json({ error: `Claude API ${res.status}: ${err}` }, { status: 500 });
  }

  const data = await res.json();
  let content: string = (data.content?.[0]?.text ?? "").trim();

  if (content.startsWith("```json")) content = content.slice(7);
  else if (content.startsWith("```")) content = content.slice(3);
  if (content.endsWith("```")) content = content.slice(0, -3);
  content = content.trim();

  const match = content.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json({ error: "AIの出力をパースできませんでした" }, { status: 500 });
  }

  let result: { events: unknown[] };
  try {
    result = JSON.parse(match[0]);
  } catch {
    return NextResponse.json({ error: "AIレスポンスのJSONパースに失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ events: result.events ?? [] });
}
