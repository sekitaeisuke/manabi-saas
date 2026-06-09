import { NextRequest, NextResponse } from "next/server";
import { requireTeacher, adminClient, authErrorResponse } from "@/lib/serverAuth";
import { dispatchNotification } from "@/lib/server/dispatchNotification";

type Announcement = {
  id: string;
  title: string;
  content: string;
  target_grade: string | null;
  target_school_id: string | null;
};

export async function POST(req: NextRequest) {
  // 講師のみがお知らせ一斉送信を実行できる
  try {
    await requireTeacher(req);
  } catch (e) {
    return authErrorResponse(e);
  }

  const origin = new URL(req.url).origin;
  const { announcement_id } = await req.json();
  if (!announcement_id) {
    return NextResponse.json({ error: "announcement_id は必須です" }, { status: 400 });
  }

  const supabase = adminClient();

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

  // 並列に発火（内部 HTTP 中継を使わず共有関数を直接呼ぶ）
  await Promise.allSettled([
    ...parentIds.map((pid) => dispatchNotification({
      actor_kind: "parent",
      actor_id: pid,
      event_type: "announcement",
      subject,
      body_text,
      link: `${origin}/parent/dashboard`,
    })),
    ...studentIds.map((sid) => dispatchNotification({
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
