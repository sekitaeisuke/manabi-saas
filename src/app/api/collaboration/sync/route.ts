import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

import { generateText } from "@/lib/ai";
// 報告書・学力診断から「気がかりな生徒」を講師連携(collaboration_tasks)へ自動掲載する。
//
// 判定:
//   報告書 … 正答率 < CONCERN_PERCENT は即「心配あり」。それ以外で講師コメント/お子様への
//            メッセージに本文がある場合のみ Claude が心配の有無を判定。
//   診断   … test_percentage / habit_score / method_score / verbal_score / skill_score の
//            いずれかが CONCERN_PERCENT 未満なら「心配あり」（気になる結果のみ）。
//
// 処理済みは collaboration_auto_log に記録し、AIの再判定・二重掲載を防ぐ。
// 「解決済」で completed になった行はそのまま残るため同一報告書は再掲されないが、
// 新しい報告書/診断は新IDで未処理 → 再び自動掲載される。

const CONCERN_PERCENT = 40;       // 心配と見なすしきい値（%）
const SCAN_DAYS = 45;             // 走査対象（直近何日分か）
const BATCH_LIMIT = 200;          // 1回の走査上限

type ReportRow = {
  id: string;
  student_id: string | null;
  student_name: string | null;
  test_subject: string | null;
  percentage: number | null;
  teacher_notes: string | null;
  message_to_child: string | null;
  created_at: string;
};

type DiagRow = {
  id: string;
  student_id: string | null;
  student_name: string | null;
  subject: string | null;
  test_percentage: number | null;
  habit_score: number | null;
  method_score: number | null;
  verbal_score: number | null;
  skill_score: number | null;
  bottleneck_layer: string | null;
  bottleneck_label: string | null;
  intervention: string | null;
  created_at: string;
};

const DIAG_LAYER_NAME: Record<string, string> = { H1: "下位能力", H2: "学習方法", H3: "学習習慣" };

type TaskInsert = {
  created_by: null;
  category: "student_guidance";
  title: string;
  description: string | null;
  student_id: string | null;
  is_all_students: false;
  status: "open";
  source_type: "report" | "diagnosis";
  source_id: string;
  auto_reason: string;
};

type LogInsert = {
  source_type: "report" | "diagnosis";
  source_id: string;
  is_concern: boolean;
  reason: string | null;
};

// 報告書本文を Claude で判定。{ [id]: {concern, reason} } を返す。
async function judgeReportsWithAI(
  rows: ReportRow[]
): Promise<Record<string, { concern: boolean; reason: string }>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || rows.length === 0) return {};

  const items = rows.map((r) => ({
    id: r.id,
    生徒: r.student_name ?? "—",
    講師コメント: (r.teacher_notes ?? "").slice(0, 1200),
    お子様へのメッセージ: (r.message_to_child ?? "").slice(0, 1200),
  }));

  const prompt =
    `あなたは学習塾の主任講師です。以下の授業報告書それぞれについて、` +
    `講師が生徒に対して「心配・気がかり」を表明しているかを判定してください。\n` +
    `心配の例: 学習意欲の低下、宿題未提出が続く、成績の急落、集中力の欠如、` +
    `精神的な落ち込みや元気のなさ、家庭環境の不安、講師や友人との関係悪化、欠席が増えている 等。\n` +
    `単なる事務連絡・前向きな成長の報告・通常の指導内容は「心配なし(false)」です。\n\n` +
    `各報告書について {"id": "...", "concern": true/false, "reason": "30字以内の日本語の理由"} を作り、` +
    `JSON配列のみを返してください（前後の説明文やコードフェンスは不要）。\n\n` +
    `報告書一覧:\n${JSON.stringify(items, null, 2)}`;

  try {
    let text = (await generateText({
      prompt, maxTokens: 2048, feature: "collaboration_sync",
    })).text;
    text = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1) return {};
    const arr = JSON.parse(text.slice(start, end + 1)) as Array<{
      id: string;
      concern: boolean;
      reason?: string;
    }>;
    const out: Record<string, { concern: boolean; reason: string }> = {};
    for (const a of arr) {
      if (a && typeof a.id === "string") {
        out[a.id] = { concern: !!a.concern, reason: (a.reason ?? "").slice(0, 60) };
      }
    }
    return out;
  } catch {
    return {};
  }
}

// ── カルテ（総合）から高緊急度を判定 ──────────────────────
type KarteRow = {
  id: string;
  student_id: string | null;
  student_name: string | null;
  karte_json: {
    currentStatus?: string;
    cautions?: string;
    textbookPace?: string;
    parentNeeds?: string | null;
  } | null;
  generated_at: string;
};

type KarteSignal = {
  student_id: string;
  生徒: string;
  現状: string;
  気を付けること: string;
  保護者要望: string | null;
  最新正答率: number | null;
  今週TODO: string;
  進捗最終日: string | null;
};

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// カルテ総合サマリー＋補助シグナルから「チームで今すぐ気にかけるべき生徒」を Claude が判定。
async function judgeKarteUrgency(
  items: KarteSignal[]
): Promise<Record<string, { urgent: boolean; reason: string }>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || items.length === 0) return {};

  const prompt =
    `あなたは学習塾の主任講師です。以下は各生徒の「カルテ」総合サマリー（報告書・保護者の声・今日/今週やること・テキスト進捗を束ねたもの）です。\n` +
    `講師チームで今すぐ気にかけて連携すべき「緊急度が高い」生徒を判定してください。\n` +
    `緊急度が高い例: 成績が著しく低い／今週やることが全く進んでいない／保護者が強く心配や不満を示している／` +
    `テキスト進捗が長期間止まっている／カルテの「気を付けること」が深刻（意欲低下・つまずきの放置・関係悪化 等）。\n` +
    `通常運用の範囲・軽微なものは urgent=false。\n\n` +
    `各生徒について {"student_id":"...","urgent":true/false,"reason":"30字以内の日本語の理由"} を作り、` +
    `JSON配列のみを返してください（前後の説明文やコードフェンスは不要）。\n\n` +
    `生徒一覧:\n${JSON.stringify(items, null, 2)}`;

  try {
    let text = (await generateText({
      prompt, maxTokens: 2048, feature: "collaboration_sync",
    })).text;
    text = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1) return {};
    const arr = JSON.parse(text.slice(start, end + 1)) as Array<{
      student_id: string; urgent: boolean; reason?: string;
    }>;
    const out: Record<string, { urgent: boolean; reason: string }> = {};
    for (const a of arr) {
      if (a && typeof a.student_id === "string") {
        out[a.student_id] = { urgent: !!a.urgent, reason: (a.reason ?? "").slice(0, 60) };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY が未設定です" },
      { status: 500 }
    );
  }
  const svc = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const since = new Date(Date.now() - SCAN_DAYS * 86_400_000).toISOString();

  // 処理済みログ
  const { data: logRows } = await svc
    .from("collaboration_auto_log")
    .select("source_type, source_id");
  const processed = new Set(
    (logRows ?? []).map((r) => `${r.source_type}:${r.source_id}`)
  );

  const tasksToInsert: TaskInsert[] = [];
  const logsToInsert: LogInsert[] = [];

  // ── 報告書 ──────────────────────────────────────────────
  const { data: reportData } = await svc
    .from("lesson_reports")
    .select(
      "id, student_id, student_name, test_subject, percentage, teacher_notes, message_to_child, created_at"
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(BATCH_LIMIT);

  const newReports = ((reportData as ReportRow[]) ?? []).filter(
    (r) => !processed.has(`report:${r.id}`)
  );

  const lowScore: ReportRow[] = [];   // 正答率で即「心配あり」
  const aiCandidates: ReportRow[] = []; // 本文をAI判定
  const noSignal: ReportRow[] = [];   // 点数も本文も無し → 心配なし

  for (const r of newReports) {
    if (r.percentage != null && r.percentage < CONCERN_PERCENT) {
      lowScore.push(r);
    } else if (
      (r.teacher_notes && r.teacher_notes.trim()) ||
      (r.message_to_child && r.message_to_child.trim())
    ) {
      aiCandidates.push(r);
    } else {
      noSignal.push(r);
    }
  }

  const aiResults = await judgeReportsWithAI(aiCandidates);

  const buildReportTask = (r: ReportRow, reason: string): TaskInsert => {
    const desc = [r.teacher_notes, r.message_to_child]
      .filter((s) => s && s.trim())
      .join("\n")
      .slice(0, 600);
    return {
      created_by: null,
      category: "student_guidance",
      title: `${r.student_name ?? "生徒"}：${reason}`.slice(0, 120),
      description: desc || null,
      student_id: r.student_id ?? null,
      is_all_students: false,
      status: "open",
      source_type: "report",
      source_id: r.id,
      auto_reason: reason,
    };
  };

  for (const r of lowScore) {
    const reason = `正答率 ${r.percentage}%（${r.test_subject ?? "—"}）`;
    tasksToInsert.push(buildReportTask(r, reason));
    logsToInsert.push({ source_type: "report", source_id: r.id, is_concern: true, reason });
  }
  for (const r of aiCandidates) {
    const j = aiResults[r.id];
    const concern = j?.concern ?? false;
    const reason = j?.reason?.trim() || "報告書に気がかりな記述あり";
    if (concern) tasksToInsert.push(buildReportTask(r, reason));
    logsToInsert.push({
      source_type: "report",
      source_id: r.id,
      is_concern: concern,
      reason: concern ? reason : null,
    });
  }
  for (const r of noSignal) {
    logsToInsert.push({ source_type: "report", source_id: r.id, is_concern: false, reason: null });
  }

  // ── 学力診断テスト（気になる結果のみ） ──────────────────
  const { data: diagData } = await svc
    .from("questionnaire_responses")
    .select(
      "id, student_id, student_name, subject, test_percentage, habit_score, method_score, verbal_score, skill_score, bottleneck_layer, bottleneck_label, intervention, created_at"
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(BATCH_LIMIT);

  for (const d of (diagData as DiagRow[]) ?? []) {
    if (processed.has(`diagnosis:${d.id}`)) continue;

    const lows: string[] = [];
    if (d.test_percentage != null && d.test_percentage < CONCERN_PERCENT)
      lows.push(`正答率${d.test_percentage}%`);
    if (d.habit_score != null && d.habit_score < CONCERN_PERCENT)
      lows.push(`学習習慣${d.habit_score}`);
    if (d.method_score != null && d.method_score < CONCERN_PERCENT)
      lows.push(`学習法${d.method_score}`);
    if (d.verbal_score != null && d.verbal_score < CONCERN_PERCENT)
      lows.push(`言語力${d.verbal_score}`);
    if (d.skill_score != null && d.skill_score < CONCERN_PERCENT)
      lows.push(`スキル${d.skill_score}`);

    const concern = lows.length > 0;
    if (concern) {
      // 主ボトルネックが特定済みならそれを見出しに（無ければ従来のスコア列挙）
      const layerName = d.bottleneck_layer ? DIAG_LAYER_NAME[d.bottleneck_layer] ?? "" : "";
      const reason = d.bottleneck_label
        ? `学力診断：${layerName ? `[${layerName}] ` : ""}${d.bottleneck_label}`
        : `学力診断：${lows.join("・")}`;
      const desc = d.bottleneck_label
        ? `三角測定で特定した主ボトルネック（${d.subject ?? "—"}）。指標: ${lows.join("・")}。${d.intervention ? `\n主介入: ${d.intervention}` : ""}`
        : `学力診断テストの結果が基準（${CONCERN_PERCENT}）を下回りました（${d.subject ?? "—"}）。`;
      tasksToInsert.push({
        created_by: null,
        category: "student_guidance",
        title: `${d.student_name ?? "生徒"}：${reason}`.slice(0, 120),
        description: desc,
        student_id: d.student_id ?? null,
        is_all_students: false,
        status: "open",
        source_type: "diagnosis",
        source_id: d.id,
        auto_reason: reason,
      });
      logsToInsert.push({ source_type: "diagnosis", source_id: d.id, is_concern: true, reason });
    } else {
      logsToInsert.push({ source_type: "diagnosis", source_id: d.id, is_concern: false, reason: null });
    }
  }

  // ── 挿入（重複は無視） ──────────────────────────────────
  let created = 0;
  if (tasksToInsert.length > 0) {
    const { data: ins } = await svc
      .from("collaboration_tasks")
      .upsert(tasksToInsert, { onConflict: "source_type,source_id", ignoreDuplicates: true })
      .select("id");
    created = ins?.length ?? 0;
  }
  if (logsToInsert.length > 0) {
    await svc
      .from("collaboration_auto_log")
      .upsert(logsToInsert, { onConflict: "source_type,source_id", ignoreDuplicates: true });
  }

  // ── ③ カルテ（総合）から高緊急度を掲載 ──────────────────
  // source_id は uuid 型のため karte では null を使い、重複は「その生徒の未対応カルテタスクが
  // 既にあるか」で防ぐ（解決済み後に再び緊急なら再掲される）。
  let createdKarte = 0;
  const { data: karteRows } = await svc
    .from("student_karte")
    .select("id, student_id, student_name, karte_json, generated_at")
    .not("student_id", "is", null);
  const kartes = ((karteRows as KarteRow[]) ?? []).filter((k) => k.student_id);

  if (kartes.length > 0) {
    const { data: openKarte } = await svc
      .from("collaboration_tasks")
      .select("student_id")
      .eq("source_type", "karte")
      .eq("status", "open");
    const alreadyOpen = new Set((openKarte ?? []).map((r) => r.student_id));
    const targets = kartes.filter((k) => !alreadyOpen.has(k.student_id));

    if (targets.length > 0) {
      const tIds = targets.map((t) => t.student_id!) as string[];
      const now = new Date();
      const todayStr = keyOf(now);
      const weekStr = keyOf(addDays(now, 6));

      const [{ data: reps }, { data: kpmsgs }, { data: dtasks }, { data: progs }] = await Promise.all([
        svc.from("lesson_reports").select("student_id, percentage, created_at").in("student_id", tIds).order("created_at", { ascending: false }),
        svc.from("parent_messages").select("student_id, message, created_at").eq("direction", "parent_to_teacher").in("student_id", tIds).gte("created_at", since).order("created_at", { ascending: false }),
        svc.from("daily_tasks").select("student_id, done, task_date").in("student_id", tIds).gte("task_date", todayStr).lte("task_date", weekStr),
        svc.from("textbook_progress").select("student_id, lesson_date").in("student_id", tIds).order("lesson_date", { ascending: false }),
      ]);

      const latestRep = new Map<string, number | null>();
      for (const r of (reps ?? []) as { student_id: string; percentage: number | null }[]) if (!latestRep.has(r.student_id)) latestRep.set(r.student_id, r.percentage);
      const parentMsg = new Map<string, string>();
      for (const m of (kpmsgs ?? []) as { student_id: string; message: string }[]) if (!parentMsg.has(m.student_id)) parentMsg.set(m.student_id, m.message);
      const taskAgg = new Map<string, { done: number; total: number }>();
      for (const t of (dtasks ?? []) as { student_id: string; done: boolean }[]) { const a = taskAgg.get(t.student_id) ?? { done: 0, total: 0 }; a.total++; if (t.done) a.done++; taskAgg.set(t.student_id, a); }
      const lastProg = new Map<string, string>();
      for (const p of (progs ?? []) as { student_id: string; lesson_date: string }[]) if (!lastProg.has(p.student_id)) lastProg.set(p.student_id, p.lesson_date);

      const items: KarteSignal[] = targets.map((k) => {
        const kj = k.karte_json ?? {};
        const agg = taskAgg.get(k.student_id!) ?? { done: 0, total: 0 };
        return {
          student_id: k.student_id!,
          生徒: k.student_name ?? "—",
          現状: (kj.currentStatus ?? "").slice(0, 400),
          気を付けること: (kj.cautions ?? "").slice(0, 300),
          保護者要望: kj.parentNeeds ?? parentMsg.get(k.student_id!) ?? null,
          最新正答率: latestRep.get(k.student_id!) ?? null,
          今週TODO: agg.total > 0 ? `${agg.done}/${agg.total}件完了` : "なし",
          進捗最終日: lastProg.get(k.student_id!) ?? null,
        };
      });

      const verdicts = await judgeKarteUrgency(items);

      const karteInserts = targets
        .filter((k) => verdicts[k.student_id!]?.urgent)
        .map((k) => {
          const reason = verdicts[k.student_id!].reason || "カルテの緊急度が高い";
          return {
            created_by: null,
            category: "student_guidance" as const,
            title: `${k.student_name ?? "生徒"}：${reason}`.slice(0, 120),
            description: (k.karte_json?.currentStatus ?? null),
            student_id: k.student_id,
            is_all_students: false,
            status: "open" as const,
            source_type: "karte" as const,
            source_id: null,
            auto_reason: reason,
          };
        });

      if (karteInserts.length > 0) {
        const { data: kins } = await svc.from("collaboration_tasks").insert(karteInserts).select("id");
        createdKarte = kins?.length ?? 0;
      }
    }
  }

  return NextResponse.json({
    created: created + createdKarte,
    scanned: { reports: newReports.length, diagnoses: (diagData ?? []).length, kartes: kartes.length },
  });
}
