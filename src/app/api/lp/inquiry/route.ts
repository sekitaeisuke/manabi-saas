import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * サービス紹介サイト（/lp）からの問い合わせ受付。
 *
 * 匿名で叩けるルートなので、テーブルへの直接 INSERT は RLS で塞いである
 * （lp-inquiries-setup.sql）。ここだけが service role で書き込む唯一の口。
 * 踏み台にされないよう、ハニーポット・長さ制限・簡易レート制限をかける。
 */

export const runtime = "nodejs";

const MAX = { juku_name: 100, person_name: 60, email: 200, phone: 40, message: 4000 };

const SCHOOL_COUNT = ["1", "2-3", "4-9", "10+"];
const STUDENT_COUNT = ["-50", "50-150", "150-400", "400+"];

// 同一IPからの連投を軽く抑える（インスタンス内メモリ。厳密さより事故防止が目的）
const recent = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 5;

function tooMany(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 500) {
    for (const [k, v] of recent) if (v.every((t) => now - t >= WINDOW_MS)) recent.delete(k);
  }
  return hits.length > LIMIT;
}

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  // ハニーポット（人間には見えない欄。埋まっていたら黙って成功を返す）
  if (str(body.company_website, 200)) {
    return NextResponse.json({ ok: true });
  }

  const juku_name = str(body.juku_name, MAX.juku_name);
  const person_name = str(body.person_name, MAX.person_name);
  const email = str(body.email, MAX.email);
  const phone = str(body.phone, MAX.phone) || null;
  const message = str(body.message, MAX.message) || null;
  const school_count = SCHOOL_COUNT.includes(str(body.school_count, 10))
    ? str(body.school_count, 10) : null;
  const student_count = STUDENT_COUNT.includes(str(body.student_count, 10))
    ? str(body.student_count, 10) : null;
  const interests = Array.isArray(body.interests)
    ? body.interests.filter((v): v is string => typeof v === "string").slice(0, 20).map((v) => v.slice(0, 40))
    : [];

  if (!juku_name || !person_name || !email) {
    return NextResponse.json({ error: "塾名・ご担当者名・メールアドレスは必須です" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "メールアドレスの形式をご確認ください" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (tooMany(ip)) {
    return NextResponse.json(
      { error: "短時間に送信が続いています。しばらく置いてからお試しください。" },
      { status: 429 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      { error: "サーバ設定が未完了です。お手数ですがお電話・メールでご連絡ください。" },
      { status: 500 },
    );
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin.from("saas_inquiries").insert({
    juku_name, person_name, email, phone, school_count, student_count,
    interests, message, source: "lp",
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
  });

  if (error) {
    return NextResponse.json({ error: "送信に失敗しました: " + error.message }, { status: 500 });
  }

  await notifyChatwork({ juku_name, person_name, email, phone, school_count, student_count, interests, message });

  return NextResponse.json({ ok: true });
}

/** Chatwork へのお知らせ。env 未設定なら黙ってスキップ（問い合わせ自体は成功扱い）。 */
async function notifyChatwork(i: {
  juku_name: string; person_name: string; email: string; phone: string | null;
  school_count: string | null; student_count: string | null;
  interests: string[]; message: string | null;
}) {
  const token = process.env.CHATWORK_API_TOKEN;
  const room = process.env.CHATWORK_INQUIRY_ROOM_ID;
  if (!token || !room) return;
  const text =
    `[info][title]つながるまなび サイトからの問い合わせ[/title]` +
    `塾名: ${i.juku_name}\nご担当: ${i.person_name}\nメール: ${i.email}\n` +
    (i.phone ? `電話: ${i.phone}\n` : "") +
    (i.school_count ? `教室数: ${i.school_count}\n` : "") +
    (i.student_count ? `生徒数: ${i.student_count}\n` : "") +
    (i.interests.length ? `関心: ${i.interests.join(" / ")}\n` : "") +
    (i.message ? `\n${i.message}` : "") +
    `[/info]`;
  try {
    await fetch(`https://api.chatwork.com/v2/rooms/${room}/messages`, {
      method: "POST",
      headers: { "X-ChatWorkToken": token, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ body: text }),
    });
  } catch {
    // 通知はベストエフォート
  }
}
