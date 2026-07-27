// LINE 連携コードの発行・解除。
// 画面（保護者/講師の通知設定）から authFetch で呼ぶ。
// コードは line_link_codes に入り、LINE 側で送られてくると /api/line/webhook が照合する。

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/apiAuth";
import { generateLinkCode, lineAddFriendUrl } from "@/lib/line";

export const runtime = "nodejs";

const CODE_TTL_MIN = 10;

type Actor = { kind: "parent" | "teacher"; id: string };

async function resolveActor(db: SupabaseClient, email: string): Promise<Actor | null> {
  const { data: parent } = await db.from("parents").select("id").eq("email", email).maybeSingle();
  if (parent) return { kind: "parent", id: parent.id as string };
  const { data: teacher } = await db.from("teachers").select("id").eq("email", email).maybeSingle();
  if (teacher) return { kind: "teacher", id: teacher.id as string };
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action !== "issue" && action !== "unlink") {
    return NextResponse.json({ error: "action は issue か unlink です" }, { status: 400 });
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const actor = await resolveActor(db, auth.email);
  if (!actor) {
    return NextResponse.json({ error: "保護者・講師アカウントが見つかりません" }, { status: 403 });
  }

  if (action === "unlink") {
    const { error } = await db
      .from("notification_preferences")
      .update({ line_enabled: false, line_user_id: null })
      .eq("actor_kind", actor.kind)
      .eq("actor_id", actor.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // 未使用の古いコードは無効化しておく（同時に複数のコードが生きている状態を作らない）
  await db.from("line_link_codes").delete()
    .eq("actor_kind", actor.kind).eq("actor_id", actor.id).is("used_at", null);

  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString();

  // 万一コードが衝突したら引き直す
  let code = "";
  for (let i = 0; i < 5; i++) {
    const candidate = generateLinkCode();
    const { error } = await db.from("line_link_codes").insert({
      code: candidate, actor_kind: actor.kind, actor_id: actor.id, expires_at: expiresAt,
    });
    if (!error) { code = candidate; break; }
    if (error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  if (!code) return NextResponse.json({ error: "コードを発行できませんでした" }, { status: 500 });

  return NextResponse.json({ code, expiresAt, addFriendUrl: lineAddFriendUrl(), ttlMinutes: CODE_TTL_MIN });
}
