import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTeacher, internalHeaders } from "@/lib/apiAuth";

type Announcement = {
  id: string;
  title: string;
  content: string;
  target_grade: string | null;
  target_school_id: string | null;
};

async function dispatch(origin: string, opts: {
  actor_kind: "parent" | "teacher" | "student";
  actor_id: string;
  event_type: string;
  subject: string;
  body_text: string;
  link?: string;
}) {
  await fetch(`${origin}/api/notify`, {
    method: "POST",
    headers: { "content-type": "application/json", ...internalHeaders() },
    body: JSON.stringify(opts),
  }).catch((e) => { console.error("dispatch failed:", opts.event_type, e); });
}

export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;

  const origin = new URL(req.url).origin;
  const { announcement_id } = await req.json();
  if (!announcement_id) {
    return NextResponse.json({ error: "announcement_id は必須です" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: a } = await supabase
    .from("announcements")
    .select("id, title, content, target_grade, target_school_id")
    .eq("id", announcement_id)
    .maybeSingle();
  const ann = a as Announcement | null;
  if (!ann) {
    return NextResponse.json({ error: "対象のお知らせが見つかりません" }, { status: 404 });
  }

  // 対象生徒を取得
  let studentQ = supabase.from("students").select("id, name, grade, school_id");
  if (ann.target_grade) studentQ = studentQ.eq("grade", ann.target_grade);
  if (ann.target_school_id) studentQ = studentQ.eq("school_id", ann.target_school_id);
  const { data: students } = await studentQ;

  const studentIds = (students ?? []).map((s: { id: string }) => s.id);

  // 対象生徒に紐付く保護者
  let parentIds: string[] = [];
  if (studentIds.length > 0) {
    const { data: links } = await supabase
      .from("parent_student_links")
      .select("parent_id")
      .in("student_id", studentIds);
    parentIds = Array.from(new Set((links ?? []).map((l: { parent_id: string }) => l.parent_id)));
  }

  const subject = `お知らせ：${ann.title}`;
  const body_text = ann.content;

  // 並列に発火
  await Promise.allSettled([
    ...parentIds.map((pid) => dispatch(origin, {
      actor_kind: "parent",
      actor_id: pid,
      event_type: "announcement",
      subject,
      body_text,
      link: `${origin}/parent/dashboard`,
    })),
    ...studentIds.map((sid) => dispatch(origin, {
      actor_kind: "student",
      actor_id: sid,
      event_type: "announcement",
      subject,
      body_text,
      link: `${origin}/student/dashboard`,
    })),
  ]);

  return NextResponse.json({
    success: true,
    parents_notified: parentIds.length,
    students_notified: studentIds.length,
  });
}
