import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

import { generateText, AiUnavailableError } from "@/lib/ai";
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
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const {
    studentName,
    grade,
    subject,
    learningContent,
    learningMethod,
    checkedItems,
    teacherNotes,
    messageToChild,
  } = await req.json() as {
    studentName: string;
    grade: string;
    subject: string;
    learningContent: string;
    learningMethod: string;
    checkedItems: string[];
    teacherNotes?: string;
    messageToChild?: string;
  };

  if (!studentName || !grade || !subject) {
    return NextResponse.json({ error: "生徒名・学年・教科は必須です" }, { status: 400 });
  }

  const checkedSet = new Set(checkedItems);
  const checkedSummary = CHECKED_GROUPS.map((g) => {
    const checked = g.items.filter((item) => checkedSet.has(item));
    const unchecked = g.items.filter((item) => !checkedSet.has(item));
    return `【${g.label}】\nできていた: ${checked.length > 0 ? checked.join("・") : "なし"}\nまだ課題: ${unchecked.length > 0 ? unchecked.join("・") : "なし"}`;
  }).join("\n\n");

  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

  const messageSection = messageToChild
    ? `【お子様に伝えて欲しいこと（講師メモ）】\n${messageToChild}`
    : "";

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

${messageSection}
${teacherNotes ? `【講師メモ（補足）】\n${teacherNotes}` : ""}

【レポート作成ルール】
- <div id="lesson-report"> ～ </div> で囲む
- マークダウン（\`\`\`など）は使わずHTMLのみ返す
- 各セクションは <h2> で区切る
- 保護者が読みやすい温かみのある文体にする
- チェック項目は表形式で視覚的に示す
- 「お子様に伝えて欲しいこと」セクションは報告書の最初に配置し、背景色 #fffbeb・ボーダー #fcd34d の目立つカードで囲む

【構成】
① 【お子様に伝えて欲しいこと】${messageToChild ? `（以下の内容を温かく丁寧な言葉に仕上げて）：${messageToChild}` : "（今日の授業で特に褒めたい点を具体的に1〜2文）"}
② 今日の授業サマリー（2〜3文、何をどう取り組んだかを具体的に）
③ 学習スキルチェック結果（チェック項目を「できていた点」「これから伸ばしたい点」に分けて表形式で）
④ 講師からのメッセージ（次回に向けたアドバイスを温かく2〜3文）
⑤ 次回の授業に向けて（宿題・家庭学習のポイントを具体的に1〜2項目）`;

  let reportHtml: string;
  try {
    reportHtml = (await generateText({ prompt, maxTokens: 4096, feature: "report_manual" })).text;
  } catch (e) {
    const msg = e instanceof AiUnavailableError ? e.message : "AI生成に失敗しました";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (reportHtml.startsWith("```html")) reportHtml = reportHtml.slice(7);
  else if (reportHtml.startsWith("```")) reportHtml = reportHtml.slice(3);
  if (reportHtml.endsWith("```")) reportHtml = reportHtml.slice(0, -3);
  reportHtml = reportHtml.trim();

  const match = reportHtml.match(/<div id="lesson-report">[\s\S]*<\/div>/);
  if (match) reportHtml = match[0];

  const title = `${today} ${subject}授業`;

  return NextResponse.json({ reportHtml, title, messageToChild: messageToChild ?? null });
}
