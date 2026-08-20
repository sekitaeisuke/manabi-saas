import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { serviceClient, findAuthUserByEmail, SERVICE_KEY_MISSING } from "@/lib/authAdmin";

/**
 * 既存講師のアカウント発行／パスワード再設定（管理者のみ）。
 * Auth ユーザが無ければ作成（＝アカウント発行）、あればパスワードを上書きする。
 * 現在のパスワードは復号できないため、確認はできず再設定のみ。
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { teacher_id, password } = await req.json();
  if (!teacher_id || !password) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 6) {
    return NextResponse.json({ error: "パスワードは6文字以上にしてください" }, { status: 400 });
  }

  const admin = serviceClient();
  if (!admin) return NextResponse.json({ error: SERVICE_KEY_MISSING }, { status: 500 });

  const { data: teacher, error: fetchErr } = await admin
    .from("teachers")
    .select("id, name, email")
    .eq("id", teacher_id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!teacher) return NextResponse.json({ error: "講師が見つかりません" }, { status: 404 });
  if (!teacher.email) {
    return NextResponse.json(
      { error: "この講師はメールアドレスが未登録です。先にメールアドレスを登録してください（ログインIDになります）" },
      { status: 400 },
    );
  }

  const email = String(teacher.email).trim().toLowerCase();

  let existing;
  try {
    existing = await findAuthUserByEmail(admin, email);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  if (existing) {
    const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, { password });
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    return NextResponse.json({ success: true, email, created: false });
  }

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) {
    return NextResponse.json({ error: created.error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true, email, created: true });
}
