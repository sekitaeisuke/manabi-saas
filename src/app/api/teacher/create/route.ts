import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { serviceClient, findAuthUserByEmail, SERVICE_KEY_MISSING } from "@/lib/authAdmin";
import { toLoginEmail, TEACHER_ID_PATTERN } from "@/lib/teacherLogin";

/**
 * 講師の新規登録（管理者のみ）。
 * teachers 行を作るだけでは講師はログインできない（ログインは Supabase Auth の
 * メール＋パスワード、teachers 行は email で突合する）ため、ここで両方を作る。
 * パスワードが空なら teachers 行だけを作る（後から「アカウント発行」で付与できる）。
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const name: string = (body.name ?? "").trim();
  // メールでもログインIDでも受ける。ID（@なし）は内部のメール形式に直して保存する。
  const rawAccount: string = (body.email ?? "").trim();
  const email: string = rawAccount ? toLoginEmail(rawAccount) : "";
  const password: string = body.password ?? "";
  const role: string = body.role ?? "teacher";
  const school_id: string | null = body.school_id || null;

  if (!name) {
    return NextResponse.json({ error: "氏名は必須です" }, { status: 400 });
  }
  if (!["admin", "teacher", "part-time"].includes(role)) {
    return NextResponse.json({ error: "役職の値が不正です" }, { status: 400 });
  }
  if (password && !email) {
    return NextResponse.json({ error: "パスワードを設定するにはメールアドレスかログインIDが必要です" }, { status: 400 });
  }
  if (rawAccount && !rawAccount.includes("@") && !TEACHER_ID_PATTERN.test(rawAccount.toLowerCase())) {
    return NextResponse.json(
      { error: "ログインIDは英小文字で始まる2〜16文字の英数字にしてください（例: t017）" },
      { status: 400 },
    );
  }
  if (password && password.length < 6) {
    return NextResponse.json({ error: "パスワードは6文字以上にしてください" }, { status: 400 });
  }

  const admin = serviceClient();
  if (!admin) return NextResponse.json({ error: SERVICE_KEY_MISSING }, { status: 500 });

  // 同じメールの講師が既にいれば二重登録しない（ログインは email で突合するため）
  if (email) {
    const { data: dup } = await admin.from("teachers").select("id").eq("email", email).maybeSingle();
    if (dup) {
      return NextResponse.json({ error: "このメールアドレスの講師は既に登録されています" }, { status: 409 });
    }
  }

  let authUserId: string | null = null;
  let authAlreadyExisted = false;

  if (email && password) {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) {
      const m = created.error.message?.toLowerCase() ?? "";
      if (m.includes("already") || m.includes("registered") || m.includes("exists")) {
        // Auth だけ先にあるケース（過去に作られたまま teachers 行が無い等）。
        // 管理者が今入力したパスワードで上書きして、意図どおりログインできるようにする。
        let found;
        try {
          found = await findAuthUserByEmail(admin, email);
        } catch (e) {
          return NextResponse.json({ error: (e as Error).message }, { status: 500 });
        }
        if (!found) {
          return NextResponse.json({ error: created.error.message }, { status: 400 });
        }
        authAlreadyExisted = true;
        authUserId = found.id;
        const { error: updErr } = await admin.auth.admin.updateUserById(found.id, { password });
        if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
      } else {
        return NextResponse.json({ error: created.error.message }, { status: 400 });
      }
    } else {
      authUserId = created.data.user?.id ?? null;
    }
  }

  const { data: teacher, error: insErr } = await admin
    .from("teachers")
    .insert({ name, email: email || null, role, school_id })
    .select("id")
    .single();

  if (insErr || !teacher) {
    // teachers 行が作れないなら、今作った Auth ユーザは宙に浮くので消す
    if (authUserId && !authAlreadyExisted) {
      await admin.auth.admin.deleteUser(authUserId).catch((e) => {
        console.error("ロールバック中のAuth削除失敗（手動対応が必要）:", authUserId, e);
      });
    }
    return NextResponse.json({ error: insErr?.message ?? "講師の登録に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    teacher_id: teacher.id,
    has_account: Boolean(authUserId),
    auth_already_existed: authAlreadyExisted,
    note: authAlreadyExisted
      ? "同じメールの Auth ユーザが既にあったため、入力したパスワードで上書きしました。"
      : null,
  });
}
