import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { lineToken, lineSecret, lineAddFriendUrl } from "@/lib/line";

// LINE 連携の配線チェック（管理者のみ）。
// Vercel のダッシュボードと LINE Developers を往復しなくても、
// 「保護者に案内を送れる状態か」を1画面で判定できるようにする。
//
// 秘密の値そのものは絶対に返さない。設定されているか／有効かだけを返す。

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  /** false のとき、何をすれば直るか */
  fix?: string;
};

async function lineGet(path: string, token: string) {
  const res = await fetch(`https://api.line.me/v2/bot/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text().catch(() => "");
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* テキストのまま扱う */ }
  return { ok: res.ok, status: res.status, json, text };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const token = lineToken();
  const secret = lineSecret();
  const addUrl = lineAddFriendUrl();
  const expectedWebhook = `${new URL(req.url).origin}/api/line/webhook`;

  const checks: Check[] = [];

  // ── ① 環境変数 ─────────────────────────────────────
  checks.push({
    key: "token",
    label: "アクセストークン（LINE_OFFICIAL_CHANNEL_ACCESS_TOKEN）",
    ok: !!token,
    detail: token ? "設定されています" : "未設定",
    fix: "Vercel → Settings → Environment Variables に追加して再デプロイ",
  });
  // シークレットは値そのものを出さない。ただし「32桁の英数字か」だけは見せる。
  // 別チャネルの値・改行混入・トークンとの取り違えが、これだけで大体わかる。
  const secretLooksValid = /^[0-9a-f]{32}$/i.test(secret);
  checks.push({
    key: "secret",
    label: "チャネルシークレット（LINE_OFFICIAL_CHANNEL_SECRET）",
    ok: !!secret && secretLooksValid,
    detail: !secret
      ? "未設定"
      : secretLooksValid
        ? "設定されています（32桁）"
        : `形式が違います（${secret.length}文字）。アクセストークンを貼っていないか確認`,
    fix: "未設定・取り違えだと Webhook の署名検証が必ず失敗し、連携コードを送っても無反応になります",
  });
  checks.push({
    key: "addUrl",
    label: "友だち追加URL（LINE_OFFICIAL_URL）",
    ok: !!addUrl,
    detail: addUrl || "未設定",
    fix: "未設定でも連携はできますが、画面に「友だち追加」ボタンが出ません",
  });

  // ── ② トークンが本当に生きているか ────────────────
  let botName = "";
  if (token) {
    const info = await lineGet("info", token);
    if (info.ok) {
      botName = String(info.json.displayName ?? "");
      checks.push({
        key: "botInfo",
        label: "LINE公式アカウントに接続できるか",
        ok: true,
        detail: `${botName || "(名称不明)"}（${String(info.json.basicId ?? "")}）`,
      });
    } else {
      checks.push({
        key: "botInfo",
        label: "LINE公式アカウントに接続できるか",
        ok: false,
        detail: `LINE API ${info.status}: ${info.text.slice(0, 120)}`,
        fix: "トークンが失効/別チャネルのものの可能性。LINE Developers で発行し直す",
      });
    }
  }

  // ── ③ Webhook URL が LINE 側に登録されているか ─────
  if (token) {
    const wh = await lineGet("channel/webhook/endpoint", token);
    if (wh.ok) {
      const endpoint = String(wh.json.endpoint ?? "");
      const active = wh.json.active === true;
      const matches = endpoint === expectedWebhook;
      checks.push({
        key: "webhookUrl",
        label: "Webhook URL の登録",
        ok: matches && active,
        detail: endpoint
          ? `登録済み: ${endpoint}${active ? "" : "（無効化されています）"}`
          : "未登録",
        fix: matches
          ? "LINE Developers で Webhook の利用を「オン」にする"
          : `LINE Developers の Webhook URL に ${expectedWebhook} を設定する`,
      });
    } else {
      checks.push({
        key: "webhookUrl",
        label: "Webhook URL の登録",
        ok: false,
        detail: `取得できません（LINE API ${wh.status}）`,
        fix: `LINE Developers の Webhook URL に ${expectedWebhook} を設定する`,
      });
    }
  }

  // ── ④ LINE から実際に叩いてもらう（本番の疎通確認） ──
  if (token) {
    const res = await fetch("https://api.line.me/v2/bot/channel/webhook/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint: expectedWebhook }),
    });
    const text = await res.text().catch(() => "");
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch { /* テキストのまま扱う */ }
    const success = res.ok && json.success === true;
    checks.push({
      key: "webhookTest",
      label: "LINE から Webhook への疎通テスト",
      ok: success,
      detail: success
        ? `成功（HTTP ${String(json.statusCode ?? 200)}）`
        : `失敗: ${String(json.reason ?? json.detail ?? (text.slice(0, 120) || res.status))}`,
      fix: "署名検証で弾かれている場合はシークレットの取り違え。デプロイ直後は数十秒おいて再実行",
    });
  }

  const ready = checks.every((c) => c.ok || c.key === "addUrl"); // 友だち追加URLは任意
  return NextResponse.json({
    ready,
    expectedWebhook,
    botName,
    checks,
  });
}
