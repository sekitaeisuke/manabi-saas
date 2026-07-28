import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isInternalCall, isServiceKeyCall } from "@/lib/apiAuth";

// 【毎朝 Cron】その日来る生徒ぶんの「今日詰めること」を先に作っておく。
//   平日 7:00 ごろに x-internal-secret（または x-service-key）付きで叩く。
//   管理者は手動でも実行可。
//
//   中身は /api/teaching-focus/generate に委譲する（ロジックを二重に持たない）。
//   既に今日ぶんがある生徒は generate 側で飛ばされるので、再実行しても二重課金しない。

export async function POST(req: NextRequest) {
  const internal = isInternalCall(req) || isServiceKeyCall(req);
  if (!internal) {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
  }

  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "INTERNAL_API_SECRET が未設定です（cron から generate を呼べません）" },
      { status: 500 },
    );
  }

  // 自分自身のオリジンに向けて委譲する。Vercel では VERCEL_URL が入る。
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : new URL(req.url).origin);

  try {
    const res = await fetch(`${origin}/api/teaching-focus/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ all: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error ?? "生成に失敗しました" }, { status: res.status });
    }
    return NextResponse.json({ ran: "teaching-focus", ...data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// GET でも叩けるようにしておく（Vercel Cron は GET を送る）
export async function GET(req: NextRequest) {
  return POST(req);
}
