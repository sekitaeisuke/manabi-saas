import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireStudent, requireTeacher } from "@/lib/apiAuth";

function svcClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// POST: 株主の声を投稿（自塾株を保有する生徒のみ）。
export async function POST(req: NextRequest) {
  const auth = await requireStudent(req);
  if (auth instanceof NextResponse) return auth;
  const { message } = await req.json().catch(() => ({}));
  if (!message || !String(message).trim()) {
    return NextResponse.json({ error: "意見を入力してください" }, { status: 400 });
  }
  const svc = svcClient();
  // 保有株>0 を検証（株主のみ発言可）
  const { data: holding } = await svc.from("class_stock_holdings")
    .select("shares").eq("student_id", auth.studentId).maybeSingle();
  const shares = holding?.shares ?? 0;
  if (shares <= 0) {
    return NextResponse.json({ ok: false, error: "自塾株を持っている株主だけが投稿できます" }, { status: 403 });
  }
  const { data: student } = await svc.from("students").select("name, school_id").eq("id", auth.studentId).maybeSingle();
  const { error } = await svc.from("shareholder_voices").insert({
    student_id: auth.studentId, student_name: student?.name ?? null,
    school_id: student?.school_id ?? null, shares, message: String(message).trim().slice(0, 500),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// GET: 株主の声 一覧（講師）。?status=open で未対応のみ。
export async function GET(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;
  const svc = svcClient();
  let q = svc.from("shareholder_voices")
    .select("id, student_name, school_id, shares, message, status, created_at")
    .order("created_at", { ascending: false }).limit(100);
  const status = req.nextUrl.searchParams.get("status");
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ voices: data ?? [] });
}
