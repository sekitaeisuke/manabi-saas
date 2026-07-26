import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/apiAuth";

// 管理者/講師が「生徒の経済画面」を読み取り専用でプレビューするためのスナップショット。
// requireTeacher で認可し、service role で対象生徒の全データをまとめて返す（副作用なし）。
export async function GET(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const studentId = req.nextUrl.searchParams.get("student_id");
  if (!studentId) return NextResponse.json({ error: "student_id が必要です" }, { status: 400 });

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: student } = await svc.from("students").select("id, name, grade, school_id").eq("id", studentId).maybeSingle();
  if (!student) return NextResponse.json({ error: "生徒が見つかりません" }, { status: 404 });
  const schoolId = (student.school_id as string) ?? null;

  let shopQ = svc.from("reward_items").select("id, title, description, cost, stock, category")
    .eq("active", true).order("cost", { ascending: true });
  shopQ = schoolId ? shopQ.or(`school_id.is.null,school_id.eq.${schoolId}`) : shopQ.is("school_id", null);

  const [w, h, tx, ex, rw, rules, voices, school, hist, students, wallets] = await Promise.all([
    svc.from("student_wallets").select("balance, locked_balance").eq("student_id", studentId).maybeSingle(),
    svc.from("class_stock_holdings").select("shares, avg_price").eq("student_id", studentId).maybeSingle(),
    svc.from("ac_transactions").select("id, amount, type, description, created_at")
      .eq("student_id", studentId).order("created_at", { ascending: false }).limit(20),
    svc.from("reward_exchanges").select("id, reward_title, cost, status, created_at")
      .eq("student_id", studentId).order("created_at", { ascending: false }).limit(30),
    shopQ,
    svc.from("ac_rules").select("event_key, label, points").eq("enabled", true).gt("points", 0),
    svc.from("shareholder_voices").select("id, message, status, created_at, shares")
      .eq("student_id", studentId).order("created_at", { ascending: false }).limit(20),
    schoolId ? svc.from("schools").select("name, current_stock_price").eq("id", schoolId).maybeSingle() : Promise.resolve({ data: null }),
    schoolId ? svc.from("class_stock_history").select("price, calculated_at").eq("school_id", schoolId).order("calculated_at", { ascending: true }).limit(52) : Promise.resolve({ data: [] }),
    schoolId ? svc.from("students").select("id").eq("school_id", schoolId) : Promise.resolve({ data: [] }),
    svc.from("student_wallets").select("student_id, locked_balance"),
  ]);

  // 教室の応援AC（自校のlocked合計）
  const idsInSchool = new Set(((students.data ?? []) as { id: string }[]).map((s) => s.id));
  let support = 0;
  for (const wr of (wallets.data ?? []) as { student_id: string; locked_balance: number }[]) {
    if (idsInSchool.has(wr.student_id)) support += wr.locked_balance ?? 0;
  }

  return NextResponse.json({
    student: {
      name: student.name, grade: student.grade, school_id: schoolId,
      school_name: (school.data as { name?: string } | null)?.name ?? null,
      current_price: (school.data as { current_stock_price?: number } | null)?.current_stock_price ?? 1000,
      support,
    },
    wallet: w.data ?? { balance: 0, locked_balance: 0 },
    holding: h.data ?? { shares: 0, avg_price: 0 },
    txns: tx.data ?? [],
    exchanges: ex.data ?? [],
    rewards: rw.data ?? [],
    rules: (rules.data ?? []).sort((a, b) => b.points - a.points),
    voices: voices.data ?? [],
    history: hist.data ?? [],
  });
}
