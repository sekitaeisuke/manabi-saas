import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";
import { createClient } from "@supabase/supabase-js";
import {
  type Diagnosis,
  parseDiagnosis,
  renderTeacherReport,
  renderParentReport,
} from "@/lib/diagnosisReport";

type SectionAnswers = Record<string, number>;

// ラベルは受験ページ（test/[token]）の実際の設問文に同期している。
const SECTION_A_LABELS: Record<string, string> = {
  a1: "毎日、決まった時間に勉強している",
  a2: "宿題を決められた日までに終わらせている",
  a3: "毎日2時間以上勉強している",
  a4: "授業の前に前回の内容を見直している",
  a5: "授業が終わったその日に内容を復習している",
  a6: "テスト前に計画を立てて勉強している",
  a7: "勉強中にスマホやゲームが気になって集中できないことがある",
  a8: "「今日はいいや」と勉強をやめてしまうことがある",
};

const SECTION_B_LABELS: Record<string, string> = {
  b1: "わからない問題でも自分でじっくり考え続けている",
  b2: "間違えた問題をもう一度自分で解きなおしている",
  b3: "解説を読んで「なるほど」と理解できている",
  b4: "教科書や参考書の例題を自分で読んで学ぼうとしている",
  b5: "ノートに大事なことをまとめている",
  b6: "新しい言葉や公式を書いて覚えるようにしている",
  b7: "わからないとき先生に積極的に質問している",
  b8: "自分の得意な科目と苦手な科目がわかっている",
};

const SECTION_C_LABELS: Record<string, string> = {
  c1: "問題文に知らない言葉や用語が出てきて困ることがある",
  c2: "文の意味や言葉のルールがよくわからなくなることがある",
  c3: "問題が「何を答えればいいのか」わからなくなることがある",
  c4: "答えはわかっているのに、どう書けばいいかわからないことがある",
  c5: "頭ではわかっているのに、うまく答えを書けないことがある",
  c6: "計算や暗記（単語・公式）はスムーズにできている",
  c7: "間違えた問題について、なぜ間違えたか自分で説明できる",
};

// 逆転項目：「〜で困る／やめてしまう」など、高評価ほど“悪い”設問。
// 5 - r で反転し、全指標を「高いほど良い」に統一して採点する。
const REVERSE_KEYS = new Set(["a7", "a8", "c1", "c2", "c3", "c4", "c5"]);

// 言語力（読解・表現・説明）= C1〜C5、技能（計算・暗記・メタ認知）= C6・C7
const VERBAL_KEYS = ["c1", "c2", "c3", "c4", "c5"];
const SKILL_KEYS = ["c6", "c7"];

function ratingText(r: number): string {
  return r === 4 ? "いつもそう" : r === 3 ? "だいたいそう" : r === 2 ? "あまりそうでない" : "ほとんどない";
}

// 指定キー群を極性補正して 0〜100 で採点（回答が無いキーは除外）
function scoreItems(answers: SectionAnswers, keys: string[]): number {
  const present = keys.filter((k) => typeof answers[k] === "number");
  if (present.length === 0) return 0;
  const sum = present.reduce((s, k) => {
    const v = answers[k] as number;
    return s + (REVERSE_KEYS.has(k) ? 5 - v : v);
  }, 0);
  return Math.round((sum / (present.length * 4)) * 100);
}

async function callClaude(prompt: string, system?: string): Promise<string> {
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
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Claude APIエラー: ${(err as { error?: { message?: string } }).error?.message ?? res.status}`);
  }
  const data = await res.json() as { content?: { text?: string }[] };
  return data.content?.[0]?.text ?? "";
}

// ─── 三角測定・三層固定診断モデル ─────────────────────────
// 答案 × 学習法 × 学習習慣を三角測定し、主ボトルネックを1つだけ特定する。
// 出力は必ず固定の構造化JSON。文章レポート化はサーバ側で行う。

const SYSTEM_PROMPT = `あなたは学力診断分析システムである。

判断基準は「三角測定：答案×学習法×学習習慣」のみとする。
推測・印象・性格評価は禁止する。

必ず以下の順で分析する。
1. 観測事実を根拠ごとに列挙する
2. 各観測を「一致・矛盾・不明」に分類する
3. 一致データのみを根拠に、最大3つの仮説を立てる
4. 主ボトルネックを1つだけ決める
5. 主ボトルネックに対する具体行動を1つだけ提示する

仮説は以下の3つのみ使用する。
H1：下位能力（計算処理・分数/小数処理・単位換算・語句理解・根拠抽出・要約構成 など、その教科を解くために必要な土台の力）
H2：学習方法（問題文の条件に線を引かない・途中式を書かない・数字だけ見て式を立てる・根拠を本文から探さない・解説を読まない など、やり方の欠落）
H3：学習習慣（宿題以外の演習不足・解き直し不足・音読/読書不足・書いて練習していない・テスト形式で再現していない など、量と回転の欠落）

主因判定は必ず以下の順序で行う。最初にNOとなった層を主因とする。
1. 下位能力は最低作動点を満たしているか（NO → 主因 H1）
2. 学習方法を知っているか（NO → 主因 H2）
3. 学習習慣が回っているか（NO → 主因 H3）

矛盾データ（例：「見直す」と答えているのに条件ミスが多い）は主因判定に使わない。矛盾は観測としては記録するが、主因の根拠にはしない。

設問の読み飛ばしは「不注意」ではなく、条件・数字・単位に線を引く行動の欠落（H2）として扱う。

禁止表現：「ケアレスミス」「もっと集中」「よく読む」「丁寧に書く」「やる気」「性格」「頑張る」。
これらは必ず具体的な行動に変換する。
例：問題文の数字・単位・条件に線を引く／途中式を1行ずつ大きく書く／間違えた問題を答えを見ずにもう一度解く。

出力は指定されたJSONのみ。説明文・マークダウン・コードフェンスを付けない。`;

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const { session_id } = await req.json() as { session_id: string };

  // RLS を貫通するため service role で読み書き（呼び出し元は requireTeacher 済み）
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Fetch questionnaire response
  const { data: qr, error } = await supabase
    .from("questionnaire_responses")
    .select("*")
    .eq("session_id", session_id)
    .single();

  if (error || !qr) {
    return NextResponse.json({ error: "アンケートデータが見つかりません" }, { status: 404 });
  }

  const sA = (qr.section_a ?? {}) as SectionAnswers;
  const sB = (qr.section_b ?? {}) as SectionAnswers;
  const sC = (qr.section_c ?? {}) as SectionAnswers;

  const habitScore = scoreItems(sA, Object.keys(SECTION_A_LABELS));
  const methodScore = scoreItems(sB, Object.keys(SECTION_B_LABELS));
  const verbalScore = scoreItems(sC, VERBAL_KEYS);   // 言語力（C1〜C5）
  const skillScore = scoreItems(sC, SKILL_KEYS);     // 技能（C6・C7）
  const testRate = qr.test_percentage ?? null;

  // Format section answers for prompt
  const formatSection = (labels: Record<string, string>, answers: SectionAnswers) =>
    Object.entries(labels)
      .map(([k, label]) => `  ・${label}：${ratingText(answers[k] ?? 1)}（${answers[k] ?? 1}点）`)
      .join("\n");

  const aiAnalysisSection = qr.ai_analysis
    ? `\n【学力テスト 解答分析（AI自動分析済み・答案から抽出）】\n${qr.ai_analysis}\n`
    : "\n【学力テスト 解答分析】答案の詳細分析なし。正答率のみを手がかりにする。\n";

  const prompt = `次の生徒について、三角測定（答案×学習法×学習習慣）で主ボトルネックを1つ特定してください。

━━━━━━━━━━━━━━━━━━━━
【生徒情報】
氏名: ${qr.student_name}　学年: ${qr.grade ?? "不明"}　科目: ${qr.subject ?? "不明"}

【答案（学力テスト）】
得点: ${qr.test_score ?? "未実施"}点 / ${qr.test_total ?? "-"}点（正答率 ${testRate ?? "-"}%）
${aiAnalysisSection}

【学習方法（自己申告・4段階／高いほど良い） 集計 ${methodScore}/100】
${formatSection(SECTION_B_LABELS, sB)}

【学習習慣（自己申告・4段階／高いほど良い） 集計 ${habitScore}/100】
${formatSection(SECTION_A_LABELS, sA)}

【言語力・技能の自己評価（「困る」系は極性補正済み・言語力 ${verbalScore}/100 ／ 技能 ${skillScore}/100）】
${formatSection(SECTION_C_LABELS, sC)}
━━━━━━━━━━━━━━━━━━━━

上記だけを根拠に、次のJSONだけを出力してください（説明文・コードフェンス禁止）:

{
  "observations": [
    { "source": "観点（例:テスト正答率 / 学習法B2 / 習慣A5 など）", "fact": "観測した具体的事実", "consistency": "一致 または 矛盾 または 不明" }
  ],
  "hypotheses": {
    "H1": "下位能力の観点で成立しうる仮説（無ければ『下位能力は作動点を満たす』）",
    "H2": "学習方法の観点で成立しうる仮説",
    "H3": "学習習慣の観点で成立しうる仮説"
  },
  "bottleneck": {
    "layer": "H1 か H2 か H3（下位能力→学習方法→学習習慣の順で最初にNOになった層）",
    "label": "主ボトルネックの短い名前（15字程度・具体的に。例『分数の通分処理』）",
    "reason": "なぜこの層が主因か。矛盾データを除外した根拠を簡潔に"
  },
  "intervention": "次回すぐ実行できる具体行動を1つだけ（禁止表現を使わない・1文）",
  "parent_message": "保護者向けの温かいメッセージ150〜200字。専門用語やH1等の記号は使わず、良い点に触れつつ『いま伸びる一歩』を前向きに伝える"
}

observations は5〜10件。矛盾は必ず consistency を「矛盾」にし、主因判定には使わないこと。`;

  let diagnosis: Diagnosis;
  let teacherReportHtml: string;
  let parentReportHtml: string;
  try {
    const raw = await callClaude(prompt, SYSTEM_PROMPT);
    diagnosis = parseDiagnosis(raw);
    teacherReportHtml = renderTeacherReport(diagnosis);
    parentReportHtml = renderParentReport(diagnosis);
  } catch (e) {
    return NextResponse.json({ error: "診断の生成に失敗しました: " + String(e) }, { status: 500 });
  }

  // Save both reports, structured diagnosis, scores and the bottleneck fields.
  const { error: updateErr } = await supabase.from("questionnaire_responses").update({
    habit_score: habitScore,
    method_score: methodScore,
    verbal_score: verbalScore,
    skill_score: skillScore,
    report_html: parentReportHtml,          // 保護者向け（温かい）
    teacher_report_html: teacherReportHtml,  // 講師向け（尖った5項目）
    diagnosis_json: diagnosis,
    bottleneck_layer: diagnosis.bottleneck.layer,
    bottleneck_label: diagnosis.bottleneck.label,
    intervention: diagnosis.intervention,
    status: "analyzed",
  }).eq("session_id", session_id);
  if (updateErr) {
    console.error("questionnaire_responses update failed:", updateErr);
    return NextResponse.json({ error: "診断結果の保存に失敗しました: " + updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    teacherReportHtml,
    parentReportHtml,
    diagnosis,
    bottleneckLayer: diagnosis.bottleneck.layer,
    bottleneckLabel: diagnosis.bottleneck.label,
    intervention: diagnosis.intervention,
    habitScore,
    methodScore,
    verbalScore,
    skillScore,
    studentName: qr.student_name,
    grade: qr.grade,
    subject: qr.subject,
    testScore: qr.test_score,
    testTotal: qr.test_total,
    testRate,
  });
}
