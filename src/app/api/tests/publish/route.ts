import { NextRequest, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/apiAuth";
import { serviceClient, SERVICE_KEY_MISSING } from "@/lib/authAdmin";

// 受験URLの既定有効期間（日）
const VALID_DAYS = 30;

/**
 * テストの受験URL（test_sessions）を発行する。
 *
 * 期限切れのURLを配ってしまう事故（生徒側は「テストが見つかりません」になる）を防ぐため、
 * 既存セッションを使い回すのではなく、ここで必ず「有効なURL」を返す:
 *   - 未失効のセッションがあればそれを返す（重複セッションを増やさない）
 *   - 失効している / renew 指定なら expires_at を延長して同じ url_token を返す
 *     （既存の test_assignments と生徒ダッシュボードのリンクがそのまま生き返る）
 *   - セッションが無ければ新規作成する
 */
export async function POST(req: NextRequest) {
  const auth = await requireTeacher(req);
  if (auth instanceof NextResponse) return auth;

  const { test_id, renew } = await req.json();
  if (!test_id) {
    return NextResponse.json({ error: "test_id は必須です" }, { status: 400 });
  }

  // requireTeacher 済み。RLS を貫通するため service role で書き込む
  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: SERVICE_KEY_MISSING }, { status: 500 });

  const expiresAt = new Date(Date.now() + VALID_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: existing, error: findErr } = await supabase
    .from("test_sessions")
    .select("id, url_token, expires_at")
    .eq("test_id", test_id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });

  const latest = existing?.[0];
  const alive = latest && (!latest.expires_at || new Date(latest.expires_at).getTime() > Date.now());

  let token: string;
  let validUntil: string | null;

  if (latest && (alive && !renew)) {
    token = latest.url_token as string;
    validUntil = (latest.expires_at as string | null) ?? null;
  } else if (latest) {
    // 期限切れ or 再発行要求 → 同じURLの期限を延ばす
    const { data: renewed, error: updErr } = await supabase
      .from("test_sessions")
      .update({ expires_at: expiresAt })
      .eq("id", latest.id)
      .select("url_token, expires_at")
      .single();
    if (updErr || !renewed) {
      return NextResponse.json({ error: updErr?.message ?? "受験URLの再発行に失敗しました" }, { status: 500 });
    }
    token = renewed.url_token as string;
    validUntil = renewed.expires_at as string;
  } else {
    const newToken = crypto.randomUUID().replace(/-/g, "");
    const { data, error } = await supabase
      .from("test_sessions")
      .insert({ test_id, url_token: newToken, expires_at: expiresAt })
      .select("url_token, expires_at")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "受験URLの発行に失敗しました" }, { status: 500 });
    }
    token = data.url_token as string;
    validUntil = data.expires_at as string;
  }

  const { error: updateErr } = await supabase
    .from("tests").update({ status: "published" }).eq("id", test_id);
  if (updateErr) {
    console.error("tests status update failed:", updateErr);
    return NextResponse.json({ error: "テストの公開状態更新に失敗しました: " + updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ token, expires_at: validUntil });
}
