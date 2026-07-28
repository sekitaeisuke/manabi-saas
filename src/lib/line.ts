// LINE Messaging API の共通ヘルパー（サーバ専用）。
//
// トークンの取り違えに注意:
//   LINE_OFFICIAL_CHANNEL_ACCESS_TOKEN … 保護者向けの LINE 公式アカウント（こちらが本命）
//   LINE_CHANNEL_ACCESS_TOKEN          … 旧・個人用bot。OFFICIAL が無いときだけ後方互換で使う
// 署名検証用の secret も同じ優先順位。Vercel には公式アカウント側の値を入れること。

import crypto from "node:crypto";

// 環境変数は貼り付け時に改行・空白が混ざりやすい。混ざると署名検証が必ず外れて
// 「既読になるのに無反応」になるので、読むときに必ず落とす。
function env(name: string): string {
  return (process.env[name] || "").trim();
}

export function lineToken(): string {
  return env("LINE_OFFICIAL_CHANNEL_ACCESS_TOKEN") || env("LINE_CHANNEL_ACCESS_TOKEN");
}

export function lineSecret(): string {
  return env("LINE_OFFICIAL_CHANNEL_SECRET") || env("LINE_CHANNEL_SECRET");
}

/** 友だち追加URL（QR・リンクの掲示用） */
export function lineAddFriendUrl(): string {
  return env("LINE_OFFICIAL_URL");
}

/** x-line-signature の検証。secret 未設定なら常に false（＝受け付けない） */
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  const secret = lineSecret();
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function callLine(path: string, body: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = lineToken();
  if (!token) return { ok: false, error: "LINE アクセストークン未設定" };
  const res = await fetch(`https://api.line.me/v2/bot/message/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const text = await res.text().catch(() => "(読み取り不可)");
  return { ok: false, error: `LINE API ${res.status}: ${text}` };
}

/** webhook への応答（replyToken は1回・約1分だけ有効） */
export function lineReply(replyToken: string, text: string) {
  return callLine("reply", { replyToken, messages: [{ type: "text", text: text.slice(0, 4999) }] });
}

/** 任意のタイミングで送る（通知本体） */
export function linePush(to: string, text: string) {
  return callLine("push", { to, messages: [{ type: "text", text: text.slice(0, 4999) }] });
}

// 連携コード: 見間違えやすい I/O/0/1 を除いた英数字6桁
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateLinkCode(): string {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

/** 保護者が送ってきたテキストをコードとして正規化（全角・空白・小文字を吸収） */
export function normalizeLinkCode(text: string): string {
  return text
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s-]/g, "")
    .toUpperCase();
}
