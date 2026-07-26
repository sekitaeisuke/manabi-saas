import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin, isInternalCall } from "@/lib/apiAuth";

// 【日次スキャン】既存シグナル（出席=顔認証入室・確認テスト合格=報告書・まなび=教材進捗・報告書提出）
// を直近N日窓で読み、AC を冪等に自動付与する。二重付与は ac_award_once の source key で根絶。
//   認可: x-internal-secret（cron）or 管理者。?dry=1 で保存せず候補件数だけ返す。
const WINDOW_DAYS = 14;

type Rule = { points: number; threshold: number | null; enabled: boolean };

function isoDaysAgo(d: number) { return new Date(Date.now() - d * 86400_000).toISOString(); }

// award タスクを適度な並列で流す（同一生徒の競合は RPC 側の行ロックで安全）
async function runAwards(
  svc: SupabaseClient, dry: boolean,
  tasks: { student: string; amount: number; type: string; desc: string; st: string; sid: string }[]
): Promise<{ count: number; ac: number }> {
  if (dry) return { count: tasks.length, ac: tasks.reduce((s, t) => s + t.amount, 0) }; // 候補（既付与は含む）
  let count = 0, ac = 0;
  const CHUNK = 15;
  for (let i = 0; i < tasks.length; i += CHUNK) {
    const slice = tasks.slice(i, i + CHUNK);
    const res = await Promise.all(slice.map(async (t) => {
      try {
        const { data, error } = await svc.rpc("ac_award_once", {
          p_student: t.student, p_amount: t.amount, p_type: t.type,
          p_desc: t.desc, p_source_type: t.st, p_source_id: t.sid,
        });
        return error ? 0 : Number(data) || 0;
      } catch { return 0; }
    }));
    for (const a of res) { if (a > 0) { count++; ac += a; } }
  }
  return { count, ac };
}

export async function POST(req: NextRequest) {
  if (!isInternalCall(req)) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ルール
  const { data: ruleRows } = await svc.from("ac_rules").select("event_key, points, threshold, enabled");
  const rules: Record<string, Rule> = {};
  for (const r of ruleRows ?? []) rules[r.event_key] = { points: r.points, threshold: r.threshold, enabled: r.enabled };
  const on = (k: string) => rules[k]?.enabled && (rules[k]?.points ?? 0) > 0;

  const sinceTs = isoDaysAgo(WINDOW_DAYS);
  const sinceDate = sinceTs.slice(0, 10);
  const out: Record<string, { count: number; ac: number }> = {};

  // 出席（student_room_logs.type='entry'・時刻列 recorded_at）→ 生徒×日で1回
  if (on("attend")) {
    const { data } = await svc.from("student_room_logs")
      .select("student_id, recorded_at").eq("type", "entry").gte("recorded_at", sinceTs);
    const seen = new Set<string>(); const tasks = [];
    for (const r of data ?? []) {
      const day = String(r.recorded_at).slice(0, 10);
      const key = `${r.student_id}:${day}`;
      if (r.student_id && !seen.has(key)) {
        seen.add(key);
        tasks.push({ student: r.student_id as string, amount: rules.attend.points, type: "EARN_ATTENDANCE",
          desc: `出席（${day}）`, st: "attend", sid: key });
      }
    }
    out.attend = await runAwards(svc, dry, tasks);
  }

  // 確認テスト合格（lesson_reports report_source='test'・percentage>=合格ライン）→ 報告書IDで1回
  if (on("testpass")) {
    const pass = rules.testpass.threshold ?? 80;
    const { data } = await svc.from("lesson_reports")
      .select("id, student_id, percentage").eq("report_source", "test")
      .gte("percentage", pass).gte("created_at", sinceTs);
    const tasks = (data ?? []).filter((r) => r.student_id).map((r) => ({
      student: r.student_id as string, amount: rules.testpass.points, type: "EARN_TEST",
      desc: `確認テスト合格（${r.percentage}%）`, st: "testpass", sid: String(r.id),
    }));
    out.testpass = await runAwards(svc, dry, tasks);
  }

  // まなび使用（textbook_progress）→ 生徒×日で1回
  if (on("manabi")) {
    const { data } = await svc.from("textbook_progress")
      .select("student_id, lesson_date").gte("lesson_date", sinceDate);
    const seen = new Set<string>(); const tasks = [];
    for (const r of data ?? []) {
      const day = String(r.lesson_date).slice(0, 10);
      const key = `${r.student_id}:${day}`;
      if (r.student_id && !seen.has(key)) {
        seen.add(key);
        tasks.push({ student: r.student_id as string, amount: rules.manabi.points, type: "EARN_MANABI",
          desc: `まなび使用（${day}）`, st: "manabi", sid: key });
      }
    }
    out.manabi = await runAwards(svc, dry, tasks);
  }

  // 報告書提出（任意・既定OFF）→ 報告書IDで1回
  if (on("report")) {
    const { data } = await svc.from("lesson_reports")
      .select("id, student_id").gte("created_at", sinceTs);
    const tasks = (data ?? []).filter((r) => r.student_id).map((r) => ({
      student: r.student_id as string, amount: rules.report.points, type: "EARN_REPORT",
      desc: "報告書提出", st: "report", sid: String(r.id),
    }));
    out.report = await runAwards(svc, dry, tasks);
  }

  const total_ac = Object.values(out).reduce((s, x) => s + x.ac, 0);
  const total_count = Object.values(out).reduce((s, x) => s + x.count, 0);
  return NextResponse.json({
    ok: true, dry, window_days: WINDOW_DAYS, scanned_at: new Date().toISOString(),
    total_count, total_ac, detail: out,
  });
}
