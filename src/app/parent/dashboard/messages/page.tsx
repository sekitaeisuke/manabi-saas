"use client";
import { showToast } from "@/lib/toast";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { Teacher } from "@/lib/supabase";
import { useSelectedStudentId } from "@/lib/useSelectedStudent";
import { notify, links } from "@/lib/notify";
import { Skeleton } from "@/components/Skeleton";

type Message = {
  id: string;
  thread_id: string | null;
  parent_id: string | null;
  teacher_id: string | null;
  student_id: string | null;
  direction: "parent_to_teacher" | "teacher_to_parent";
  subject: string | null;
  message: string;
  parent_read: boolean;
  status: string | null;
  created_at: string;
};

type ParentRow = { id: string; name: string };

export default function ParentMessagesPage() {
  const [selectedStudentId] = useSelectedStudentId();
  const [parent, setParent] = useState<ParentRow | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [newForm, setNewForm] = useState({ teacher_id: "", subject: "", message: "" });
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const { data: p } = await supabase
      .from("parents")
      .select("id, name")
      .eq("email", session.user.email!)
      .maybeSingle();
    if (!p) { setLoading(false); return; }
    setParent(p);

    // メッセージと教師リストを並列取得
    let msgQuery = supabase
      .from("parent_messages")
      .select("*")
      .eq("parent_id", p.id)
      .order("created_at", { ascending: true });
    if (selectedStudentId) msgQuery = msgQuery.eq("student_id", selectedStudentId);

    // 生徒のschool_idが必要な場合のみ先に取得、それ以外は並列
    let schoolId: string | null = null;
    if (selectedStudentId) {
      const { data: stu } = await supabase
        .from("students").select("school_id").eq("id", selectedStudentId).maybeSingle();
      schoolId = stu?.school_id ?? null;
    }

    let teacherQuery = supabase.from("teachers").select("*");
    if (schoolId) teacherQuery = teacherQuery.eq("school_id", schoolId);

    const [{ data: msgs }, { data: ts }] = await Promise.all([msgQuery, teacherQuery.order("name")]);
    setMessages((msgs as Message[]) ?? []);
    setTeachers((ts as Teacher[]) ?? []);

    setLoading(false);
  }, [selectedStudentId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const threads = useMemo(() => {
    const map = new Map<string, Message[]>();
    for (const m of messages) {
      const key = m.thread_id ?? m.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries())
      .map(([id, msgs]) => ({
        id,
        msgs,
        last: msgs[msgs.length - 1],
        hasUnread: msgs.some((m) => m.direction === "teacher_to_parent" && !m.parent_read),
        subject: msgs[0].subject ?? "(件名なし)",
      }))
      .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  }, [messages]);

  const active = useMemo(
    () => threads.find((t) => t.id === activeThread) ?? null,
    [threads, activeThread]
  );

  useEffect(() => {
    if (activeThread) setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, [activeThread, messages]);

  const openThread = async (threadId: string) => {
    setActiveThread(threadId);
    if (!parent) return;
    const unreadIds = messages
      .filter((m) => (m.thread_id ?? m.id) === threadId && m.direction === "teacher_to_parent" && !m.parent_read)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;
    await supabase.from("parent_messages").update({ parent_read: true }).in("id", unreadIds);
    setMessages((prev) => prev.map((m) => unreadIds.includes(m.id) ? { ...m, parent_read: true } : m));
  };

  const sendReply = async () => {
    if (!parent || !active || !reply.trim()) return;
    setSending(true);
    const first = active.msgs[0];
    const teacherId = active.msgs.find((m) => m.teacher_id)?.teacher_id ?? first.teacher_id;
    const { error } = await supabase.from("parent_messages").insert({
      thread_id: active.id,
      parent_id: parent.id,
      teacher_id: teacherId,
      student_id: first.student_id,
      direction: "parent_to_teacher",
      parent_name: parent.name,
      subject: first.subject ? `Re: ${first.subject.replace(/^Re:\s*/, "")}` : null,
      message: reply.trim(),
      status: "unread",
      parent_read: true,
    });
    setSending(false);
    if (!error) {
      if (teacherId) {
        notify({
          actor_kind: "teacher",
          actor_id: teacherId,
          event_type: "new_parent_message",
          subject: "保護者から返信",
          body_text: `${parent.name} さんから返信が届きました。\n\n${reply.trim()}`,
          link: links.teacherMessages(),
        });
      }
      setReply("");
      loadAll();
    } else {
      showToast(`送信に失敗しました: ${error.message}`, "error");
    }
  };

  const sendNew = async () => {
    if (!parent || !newForm.message.trim()) return;
    setSending(true);
    const threadId = crypto.randomUUID();
    const { error } = await supabase.from("parent_messages").insert({
      thread_id: threadId,
      parent_id: parent.id,
      teacher_id: newForm.teacher_id || null,
      student_id: selectedStudentId,
      direction: "parent_to_teacher",
      parent_name: parent.name,
      subject: newForm.subject || null,
      message: newForm.message.trim(),
      status: "unread",
      parent_read: true,
    });
    setSending(false);
    if (!error) {
      if (newForm.teacher_id) {
        notify({
          actor_kind: "teacher",
          actor_id: newForm.teacher_id,
          event_type: "new_parent_message",
          subject: "保護者から新着メッセージ",
          body_text: `${parent.name} さんから新着メッセージです。\n件名: ${newForm.subject || "(件名なし)"}\n\n${newForm.message.trim()}`,
          link: links.teacherMessages(),
        });
      }
      setShowNew(false);
      setNewForm({ teacher_id: "", subject: "", message: "" });
      setActiveThread(threadId);
      loadAll();
    } else {
      showToast(`送信に失敗しました: ${error.message}`, "error");
    }
  };

  const teacherName = (id: string | null) =>
    id ? teachers.find((t) => t.id === id)?.name ?? "講師" : "塾";

  return (
    <div className="px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">講師とのメッセージ</h1>
            <p className="mt-1 text-slate-600">教室の講師と連絡を取り合えます。</p>
          </div>
          <button onClick={() => setShowNew(true)}
            className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">
            新規メッセージ
          </button>
        </div>

        {loading ? (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <Skeleton className="mb-2 h-4 w-36" />
                  <Skeleton className="mb-1 h-3 w-24" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
                  <Skeleton className={`h-16 rounded-2xl ${i % 2 === 0 ? "w-2/3" : "w-1/2"}`} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <div className="space-y-2">
              {threads.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                  まだメッセージがありません
                </div>
              )}
              {threads.map((t) => (
                <button key={t.id} onClick={() => openThread(t.id)}
                  className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-blue-200 ${
                    activeThread === t.id ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"
                  }`}>
                  <div className="mb-1 flex items-center gap-2">
                    {t.hasUnread && <span className="h-2 w-2 rounded-full bg-red-500" />}
                    <p className="truncate font-semibold text-slate-900">{t.subject}</p>
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {teacherName(t.last.teacher_id)} ・ {new Date(t.last.created_at).toLocaleDateString("ja-JP")}
                  </p>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-600">{t.last.message}</p>
                </button>
              ))}
            </div>

            <div>
              {!active ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
                  左からスレッドを選択するか、「新規メッセージ」を作成してください。
                </div>
              ) : (
                <div className="flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  {/* スレッドヘッダー */}
                  <div className="border-b border-slate-100 px-6 py-4">
                    <h2 className="font-bold text-slate-950">{active.subject}</h2>
                    <p className="mt-0.5 text-xs text-slate-400">{active.msgs.length}件のメッセージ</p>
                  </div>

                  {/* メッセージ一覧 */}
                  <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 max-h-[60vh]">
                    {active.msgs.map((m, idx) => {
                      const fromParent = m.direction === "parent_to_teacher";
                      const showDate = idx === 0 ||
                        new Date(m.created_at).toDateString() !==
                        new Date(active.msgs[idx - 1].created_at).toDateString();
                      return (
                        <div key={m.id}>
                          {showDate && (
                            <div className="flex items-center gap-3 my-2">
                              <div className="flex-1 h-px bg-slate-100" />
                              <span className="text-xs text-slate-400 shrink-0">
                                {new Date(m.created_at).toLocaleDateString("ja-JP", { month: "long", day: "numeric" })}
                              </span>
                              <div className="flex-1 h-px bg-slate-100" />
                            </div>
                          )}
                          <div className={`flex ${fromParent ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[78%] space-y-1`}>
                              <p className={`text-[11px] font-semibold px-1 ${fromParent ? "text-right text-slate-400" : "text-slate-400"}`}>
                                {fromParent ? "あなた" : teacherName(m.teacher_id)}
                              </p>
                              <div className={`rounded-2xl px-4 py-3 text-sm leading-7 ${
                                fromParent
                                  ? "bg-blue-600 text-white rounded-tr-sm"
                                  : "bg-slate-100 text-slate-900 rounded-tl-sm"
                              }`}>
                                <p className="whitespace-pre-wrap">{m.message}</p>
                              </div>
                              <p className={`text-[10px] text-slate-400 px-1 ${fromParent ? "text-right" : ""}`}>
                                {new Date(m.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                                {!fromParent && m.parent_read && <span className="ml-1 text-blue-400">既読</span>}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </div>

                  {/* 返信エリア */}
                  <div className="border-t border-slate-100 px-6 py-4 bg-slate-50">
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply(); }
                      }}
                      rows={3}
                      placeholder="返信を入力… (Ctrl+Enter で送信)"
                      className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-slate-400">Ctrl+Enter で送信</span>
                      <button onClick={sendReply} disabled={sending || !reply.trim()}
                        className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition">
                        {sending
                          ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />送信中</>
                          : "返信を送信"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {showNew && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
              <h3 className="mb-4 text-lg font-bold text-slate-950">新規メッセージ</h3>
              <div className="space-y-4">
                <label className="block text-sm text-slate-700">
                  宛先講師（任意）
                  <select
                    value={newForm.teacher_id}
                    onChange={(e) => setNewForm({ ...newForm, teacher_id: e.target.value })}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <option value="">指定なし（教室宛）</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-slate-700">
                  件名
                  <input
                    value={newForm.subject}
                    onChange={(e) => setNewForm({ ...newForm, subject: e.target.value })}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  本文
                  <textarea
                    value={newForm.message}
                    onChange={(e) => setNewForm({ ...newForm, message: e.target.value })}
                    rows={6}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                  />
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setShowNew(false)}
                  className="rounded-2xl border border-slate-300 bg-white px-5 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  キャンセル
                </button>
                <button onClick={sendNew} disabled={sending || !newForm.message.trim()}
                  className="rounded-2xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                  {sending ? "送信中..." : "送信"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
