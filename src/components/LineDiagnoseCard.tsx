"use client";

// LINE 連携の配線チェック（管理者だけに見せる）。
// 「保護者に案内を送っていい状態か」を1クリックで判定するためのもの。
// 秘密の値は API 側で返さないので、この画面にも出ない。

import { useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { Badge, Button, Card, Spinner, cx } from "@/components/ui";

type Check = { key: string; label: string; ok: boolean; detail: string; fix?: string };
type Result = { ready: boolean; expectedWebhook: string; botName: string; checks: Check[] };

export default function LineDiagnoseCard() {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/line/diagnose");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? "診断に失敗しました"); setResult(null); return; }
      setResult(json as Result);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            LINE連携の配線チェック
            <Badge tone="neutral">管理者のみ</Badge>
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            保護者へ案内を送る前に、ここが全部○になっているか確かめてください。
            ×のまま送ると、コードを送ってもらっても無反応になります。
          </p>
        </div>
        <Button onClick={run} disabled={busy} size="sm" variant="secondary">
          {busy ? <><Spinner className="h-3 w-3" />確認中…</> : "チェックする"}
        </Button>
      </div>

      {error && (
        <p className="mt-3 rounded-field border border-critical-200 bg-critical-50 px-3 py-2 text-xs text-critical-700">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-4">
          <div
            className={cx(
              "mb-3 rounded-field border px-4 py-3 text-sm font-semibold",
              result.ready
                ? "border-positive-200 bg-positive-50 text-positive-700"
                : "border-caution-200 bg-caution-50 text-caution-700",
            )}
          >
            {result.ready
              ? `準備できています。${result.botName ? `「${result.botName}」に` : ""}保護者を案内できます。`
              : "まだ送れません。下の × を直してください。"}
          </div>

          <ul className="space-y-1.5">
            {result.checks.map((c) => (
              <li
                key={c.key}
                className={cx(
                  "rounded-field border px-3 py-2.5",
                  c.ok ? "border-line bg-surface" : "border-critical-200 bg-critical-50",
                )}
              >
                <div className="flex items-start gap-2">
                  <span aria-hidden className={cx("shrink-0 font-bold", c.ok ? "text-positive-600" : "text-critical-600")}>
                    {c.ok ? "○" : "×"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{c.label}</p>
                    <p className="mt-0.5 break-all text-xs text-ink-muted">{c.detail}</p>
                    {!c.ok && c.fix && (
                      <p className="mt-1 text-xs font-medium text-critical-700">→ {c.fix}</p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-3 break-all text-xs text-ink-faint">
            設定すべき Webhook URL: <span className="font-mono">{result.expectedWebhook}</span>
          </p>
        </div>
      )}
    </Card>
  );
}
