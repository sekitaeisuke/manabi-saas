"use client";

// LINE 連携（合言葉コード方式）のカード。保護者／講師の通知設定で共通に使う。
// 連携そのものはここが担当し、line_enabled のトグルだけ親ページの state に返す
// （親ページの「保存」ボタンが line_enabled を書くため、値の持ち主を一つにしている）。

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";

type Props = {
  actorKind: "parent" | "teacher";
  actorId: string;
  lineUserId: string | null;
  lineEnabled: boolean;
  onChange: (v: { line_user_id: string | null; line_enabled: boolean }) => void;
};

type IssuedCode = { code: string; expiresAt: string; addFriendUrl: string; ttlMinutes: number };

export default function LineLinkCard({ actorKind, actorId, lineUserId, lineEnabled, onChange }: Props) {
  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 親から渡る onChange は毎レンダー別関数なので、ref 経由で最新版を持つ
  // （ポーリングの interval が毎レンダー張り直されるのを防ぐ）
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const issue = useCallback(async () => {
    setBusy(true);
    setError("");
    const res = await authFetch("/api/line/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "issue" }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError(json.error ?? "コードを発行できませんでした");
    else setIssued(json as IssuedCode);
    setBusy(false);
  }, []);

  const unlink = useCallback(async () => {
    setBusy(true);
    setError("");
    const res = await authFetch("/api/line/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unlink" }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError(json.error ?? "解除できませんでした");
    else {
      setIssued(null);
      onChangeRef.current({ line_user_id: null, line_enabled: false });
    }
    setBusy(false);
  }, []);

  // コード表示中は、LINE 側で連携が済んだかを数秒おきに見に行く
  useEffect(() => {
    if (!issued || lineUserId) return;
    const deadline = new Date(issued.expiresAt).getTime();
    const timer = setInterval(async () => {
      if (Date.now() > deadline) { setIssued(null); return; }
      const { data } = await supabase
        .from("notification_preferences")
        .select("line_user_id, line_enabled")
        .eq("actor_kind", actorKind)
        .eq("actor_id", actorId)
        .maybeSingle();
      if (data?.line_user_id) {
        setIssued(null);
        onChangeRef.current({ line_user_id: data.line_user_id, line_enabled: data.line_enabled ?? true });
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [issued, lineUserId, actorKind, actorId]);

  const expiresLabel = issued
    ? new Date(issued.expiresAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            LINE で受け取る
            {lineUserId ? (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">連携済み</span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">未連携</span>
            )}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {lineUserId
              ? "塾の LINE 公式アカウントに通知が届きます。"
              : "塾の LINE 公式アカウントを友だち追加し、6桁のコードを送ると連携できます。"}
          </p>
        </div>

        {lineUserId ? (
          <input
            type="checkbox"
            checked={lineEnabled}
            onChange={(e) => onChange({ line_user_id: lineUserId, line_enabled: e.target.checked })}
            className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
        ) : (
          <button onClick={issue} disabled={busy}
            className="shrink-0 rounded-2xl bg-[#06C755] px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-40">
            {busy ? "処理中..." : "連携する"}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {issued && !lineUserId && (
        <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="text-xs font-semibold text-green-800">① 塾の LINE 公式アカウントを友だち追加</p>
          {issued.addFriendUrl ? (
            <a href={issued.addFriendUrl} target="_blank" rel="noreferrer"
              className="mt-1 inline-block rounded-xl bg-[#06C755] px-3 py-1.5 text-xs font-semibold text-white">
              友だち追加ページを開く
            </a>
          ) : (
            <p className="mt-1 text-xs text-slate-500">教室で配布している QR コードから追加してください。</p>
          )}

          <p className="mt-4 text-xs font-semibold text-green-800">② このコードをトークに送る</p>
          <p className="mt-1 select-all font-mono text-3xl font-bold tracking-[0.3em] text-slate-900">{issued.code}</p>
          <p className="mt-2 text-xs text-slate-500">
            有効期限 {expiresLabel}（約{issued.ttlMinutes}分）。送信されると自動でこの画面が「連携済み」に変わります。
          </p>
        </div>
      )}

      {lineUserId && (
        <div className="mt-4 flex items-center gap-3">
          <button onClick={unlink} disabled={busy}
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40">
            連携を解除
          </button>
          <span className="text-xs text-slate-400">LINE で「解除」と送っても解除できます。</span>
        </div>
      )}
    </div>
  );
}
