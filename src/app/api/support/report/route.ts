import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";

// ヘルプデスクへの問い合わせ。
//
// 生成AIは講師にとってまだ馴染みが薄く、エラーの意味も伝わりにくい。
// 「何が起きたか」を自動で添付したうえで、その場から info@ へ送れるようにする。
//
// 二段構え:
//   ① support_requests に必ず記録する（メールが飛ばなくても問い合わせは失われない）
//   ② RESEND_API_KEY があれば info@kyouiku-koubou.com へメール送信
//
// 入力: { message, category?, context? }
//   context には画面側が拾ったエラー内容（feature / provider / kind / 画面に出た文言）を入れる。

const HELPDESK_TO = process.env.SUPPORT_EMAIL_TO ?? "info@kyouiku-koubou.com";

type Body = {
  message?: string;
  category?: string;
  context?: Record<string, unknown>;
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function sendMail(subject: string, text: string, html: string): Promise<{ status: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { status: "skipped", error: "RESEND_API_KEY 未設定" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
        to: HELPDESK_TO,
        subject, text, html,
      }),
    });
    if (!res.ok) return { status: "failed", error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: String(e).slice(0, 200) };
  }
}

export async function POST(req: NextRequest) {
  // 講師・保護者・生徒の誰でも困ったら送れるようにする（無認証は不可）
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as Body;
  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "お困りの内容を書いてください" }, { status: 400 });
  }
  if (message.length > 4000) {
    return NextResponse.json({ error: "本文が長すぎます（4000字まで）" }, { status: 400 });
  }

  const actorEmail = "email" in auth ? String((auth as { email?: string }).email ?? "") : "";
  const actorName = "name" in auth ? String((auth as { name?: string }).name ?? "") : "";
  const category = typeof body.category === "string" ? body.category.slice(0, 40) : "ai_error";
  const context = body.context && typeof body.context === "object" ? body.context : null;

  const ctxLines = context
    ? Object.entries(context).map(([k, v]) => `  ${k}: ${String(v ?? "").slice(0, 300)}`).join("\n")
    : "  （なし）";

  const subject = `【つながるまなび】お問い合わせ（${category}）${actorName ? ` / ${actorName}` : ""}`;
  const text =
    `つながるまなび からの問い合わせです。\n\n` +
    `■ 送信者\n  ${actorName || "（名前未設定）"} <${actorEmail || "メール不明"}>\n\n` +
    `■ お困りの内容\n${message}\n\n` +
    `■ 自動で添付された状況\n${ctxLines}\n`;
  const html =
    `<p>つながるまなび からの問い合わせです。</p>` +
    `<p><b>送信者</b><br>${esc(actorName || "（名前未設定）")} &lt;${esc(actorEmail || "メール不明")}&gt;</p>` +
    `<p><b>お困りの内容</b><br>${esc(message).replace(/\n/g, "<br>")}</p>` +
    `<p><b>自動で添付された状況</b><br><pre>${esc(ctxLines)}</pre></p>`;

  const mail = await sendMail(subject, text, html);

  // 記録は service role で（RLSは閲覧用。書き込みはここだけに絞る）
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let saved = false;
  let saveError: string | null = null;
  if (serviceRoleKey) {
    const svc = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error } = await svc.from("support_requests").insert({
      category, message, context,
      actor_email: actorEmail || null,
      actor_name: actorName || null,
      mail_status: mail.status,
      mail_error: mail.error ?? null,
    });
    saved = !error;
    saveError = error?.message ?? null;
  }

  // メールが飛ばなくても、記録できていれば「受け付けた」と返す。
  // 両方だめなときだけ失敗にする（講師に黙って消えるのが一番まずい）。
  if (mail.status !== "sent" && !saved) {
    return NextResponse.json(
      { error: `送信できませんでした。お手数ですが ${HELPDESK_TO} まで直接ご連絡ください。`, detail: mail.error ?? saveError },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    mailed: mail.status === "sent",
    to: HELPDESK_TO,
    note: mail.status === "sent" ? null : "メール送信は未設定のため、管理画面に記録しました。",
  });
}
