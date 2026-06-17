import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";

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
  created_at: string;
};

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
    if (!res.ok) return {};
    const data = await res.json();
    let text: string = data.content?.[0]?.text ?? "";
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
      "id, student_id, student_name, subject, test_percentage, habit_score, method_score, verbal_score, skill_score, created_at"
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
      const reason = `学力診断：${lows.join("・")}`;
      tasksToInsert.push({
        created_by: null,
        category: "student_guidance",
        title: `${d.student_name ?? "生徒"}：${reason}`.slice(0, 120),
        description: `学力診断テストの結果が基準（${CONCERN_PERCENT}）を下回りました（${d.subject ?? "—"}）。`,
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

  return NextResponse.json({
    created,
    scanned: { reports: newReports.length, diagnoses: (diagData ?? []).length },
  });
}
