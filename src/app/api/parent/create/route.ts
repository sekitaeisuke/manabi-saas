import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { email, password, name, phone, student_ids } = await req.json();

  if (!email || !password || !name) {
    return NextResponse.json({ error: "メール・パスワード・氏名は必須です" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    return NextResponse.json({
      error:
        "SUPABASE_SERVICE_ROLE_KEY が未設定のため、サーバ側で parents テーブルに書き込めません（RLS で弾かれます）。" +
        " Supabase ダッシュボード → Project Settings → API Keys から service_role キーをコピーし、" +
        " プロジェクトの .env.local に SUPABASE_SERVICE_ROLE_KEY=... を追加して dev サーバを再起動してください。",
    }, { status: 500 });
  }

  // RLS をバイパスするための service role クライアント
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 既存 parents 行チェック
  const { data: existing } = await admin
    .from("parents").select("id").eq("email", email).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "このメールアドレスは既に parents に登録されています" }, { status: 409 });
  }

  // Auth ユーザ作成（既存なら拾う）
  let authUserId: string | null = null;
  let authAlreadyExisted = false;

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created.error) {
    const m = created.error.message?.toLowerCase() ?? "";
    if (m.includes("already") || m.includes("registered") || m.includes("exists")) {
      authAlreadyExisted = true;
      // 既存ユーザの id を取得（admin.listUsers を使うか、email でフィルタ）
      const { data: list } = await admin.auth.admin.listUsers();
      const found = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      authUserId = found?.id ?? null;
    } else {
      return NextResponse.json({ error: created.error.message }, { status: 400 });
    }
  } else {
    authUserId = created.data.user?.id ?? null;
  }

  // parents 行を作成
  const { data: parent, error: insErr } = await admin
    .from("parents")
    .insert({ email, name, phone: phone || null, auth_user_id: authUserId })
    .select("id")
    .single();

  if (insErr || !parent) {
    return NextResponse.json({ error: insErr?.message ?? "parents 行の作成に失敗しました" }, { status: 500 });
  }

  // 紐付け
  if (Array.isArray(student_ids) && student_ids.length > 0) {
    const rows = student_ids.map((sid: string) => ({ parent_id: parent.id, student_id: sid }));
    const { error: linkErr } = await admin.from("parent_student_links").insert(rows);
    if (linkErr) {
      // ロールバック: 作成した保護者レコードを削除
      await admin.from("parents").delete().eq("id", parent.id);
      if (!authAlreadyExisted) {
        await admin.auth.admin.deleteUser(authUserId!).catch((e) => {
          console.error("ロールバック中のAuth削除失敗（手動対応が必要）:", authUserId, e);
        });
      }
      return NextResponse.json(
        { error: `生徒紐付けに失敗したため保護者の作成を取り消しました: ${linkErr.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    success: true,
    parent_id: parent.id,
    auth_already_existed: authAlreadyExisted,
    note: authAlreadyExisted
      ? "Supabase Auth に同じ Email のユーザが既に存在したため、新規パスワードは設定していません。保護者は既存のパスワードでログインしてください。パスワードを忘れている場合は Supabase ダッシュボードからリセットしてください。"
      : null,
  });
}
