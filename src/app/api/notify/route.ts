import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

type ActorKind = "parent" | "teacher" | "student";

type NotifyPayload = {
  actor_kind: ActorKind;
  actor_id: string;
  event_type: string;     // new_parent_message / reschedule_decision / ...
  subject: string;
  body_text: string;
  body_html?: string;
  link?: string;
};

const APP_NAME = "manabi-saas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function lookupContactEmail(supabase: any, actor_kind: ActorKind, actor_id: string, override: string | null): Promise<string | null> {
  if (override) return override;
  if (actor_kind === "parent") {
    const { data } = await supabase.from("parents").select("email").eq("id", actor_id).maybeSingle();
    return (data as { email: string | null } | null)?.email ?? null;
  }
  if (actor_kind === "teacher") {
    const { data } = await supabase.from("teachers").select("email").eq("id", actor_id).maybeSingle();
    return (data as { email: string | null } | null)?.email ?? null;
  }
  if (actor_kind === "student") {
    return null; // 生徒は login_id@students.local なので email 通知は基本オフ
  }
  return null;
}

async function sendEmailViaResend({
  to, subject, html, text,
}: { to: string; subject: string; html: string; text: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY 未設定" };
  const from = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: `Resend ${res.status}: ${t}` };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const payload = (await req.json()) as NotifyPayload;

  if (!payload?.actor_kind || !payload?.actor_id || !payload?.event_type) {
    return NextResponse.json({ error: "actor_kind / actor_id / event_type は必須です" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 受信者の通知設定を取得
  const { data: prefRow } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("actor_kind", payload.actor_kind)
    .eq("actor_id", payload.actor_id)
    .maybeSingle();

  const pref = (prefRow ?? {
    email_enabled: true, push_enabled: false, line_enabled: false,
    email_override: null, push_endpoint: null, line_user_id: null,
  }) as {
    email_enabled: boolean; push_enabled: boolean; line_enabled: boolean;
    email_override: string | null; push_endpoint: string | null; line_user_id: string | null;
  };

  const subject = `[${APP_NAME}] ${payload.subject}`;
  const html = payload.body_html ?? `<p>${payload.body_text.replace(/\n/g, "<br/>")}</p>${
    payload.link ? `<p><a href="${payload.link}">${payload.link}</a></p>` : ""
  }`;
  const text = payload.body_text + (payload.link ? `\n\n${payload.link}` : "");

  const log = async (channel: string, status: string, recipient: string | null, error: string | null) => {
    await supabase.from("notification_log").insert({
      actor_kind: payload.actor_kind,
      actor_id: payload.actor_id,
      channel,
      event_type: payload.event_type,
      status,
      recipient,
      subject,
      body: text,
      error,
    });
  };

  const results: Record<string, { status: string; error?: string }> = {};

  // Email
  if (pref.email_enabled) {
    const to = await lookupContactEmail(supabase, payload.actor_kind, payload.actor_id, pref.email_override);
    if (!to) {
      await log("email", "skipped", null, "宛先メール未登録");
      results.email = { status: "skipped", error: "no recipient email" };
    } else {
      const r = await sendEmailViaResend({ to, subject, html, text });
      if (r.ok) {
        await log("email", "sent", to, null);
        results.email = { status: "sent" };
      } else {
        await log("email", "failed", to, r.error);
        results.email = { status: "failed", error: r.error };
      }
    }
  } else {
    results.email = { status: "disabled" };
  }

  // Push（Web Push）
  if (pref.push_enabled) {
    const vapidPub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPriv = process.env.VAPID_PRIVATE_KEY;
    const vapidSub = process.env.VAPID_SUBJECT;
    if (!pref.push_endpoint) {
      await log("push", "skipped", null, "push_endpoint 未登録");
      results.push = { status: "skipped", error: "no push endpoint" };
    } else if (!vapidPub || !vapidPriv || !vapidSub) {
      await log("push", "skipped", null, "VAPID 鍵未設定");
      results.push = { status: "skipped", error: "VAPID keys not configured" };
    } else {
      try {
        webpush.setVapidDetails(vapidSub, vapidPub, vapidPriv);
        const subscription = JSON.parse(pref.push_endpoint) as {
          endpoint: string; keys: { p256dh: string; auth: string };
        };
        const pushPayload = JSON.stringify({
          title: payload.subject || "manabi-saas",
          body: payload.body_text,
          url: payload.link || "/",
        });
        await webpush.sendNotification(subscription, pushPayload);
        await log("push", "sent", subscription.endpoint, null);
        results.push = { status: "sent" };
      } catch (e: unknown) {
        const statusCode = (e as { statusCode?: number })?.statusCode;
        const msg = e instanceof Error ? e.message : String(e);
        // 410 Gone / 404 Not Found → subscription 失効。preferences をクリア。
        if (statusCode === 410 || statusCode === 404) {
          await supabase.from("notification_preferences")
            .update({ push_enabled: false, push_endpoint: null })
            .eq("actor_kind", payload.actor_kind)
            .eq("actor_id", payload.actor_id);
          await log("push", "failed", pref.push_endpoint, `subscription expired (${statusCode})`);
          results.push = { status: "failed", error: `expired (${statusCode})` };
        } else {
          await log("push", "failed", pref.push_endpoint, msg);
          results.push = { status: "failed", error: msg };
        }
      }
    }
  } else {
    results.push = { status: "disabled" };
  }

  // LINE（未実装）
  if (pref.line_enabled) {
    if (!pref.line_user_id) {
      await log("line", "skipped", null, "line_user_id 未登録");
      results.line = { status: "skipped", error: "no line user id" };
    } else {
      // TODO: LINE Messaging API を使って実装
      await log("line", "skipped", pref.line_user_id, "LINE 連携 未実装");
      results.line = { status: "stub" };
    }
  } else {
    results.line = { status: "disabled" };
  }

  return NextResponse.json({ success: true, results });
}
