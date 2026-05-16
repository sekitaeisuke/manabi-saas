"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import type { Student } from "@/lib/supabase";
import { subscribeWebPush, unsubscribeWebPush, checkWebPushSupport, getCurrentSubscriptionEndpoint } from "@/lib/webPush";

type Tab = "tests" | "messages" | "settings";

type AssignedTest = {
  assignment_id: string;
  test_session_id: string;
  url_token: string;
  test_title: string;
  test_subject: string;
  test_grade: string;
  completed: boolean;
  percentage: number | null;
};

type StudentMessage = {
  id: string;
  subject: string | null;
  message: string;
  status: string;
  direction: "student_to_teacher" | "teacher_to_student";
  thread_id: string | null;
  student_read: boolean;
  created_at: string;
};

export default function StudentDashboardPage() {
  const [student, setStudent] = useState<Student | null>(null);
  const [tests, setTests] = useState<AssignedTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("tests");
  const [messages, setMessages] = useState<StudentMessage[]>([]);
  const [msgForm, setMsgForm] = useState({ subject: "", message: "" });
  const [sending, setSending] = useState(false);
  const [msgSent, setMsgSent] = useState(false);
  const [studentRef, setStudentRef] = useState<Student | null>(null);
  const [activeMessageThread, setActiveMessageThread] = useState<string | null>(null);
  const [threadReply, setThreadReply] = useState("");
  const router = useRouter();

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/student/login");
  };

  const fetchMessages = async (s: Student) => {
    const { data } = await supabase
      .from("student_messages")
      .select("id, subject, message, status, direction, thread_id, student_read, created_at")
      .eq("student_id", s.id)
      .order("created_at", { ascending: true });
    setMessages((data as StudentMessage[]) ?? []);
  };

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: studentData } = await supabase
        .from("students")
        .select("*")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!studentData) return;
      setStudent(studentData as Student);
      setStudentRef(studentData as Student);

      // テスト取得
      const { data: assignments } = await supabase
        .from("test_assignments")
        .select("id, test_session_id")
        .eq("student_id", studentData.id);

      if (assignments && assignments.length > 0) {
        const sessionIds = assignments.map((a: { id: string; test_session_id: string }) => a.test_session_id);
        const { data: sessions } = await supabase
          .from("test_sessions")
          .select("id, url_token, tests(title, subject, grade)")
          .in("id", sessionIds);
        const { data: responses } = await supabase
          .from("questionnaire_responses")
          .select("session_id, test_percentage")
          .like("session_id", `%${studentData.name}%`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const assembled: AssignedTest[] = (sessions ?? []).map((s: any) => {
          const testInfo = Array.isArray(s.tests) ? s.tests[0] : s.tests;
          const assignment = assignments.find((a: { id: string; test_session_id: string }) => a.test_session_id === s.id);
          const response = (responses ?? []).find((r: { session_id: string; test_percentage: number | null }) =>
            r.session_id.startsWith(s.id + ":") && r.session_id.endsWith(":" + studentData.name)
          );
          return {
            assignment_id: assignment?.id ?? "",
            test_session_id: s.id,
            url_token: s.url_token,
            test_title: testInfo?.title ?? "テスト",
            test_subject: testInfo?.subject ?? "",
            test_grade: testInfo?.grade ?? "",
            completed: !!response,
            percentage: response?.test_percentage ?? null,
          };
        });
        setTests(assembled);
      }

      await fetchMessages(studentData as Student);
      setLoading(false);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = async () => {
    const s = studentRef;
    if (!msgForm.message || !s) return;
    setSending(true);
    await supabase.from("student_messages").insert({
      student_id: s.id,
      student_name: s.name,
      subject: msgForm.subject || null,
      message: msgForm.message,
      status: "unread",
      direction: "student_to_teacher",
      thread_id: crypto.randomUUID(),
      student_read: true,
    });
    setMsgForm({ subject: "", message: "" });
    setMsgSent(true);
    setTimeout(() => setMsgSent(false), 3000);
    await fetchMessages(s);
    setSending(false);
  };

  const sendThreadReply = async (threadId: string, body: string) => {
    const s = studentRef;
    if (!s || !body.trim()) return;
    const firstSubject = messages.find((m) => (m.thread_id ?? m.id) === threadId)?.subject ?? null;
    await supabase.from("student_messages").insert({
      student_id: s.id,
      student_name: s.name,
      subject: firstSubject ? `Re: ${firstSubject.replace(/^Re:\s*/, "")}` : null,
      message: body.trim(),
      status: "unread",
      direction: "student_to_teacher",
      thread_id: threadId,
      student_read: true,
    });
    await fetchMessages(s);
  };

  const openMessageThread = async (threadId: string) => {
    const s = studentRef;
    if (!s) return;
    const unreadIds = messages
      .filter((m) => (m.thread_id ?? m.id) === threadId && m.direction === "teacher_to_student" && !m.student_read)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;
    await supabase.from("student_messages").update({ student_read: true }).in("id", unreadIds);
    await fetchMessages(s);
  };

  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
  const pendingTests = tests.filter((t) => !t.completed);
  const completedTests = tests.filter((t) => t.completed);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50">
      <header className="sticky top-0 z-10 border-b border-white/60 bg-white/80 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Logo size="sm" />
          <button
            onClick={logout}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            ログアウト
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        {/* あいさつ */}
        <div className="mb-8">
          <p className="text-sm text-slate-400">{today}</p>
          {student && (
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              {student.name}さん、こんにちは！
            </h1>
          )}
          <p className="mt-1 text-sm text-slate-500">
            {student?.grade} ・ 今日も頑張りましょう。
          </p>
        </div>

        {/* タブ */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setTab("tests")}
            className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
              tab === "tests"
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            テスト
            {pendingTests.length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                {pendingTests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setTab("messages"); setActiveMessageThread(null); }}
            className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
              tab === "messages"
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            先生へのメッセージ
            {(() => {
              const c = messages.filter((m) => m.direction === "teacher_to_student" && !m.student_read).length;
              return c > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                  {c}
                </span>
              ) : null;
            })()}
          </button>
          <button
            onClick={() => setTab("settings")}
            className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition ${
              tab === "settings"
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            通知設定
          </button>
        </div>

        {tab === "settings" && studentRef && <StudentSettings student={studentRef} />}

        {/* テストタブ */}
        {tab === "tests" && (
          <section>
            {loading ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">
                読み込み中...
              </div>
            ) : tests.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <p className="text-slate-500">まだテストが割り当てられていません</p>
                <p className="mt-1 text-sm text-slate-400">
                  先生からテストが届いたら、ここに表示されます
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {pendingTests.length > 0 && (
                  <div>
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      受験するテスト
                    </h2>
                    <div className="space-y-3">
                      {pendingTests.map((t) => (
                        <div
                          key={t.assignment_id}
                          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-900">{t.test_title}</p>
                              <p className="mt-0.5 text-sm text-slate-500">
                                {t.test_subject} ・ {t.test_grade}
                              </p>
                            </div>
                            <a
                              href={`/test/${t.url_token}?studentName=${encodeURIComponent(student?.name ?? "")}`}
                              className="shrink-0 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                            >
                              受験する →
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {completedTests.length > 0 && (
                  <div>
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      提出済みテスト
                    </h2>
                    <div className="space-y-3">
                      {completedTests.map((t) => (
                        <div
                          key={t.assignment_id}
                          className="rounded-3xl border border-green-200 bg-white p-6 opacity-80 shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-700">{t.test_title}</p>
                              <p className="mt-0.5 text-sm text-slate-400">
                                {t.test_subject} ・ {t.test_grade}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
                                提出済み ✓
                              </span>
                              {t.percentage != null && (
                                <p className="mt-1 text-xs text-slate-400">
                                  {Math.round(t.percentage)}点
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* メッセージタブ */}
        {tab === "messages" && (
          <section>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-semibold text-slate-900">先生へメッセージを送る</h2>
              <div className="space-y-3">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">件名（任意）</span>
                  <input
                    value={msgForm.subject}
                    onChange={(e) => setMsgForm({ ...msgForm, subject: e.target.value })}
                    placeholder="例：宿題について"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">メッセージ *</span>
                  <textarea
                    value={msgForm.message}
                    onChange={(e) => setMsgForm({ ...msgForm, message: e.target.value })}
                    placeholder="先生への質問や連絡を入力してください..."
                    rows={5}
                    className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </label>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={sendMessage}
                  disabled={!msgForm.message || sending}
                  className="rounded-2xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
                >
                  {sending ? "送信中..." : "送信する"}
                </button>
                {msgSent && (
                  <span className="text-sm font-medium text-green-600">送信しました！</span>
                )}
              </div>
            </div>

            {messages.length > 0 && (() => {
              const threadMap = new Map<string, StudentMessage[]>();
              for (const m of messages) {
                const key = m.thread_id ?? m.id;
                if (!threadMap.has(key)) threadMap.set(key, []);
                threadMap.get(key)!.push(m);
              }
              const threadList = Array.from(threadMap.entries())
                .map(([id, msgs]) => ({
                  id,
                  msgs,
                  last: msgs[msgs.length - 1],
                  subject: msgs.find((m) => m.subject)?.subject ?? "(件名なし)",
                  hasUnread: msgs.some((m) => m.direction === "teacher_to_student" && !m.student_read),
                }))
                .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
              const active = threadList.find((t) => t.id === activeMessageThread) ?? null;
              return (
                <div className="mt-6">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    やりとり
                  </h3>
                  {active ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="font-semibold text-slate-900">{active.subject}</p>
                        <button onClick={() => { setActiveMessageThread(null); setThreadReply(""); }}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
                          一覧に戻る
                        </button>
                      </div>
                      <div className="space-y-2">
                        {active.msgs.map((m) => {
                          const fromTeacher = m.direction === "teacher_to_student";
                          return (
                            <div key={m.id} className={`flex ${fromTeacher ? "justify-start" : "justify-end"}`}>
                              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                                fromTeacher ? "bg-slate-100 text-slate-900" : "bg-indigo-600 text-white"
                              }`}>
                                <p className={`mb-1 text-[10px] font-semibold ${fromTeacher ? "text-slate-500" : "text-indigo-100"}`}>
                                  {fromTeacher ? "先生" : "自分"} ・ {new Date(m.created_at).toLocaleString("ja-JP")}
                                </p>
                                <p className="whitespace-pre-wrap leading-6">{m.message}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-4 border-t border-slate-100 pt-3">
                        <textarea
                          value={threadReply}
                          onChange={(e) => setThreadReply(e.target.value)}
                          rows={3}
                          placeholder="返信を入力..."
                          className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        <div className="mt-2 flex justify-end">
                          <button
                            onClick={async () => {
                              if (!threadReply.trim()) return;
                              await sendThreadReply(active.id, threadReply);
                              setThreadReply("");
                            }}
                            disabled={!threadReply.trim()}
                            className="rounded-xl bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                            返信
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {threadList.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => { setActiveMessageThread(t.id); openMessageThread(t.id); }}
                          className="block w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200"
                        >
                          <div className="flex items-center gap-2">
                            {t.hasUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                            <p className={`flex-1 truncate text-sm font-semibold ${t.hasUnread ? "text-slate-900" : "text-slate-700"}`}>
                              {t.subject}
                            </p>
                            <span className="shrink-0 text-xs text-slate-400">
                              {new Date(t.last.created_at).toLocaleDateString("ja-JP")}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-500">{t.last.message}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </section>
        )}
      </main>
    </div>
  );
}

type StudentPrefs = {
  id?: string;
  push_enabled: boolean;
  push_endpoint: string | null;
};

function StudentSettings({ student }: { student: Student }) {
  const [prefs, setPrefs] = useState<StudentPrefs>({ push_enabled: false, push_endpoint: null });
  const [loading, setLoading] = useState(true);
  const [pushDeviceActive, setPushDeviceActive] = useState(false);
  const [pushSupport, setPushSupport] = useState<{ ok: boolean; reason?: string }>({ ok: true });
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("actor_kind", "student")
        .eq("actor_id", student.id)
        .maybeSingle();
      if (data) setPrefs(data as StudentPrefs);
      const support = checkWebPushSupport();
      setPushSupport(support.ok ? { ok: true } : { ok: false, reason: support.reason });
      if (support.ok) {
        const endpoint = await getCurrentSubscriptionEndpoint();
        setPushDeviceActive(!!endpoint);
      }
      setLoading(false);
    };
    load();
  }, [student.id]);

  const enablePush = async () => {
    setPushBusy(true);
    setPushError("");
    const r = await subscribeWebPush();
    if (!r.ok) { setPushError(r.error); setPushBusy(false); return; }
    const subscriptionJson = JSON.stringify(r.subscription);
    const payload = {
      actor_kind: "student",
      actor_id: student.id,
      email_enabled: false,
      line_enabled: false,
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
    setPushBusy(true);
    setPushError("");
    await unsubscribeWebPush();
    if (prefs.id) {
      await supabase.from("notification_preferences")
        .update({ push_enabled: false, push_endpoint: null })
        .eq("id", prefs.id);
    }
    setPrefs((p) => ({ ...p, push_enabled: false, push_endpoint: null }));
    setPushDeviceActive(false);
    setPushBusy(false);
  };

  if (loading) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中...</div>;
  }

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">ブラウザのプッシュ通知</p>
            <p className="mt-1 text-xs text-slate-500">
              {pushDeviceActive
                ? "この端末で有効化されています。"
                : "先生からのメッセージなどをこの端末で受け取れます。"}
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
              className="shrink-0 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
              {pushBusy ? "処理中..." : "この端末で有効化"}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500">
        ※ メール通知は生徒アカウントには使われない設計です。Push 通知のみが対象です。
      </p>
    </section>
  );
}
