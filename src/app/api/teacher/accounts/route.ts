import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { serviceClient, SERVICE_KEY_MISSING } from "@/lib/authAdmin";

/**
 * 講師のうち「ログインできる（Auth ユーザがある）」メールの一覧を返す（管理者のみ）。
 * 画面で「ログイン可 / 未発行」を出し分けるために使う。
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const admin = serviceClient();
  if (!admin) return NextResponse.json({ error: SERVICE_KEY_MISSING }, { status: 500 });

  const { data: teachers, error } = await admin.from("teachers").select("email");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const wanted = new Set(
    (teachers ?? [])
      .map((t) => (t.email ? String(t.email).trim().toLowerCase() : null))
      .filter((e): e is string => Boolean(e)),
  );
  if (wanted.size === 0) return NextResponse.json({ emails: [] });

  const found: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    const users = data?.users ?? [];
    for (const u of users) {
      const e = u.email?.toLowerCase();
      if (e && wanted.has(e)) found.push(e);
    }
    if (users.length < 1000) break;
  }

  return NextResponse.json({ emails: found });
}
