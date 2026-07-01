import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";
import { CHECK_GROUPS, CHECK_ITEMS, GROUP_SCORE_HINT } from "@/lib/checkGroups";

// 報告書の「学習スキル17項目」を、学力診断(questionnaire_responses)から推定して下書きチェックを返す。
// これは講師が最終確認・調整する下書き。
//
// 2段構え:
//   ① 直接マッピング（確定的・高精度）… 診断の生回答 section_a/b/c（各設問1〜4）を
//      17項目に1対1で対応づけ、閾値で checked を決める。逆転設問は極性補正。
//   ② AIフォールバック … 生回答が無い場合のみ、集約スコアから Claude が推定。
//
// 判定パターン・JSON配列抽出は collaboration/sync を踏襲。

type Diag = {
  id: string;
  student_name: string | null;
  subject: string | null;
  section_a: Record<string, number> | null;
  section_b: Record<string, number> | null;
  section_c: Record<string, number> | null;
  test_percentage: number | null;
  habit_score: number | null;
  method_score: number | null;
  verbal_score: number | null;
  skill_score: number | null;
  ai_analysis: string | null;
  created_at: string;
};

type PerItem = { item: string; checked: boolean; confidence: number; reason: string };

// 17項目 → 診断設問キーの対応。section: a/b/c、reverse=「困る/やめる」系の逆転設問。
// 設問文は from-questionnaire/route.ts の SECTION_*_LABELS と同期。
const ITEM_MAP: Record<string, { section: "a" | "b" | "c"; key: string; reverse?: boolean }> = {
  // 成果物
  "1日の内容が終えられる": { section: "a", key: "a2" },              // 宿題を期日までに終わらせている
  "時間通りに進める": { section: "a", key: "a1" },                    // 決まった時間に勉強している
  "暗算・暗記がスムーズ": { section: "c", key: "c6" },                // 計算や暗記はスムーズ
  "苦手単元も取り組める": { section: "b", key: "b8" },                // 得意・苦手がわかっている
  "問題量が多い": { section: "a", key: "a3" },                        // 毎日2時間以上勉強している
  // 読む
  "問題を読む／わかる": { section: "c", key: "c3", reverse: true },   // 何を答えるかわからなくなる(逆転)
  "解説を読む／わかる": { section: "b", key: "b3" },                  // 解説を読んで理解できている
  "ノートを読む／わかる": { section: "b", key: "b4" },               // 例題を自分で読んで学ぶ
  // 書く
  "ノートを使う": { section: "b", key: "b5" },                        // ノートに大事なことをまとめる
  "途中式を書く": { section: "c", key: "c4", reverse: true },         // どう書けばいいかわからない(逆転)
  "言葉を書いて練習する": { section: "b", key: "b6" },               // 新しい言葉や公式を書いて覚える
  // 聞く
  "質問・相談する": { section: "b", key: "b7" },                      // 先生に積極的に質問している
  "授業をわかるまで": { section: "a", key: "a5" },                    // その日に復習している
  "テスト情報収集": { section: "a", key: "a6" },                      // テスト前に計画を立てる
  // 考える
  "誤答原因がわかる": { section: "c", key: "c7" },                    // なぜ間違えたか説明できる
  "教科バランス良い": { section: "b", key: "b8" },                    // 得意・苦手がわかっている
  "解き直しを実践": { section: "b", key: "b2" },                      // 間違えた問題を解きなおしている
};

const CHECK_THRESHOLD = 3; // 4段階（1〜4）で「だいたいそう(3)」以上を「できている」とみなす

function ratingText(r: number): string {
  return r === 4 ? "いつもそう" : r === 3 ? "だいたいそう" : r === 2 ? "あまりそうでない" : "ほとんどない";
}

// ① 生回答（section_a/b/c）から17項目を確定的に判定
function mapFromAnswers(diag: Diag): PerItem[] | null {
  const sections: Record<"a" | "b" | "c", Record<string, number>> = {
    a: diag.section_a ?? {},
    b: diag.section_b ?? {},
    c: diag.section_c ?? {},
  };
  const hasAny =
    Object.keys(sections.a).length + Object.keys(sections.b).length + Object.keys(sections.c).length > 0;
  if (!hasAny) return null;

  return CHECK_ITEMS.map((item) => {
    const m = ITEM_MAP[item];
    const raw = m ? sections[m.section][m.key] : undefined;
    if (typeof raw !== "number") {
      return { item, checked: false, confidence: 0.3, reason: "診断に該当設問なし" };
    }
    const eff = m!.reverse ? 5 - raw : raw; // 高いほど良いに統一
    return {
      item,
      checked: eff >= CHECK_THRESHOLD,
      confidence: 0.9,
      reason: `診断回答「${ratingText(raw)}」`,
    };
  });
}

// ② 集約スコアから Claude が推定（生回答が無い場合のフォールバック）
async function estimateWithAI(
  studentName: string,
  subject: string | null,
  scores: Record<string, number | null>,
  aiAnalysis: string | null
): Promise<PerItem[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const scoreLines = Object.entries(scores)
    .map(([k, v]) => `${k}: ${v == null ? "データなし" : v}`)
    .join(" / ");
  const groupBlock = CHECK_GROUPS.map(
    (g) => `【${g.label}】(主な根拠: ${GROUP_SCORE_HINT[g.label] ?? "—"})\n- ${g.items.join("\n- ")}`
  ).join("\n\n");

  const prompt = `あなたは個別指導塾の主任講師です。ある生徒の学習スキル「17項目」について、
学力診断スコアと学力テストの結果から、現時点で「できている(true)」か「まだ課題(false)」かを推定してください。
これは講師が確認・調整する下書きです。断定せず、根拠（スコア）が無い/弱い項目は控えめに false にしてください。

【生徒】${studentName}（${subject ?? "教科不明"}）
【スコア(0-100目安)】${scoreLines}
${aiAnalysis ? `【診断コメント】\n${aiAnalysis.slice(0, 1200)}` : ""}

【17項目（5グループ）】
${groupBlock}

【出力ルール】
- 17項目すべてについて {"item":"項目名(上記のまま)","checked":true/false,"confidence":0.0-1.0,"reason":"20字以内"} を作る。
- JSON配列のみを返す（前後の説明文・コードフェンスは不要）。
- item は上記の項目名を一字一句そのまま使う。`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    let text: string = data.content?.[0]?.text ?? "";
    text = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1) return null;
    const arr = JSON.parse(text.slice(start, end + 1)) as Array<{
      item?: string;
      checked?: boolean;
      confidence?: number;
      reason?: string;
    }>;
    const known = new Set(CHECK_ITEMS);
    const out: PerItem[] = [];
    const seen = new Set<string>();
    for (const a of arr) {
      if (!a || typeof a.item !== "string" || !known.has(a.item) || seen.has(a.item)) continue;
      seen.add(a.item);
      out.push({
        item: a.item,
        checked: !!a.checked,
        confidence: typeof a.confidence === "number" ? Math.max(0, Math.min(1, a.confidence)) : 0.5,
        reason: (a.reason ?? "").slice(0, 40),
      });
    }
    for (const item of CHECK_ITEMS) {
      if (!seen.has(item)) out.push({ item, checked: false, confidence: 0.3, reason: "根拠不足" });
    }
    return out;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const studentName: string | undefined = body?.studentName;
  const studentId: string | undefined = body?.studentId;
  const subjectHint: string | undefined = body?.subject;
  if (!studentName && !studentId) {
    return NextResponse.json({ error: "studentName または studentId が必要です" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY が未設定です" }, { status: 500 });
  }
  const svc = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 学力診断（最新1件・生回答つき）
  let dq = svc
    .from("questionnaire_responses")
    .select(
      "id, student_name, subject, section_a, section_b, section_c, test_percentage, habit_score, method_score, verbal_score, skill_score, ai_analysis, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(1);
  dq = studentName ? dq.eq("student_name", studentName) : dq.eq("student_id", studentId!);
  const { data: diagRows } = await dq;
  const diag = ((diagRows as Diag[]) ?? [])[0] ?? null;

  // 学力テスト結果（最新の正答率。診断が無い場合の補助にもなる）
  let latestResultPct: number | null = null;
  if (studentName) {
    const { data: resRows } = await svc
      .from("results")
      .select("percentage, completed_at")
      .eq("student_name", studentName)
      .order("completed_at", { ascending: false })
      .limit(1);
    latestResultPct = (resRows as { percentage: number | null }[] | null)?.[0]?.percentage ?? null;
  }

  if (!diag && latestResultPct == null) {
    return NextResponse.json({
      checkedItems: [],
      perItem: [],
      basis: null,
      reason: "no_diagnosis",
      method: "none",
      message: "学力診断・テスト結果が見つかりませんでした。手動でチェックしてください。",
    });
  }

  // ── ① 直接マッピング優先 ──
  let perItem: PerItem[] | null = diag ? mapFromAnswers(diag) : null;
  let method: "questionnaire_items" | "ai_scores" = "questionnaire_items";

  // ── ② 生回答が無ければ AI フォールバック ──
  if (!perItem) {
    method = "ai_scores";
    const scores: Record<string, number | null> = {
      正答率: diag?.test_percentage ?? latestResultPct,
      学習習慣: diag?.habit_score ?? null,
      学習法: diag?.method_score ?? null,
      言語力: diag?.verbal_score ?? null,
      スキル: diag?.skill_score ?? null,
    };
    perItem = await estimateWithAI(
      studentName ?? diag?.student_name ?? "生徒",
      subjectHint ?? diag?.subject ?? null,
      scores,
      diag?.ai_analysis ?? null
    );
  }

  if (!perItem) {
    return NextResponse.json({ error: "17項目の推定に失敗しました。手動でチェックしてください。" }, { status: 502 });
  }

  const checkedItems = perItem.filter((p) => p.checked).map((p) => p.item);
  const message =
    method === "questionnaire_items"
      ? `学力診断の回答から17項目中${checkedItems.length}項目を「できている」と判定しました（下書き）。確認・調整してください。`
      : `AIが17項目中${checkedItems.length}項目を「できている」と推定しました（下書き）。必ず確認・調整してください。`;

  return NextResponse.json({
    checkedItems,
    perItem,
    method,
    message,
    basis: {
      questionnaireId: diag?.id ?? null,
      latestResultPercentage: latestResultPct,
    },
  });
}
