import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

import { generateText } from "@/lib/ai";
// カルテ(learning_plans.plan_json)の3か月方針を「毎日のTODO」に日割り展開して daily_tasks に保存する。
// カルテ作成時にクライアントから {learningPlanId} で呼ばれる（再生成も同じ）。

const WEEKS = 13; // 約3か月
const DOW = ["月", "火", "水", "木", "金", "土", "日"] as const;
const DOW_INDEX: Record<string, number> = { 月: 0, 火: 1, 水: 2, 木: 3, 金: 4, 土: 5, 日: 6 };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Task = { subject?: string; content: string; amount?: string };
type Day = { dow: string; tasks: Task[] };
type Week = { week: number; month?: number; theme?: string; days: Day[] };

// Claudeで3か月方針を13週間×7日の具体TODOに展開
async function expandWithAI(
  planJson: any,
  studentName: string,
  grade: string,
  subject: string
): Promise<Week[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = `あなたは個別指導塾のベテラン講師です。次の生徒の「3か月学習方針(JSON)」を、毎日の具体的なTODOに落とし込んでください。

生徒：${studentName}（${grade}・${subject}）

【3か月方針(JSON)】
${JSON.stringify(planJson, null, 2)}

【作成ルール】
- ${WEEKS}週間分（約3か月）を週ごとに作る。各週は必ず月〜日の7日分。
- roadmap の月別目標・先取り単元・テキストのページに沿って、週が進むごとに内容を前進させる（毎週まったく同じ内容にしない）。
- 平日は学習量多め、土曜は復習や演習、日曜は休み/予備日(タスク0個)でもよい。
- 各タスクは subject(科目), content(やること・30字以内・具体的に), amount(分量や目安・任意)。
- 1日のタスクは0〜2個。
- 出力はJSONのみ（前後の説明やコードフェンスを付けない）。

【出力JSON形式】
{"weeks":[{"week":1,"month":1,"theme":"今週のテーマ","days":[{"dow":"月","tasks":[{"subject":"${subject}","content":"例: 正負の数 p.10-12","amount":"2ページ"}]},{"dow":"火","tasks":[...]}, ... 月〜日の7日 ...]}, ... ${WEEKS}週分 ...]}`;

  try {
    let text = (await generateText({
      prompt, maxTokens: 8192, feature: "daily_tasks",
    })).text;
    text = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s === -1 || e === -1) return null;
    const parsed = JSON.parse(text.slice(s, e + 1));
    if (!Array.isArray(parsed.weeks) || parsed.weeks.length === 0) return null;
    return parsed.weeks as Week[];
  } catch {
    return null;
  }
}

// AI失敗時：dailyRoutine と roadmap から機械的に週次パターンを作る
function fallbackWeeks(planJson: any, subject: string): Week[] {
  const routines: any[] = Array.isArray(planJson?.dailyRoutine) ? planJson.dailyRoutine : [];
  const weekday = routines.find((r) => String(r?.day ?? "").includes("平日")) ?? routines[0] ?? null;
  const holiday = routines.find((r) => String(r?.day ?? "").includes("休")) ?? weekday;
  const roadmap: any[] = Array.isArray(planJson?.roadmap) ? planJson.roadmap : [];

  const weeks: Week[] = [];
  for (let w = 0; w < WEEKS; w++) {
    const month = Math.min(3, Math.floor(w / Math.ceil(WEEKS / 3)) + 1);
    const rm = roadmap[month - 1] ?? null;
    const theme = rm?.goal ?? `${month}ヶ月目`;
    const days: Day[] = DOW.map((dow, i) => {
      if (i === 6) return { dow, tasks: [] }; // 日曜は予備日
      const r = i >= 5 ? holiday : weekday;
      const content = r?.content ?? rm?.weeklyPlan ?? rm?.textbookPages ?? "今週の範囲を学習する";
      return {
        dow,
        tasks: [{ subject, content: String(content).slice(0, 40), amount: r?.duration ? String(r.duration) : undefined }],
      };
    });
    weeks.push({ week: w + 1, month, theme, days });
  }
  return weeks;
}

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const learningPlanId: string | undefined = body?.learningPlanId;
  if (!learningPlanId) {
    return NextResponse.json({ error: "learningPlanId は必須です" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY が未設定です" }, { status: 500 });
  }
  const svc = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: plan } = await svc
    .from("learning_plans")
    .select("id, student_name, grade, subject, plan_json, created_at")
    .eq("id", learningPlanId)
    .maybeSingle();
  if (!plan) {
    return NextResponse.json({ error: "カルテが見つかりません" }, { status: 404 });
  }
  if (!plan.plan_json) {
    // 旧カルテ等でplan_jsonが無い場合はTODO生成不可（致命ではない）
    return NextResponse.json({ created: 0, reason: "no_plan_json" });
  }

  // 生徒名→student_id（照合できた場合のみ。生徒本人のdone更新RLSに使う）
  const { data: stu } = await svc
    .from("students")
    .select("id")
    .eq("name", plan.student_name)
    .limit(1)
    .maybeSingle();
  const studentId: string | null = stu?.id ?? null;

  let weeks = await expandWithAI(plan.plan_json, plan.student_name, plan.grade, plan.subject);
  let usedFallback = false;
  if (!weeks || weeks.length === 0) {
    weeks = fallbackWeeks(plan.plan_json, plan.subject);
    usedFallback = true;
  }

  // 週の起点 = カルテ作成日を含む週の月曜
  const created = new Date(plan.created_at);
  const startMonday = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  const d0 = startMonday.getDay(); // 0=日,1=月,...
  startMonday.setDate(startMonday.getDate() + (d0 === 0 ? -6 : 1 - d0));

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const rows: any[] = [];
  weeks.forEach((wk, wi) => {
    (wk?.days ?? []).forEach((day) => {
      const key = String(day?.dow ?? "").trim();
      const di = DOW_INDEX[key];
      if (di === undefined) return;
      const date = new Date(startMonday);
      date.setDate(startMonday.getDate() + wi * 7 + di);
      const dateStr = fmt(date);
      (day?.tasks ?? []).forEach((t, ti) => {
        if (!t?.content) return;
        rows.push({
          learning_plan_id: plan.id,
          student_id: studentId,
          student_name: plan.student_name,
          task_date: dateStr,
          subject: t.subject ? String(t.subject).slice(0, 40) : plan.subject,
          content: String(t.content).slice(0, 200),
          amount: t.amount ? String(t.amount).slice(0, 60) : null,
          sort_order: ti,
          done: false,
        });
      });
    });
  });

  // 既存を消してから入れ直す（再生成に対応）
  await svc.from("daily_tasks").delete().eq("learning_plan_id", plan.id);

  let created2 = 0;
  if (rows.length > 0) {
    const { data: ins, error } = await svc.from("daily_tasks").insert(rows).select("id");
    if (error) {
      return NextResponse.json({ error: error.message, created: 0 }, { status: 500 });
    }
    created2 = ins?.length ?? 0;
  }

  return NextResponse.json({ created: created2, weeks: weeks.length, usedFallback });
}
