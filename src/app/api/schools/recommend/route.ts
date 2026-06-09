import { NextRequest, NextResponse } from "next/server";
import { requireTeacher, adminClient, authErrorResponse } from "@/lib/serverAuth";

function estimateDeviationValue(
  testPercentage: number | null,
  habitScore: number | null,
  skillScore: number | null,
): { min: number; max: number } {
  const base = testPercentage ?? 50;
  let center: number;
  if      (base >= 93) center = 75;
  else if (base >= 87) center = 70;
  else if (base >= 80) center = 65;
  else if (base >= 72) center = 60;
  else if (base >= 63) center = 55;
  else if (base >= 53) center = 50;
  else if (base >= 43) center = 45;
  else if (base >= 33) center = 41;
  else                 center = 37;

  const habitAdj = habitScore != null ? Math.round((habitScore - 50) / 33) : 0;
  const skillAdj = skillScore != null ? Math.round((skillScore - 50) / 33) : 0;
  center += Math.max(-3, Math.min(3, habitAdj + skillAdj));

  return { min: center - 6, max: center + 6 };
}

// 学年文字列 → 推薦対象のschool_level
function targetSchoolLevels(grade: string | null): string[] {
  if (!grade) return ["高校", "中高一貫"];
  if (grade.startsWith("小")) return ["中学", "中高一貫"];  // 小学生 → 中学受験
  if (grade.startsWith("中")) return ["高校", "中高一貫"];  // 中学生 → 高校受験
  return ["高校", "中高一貫"];
}

export async function GET(req: NextRequest) {
  try {
    await requireTeacher(req);
  } catch (e) {
    return authErrorResponse(e);
  }

  const supabase = adminClient();
  const { searchParams } = new URL(req.url);
  const testPercentage = searchParams.get("test_percentage") ? Number(searchParams.get("test_percentage")) : null;
  const habitScore     = searchParams.get("habit_score")     ? Number(searchParams.get("habit_score"))     : null;
  const skillScore     = searchParams.get("skill_score")     ? Number(searchParams.get("skill_score"))     : null;
  const prefecture     = searchParams.get("prefecture") || null;
  const grade          = searchParams.get("grade") || null;

  const range  = estimateDeviationValue(testPercentage, habitScore, skillScore);
  const levels = targetSchoolLevels(grade);

  let query = supabase
    .from("high_schools")
    .select("id, name, school_type, school_level, prefecture, city, deviation_value_min, deviation_value_max, features, description, appeal_points, website")
    .eq("status", "active")
    .in("school_level", levels)
    .lte("deviation_value_min", range.max)
    .gte("deviation_value_max", range.min)
    .order("deviation_value_max", { ascending: false })
    .limit(10);

  if (prefecture) query = query.eq("prefecture", prefecture);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    schools: data ?? [],
    range,
    center: Math.round((range.min + range.max) / 2),
    targetLevels: levels,
  });
}
