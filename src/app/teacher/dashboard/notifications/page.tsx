"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";

type LogRow = {
  id: string;
  actor_kind: "parent" | "teacher" | "student";
  actor_id: string;
  channel: "email" | "push" | "line";
  event_type: string;
  status: "queued" | "sent" | "skipped" | "failed";
  recipient: string | null;
  subject: string | null;
  body: string | null;
  error: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<LogRow["status"], string> = {
  queued: "送信待ち", sent: "成功", skipped: "スキップ", failed: "失敗",
};
const STATUS_CLS: Record<LogRow["status"], string> = {
  queued:  "bg-slate-100 text-slate-700",
  sent:    "bg-green-100 text-green-700",
  skipped: "bg-amber-100 text-amber-700",
  failed:  "bg-red-100 text-red-700",
};
const CHANNEL_LABEL: Record<LogRow["channel"], string> = {
  email: "Email", push: "Push", line: "LINE",
};

export default function NotificationsLogPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<"" | LogRow["channel"]>("");
  const [status, setStatus] = useState<"" | LogRow["status"]>("");
  const [keyword, setKeyword] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("notification_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (channel) q = q.eq("channel", channel);
    if (status) q = q.eq("status", status);
    if (fromDate) q = q.gte("created_at", new Date(fromDate).toISOString());
    if (toDate) {
      const end = new Date(toDate);
      end.setUTCDate(end.getUTCDate() + 1);
      q = q.lt("created_at", end.toISOString());
    }
    if (keyword.trim()) {
      const k = `%${keyword.trim()}%`;
      q = q.or(`subject.ilike.${k},recipient.ilike.${k},error.ilike.${k},body.ilike.${k},event_type.ilike.${k}`);
    }
    const { data } = await q;
    setLogs((data as LogRow[]) ?? []);
    setLoading(false);
  }, [channel, status, fromDate, toDate, keyword]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const total = logs.length;
    const ok = logs.filter((l) => l.status === "sent").length;
    const failed = logs.filter((l) => l.status === "failed").length;
    return { total, ok, failed };
  }, [logs]);

  return (
    <div className="px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">通知ログ</h1>
            <p className="mt-1 text-slate-600">最新100件の通知送信履歴を表示します。</p>
          </div>
          <button onClick={load}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            再読み込み
          </button>
        </div>

        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <KpiCard label="表示中" value={stats.total} />
          <KpiCard label="成功"   value={stats.ok}     tone="ok" />
          <KpiCard label="失敗"   value={stats.failed} tone={stats.failed > 0 ? "alert" : "default"} />
        </section>

        <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">全チャネル</option>
            <option value="email">Email</option>
            <option value="push">Push</option>
            <option value="line">LINE</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">全ステータス</option>
            <option value="sent">成功</option>
            <option value="skipped">スキップ</option>
            <option value="failed">失敗</option>
            <option value="queued">送信待ち</option>
          </select>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
            placeholder="件名 / 宛先 / エラーで検索"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
        </section>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中...</div>
        ) : logs.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            該当するログはありません
          </div>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">日時</th>
                  <th className="px-4 py-3">チャネル</th>
                  <th className="px-4 py-3">状態</th>
                  <th className="px-4 py-3">受信者種別</th>
                  <th className="px-4 py-3">宛先</th>
                  <th className="px-4 py-3">イベント</th>
                  <th className="px-4 py-3">件名</th>
                  <th className="px-4 py-3">エラー</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      {new Date(l.created_at).toLocaleString("ja-JP")}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-700">{CHANNEL_LABEL[l.channel] ?? l.channel}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_CLS[l.status]}`}>
                        {STATUS_LABEL[l.status] ?? l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{l.actor_kind}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <span className="block max-w-[200px] truncate">{l.recipient ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{l.event_type}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      <span className="block max-w-[260px] truncate">{l.subject ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-red-600">
                      {l.error ? <span className="block max-w-[260px] truncate" title={l.error}>{l.error}</span> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone?: "default" | "ok" | "alert" }) {
  const cls =
    tone === "ok" ? "border-green-200 bg-green-50 text-green-800"
    : tone === "alert" ? "border-red-200 bg-red-50 text-red-700"
    : "border-slate-200 bg-white text-slate-900";
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${cls}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}
