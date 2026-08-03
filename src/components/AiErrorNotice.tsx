"use client";

// 生成AIが失敗したときに出す案内。
// 生成AIはまだ馴染みが薄く、エラー文だけ見せても講師は次の一手が分からない。
// 「何が起きたか」「どうすればよいか」を出したうえで、その場からヘルプデスクへ送れるようにする。
// 送信時は状況（機能・プロバイダ・エラー種別・画面に出た文言）が自動で添付される。

import { useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { Card, Button, Badge, inputClass, cx } from "@/components/ui";

export type AiErrorContext = {
  feature?: string;    // どの機能で起きたか（karte_build 等）
  kind?: string;       // no_key / invalid_key / no_balance / busy / other
  provider?: string;   // anthropic / openai / google
  screen?: string;     // 講師が見ていた画面
};

export type AiErrorState = { message: string; context: AiErrorContext };

/**
 * APIの応答から AiErrorNotice 用の状態を作る。
 * aiKind が付いていないもの（入力ミス・保存失敗など）は AI起因ではないので null を返し、
 * 各画面の従来のエラー表示に任せる。
 */
export function aiErrorFrom(
  data: { error?: string; aiKind?: string; aiProvider?: string; feature?: string } | null | undefined,
  screen: string,
): AiErrorState | null {
  if (!data?.error || !data.aiKind) return null;
  return {
    message: data.error,
    context: { feature: data.feature, kind: data.aiKind, provider: data.aiProvider, screen },
  };
}

/** エラー種別ごとの「まず何をすればよいか」 */
const NEXT_STEP: Record<string, string> = {
  no_key:
    "APIキーの登録が必要です。ChatGPT Plus や Claude Pro などの月額プランでは動きません（別の契約です）。" +
    "取得方法が分からない場合は、そのままヘルプデスクにご連絡ください。ご案内します。",
  invalid_key: "登録されているAPIキーが使えなくなっています。キーの入れ直しが必要です。",
  no_balance: "AI提供元の残高・利用枠が足りていません。残高を追加するか、別のAIに切り替えると動きます。",
  busy: "AI提供元が一時的に混み合っています。少し待ってからもう一度お試しください。",
  other: "原因が特定できませんでした。ヘルプデスクにご連絡いただければこちらで調べます。",
};

export function AiErrorNotice({ message, context, onRetry }: {
  message: string;
  context?: AiErrorContext;
  onRetry?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<null | { mailed: boolean; note: string | null }>(null);
  const [failed, setFailed] = useState("");

  const kind = context?.kind ?? "other";
  const nextStep = NEXT_STEP[kind] ?? NEXT_STEP.other;

  const send = async () => {
    setSending(true);
    setFailed("");
    try {
      const r = await authFetch("/api/support/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "ai_error",
          message: body.trim() || "（本文なし：エラー画面から送信）",
          context: {
            エラー内容: message,
            機能: context?.feature ?? "",
            AI提供元: context?.provider ?? "",
            種別: kind,
            画面: context?.screen ?? "",
            送信日時: new Date().toLocaleString("ja-JP"),
          },
        }),
      });
      const d = await r.json();
      if (d.error) setFailed(d.error);
      else setDone({ mailed: !!d.mailed, note: d.note ?? null });
    } catch {
      setFailed("送信できませんでした。お手数ですが info@kyouiku-koubou.com まで直接ご連絡ください。");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <Card className="border-positive-200 bg-positive-50">
        <p className="text-sm font-semibold text-ink">お問い合わせを受け付けました。</p>
        <p className="mt-1 text-sm text-ink-muted">
          {done.mailed
            ? "ヘルプデスク（info@kyouiku-koubou.com）に届いています。折り返しご連絡します。"
            : "内容を記録しました。担当が確認のうえご連絡します。"}
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-critical-200 bg-critical-50">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="critical">AIが使えませんでした</Badge>
        {context?.provider && <Badge tone="neutral">{context.provider}</Badge>}
      </div>

      <p className="mt-2 text-sm font-semibold text-ink">{message}</p>
      <p className="mt-1 text-sm text-ink-muted">{nextStep}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>もう一度試す</Button>
        )}
        {!open && (
          <Button size="sm" onClick={() => setOpen(true)}>ヘルプデスクに連絡</Button>
        )}
      </div>

      {open && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-ink-muted">
            お困りの内容をひとことで大丈夫です。エラーの詳細はこちらで自動的に添付されます。
          </p>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="例）カルテを作ろうとしたら出ました。どうすればよいですか？"
            className={cx(inputClass, "w-full")}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={send} disabled={sending}>
              {sending ? "送信中..." : "この内容で送る"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={sending}>
              やめる
            </Button>
            <span className="text-xs text-ink-faint">宛先：info@kyouiku-koubou.com</span>
          </div>
          {failed && <p className="mt-2 text-sm text-critical-700">{failed}</p>}
        </div>
      )}
    </Card>
  );
}
