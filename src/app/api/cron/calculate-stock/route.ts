import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin, isInternalCall } from "@/lib/apiAuth";
import { computeNewPrice, STOCK_FLOOR, type WeeklyAggregate } from "@/lib/classStock";

// 【週次 Cron】自塾株の株価アルゴリズムを校舎ごとに実行する。
//   毎週日曜 23:59 に x-internal-secret 付きで叩く（Vercel Cron / 外部スケジューラ）。
//   管理者は手動でも実行可（requireAdmin）。?dry=1 で保存せず結果だけ返す。
//
//   データ源は既存テーブルを流用。取得に失敗した成分は 0 に倒して処理を止めない（防御的）。
const WEEK_DAYS = 7;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}
function dateDaysAgo(days: number): string {
  return isoDaysAgo(days).slice(0, 10); // YYYY-MM-DD
}

// count(head) を実行し、失敗しても 0 を返す小さなラッパ。
async function safeCount(p: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  try {
    const { count, error } = await p;
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
}

export async function POST(req: NextRequest) {
  // 認可: 内部呼び出し(secret) or 管理者
  if (!isInternalCall(req)) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  const svc: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: schools, error: schErr } = await svc
    .from("schools").select("id, name, current_stock_price");
  if (schErr) return NextResponse.json({ error: schErr.message }, { status: 500 });

  const sinceTs = isoDaysAgo(WEEK_DAYS);
  const sinceDate = dateDaysAgo(WEEK_DAYS);
  const results: unknown[] = [];

  for (const school of schools ?? []) {
    // 在籍生徒
    const { data: studs } = await svc.from("students").select("id, created_at").eq("school_id", school.id);
    const ids = (studs ?? []).map((s) => s.id as string);
    const studentCount = ids.length;
    if (studentCount === 0) continue; // 生徒0の校舎は据え置き（履歴も作らない）

    const newStudents = (studs ?? []).filter(
      (s) => s.created_at && (s.created_at as string) >= sinceTs
    ).length;

    const head = { count: "exact" as const, head: true };
    // 学習量: 教材進捗の入力数 ＋ 完了した日次タスク数
    const [progressCount, tasksDone, tests80, contribPos, contribNeg] = await Promise.all([
      safeCount(svc.from("textbook_progress").select("id", head).in("student_id", ids).gte("lesson_date", sinceDate)),
      safeCount(svc.from("daily_tasks").select("id", head).in("student_id", ids).eq("done", true).gte("task_date", sinceDate)),
      safeCount(svc.from("lesson_reports").select("id", head).in("student_id", ids).gte("percentage", 80).gte("created_at", sinceTs)),
      safeCount(svc.from("contribution_events").select("id", head).eq("school_id", school.id).eq("polarity", "positive").gte("occurred_on", sinceDate)),
      safeCount(svc.from("contribution_events").select("id", head).eq("school_id", school.id).eq("polarity", "negative").gte("occurred_on", sinceDate)),
    ]);

    const agg: WeeklyAggregate = {
      studentCount,
      studyUnits: progressCount + tasksDone,
      tests80plus: tests80,
      contributions: contribPos,
      newStudents,
      penaltyRatio: Math.min(1, contribNeg / studentCount),
    };
    const calc = computeNewPrice(school.current_stock_price ?? 1000, agg);
    const detail = { agg, deltas: calc.deltas, sinceTs, sinceDate };

    if (!dry) {
      await svc.from("class_stock_history").insert({
        school_id: school.id,
        price: calc.newPrice,
        prev_price: calc.prevPrice,
        study_score: calc.deltas.study,
        contrib_score: calc.deltas.contrib,
        growth_score: calc.deltas.growth,
        penalty_score: calc.deltas.penalty,
        detail,
      });
      await svc.from("schools").update({ current_stock_price: calc.newPrice }).eq("id", school.id);
    }

    results.push({
      school_id: school.id, school_name: school.name,
      prev_price: calc.prevPrice, new_price: calc.newPrice,
      change_rate: calc.changeRate, deltas: calc.deltas, agg,
    });
  }

  // ライバル塾（ベンチマーク）も毎週すこし上下させる（自動変動ON のもの）。
  const rivals: unknown[] = [];
  const { data: benchmarks } = await svc
    .from("stock_benchmarks").select("id, name, price, volatility, auto_move").eq("active", true);
  for (const b of benchmarks ?? []) {
    if (!b.auto_move) continue;
    const vol = typeof b.volatility === "number" ? b.volatility : 0.04;
    const swing = (Math.random() * 2 - 1) * vol;                 // -vol..+vol
    const newPrice = Math.max(STOCK_FLOOR, Math.round((b.price ?? 0) * (1 + swing)));
    if (!dry) {
      await svc.from("stock_benchmarks")
        .update({ prev_price: b.price, price: newPrice }).eq("id", b.id);
    }
    rivals.push({ name: b.name, prev_price: b.price, new_price: newPrice, change_rate: swing });
  }

  // 株主配当（AC配当）：保有株数 × 配当レート(ac_rules 'dividend') を INVEST_DIVIDEND で付与。
  // source key `dividend:{student}:{date}` で同日再実行しても二重配当しない（冪等）。
  let dividend = { paid: 0, ac: 0, rate: 0 };
  const { data: divRule } = await svc.from("ac_rules")
    .select("points, enabled").eq("event_key", "dividend").maybeSingle();
  const rate = divRule?.enabled ? (divRule.points ?? 0) : 0;
  if (rate > 0) {
    const day = new Date().toISOString().slice(0, 10);
    const { data: holders } = await svc.from("class_stock_holdings").select("student_id, shares").gt("shares", 0);
    for (const hgd of holders ?? []) {
      const amt = (hgd.shares ?? 0) * rate;
      if (amt <= 0) continue;
      if (!dry) {
        const { data: awarded } = await svc.rpc("ac_award_once", {
          p_student: hgd.student_id, p_amount: amt, p_type: "INVEST_DIVIDEND",
          p_desc: `株主配当（${hgd.shares}株×${rate}）`, p_source_type: "dividend", p_source_id: `${hgd.student_id}:${day}`,
        });
        if ((Number(awarded) || 0) > 0) { dividend.paid++; dividend.ac += Number(awarded); }
      } else { dividend.paid++; dividend.ac += amt; }
    }
    dividend.rate = rate;
  }

  return NextResponse.json({ ok: true, dry, calculated_at: new Date().toISOString(), schools: results, rivals, dividend });
}

