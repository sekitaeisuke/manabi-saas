"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type Tab = "inbox" | "announcements";

type ParentMessage = {
  id: string;
  parent_name: string;
  student_name: string | null;
  email: string | null;
  subject: string | null;
  message: string;
  status: string;
  created_at: string;
};

type Announcement = {
  id: string;
  title: string;
  content: string;
  author: string | null;
  created_at: string;
};

export default function MessagesPage() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [messages, setMessages] = useState<ParentMessage[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ParentMessage | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", content: "" });
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: m }, { data: a }] = await Promise.all([
      supabase.from("parent_messages").select("*").order("created_at", { ascending: false }),
      supabase.from("announcements").select("*").order("created_at", { ascending: false }),
    ]);
    setMessages(m ?? []);
    setAnnouncements(a ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const markRead = async (id: string) => {
    await supabase.from("parent_messages").update({ status: "read" }).eq("id", id);
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, status: "read" } : m));
    if (selected?.id === id) setSelected((prev) => prev ? { ...prev, status: "read" } : null);
  };

  const deleteMessage = async (id: string) => {
    if (!confirm("このメッセージを削除しますか？")) return;
    await supabase.from("parent_messages").delete().eq("id", id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const saveAnnouncement = async () => {
    if (!form.title || !form.content) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("announcements").insert({
      title: form.title,
      content: form.content,
      author: user?.email ?? null,
    });
    setForm({ title: "", content: "" });
    setShowForm(false);
    setSaving(false);
    fetchAll();
  };

  const deleteAnnouncement = async (id: string) => {
    if (!confirm("このお知らせを削除しますか？")) return;
    await supabase.from("announcements").delete().eq("id", id);
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  };

  const unreadCount = messages.filter((m) => m.status === "unread").length;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10">
      <main className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-950">メッセージ・お知らせ</h1>
          <p className="mt-1 text-slate-600">保護者からのお問い合わせとお知らせの管理</p>
        </div>

        <div className="mb-6 flex gap-2">
          <button onClick={() => setTab("inbox")}
            className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${tab === "inbox" ? "bg-slate-950 text-white" : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
            受信メッセージ
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">{unreadCount}</span>
            )}
          </button>
          <button onClick={() => setTab("announcements")}
            className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${tab === "announcements" ? "bg-slate-950 text-white" : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
            お知らせ配信（{announcements.length}）
          </button>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">読み込み中...</div>
        ) : tab === "inbox" ? (
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-2 space-y-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">受信トレイ</p>
                <a href={`${origin}/contact`} target="_blank"
                  className="text-xs text-indigo-600 hover:underline">保護者向けフォーム →</a>
              </div>
              {messages.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
                  メッセージはありません
                </div>
              ) : messages.map((m) => (
                <button key={m.id}
                  onClick={() => { setSelected(m); if (m.status === "unread") markRead(m.id); }}
                  className={`w-full text-left rounded-2xl border p-4 transition ${selected?.id === m.id ? "border-indigo-300 bg-indigo-50" : m.status === "unread" ? "border-slate-200 bg-white shadow-sm" : "border-slate-100 bg-white opacity-80"}`}>
                  <div className="flex items-center gap-2">
                    {m.status === "unread" && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                    <p className={`flex-1 truncate text-sm font-semibold ${m.status === "unread" ? "text-slate-900" : "text-slate-600"}`}>
                      {m.parent_name}
                    </p>
                    <span className="shrink-0 text-xs text-slate-400">{m.created_at.slice(0, 10)}</span>
                  </div>
                  {m.subject && <p className="mt-1 truncate text-xs text-slate-500">{m.subject}</p>}
                  <p className="mt-1 truncate text-xs text-slate-400">{m.message}</p>
                </button>
              ))}
            </div>

            <div className="lg:col-span-3">
              {selected ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{selected.subject ?? "（件名なし）"}</h2>
                      <p className="mt-1 text-sm text-slate-600">
                        {selected.parent_name}
                        {selected.student_name && <span className="ml-2 text-slate-400">（生徒：{selected.student_name}）</span>}
                      </p>
                      {selected.email && (
                        <a href={`mailto:${selected.email}`} className="mt-1 block text-sm text-indigo-600 hover:underline">
                          {selected.email}
                        </a>
                      )}
                      <p className="mt-1 text-xs text-slate-400">{new Date(selected.created_at).toLocaleString("ja-JP")}</p>
                    </div>
                    <button onClick={() => deleteMessage(selected.id)}
                      className="shrink-0 rounded-xl border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                      削除
                    </button>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{selected.message}</p>
                  </div>
                  {selected.email && (
                    <a href={`mailto:${selected.email}?subject=Re: ${encodeURIComponent(selected.subject ?? "")}`}
                      className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      メールで返信
                    </a>
                  )}
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white text-slate-400">
                  メッセージを選択してください
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <a href={`${origin}/announcements`} target="_blank"
                className="rounded-2xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                保護者向けページを開く →
              </a>
              <button onClick={() => setShowForm(!showForm)}
                className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
                {showForm ? "キャンセル" : "+ お知らせを作成"}
              </button>
            </div>

            {showForm && (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 font-semibold text-slate-900">新規お知らせ</h3>
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">タイトル *</span>
                    <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="例：夏期講習のお知らせ"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">内容 *</span>
                    <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
                      placeholder="お知らせの内容を入力してください..."
                      rows={6}
                      className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400" />
                  </label>
                </div>
                <button onClick={saveAnnouncement} disabled={!form.title || !form.content || saving}
                  className="mt-4 rounded-2xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                  {saving ? "投稿中..." : "投稿する"}
                </button>
              </div>
            )}

            {announcements.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-400">
                お知らせはありません
              </div>
            ) : (
              <div className="space-y-3">
                {announcements.map((a) => (
                  <div key={a.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900">{a.title}</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{a.content}</p>
                        <p className="mt-3 text-xs text-slate-400">{new Date(a.created_at).toLocaleString("ja-JP")}</p>
                      </div>
                      <button onClick={() => deleteAnnouncement(a.id)}
                        className="shrink-0 rounded-xl border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
