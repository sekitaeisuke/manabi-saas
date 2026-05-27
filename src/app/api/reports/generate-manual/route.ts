import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const CHECKED_GROUPS = [
  {
    label: "成果物",
    items: [
      "1日の内容が終えられる",
      "時間通りに進める",
      "暗算・暗記がスムーズ",
      "苦手単元も取り組める",
      "問題量が多い",
    ],
  },
  {
    label: "読む",
    items: ["問題を読む／わかる", "解説を読む／わかる", "ノートを読む／わかる"],
  },
  {
    label: "書く",
    items: ["ノートを使う", "途中式を書く", "言葉を書いて練習する"],
  },
  {
    label: "聞く",
    items: ["質問・相談する", "授業をわかるまで", "テスト情報収集"],
  },
  {
    label: "考える",
    items: ["誤答原因がわかる", "教科バランス良い", "解き直しを実践"],
  },
];

export async function POST(req: NextRequest) {
  const {
    studentName,
    grade,
    subject,
    learningContent,
    learningMethod,
    checkedItems,
    teacherNotes,
  } = await req.json() as {
    studentName: string;
    grade: string;
    subject: string;
    learningContent: string;
    learningMethod: string;
    checkedItems: string[];
    teacherNotes?: string;
  };

  if (!studentName || !grade || !subject) {
    return NextResponse.json({ error: "生徒名・学年・教科は必須です" }, { status: 400 });
  }

  // チェック項目をグループ別に整理してプロンプトに渡す
  const checkedSet = new Set(checkedItems);
  const checkedSummary = CHECKED_GROUPS.map((g) => {
    const checked = g.items.filter((item) => checkedSet.has(item));
    const unchecked = g.items.filter((item) => !checkedSet.has(item));
    return `【${g.label}】\nできていた: ${checked.length > 0 ? checked.join("・") : "なし"}\nまだ課題: ${unchecked.length > 0 ? unchecked.join("・") : "なし"}`;
  }).join("\n\n");

  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

  const prompt = `あなたは日本の個別指導塾の熟練した講師です。
以下の授業記録をもとに、保護者向けの授業報告書をHTML形式で作成してください。

【授業情報】
日付: ${today}
生徒: ${studentName}（${grade}）
教科: ${subject}

【学習内容（what）】
${learningContent || "（未記入）"}

【学習方法（how）】
${learningMethod || "（未記入）"}

【学習スキルチェック】
${checkedSummary}

${teacherNotes ? `【講師メモ（非公開用）】\n${teacherNotes}` : ""}

【レポート作成ルール】
- <div id="lesson-report"> ～ </div> で囲む
- マークダウン（\`\`\`など）は使わずHTMLのみ返す
- 各セクションは <h2> で区切る
- 保護者が読みやすい温かみのある文体にする
- チェック項目は表形式で視覚的に示す

【構成】
① 今日の授業サマリー（2〜3文、何をどう取り組んだかを具体的に）
② 学習スキルチェック結果（チェック項目を「できていた点」「これから伸ばしたい点」に分けて表形式で）
③ 講師からのメッセージ（生徒の頑張りをほめつつ、次回に向けたアドバイスを温かく2〜3文）
④ 次回の授業に向けて（宿題・家庭学習のポイントを具体的に1〜2項目）`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json({ error: "AI生成に失敗しました", raw: errText.slice(0, 200) }, { status: 500 });
  }

  const aiData = await res.json();
  let reportHtml = (aiData.content?.[0]?.text ?? "").trim();

  if (reportHtml.startsWith("```html")) reportHtml = reportHtml.slice(7);
  else if (reportHtml.startsWith("```")) reportHtml = reportHtml.slice(3);
  if (reportHtml.endsWith("```")) reportHtml = reportHtml.slice(0, -3);
  reportHtml = reportHtml.trim();

  const match = reportHtml.match(/<div id="lesson-report">[\s\S]*<\/div>/);
  if (match) reportHtml = match[0];

  // Supabase に保存
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const title = `${today} ${subject}授業`;

  const { data, error } = await supabase
    .from("lesson_reports")
    .insert({
      test_title: title,
      test_subject: subject,
      test_grade: grade,
      student_name: studentName,
      report_html: reportHtml,
      teacher_notes: teacherNotes ?? null,
      status: "draft",
      report_source: "manual",
      learning_content: learningContent || null,
      learning_method: learningMethod || null,
      checked_items: checkedItems,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "報告書の保存に失敗しました: " + error.message }, { status: 500 });
  }

  return NextResponse.json({ reportHtml, reportId: data.id });
}
