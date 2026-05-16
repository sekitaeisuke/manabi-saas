"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { notify, links } from "@/lib/notify";

type Tab = "inbox" | "students" | "announcements";

type ParentMessage = {
  id: string;
  parent_name: string | null;
  student_name: string | null;
  email: string | null;
  subject: string | null;
  message: string;
  status: string | null;
  direction: "parent_to_teacher" | "teacher_to_parent";
  thread_id: string | null;
  parent_id: string | null;
  teacher_id: string | null;
  student_id: string | null;
  parent_read: boolean;
  created_at: string;
};

type StudentMessage = {
  id: string;
  student_id: string | null;
  student_name: string;
  teacher_id: string | null;
  subject: string | null;
  message: string;
  status: string;
  direction: "student_to_teacher" | "teacher_to_student";
  thread_id: string | null;
  student_read: boolean;
  created_at: string;
};

type Announcement = {
  id: string;
  title: string;
  content: string;
  author: string | null;
  target_grade: string | null;
  target_school_id: string | null;
  created_at: string;
};

type School = { id: string; name: string };

type ParentOption = {
  id: string;
  name: string;
  email: string;
  students: { id: string; name: string; grade: string }[];
};

export default function MessagesPage() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [messages, setMessages] = useState<ParentMessage[]>([]);
  const [studentMessages, setStudentMessages] = useState<StudentMessage[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeStudentThreadId, setActiveStudentThreadId] = useState<string | null>(null);
  const [studentReply, setStudentReply] = useState("");
  const [studentReplyBusy, setStudentReplyBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", target_grade: "", target_school_id: "" });
  const [saving, setSaving] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [parents, setParents] = useState<ParentOption[]>([]);
  const [parentSearch, setParentSearch] = useState("");
  const [newForm, setNewForm] = useState({ parent_id: "", student_id: "", subject: "", message: "" });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: m }, { data: sm }, { data: a }, { data: sc }] = await Promise.all([
      supabase.from("parent_messages").select("*").order("created_at", { ascending: true }),
      supabase.from("student_messages").select("*").order("created_at", { ascending: true }),
      supabase.from("announcements").select("*").order("created_at", { ascending: false }),
      supabase.from("schools").select("id, name").order("name"),
    ]);
    setMessages((m as ParentMessage[]) ?? []);
    setStudentMessages((sm as StudentMessage[]) ?? []);
    setAnnouncements((a as Announcement[]) ?? []);
    setSchools((sc as School[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const threads = useMemo(() => {
    const map = new Map<string, ParentMessage[]>();
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
        first: msgs[0],
        hasUnread: msgs.some((m) => m.direction === "parent_to_teacher" && m.status === "unread"),
        subject: msgs.find((m) => m.subject)?.subject ?? "(件名なし)",
      }))
      .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  }, [messages]);

  const active = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  );

  const studentThreads = useMemo(() => {
    const map = new Map<string, StudentMessage[]>();
    for (const m of studentMessages) {
      const key = m.thread_id ?? m.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries())
      .map(([id, msgs]) => ({
        id,
        msgs,
        first: msgs[0],
        last: msgs[msgs.length - 1],
        hasUnread: msgs.some((m) => m.direction === "student_to_teacher" && m.status === "unread"),
        subject: msgs.find((m) => m.subject)?.subject ?? "(件名なし)",
      }))
      .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  }, [studentMessages]);

  const activeStudent = useMemo(
    () => studentThreads.find((t) => t.id === activeStudentThreadId) ?? null,
    [studentThreads, activeStudentThreadId]
  );

  const openThread = async (threadId: string) => {
    setActiveThreadId(threadId);
    const toMark = messages
      .filter((m) => (m.thread_id ?? m.id) === threadId && m.direction === "parent_to_teacher" && m.status === "unread")
      .map((m) => m.id);
    if (toMark.length === 0) return;
    await supabase.from("parent_messages").update({ status: "read" }).in("id", toMark);
    setMessages((prev) => prev.map((m) => toMark.includes(m.id) ? { ...m, status: "read" } : m));
  };

  const sendReply = async () => {
    if (!active || !reply.trim()) return;
    setSending(true);
    const first = active.first;
    const { data: { session } } = await supabase.auth.getSession();
    let teacherId: string | null = null;
    if (session?.user?.email) {
      const { data: t } = await supabase.from("teachers").select("id").eq("email", session.user.email).maybeSingle();
      teacherId = t?.id ?? null;
    }
    const { error } = await supabase.from("parent_messages").insert({
      thread_id: active.id,
      parent_id: first.parent_id,
      teacher_id: teacherId ?? first.teacher_id,
      student_id: first.student_id,
      direction: "teacher_to_parent",
      parent_name: first.parent_name,
      student_name: first.student_name,
      subject: first.subject ? `Re: ${first.subject.replace(/^Re:\s*/, "")}` : null,
      message: reply.trim(),
      status: "read",
      parent_read: false,
    });
    setSending(false);
    if (error) { alert(`送信失敗: ${error.message}`); return; }
    if (first.parent_id) {
      notify({
        actor_kind: "parent",
        actor_id: first.parent_id,
        event_type: "new_parent_message",
        subject: "講師から新着メッセージ",
        body_text: `件名: ${first.subject ?? "(件名なし)"}\n\n${reply.trim()}`,
        link: links.parentMessages(),
      });
    }
    setReply("");
    fetchAll();
  };

  const deleteThread = async () => {
    if (!active) return;
    if (!confirm("このスレッドを削除しますか？")) return;
    const ids = active.msgs.map((m) => m.id);
    await supabase.from("parent_messages").delete().in("id", ids);
    setActiveThreadId(null);
    fetchAll();
  };

  const openStudentThread = async (threadId: string) => {
    setActiveStudentThreadId(threadId);
    const toMark = studentMessages
      .filter((m) => (m.thread_id ?? m.id) === threadId && m.direction === "student_to_teacher" && m.status === "unread")
      .map((m) => m.id);
    if (toMark.length === 0) return;
    await supabase.from("student_messages").update({ status: "read" }).in("id", toMark);
    setStudentMessages((prev) => prev.map((m) => toMark.includes(m.id) ? { ...m, status: "read" } : m));
  };

  const sendStudentReply = async () => {
    if (!activeStudent || !studentReply.trim()) return;
    setStudentReplyBusy(true);
    const first = activeStudent.first;
    const { data: { session } } = await supabase.auth.getSession();
    let teacherId: string | null = null;
    if (session?.user?.email) {
      const { data: t } = await supabase.from("teachers").select("id").eq("email", session.user.email).maybeSingle();
      teacherId = t?.id ?? null;
    }
    const { error } = await supabase.from("student_messages").insert({
      thread_id: activeStudent.id,
      student_id: first.student_id,
      student_name: first.student_name,
      teacher_id: teacherId ?? first.teacher_id,
      direction: "teacher_to_student",
      subject: first.subject ? `Re: ${first.subject.replace(/^Re:\s*/, "")}` : null,
      message: studentReply.trim(),
      status: "read",
      student_read: false,
    });
    setStudentReplyBusy(false);
    if (error) { alert(`送信失敗: ${error.message}`); return; }
    if (first.student_id) {
      notify({
        actor_kind: "student",
        actor_id: first.student_id,
        event_type: "new_student_message",
        subject: "先生から新着メッセージ",
        body_text: `件名: ${first.subject ?? "(件名なし)"}\n\n${studentReply.trim()}`,
        link: links.studentDashboard(),
      });
    }
    setStudentReply("");
    fetchAll();
  };

  const deleteStudentThread = async () => {
    if (!activeStudent) return;
    if (!confirm("このスレッドを削除しますか？")) return;
    const ids = activeStudent.msgs.map((m) => m.id);
    await supabase.from("student_messages").delete().in("id", ids);
    setActiveStudentThreadId(null);
    fetchAll();
  };

  const saveAnnouncement = async () => {
    if (!form.title || !form.content) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: inserted } = await supabase.from("announcements").insert({
      title: form.title,
      content: form.content,
      author: user?.email ?? null,
      target_grade: form.target_grade || null,
      target_school_id: form.target_school_id || null,
    }).select("id").single();

    if (inserted?.id) {
      // best-effort broadcast notification
      fetch("/api/notify/announcement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ announcement_id: inserted.id }),
        keepalive: true,
      }).catch(() => {});
    }

    setForm({ title: "", content: "", target_grade: "", target_school_id: "" });
    setShowForm(false);
    setSaving(false);
    fetchAll();
  };

  const deleteAnnouncement = async (id: string) => {
    if (!confirm("このお知らせを削除しますか？")) return;
    await supabase.from("announcements").delete().eq("id", id);
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  };

  const openNew = async () => {
    setShowNew(true);
    setNewForm({ parent_id: "", student_id: "", subject: "", message: "" });
    setParentSearch("");
    if (parents.length === 0) {
      const { data } = await supabase
        .from("parents")
        .select("id, name, email, parent_student_links(student:students(id, name, grade))")
        .order("name");
      const list: ParentOption[] = (data ?? []).map((p: {
        id: string; name: string; email: string;
        parent_student_links: { student: { id: string; name: string; grade: string } | { id: string; name: string; grade: string }[] | null }[] | null;
      }) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        students: (p.parent_student_links ?? [])
          .map((l) => Array.isArray(l.student) ? l.student[0] : l.student)
          .filter((s): s is { id: string; name: string; grade: string } => Boolean(s)),
      }));
      setParents(list);
    }
  };

  const sendNewThread = async () => {
    if (!newForm.parent_id || !newForm.message.trim()) return;
    setSending(true);
    const parent = parents.find((p) => p.id === newForm.parent_id);
    const studentId = newForm.student_id || parent?.students[0]?.id || null;
    const studentName = studentId ? parent?.students.find((s) => s.id === studentId)?.name ?? null : null;
    const { data: { session } } = await supabase.auth.getSession();
    let teacherId: string | null = null;
    if (session?.user?.email) {
      const { data: t } = await supabase.from("teachers").select("id").eq("email", session.user.email).maybeSingle();
      teacherId = t?.id ?? null;
    }
    const threadId = crypto.randomUUID();
    const { error } = await supabase.from("parent_messages").insert({
      thread_id: threadId,
      parent_id: newForm.parent_id,
      teacher_id: teacherId,
      student_id: studentId,
      direction: "teacher_to_parent",
      parent_name: parent?.name ?? null,
      student_name: studentName,
      email: parent?.email ?? null,
      subject: newForm.subject || null,
      message: newForm.message.trim(),
      status: "read",
      parent_read: false,
    });
    setSending(false);
    if (error) { alert(`送信失敗: ${error.message}`); return; }
    notify({
      actor_kind: "parent",
      actor_id: newForm.parent_id,
      event_type: "new_parent_message",
      subject: "講師から新着メッセージ",
      body_text: `件名: ${newForm.subject || "(件名なし)"}\n\n${newForm.message.trim()}`,
      link: links.parentMessages(),
    });
    setShowNew(false);
    setActiveThreadId(threadId);
    fetchAll();
  };

  const unreadThreadCount = threads.filter((t) => t.hasUnread).length;
  const unreadStudentCount = studentThreads.filter((t) => t.hasUnread).length;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="min-h-screen bg-slate-100 px-6 py-10">
      <main className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-950">メッセージ・お知らせ</h1>
          <p className="mt-1 text-slate-600">保護者・生徒からのお問い合わせとお知らせの管理</p>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setTab("inbox")}
            className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
              tab === "inbox" ? "bg-slate-950 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            保護者スレッド
            {unreadThreadCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                {unreadThreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("students")}
            className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
              tab === "students" ? "bg-slate-950 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            生徒からのメッセージ
            {unreadStudentCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                {unreadStudentCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("announcements")}
            className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
              tab === "announcements" ? "bg-slate-950 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            お知らせ配信（{announcements.length}）
          </button>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">
            読み込み中...
          </div>
        ) : tab === "inbox" ? (
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <div className="space-y-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">スレッド</p>
                <div className="flex items-center gap-2">
                  <button onClick={openNew}
                    className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700">
                    ＋ 新規
                  </button>
                  <a href={`${origin}/contact`} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-indigo-600 hover:underline">
                    フォーム →
                  </a>
                </div>
              </div>
              {threads.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
                  スレッドはありません
                </div>
              ) : threads.map((t) => (
                <button key={t.id}
                  onClick={() => openThread(t.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    activeThreadId === t.id
                      ? "border-indigo-300 bg-indigo-50"
                      : t.hasUnread
                      ? "border-slate-200 bg-white shadow-sm"
                      : "border-slate-100 bg-white opacity-90"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {t.hasUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                    <p className={`flex-1 truncate text-sm font-semibold ${t.hasUnread ? "text-slate-900" : "text-slate-600"}`}>
                      {t.first.parent_name ?? "保護者"}
                    </p>
                    <span className="shrink-0 text-xs text-slate-400">{t.last.created_at.slice(0, 10)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">{t.subject}</p>
                  {t.first.student_name && (
                    <p className="mt-0.5 truncate text-xs text-slate-400">生徒：{t.first.student_name}</p>
                  )}
                  <p className="mt-1 truncate text-xs text-slate-500">{t.last.message}</p>
                </button>
              ))}
            </div>

            <div>
              {active ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-bold text-slate-900">{active.subject}</h2>
                      <p className="mt-1 text-sm text-slate-600">
                        {active.first.parent_name ?? "保護者"}
                        {active.first.student_name && (
                          <span className="ml-2 text-slate-400">（生徒：{active.first.student_name}）</span>
                        )}
                      </p>
                      {active.first.email && (
                        <a href={`mailto:${active.first.email}`} className="mt-1 block text-sm text-indigo-600 hover:underline">
                          {active.first.email}
                        </a>
                      )}
                    </div>
                    <button onClick={deleteThread}
                      className="shrink-0 rounded-xl border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                      スレッド削除
                    </button>
                  </div>

                  <div className="space-y-3">
                    {active.msgs.map((m) => {
                      const fromTeacher = m.direction === "teacher_to_parent";
                      return (
                        <div key={m.id} className={`flex ${fromTeacher ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                            fromTeacher ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-900"
                          }`}>
                            <p className={`mb-1 text-xs font-semibold ${fromTeacher ? "text-indigo-100" : "text-slate-500"}`}>
                              {fromTeacher ? "講師" : (m.parent_name ?? "保護者")} ・ {new Date(m.created_at).toLocaleString("ja-JP")}
                            </p>
                            <p className="whitespace-pre-wrap leading-7">{m.message}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 border-t border-slate-200 pt-4">
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={3}
                      placeholder="返信を入力..."
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <div className="mt-3 flex justify-end">
                      <button onClick={sendReply} disabled={sending || !reply.trim()}
                        className="rounded-2xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                        {sending ? "送信中..." : "返信を送信"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white text-slate-400">
                  スレッドを選択してください
                </div>
              )}
            </div>
          </div>

        ) : tab === "students" ? (
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <div className="space-y-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                生徒スレッド
              </p>
              {studentThreads.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
                  メッセージはありません
                </div>
              ) : studentThreads.map((t) => (
                <button key={t.id}
                  onClick={() => openStudentThread(t.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    activeStudentThreadId === t.id
                      ? "border-indigo-300 bg-indigo-50"
                      : t.hasUnread
                      ? "border-slate-200 bg-white shadow-sm"
                      : "border-slate-100 bg-white opacity-90"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {t.hasUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                    <p className={`flex-1 truncate text-sm font-semibold ${t.hasUnread ? "text-slate-900" : "text-slate-600"}`}>
                      {t.first.student_name}
                    </p>
                    <span className="shrink-0 text-xs text-slate-400">{t.last.created_at.slice(0, 10)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">{t.subject}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{t.last.message}</p>
                </button>
              ))}
            </div>

            <div>
              {activeStudent ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-bold text-slate-900">{activeStudent.subject}</h2>
                      <p className="mt-1 text-sm text-slate-600">{activeStudent.first.student_name}</p>
                    </div>
                    <button onClick={deleteStudentThread}
                      className="shrink-0 rounded-xl border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                      スレッド削除
                    </button>
                  </div>

                  <div className="space-y-3">
                    {activeStudent.msgs.map((m) => {
                      const fromTeacher = m.direction === "teacher_to_student";
                      return (
                        <div key={m.id} className={`flex ${fromTeacher ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                            fromTeacher ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-900"
                          }`}>
                            <p className={`mb-1 text-xs font-semibold ${fromTeacher ? "text-indigo-100" : "text-slate-500"}`}>
                              {fromTeacher ? "講師" : m.student_name} ・ {new Date(m.created_at).toLocaleString("ja-JP")}
                            </p>
                            <p className="whitespace-pre-wrap leading-7">{m.message}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 border-t border-slate-200 pt-4">
                    <textarea
                      value={studentReply}
                      onChange={(e) => setStudentReply(e.target.value)}
                      rows={3}
                      placeholder="返信を入力..."
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <div className="mt-3 flex justify-end">
                      <button onClick={sendStudentReply} disabled={studentReplyBusy || !studentReply.trim()}
                        className="rounded-2xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                        {studentReplyBusy ? "送信中..." : "返信を送信"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white text-slate-400">
                  スレッドを選択してください
                </div>
              )}
            </div>
          </div>

        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <a href={`${origin}/announcements`} target="_blank" rel="noopener noreferrer"
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
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-xs text-slate-600">対象学年（任意）
                      <select value={form.target_grade}
                        onChange={(e) => setForm({ ...form, target_grade: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <option value="">全学年</option>
                        {["小1","小2","小3","小4","小5","小6","中1","中2","中3","高1","高2","高3"].map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-slate-600">対象校舎（任意）
                      <select value={form.target_school_id}
                        onChange={(e) => setForm({ ...form, target_school_id: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <option value="">全校舎</option>
                        {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </label>
                  </div>
                  <p className="text-xs text-slate-400">未指定の項目は「すべて」として扱われ、指定された条件を AND で満たす生徒・保護者にのみ表示されます。</p>
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
                {announcements.map((a) => {
                  const schoolName = a.target_school_id ? schools.find((s) => s.id === a.target_school_id)?.name : null;
                  return (
                    <div key={a.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <p className="font-bold text-slate-900">{a.title}</p>
                            {a.target_grade && (
                              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                                {a.target_grade}
                              </span>
                            )}
                            {schoolName && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                {schoolName}
                              </span>
                            )}
                            {!a.target_grade && !a.target_school_id && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                全員
                              </span>
                            )}
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{a.content}</p>
                          <p className="mt-3 text-xs text-slate-400">{new Date(a.created_at).toLocaleString("ja-JP")}</p>
                        </div>
                        <button onClick={() => deleteAnnouncement(a.id)}
                          className="shrink-0 rounded-xl border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                          削除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {showNew && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowNew(false)}>
            <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-4 text-lg font-bold text-slate-950">保護者へ新規メッセージ</h3>
              <div className="space-y-3">
                <label className="block text-xs text-slate-600">保護者を検索
                  <input value={parentSearch} onChange={(e) => setParentSearch(e.target.value)}
                    placeholder="氏名・メール・お子さま名"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                </label>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
                  {parents.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-slate-400">読み込み中...</p>
                  ) : (
                    parents
                      .filter((p) => {
                        if (!parentSearch.trim()) return true;
                        const q = parentSearch.toLowerCase();
                        return p.name.toLowerCase().includes(q)
                          || p.email.toLowerCase().includes(q)
                          || p.students.some((s) => s.name.toLowerCase().includes(q));
                      })
                      .slice(0, 30)
                      .map((p) => (
                        <button key={p.id}
                          onClick={() => setNewForm({ ...newForm, parent_id: p.id, student_id: p.students[0]?.id ?? "" })}
                          className={`w-full rounded-lg px-3 py-2 text-left text-xs transition ${
                            newForm.parent_id === p.id ? "bg-indigo-600 text-white" : "bg-white text-slate-700 hover:bg-slate-100"
                          }`}>
                          <p className="font-semibold">{p.name} <span className="font-normal opacity-70">（{p.email}）</span></p>
                          {p.students.length > 0 && (
                            <p className={`mt-0.5 ${newForm.parent_id === p.id ? "text-indigo-100" : "text-slate-500"}`}>
                              お子さま：{p.students.map((s) => s.name).join("、")}
                            </p>
                          )}
                        </button>
                      ))
                  )}
                </div>

                {newForm.parent_id && (() => {
                  const selectedParent = parents.find((p) => p.id === newForm.parent_id);
                  if (!selectedParent || selectedParent.students.length <= 1) return null;
                  return (
                    <label className="block text-xs text-slate-600">関連するお子さま
                      <select value={newForm.student_id}
                        onChange={(e) => setNewForm({ ...newForm, student_id: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        {selectedParent.students.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}（{s.grade}）</option>
                        ))}
                      </select>
                    </label>
                  );
                })()}

                <label className="block text-xs text-slate-600">件名
                  <input value={newForm.subject} onChange={(e) => setNewForm({ ...newForm, subject: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                </label>
                <label className="block text-xs text-slate-600">本文
                  <textarea value={newForm.message} onChange={(e) => setNewForm({ ...newForm, message: e.target.value })}
                    rows={6}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button onClick={() => setShowNew(false)}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  キャンセル
                </button>
                <button onClick={sendNewThread} disabled={sending || !newForm.parent_id || !newForm.message.trim()}
                  className="rounded-2xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                  {sending ? "送信中..." : "送信"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
