// LINE 公式アカウントの Webhook。
// 保護者/講師が友だち追加して6桁の連携コードを送ると、
// notification_preferences.line_user_id を埋めて以後 /api/notify から LINE に届くようになる。
//
// LINE Developers の Webhook URL に  https://<本番ドメイン>/api/line/webhook  を設定すること。

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { verifyLineSignature, lineReply, normalizeLinkCode } from "@/lib/line";

export const runtime = "nodejs"; // 署名検証に node:crypto を使う
export const dynamic = "force-dynamic";

const GUIDE =
  "「つながるまなび」の通知をこの LINE で受け取れます。\n\n" +
  "保護者ページ →「通知設定」→「LINE で受け取る」の【連携する】を押すと6桁のコードが出ます。" +
  "そのコードをこのトークに送ってください。\n\n" +
  "（連携をやめるときは「解除」と送ってください）";

const UNLINK_WORDS = ["解除", "かいじょ", "停止", "解約", "UNLINK"];

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
};

/** 返信の失敗を握りつぶさない。無反応の原因（トークン違い・期限切れ）はここにしか出ない */
async function reply(replyToken: string, text: string) {
  const res = await lineReply(replyToken, text);
  if (!res.ok) console.error("[line/webhook] 返信に失敗:", res.error);
}

function svc(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** userId の連携を解除する（ブロック・「解除」送信の両方から呼ぶ） */
async function unlinkByUserId(db: SupabaseClient, lineUserId: string) {
  await db
    .from("notification_preferences")
    .update({ line_enabled: false, line_user_id: null })
    .eq("line_user_id", lineUserId);
}

async function handleCode(db: SupabaseClient, lineUserId: string, code: string): Promise<string | null> {
  const { data: row } = await db
    .from("line_link_codes")
    .select("code, actor_kind, actor_id, expires_at, used_at")
    .eq("code", code)
    .maybeSingle();

  if (!row) return null; // コードではない入力 → 呼び出し側で案内文を返す
  if (row.used_at) return "このコードは使用済みです。設定画面でもう一度発行してください。";
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return "このコードは有効期限が切れています。設定画面でもう一度発行してください。";
  }

  // 同じ種別の古い紐付けを外してから付け替える（機種変更・アカウント作り直し対策）
  await db
    .from("notification_preferences")
    .update({ line_enabled: false, line_user_id: null })
    .eq("line_user_id", lineUserId)
    .eq("actor_kind", row.actor_kind);

  const { error } = await db
    .from("notification_preferences")
    .upsert(
      { actor_kind: row.actor_kind, actor_id: row.actor_id, line_user_id: lineUserId, line_enabled: true },
      { onConflict: "actor_kind,actor_id" }
    );
  if (error) {
    console.error("[line/webhook] 連携保存に失敗:", error.message);
    return "連携に失敗しました。時間をおいてもう一度お試しください。";
  }

  await db
    .from("line_link_codes")
    .update({ used_at: new Date().toISOString(), line_user_id: lineUserId })
    .eq("code", row.code);

  return "連携が完了しました。これから塾からのお知らせがこの LINE に届きます。";
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verifyLineSignature(rawBody, req.headers.get("x-line-signature"))) {
    // 署名不一致＝LINE以外からの呼び出し。何もしない。
    return NextResponse.json({ error: "signature mismatch" }, { status: 403 });
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(rawBody) as { events?: LineEvent[] }).events ?? [];
  } catch {
    return NextResponse.json({ ok: true }); // 壊れた本文でも200を返して再送を止める
  }

  const db = svc();

  for (const ev of events) {
    const lineUserId = ev.source?.userId;
    if (!lineUserId) continue;

    try {
      if (ev.type === "unfollow") {
        // ブロックされたら送信を止める（送っても届かず失敗ログが溜まるだけ）
        await unlinkByUserId(db, lineUserId);
        continue;
      }

      if (ev.type === "follow") {
        if (ev.replyToken) await reply(ev.replyToken, GUIDE);
        continue;
      }

      if (ev.type === "message" && ev.message?.type === "text") {
        const text = normalizeLinkCode(ev.message.text ?? "");
        if (!ev.replyToken) continue;

        if (UNLINK_WORDS.includes(text)) {
          await unlinkByUserId(db, lineUserId);
          await reply(ev.replyToken, "連携を解除しました。通知はメールでお届けします。");
          continue;
        }

        const result = text.length === 6 ? await handleCode(db, lineUserId, text) : null;
        await reply(ev.replyToken, result ?? GUIDE);
      }
    } catch (e) {
      // 1イベントの失敗で全体を落とさない（LINEは200以外だと再送してくる）
      console.error("[line/webhook] event error:", e instanceof Error ? e.message : String(e));
    }
  }

  return NextResponse.json({ ok: true });
}
