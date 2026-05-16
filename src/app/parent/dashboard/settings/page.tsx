"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { subscribeWebPush, unsubscribeWebPush, checkWebPushSupport, getCurrentSubscriptionEndpoint } from "@/lib/webPush";

type Prefs = {
  id?: string;
  email_enabled: boolean;
  push_enabled: boolean;
  line_enabled: boolean;
  email_override: string | null;
  push_endpoint: string | null;
};

const DEFAULTS: Prefs = {
  email_enabled: true,
  push_enabled: false,
  line_enabled: false,
  email_override: null,
  push_endpoint: null,
};

export default function ParentSettingsPage() {
  const [parentId, setParentId] = useState<string | null>(null);
  const [defaultEmail, setDefaultEmail] = useState<string>("");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pushDeviceActive, setPushDeviceActive] = useState(false);
  const [pushSupport, setPushSupport] = useState<{ ok: boolean; reason?: string }>({ ok: true });
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: p } = await supabase.from("parents").select("id, email").eq("email", session.user.email!).maybeSingle();
    if (!p) { setLoading(false); return; }
    setParentId(p.id);
    setDefaultEmail(p.email);

    const { data: pr } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("actor_kind", "parent")
      .eq("actor_id", p.id)
      .maybeSingle();
    if (pr) setPrefs(pr as Prefs);

    const support = checkWebPushSupport();
    setPushSupport(support.ok ? { ok: true } : { ok: false, reason: support.reason });
    if (support.ok) {
      const endpoint = await getCurrentSubscriptionEndpoint();
      setPushDeviceActive(!!endpoint);
    }

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const enablePush = async () => {
    if (!parentId) return;
    setPushBusy(true);
    setPushError("");
    const r = await subscribeWebPush();
    if (!r.ok) { setPushError(r.error); setPushBusy(false); return; }
    const subscriptionJson = JSON.stringify(r.subscription);
    const payload = {
      actor_kind: "parent",
      actor_id: parentId,
      email_enabled: prefs.email_enabled,
      line_enabled: prefs.line_enabled,
      email_override: prefs.email_override || null,
      push_enabled: true,
      push_endpoint: subscriptionJson,
    };
    if (prefs.id) {
      await supabase.from("notification_preferences").update(payload).eq("id", prefs.id);
    } else {
      const { data } = await supabase.from("notification_preferences").insert(payload).select("id").single();
      if (data) setPrefs((p) => ({ ...p, id: data.id }));
    }
    setPrefs((p) => ({ ...p, push_enabled: true, push_endpoint: subscriptionJson }));
    setPushDeviceActive(true);
    setPushBusy(false);
  };

  const disablePush = async () => {
    if (!parentId) return;
    setPushBusy(true);
    setPushError("");
    await unsubscribeWebPush();
    const payload = {
      push_enabled: false,
      push_endpoint: null,
    };
    if (prefs.id) await supabase.from("notification_preferences").update(payload).eq("id", prefs.id);
    setPrefs((p) => ({ ...p, push_enabled: false, push_endpoint: null }));
    setPushDeviceActive(false);
    setPushBusy(false);
  };

  const save = async () => {
    if (!parentId) return;
    setSaving(true);
    setSaved(false);
    const payload = {
      actor_kind: "parent",
      actor_id: parentId,
      email_enabled: prefs.email_enabled,
      push_enabled: prefs.push_enabled,
      line_enabled: prefs.line_enabled,
      email_override: prefs.email_override || null,
    };
    if (prefs.id) {
      await supabase.from("notification_preferences").update(payload).eq("id", prefs.id);
    } else {
      const { data } = await supabase.from("notification_preferences").insert(payload).select("id").single();
      if (data) setPrefs((p) => ({ ...p, id: data.id }));
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-950">通知設定</h1>
          <p className="mt-1 text-slate-600">講師からのメッセージや振替返答などの通知の受け取り方を変更できます。</p>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中...</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <Toggle
                title="メールで受け取る"
                description={`登録メール：${prefs.email_override || defaultEmail}`}
                checked={prefs.email_enabled}
                onChange={(v) => setPrefs({ ...prefs, email_enabled: v })}
              />
              <div className="mt-3">
                <label className="block text-xs text-slate-600">受信用メールを変更する（任意）
                  <input
                    type="email"
                    value={prefs.email_override ?? ""}
                    onChange={(e) => setPrefs({ ...prefs, email_override: e.target.value })}
                    placeholder={defaultEmail}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                </label>
                <p className="mt-1 text-xs text-slate-400">空欄ならログイン用メールに送信されます。</p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">ブラウザのプッシュ通知</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {pushDeviceActive
                      ? "この端末で有効化されています。"
                      : "ブラウザを閉じていてもこの端末に通知が届きます。"}
                  </p>
                  {!pushSupport.ok && (
                    <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      この環境では Web Push は利用できません：{pushSupport.reason}
                    </p>
                  )}
                  {pushError && (
                    <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{pushError}</p>
                  )}
                </div>
                {pushDeviceActive ? (
                  <button onClick={disablePush} disabled={pushBusy}
                    className="shrink-0 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40">
                    この端末で無効化
                  </button>
                ) : (
                  <button onClick={enablePush} disabled={pushBusy || !pushSupport.ok}
                    className="shrink-0 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                    {pushBusy ? "処理中..." : "この端末で有効化"}
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <Toggle
                title="LINE で受け取る"
                description="LINE 連携は今後の機能。トグルだけ先行で記録します。"
                checked={prefs.line_enabled}
                onChange={(v) => setPrefs({ ...prefs, line_enabled: v })}
                badge="準備中"
              />
            </div>

            <div className="flex items-center gap-3">
              <button onClick={save} disabled={saving}
                className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                {saving ? "保存中..." : "保存"}
              </button>
              {saved && <span className="text-sm font-medium text-green-600">保存しました</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({
  title, description, checked, onChange, badge,
}: { title: string; description: string; checked: boolean; onChange: (v: boolean) => void; badge?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {title}
          {badge && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{badge}</span>}
        </p>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
    </label>
  );
}
