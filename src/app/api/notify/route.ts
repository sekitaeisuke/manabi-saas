import { NextRequest, NextResponse } from "next/server";
import { requireUser, authErrorResponse } from "@/lib/serverAuth";
import { dispatchNotification, type NotifyPayload } from "@/lib/server/dispatchNotification";

export async function POST(req: NextRequest) {
  // ログイン済み（保護者/講師/生徒いずれか）のみ通知を発火できる
  try {
    await requireUser(req);
  } catch (e) {
    return authErrorResponse(e);
  }

  const payload = (await req.json()) as NotifyPayload;

  if (!payload?.actor_kind || !payload?.actor_id || !payload?.event_type) {
    return NextResponse.json({ error: "actor_kind / actor_id / event_type は必須です" }, { status: 400 });
  }

  try {
    const results = await dispatchNotification(payload);
    return NextResponse.json({ success: true, results });
  } catch (e) {
    return authErrorResponse(e);
  }
}
