"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import type { Student, Teacher } from "@/lib/supabase";

type SourceType = "manual" | "report" | "diagnosis";

type Category = "student_guidance" | "classroom_management" | "school_rules";
type ViewMode = "list" | "calendar";

type Task = {
  id: string;
  created_by: string | null;
  category: Category;
  title: string;
  description: string | null;
  status: string;
  student_id: string | null;
  is_all_students: boolean;
  due_date: string | null;
  scheduled_date: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  source_type: SourceType | null;
  source_id: string | null;
  auto_reason: string | null;
};

type Message = {
  id: string;
  task_id: string;
  teacher_id: string | null;
  body: string;
  created_at: string;
};

const CATEGORY_LABELS: Record<Category | "all", string> = {
  all: "すべて",
  student_guidance: "生徒指導",
  classroom_management: "教室運営",
  school_rules: "塾ルール",
};

const CATEGORY_COLORS: Record<Category, string> = {
  student_guidance: "bg-blue-100 text-blue-700",
  classroom_management: "bg-amber-100 text-amber-700",
  school_rules: "bg-purple-100 text-purple-700",
};

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

const EMPTY_FORM = {
  category: "student_guidance" as Category,
  title: "",
  description: "",
  student_id: "",
  is_all_students: false,
  due_date: "",
  scheduled_date: "",
};

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dueDateLabel(due: string | null): { text: string; cls: string } | null {
  if (!due) return null;
  const today = dateKey(new Date());
  if (due < today) return { text: `期限切れ ${due}`, cls: "text-red-600 bg-red-50" };
  if (due === today) return { text: "今日が期限", cls: "text-orange-600 bg-orange-50" };
  return { text: `期限 ${due}`, cls: "text-slate-600 bg-slate-100" };
}

export default function TeacherCollaborationPage() {
  const [myTeacherId, setMyTeacherId] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: t } = await supabase.from("teachers").select("id").eq("email", session.user.email!).maybeSingle();
      if (t) setMyTeacherId(t.id);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const [{ data: ts }, { data: ss }] = await Promise.all([
        supabase.from("teachers").select("*").order("name"),
        supabase.from("students").select("*").order("name"),
      ]);
      setTeachers(ts ?? []);
      setStudents(ss ?? []);
    })();
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("collaboration_tasks").select("*").eq("status", "open")
      .order("created_at", { ascending: false });
    setTasks((data as Task[]) ?? []);
    setLoading(false);
  }, []);

  const fetchReadIds = useCallback(async () => {
    if (!myTeacherId) return;
    const { data } = await supabase.from("collaboration_task_reads")
      .select("task_id").eq("teacher_id", myTeacherId);
    setReadIds(new Set((data ?? []).map((r: { task_id: string }) => r.task_id)));
  }, [myTeacherId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useEffect(() => { if (myTeacherId) fetchReadIds(); }, [myTeacherId, fetchReadIds]);

  // ページを開いたら報告書・学力診断から「気がかりな生徒」を自動掲載して再取得
  useEffect(() => {
    (async () => {
      setSyncing(true);
      try { await authFetch("/api/collaboration/sync", { method: "POST" }); } catch { /* 同期失敗は無視 */ }
      setSyncing(false);
      fetchTasks();
    })();
  }, [fetchTasks]);

  const fetchMessages = useCallback(async (taskId: string) => {
    const { data } = await supabase.from("collaboration_task_messages")
      .select("*").eq("task_id", taskId).order("created_at", { ascending: true });
    setMessages((data as Message[]) ?? []);
  }, []);

  const selectTask = useCallback(async (taskId: string) => {
    setSelectedTaskId(taskId);
    await fetchMessages(taskId);
    if (myTeacherId) {
      await supabase.from("collaboration_task_reads").upsert(
        { task_id: taskId, teacher_id: myTeacherId },
        { onConflict: "task_id,teacher_id" }
      );
      setReadIds(prev => new Set([...prev, taskId]));
    }
  }, [myTeacherId, fetchMessages]);

  const closeDetail = () => { setSelectedTaskId(null); setMessages([]); setNewMessage(""); };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const saveTask = async () => {
    if (!form.title.trim()) { setFormError("タイトルは必須です"); return; }
    if (!myTeacherId) return;
    setSaving(true); setFormError("");
    const { error } = await supabase.from("collaboration_tasks").insert({
      created_by: myTeacherId,
      category: form.category,
      title: form.title.trim(),
      description: form.description.trim() || null,
      student_id: form.category === "student_guidance" && !form.is_all_students && form.student_id ? form.student_id : null,
      is_all_students: form.category === "student_guidance" ? form.is_all_students : false,
      due_date: form.due_date || null,
      scheduled_date: form.category === "student_guidance" && form.scheduled_date ? form.scheduled_date : null,
      status: "open",
    });
    setSaving(false);
    if (error) { setFormError(error.message); return; }
    setCreating(false); setForm(EMPTY_FORM); fetchTasks();
  };

  const completeTask = async (taskId: string) => {
    if (!myTeacherId) return;
    if (!confirm("このタスクを完了にして削除しますか？")) return;
    await supabase.from("collaboration_tasks")
      .update({ status: "completed", completed_by: myTeacherId, completed_at: new Date().toISOString() })
      .eq("id", taskId);
    if (selectedTaskId === taskId) closeDetail();
    fetchTasks();
  };

  // 自動掲載タスクを「解決済」にする（行は残るので同じ報告書では再掲されない）
  const resolveAuto = async (taskId: string) => {
    if (!myTeacherId) return;
    await supabase.from("collaboration_tasks")
      .update({ status: "completed", completed_by: myTeacherId, completed_at: new Date().toISOString() })
      .eq("id", taskId);
    if (selectedTaskId === taskId) closeDetail();
    fetchTasks();
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedTaskId || !myTeacherId) return;
    setSendingMsg(true);
    await supabase.from("collaboration_task_messages").insert({
      task_id: selectedTaskId, teacher_id: myTeacherId, body: newMessage.trim(),
    });
    setNewMessage(""); await fetchMessages(selectedTaskId); setSendingMsg(false);
  };

  const teacherName = (id: string | null) => id ? teachers.find(t => t.id === id)?.name ?? "—" : "—";
  const studentName = (id: string | null) => id ? students.find(s => s.id === id)?.name ?? "—" : "—";

  const isAutoTask = (t: Task) => t.source_type === "report" || t.source_type === "diagnosis";
  const filteredTasks = categoryFilter === "all" ? tasks : tasks.filter(t => t.category === categoryFilter);
  const autoTasks = filteredTasks.filter(isAutoTask);
  const manualTasks = filteredTasks.filter(t => !isAutoTask(t));
  const selectedTask = tasks.find(t => t.id === selectedTaskId) ?? null;

  // カレンダー用
  const calYear = calendarMonth.getFullYear();
  const calMonth = calendarMonth.getMonth();
  const calCells = (() => {
    const first = new Date(calYear, calMonth, 1);
    const days = new Date(calYear, calMonth + 1, 0).getDate();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < first.getDay(); i++) arr.push(null);
    for (let d = 1; d <= days; d++) arr.push(new Date(calYear, calMonth, d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  })();

  const tasksByDue = new Map<string, Task[]>();
  const tasksByScheduled = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.due_date) {
      if (!tasksByDue.has(t.due_date)) tasksByDue.set(t.due_date, []);
      tasksByDue.get(t.due_date)!.push(t);
    }
    if (t.scheduled_date) {
      if (!tasksByScheduled.has(t.scheduled_date)) tasksByScheduled.set(t.scheduled_date, []);
      tasksByScheduled.get(t.scheduled_date)!.push(t);
    }
  }

  const todayKey = dateKey(new Date());

  // ── タスクカード（一覧・省略せず読める） ──
  const TaskCard = ({ task }: { task: Task }) => {
    const isUnread = !readIds.has(task.id) && task.created_by !== myTeacherId;
    const due = dueDateLabel(task.due_date);
    const auto = isAutoTask(task);
    return (
      <div className={`rounded-2xl border p-4 shadow-sm transition ${auto ? "border-rose-200 bg-rose-50/50" : "border-slate-200 bg-white"}`}>
        <button onClick={() => selectTask(task.id)} className="w-full text-left">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${CATEGORY_COLORS[task.category]}`}>
              {CATEGORY_LABELS[task.category]}
            </span>
            {auto && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                {task.source_type === "diagnosis" ? "🔔 自動・診断" : "🔔 自動・報告書"}
              </span>
            )}
            {task.category === "student_guidance" && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {task.is_all_students ? "生徒全体" : studentName(task.student_id)}
              </span>
            )}
            {isUnread && <span className="ml-auto flex items-center gap-1 text-xs font-bold text-red-500"><span className="h-2 w-2 rounded-full bg-red-500" />未読</span>}
          </div>
          <p className="font-bold text-slate-900 leading-snug">{task.title}</p>
          {auto && task.auto_reason && (
            <p className="mt-1 text-sm font-medium text-rose-600">{task.auto_reason}</p>
          )}
          {task.description && (
            <p className="mt-1 line-clamp-2 text-sm text-slate-600 whitespace-pre-wrap">{task.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {due && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${due.cls}`}>{due.text}</span>}
            <span className="text-xs text-slate-400">
              {auto ? "自動掲載" : teacherName(task.created_by)} · {new Date(task.created_at).toLocaleString("ja-JP", { month: "short", day: "numeric" })}
            </span>
          </div>
        </button>
        <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-2.5">
          <button onClick={() => selectTask(task.id)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            開く・返信
          </button>
          {auto ? (
            <button onClick={() => resolveAuto(task.id)}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700">
              ✓ 対応した（解決）
            </button>
          ) : (
            <button onClick={() => completeTask(task.id)}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700">
              ✓ 完了
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen px-6 py-8 text-slate-900">
      <div className="mx-auto w-full max-w-5xl">

        {/* ヘッダー */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">講師連携</h1>
            <p className="mt-1 text-sm text-slate-600">
              気がかりな生徒（報告書・学力診断から自動掲載）と、講師間で共有するタスク。
              {syncing && <span className="ml-2 text-xs font-semibold text-rose-500">自動掲載を確認中…</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden">
              <button onClick={() => setViewMode("list")}
                className={`px-4 py-2 text-sm font-semibold transition ${viewMode === "list" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                リスト
              </button>
              <button onClick={() => setViewMode("calendar")}
                className={`px-4 py-2 text-sm font-semibold transition ${viewMode === "calendar" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                カレンダー
              </button>
            </div>
            <button onClick={() => { setForm(EMPTY_FORM); setFormError(""); setCreating(true); }}
              className="rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
              ＋ タスクを作成
            </button>
          </div>
        </div>

        {/* カテゴリータブ */}
        <div className="mb-5 flex gap-2 flex-wrap">
          {(["all", "student_guidance", "classroom_management", "school_rules"] as const).map((cat) => (
            <button key={cat} onClick={() => setCategoryFilter(cat)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${categoryFilter === cat ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {CATEGORY_LABELS[cat]}
              {cat !== "all" && (
                <span className="ml-1.5 text-xs opacity-70">({tasks.filter(t => t.category === cat).length})</span>
              )}
            </button>
          ))}
        </div>

        {/* ── リストビュー（読みやすいカード） ── */}
        {viewMode === "list" && (
          loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400">読み込み中...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
              <p className="text-3xl mb-2">✅</p>
              <p className="font-semibold text-slate-700">対応が必要なタスクはありません</p>
            </div>
          ) : (
            <div className="space-y-6">
              {autoTasks.length > 0 && (
                <section>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-rose-700">
                    🔔 気がかり（自動掲載）<span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs">{autoTasks.length}</span>
                  </h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {autoTasks.map((task) => <TaskCard key={task.id} task={task} />)}
                  </div>
                </section>
              )}
              {manualTasks.length > 0 && (
                <section>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700">
                    タスク<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{manualTasks.length}</span>
                  </h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {manualTasks.map((task) => <TaskCard key={task.id} task={task} />)}
                  </div>
                </section>
              )}
            </div>
          )
        )}

        {/* ── カレンダービュー ── */}
        {viewMode === "calendar" && (
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button onClick={() => setCalendarMonth(new Date(calYear, calMonth - 1, 1))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">←</button>
              <span className="min-w-[8rem] text-center font-semibold text-slate-800">{calYear}年{calMonth + 1}月</span>
              <button onClick={() => setCalendarMonth(new Date(calYear, calMonth + 1, 1))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">→</button>
              <button onClick={() => setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                className="ml-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">今月</button>
              <div className="ml-4 flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-400" />納期</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-400" />予定日</span>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="grid grid-cols-7 text-center text-xs font-semibold text-slate-500 mb-1">
                {WEEKDAY.map((w, i) => (
                  <div key={w} className={`py-2 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : ""}`}>{w}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calCells.map((d, idx) => {
                  if (!d) return <div key={idx} className="min-h-24 rounded-lg bg-slate-50/50" />;
                  const k = dateKey(d);
                  const dueTasks = (tasksByDue.get(k) ?? []).filter(t => categoryFilter === "all" || t.category === categoryFilter);
                  const schedTasks = (tasksByScheduled.get(k) ?? []).filter(t => categoryFilter === "all" || t.category === categoryFilter);
                  const isToday = k === todayKey;
                  return (
                    <div key={k} className={`min-h-24 rounded-lg border p-1.5 text-left ${isToday ? "border-indigo-400 bg-indigo-50/40" : "border-slate-100"}`}>
                      <p className={`text-xs font-semibold mb-1 ${isToday ? "text-indigo-600" : "text-slate-600"}`}>{d.getDate()}</p>
                      <div className="space-y-0.5">
                        {dueTasks.map(t => (
                          <button key={`due-${t.id}`} onClick={() => selectTask(t.id)}
                            className="w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold bg-red-100 text-red-700 hover:bg-red-200">
                            📅 {t.title}
                          </button>
                        ))}
                        {schedTasks.map(t => (
                          <button key={`sched-${t.id}`} onClick={() => selectTask(t.id)}
                            className="w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200">
                            🗓 {t.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 詳細＋スレッド モーダル（広く読める） ── */}
      {selectedTask && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={closeDetail}>
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* ヘッダー */}
            <div className="shrink-0 border-b border-slate-100 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${CATEGORY_COLORS[selectedTask.category]}`}>
                      {CATEGORY_LABELS[selectedTask.category]}
                    </span>
                    {isAutoTask(selectedTask) && (
                      <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">
                        {selectedTask.source_type === "diagnosis" ? "🔔 自動・診断" : "🔔 自動・報告書"}
                      </span>
                    )}
                    {selectedTask.category === "student_guidance" && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {selectedTask.is_all_students ? "生徒全体" : studentName(selectedTask.student_id)}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-slate-950">{selectedTask.title}</h2>
                  {selectedTask.auto_reason && (
                    <p className="mt-0.5 text-sm font-semibold text-rose-600">{selectedTask.auto_reason}</p>
                  )}
                  {selectedTask.description && (
                    <p className="mt-1.5 text-sm text-slate-600 whitespace-pre-wrap">{selectedTask.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {selectedTask.due_date && (
                      <span className={`rounded-full px-2.5 py-0.5 font-semibold ${dueDateLabel(selectedTask.due_date)?.cls}`}>📅 納期 {selectedTask.due_date}</span>
                    )}
                    {selectedTask.scheduled_date && (
                      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 font-semibold text-blue-700">🗓 予定日 {selectedTask.scheduled_date}</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    作成: {isAutoTask(selectedTask) ? "自動掲載" : teacherName(selectedTask.created_by)} · {new Date(selectedTask.created_at).toLocaleString("ja-JP")}
                  </p>
                </div>
                <button onClick={closeDetail} className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-500 hover:bg-slate-50">✕</button>
              </div>
              <div className="mt-3 flex justify-end">
                {isAutoTask(selectedTask) ? (
                  <button onClick={() => resolveAuto(selectedTask.id)}
                    className="rounded-xl bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700">✓ 対応した（解決済）</button>
                ) : (
                  <button onClick={() => completeTask(selectedTask.id)}
                    className="rounded-xl bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700">✓ 完了・削除</button>
                )}
              </div>
            </div>

            {/* スレッド */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">まだメッセージはありません。下から連携を始めましょう。</p>
              ) : messages.map((msg) => {
                const isMe = msg.teacher_id === myTeacherId;
                return (
                  <div key={msg.id} className={`flex gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
                    {!isMe && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                        {teacherName(msg.teacher_id).slice(0, 1)}
                      </div>
                    )}
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isMe ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-900"}`}>
                      {!isMe && <p className="mb-0.5 text-xs font-semibold opacity-60">{teacherName(msg.teacher_id)}</p>}
                      <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                      <p className={`mt-1 text-right text-[10px] ${isMe ? "text-white/60" : "text-slate-400"}`}>
                        {new Date(msg.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* 入力 */}
            <div className="shrink-0 border-t border-slate-100 p-3 flex gap-2">
              <textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                rows={2} placeholder="メッセージを入力（Enter送信・Shift+Enterで改行）"
                className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <button onClick={sendMessage} disabled={sendingMsg || !newMessage.trim()}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                送信
              </button>
            </div>
          </div>
        </div>
      )}

      {/* タスク作成モーダル */}
      {creating && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setCreating(false)}>
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-5 text-lg font-bold text-slate-950">タスクを作成</h3>
            <div className="grid gap-4">

              {/* カテゴリー */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">カテゴリー</p>
                <div className="flex gap-2">
                  {(["student_guidance", "classroom_management", "school_rules"] as Category[]).map((cat) => (
                    <button key={cat}
                      onClick={() => setForm({ ...form, category: cat, student_id: "", is_all_students: false, scheduled_date: "" })}
                      className={`flex-1 rounded-xl border py-2.5 text-xs font-semibold transition ${form.category === cat ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                      {CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </div>

              {/* 生徒指導：対象 */}
              {form.category === "student_guidance" && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">対象</p>
                  <div className="flex gap-2 mb-2">
                    <button onClick={() => setForm({ ...form, is_all_students: false })}
                      className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition ${!form.is_all_students ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                      個別生徒
                    </button>
                    <button onClick={() => setForm({ ...form, is_all_students: true, student_id: "" })}
                      className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition ${form.is_all_students ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                      生徒全体
                    </button>
                  </div>
                  {!form.is_all_students && (
                    <select value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      <option value="">— 生徒を選択 —</option>
                      {students.map((s) => <option key={s.id} value={s.id}>{s.name}（{s.grade}）</option>)}
                    </select>
                  )}
                </div>
              )}

              {/* タイトル */}
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                タイトル
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="例：田中くんの宿題未提出が続いている"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-900" />
              </label>

              {/* 詳細 */}
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                詳細（任意）
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2} placeholder="具体的な状況や対応方針など"
                  className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-900" />
              </label>

              {/* 日付 */}
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  納期（任意）
                  <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-900" />
                </label>
                {form.category === "student_guidance" && (
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    予定日（任意）
                    <input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-900" />
                  </label>
                )}
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setCreating(false)}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                キャンセル
              </button>
              <button onClick={saveTask} disabled={saving}
                className="rounded-2xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                {saving ? "作成中..." : "作成する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
