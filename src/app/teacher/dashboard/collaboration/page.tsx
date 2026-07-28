"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import type { Student, Teacher } from "@/lib/supabase";
import {
  Badge, Button, Card, EmptyState, LinkButton, PageHeader, SectionTitle,
  Spinner, cx, inputClass,
} from "@/components/ui";

/* ──────────────────────────────────────────────────────────
   講師連携
     上：生徒について … 生徒ごとに話が積み上がる。開くとその子の事実が横にある。
     下：教室運営     … 議題。決まったら閉じる。

   タスク管理ではなく「語り合う場所」にしたいので、担当者・期限は前面に出さず
   詳細の中に畳んである（機能としては残す。完了の権限ルールも従来どおり）。
   ────────────────────────────────────────────────────────── */

type SourceType = "manual" | "report" | "diagnosis" | "karte";

const AUTO_LABEL: Record<string, string> = {
  report: "報告書から", diagnosis: "診断から", karte: "カルテから",
};

type Category = "student_guidance" | "classroom_management" | "school_rules";

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
  assignee_id: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
};

type Message = {
  id: string;
  task_id: string;
  teacher_id: string | null;
  body: string;
  created_at: string;
};

/** 会話の隣に置く「その子の事実」。ここがあるから議論が具体になる。 */
type StudentFacts = {
  progress: { textbook: string; where: string | null; understanding: string | null; date: string } | null;
  report: { subject: string | null; percentage: number | null; date: string } | null;
  diagnosis: { bottleneck: string | null; intervention: string | null; date: string } | null;
  parent: { message: string; date: string } | null;
};

// ロール上下: 管理者 > 講師 > 非常勤
const ROLE_RANK: Record<string, number> = { admin: 3, teacher: 2, "part-time": 1 };
const ROLE_LABEL: Record<string, string> = { admin: "管理者", teacher: "講師", "part-time": "非常勤" };
const rankOf = (role: string | null | undefined) => ROLE_RANK[role ?? ""] ?? 1;

const UNDERSTAND: Record<string, string> = { good: "◎手応えあり", normal: "○ふつう", weak: "△不安" };

const EMPTY_FORM = {
  category: "student_guidance" as Category,
  title: "",
  description: "",
  student_id: "",
  is_all_students: false,
  due_date: "",
  scheduled_date: "",
  assignee_id: "",
};

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}日前`;
  return new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

export default function CollaborationPage() {
  const [myTeacherId, setMyTeacherId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string>("part-time");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [lastMsg, setLastMsg] = useState<Map<string, Message>>(new Map());
  const [msgCount, setMsgCount] = useState<Map<string, number>>(new Map());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [facts, setFacts] = useState<StudentFacts | null>(null);
  const [showDetails, setShowDetails] = useState(false); // 担当・期限の畳み
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* ── 自分・名簿 ─────────────────────────────────── */
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: t } = await supabase.from("teachers").select("id, role").eq("email", session.user.email!).maybeSingle();
      if (t) { setMyTeacherId(t.id); setMyRole(t.role); }
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

  /* ── 話題と、その最後の一言 ───────────────────────── */
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("collaboration_tasks").select("*").eq("status", "open")
      .order("created_at", { ascending: false });
    const rows = (data as Task[]) ?? [];
    setTasks(rows);

    // 一覧に「最後の一言」を出すため、まとめて引いてクライアントで畳む
    if (rows.length > 0) {
      const { data: ms } = await supabase
        .from("collaboration_task_messages")
        .select("id, task_id, teacher_id, body, created_at")
        .in("task_id", rows.map((r) => r.id))
        .order("created_at", { ascending: false });
      const last = new Map<string, Message>();
      const count = new Map<string, number>();
      for (const m of (ms as Message[]) ?? []) {
        if (!last.has(m.task_id)) last.set(m.task_id, m);
        count.set(m.task_id, (count.get(m.task_id) ?? 0) + 1);
      }
      setLastMsg(last);
      setMsgCount(count);
    } else {
      setLastMsg(new Map());
      setMsgCount(new Map());
    }
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

  // 開いたら報告書・診断から「気がかりな生徒」を自動掲載して再取得
  useEffect(() => {
    (async () => {
      try { await authFetch("/api/collaboration/sync", { method: "POST" }); } catch { /* 同期失敗は無視 */ }
      fetchTasks();
    })();
  }, [fetchTasks]);

  /* ── その子の事実（会話の隣に置く） ───────────────── */
  const fetchFacts = useCallback(async (studentId: string, studentName: string) => {
    setFacts(null);
    const [p, r, d, m] = await Promise.allSettled([
      supabase.from("textbook_progress")
        .select("textbook, progress_where, understanding, lesson_date")
        .eq("student_id", studentId).order("lesson_date", { ascending: false }).limit(1),
      supabase.from("lesson_reports")
        .select("test_subject, percentage, created_at")
        .eq("student_id", studentId).order("created_at", { ascending: false }).limit(1),
      supabase.from("questionnaire_responses")
        .select("bottleneck_label, intervention, created_at")
        .eq("student_name", studentName).order("created_at", { ascending: false }).limit(1),
      supabase.from("parent_messages")
        .select("message, created_at")
        .eq("student_id", studentId).eq("direction", "parent_to_teacher")
        .order("created_at", { ascending: false }).limit(1),
    ]);
    const row = (x: PromiseSettledResult<{ data: unknown[] | null; error: unknown } | null>) =>
      x.status === "fulfilled" && x.value && !x.value.error ? (x.value.data ?? [])[0] : null;

    const pr = row(p) as { textbook: string; progress_where: string | null; understanding: string | null; lesson_date: string } | undefined;
    const rr = row(r) as { test_subject: string | null; percentage: number | null; created_at: string } | undefined;
    const dr = row(d) as { bottleneck_label: string | null; intervention: string | null; created_at: string } | undefined;
    const mr = row(m) as { message: string; created_at: string } | undefined;

    setFacts({
      progress: pr ? { textbook: pr.textbook, where: pr.progress_where, understanding: pr.understanding, date: pr.lesson_date } : null,
      report: rr ? { subject: rr.test_subject, percentage: rr.percentage, date: rr.created_at.slice(0, 10) } : null,
      diagnosis: dr ? { bottleneck: dr.bottleneck_label, intervention: dr.intervention, date: dr.created_at.slice(0, 10) } : null,
      parent: mr ? { message: mr.message, date: mr.created_at.slice(0, 10) } : null,
    });
  }, []);

  const fetchMessages = useCallback(async (taskId: string) => {
    const { data } = await supabase.from("collaboration_task_messages")
      .select("*").eq("task_id", taskId).order("created_at", { ascending: true });
    setMessages((data as Message[]) ?? []);
  }, []);

  const selectTask = useCallback(async (taskId: string) => {
    setSelectedTaskId(taskId);
    setShowDetails(false);
    await fetchMessages(taskId);
    const t = tasks.find((x) => x.id === taskId);
    if (t?.student_id) {
      const s = students.find((x) => x.id === t.student_id);
      fetchFacts(t.student_id, s?.name ?? "");
    } else {
      setFacts(null);
    }
    if (myTeacherId) {
      await supabase.from("collaboration_task_reads").upsert(
        { task_id: taskId, teacher_id: myTeacherId },
        { onConflict: "task_id,teacher_id" }
      );
      setReadIds((prev) => new Set([...prev, taskId]));
    }
  }, [myTeacherId, fetchMessages, fetchFacts, tasks, students]);

  const closeDetail = () => {
    setSelectedTaskId(null); setMessages([]); setNewMessage(""); setFacts(null);
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  /* ── 書き込み系（従来の権限ルールをそのまま保持） ──── */
  const saveTask = async () => {
    if (!form.title.trim()) { setFormError("ひとことを入力してください"); return; }
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
      assignee_id: form.assignee_id || null,
      assigned_by: form.assignee_id ? myTeacherId : null,
      assigned_at: form.assignee_id ? new Date().toISOString() : null,
      status: "open",
    });
    setSaving(false);
    if (error) { setFormError(error.message); return; }
    setCreating(false); setForm(EMPTY_FORM); fetchTasks();
  };

  const assignTask = async (taskId: string, assigneeId: string) => {
    if (!myTeacherId) return;
    const patch = assigneeId
      ? { assignee_id: assigneeId, assigned_by: myTeacherId, assigned_at: new Date().toISOString() }
      : { assignee_id: null, assigned_by: null, assigned_at: null };
    await supabase.from("collaboration_tasks").update(patch).eq("id", taskId);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  };

  const finishTask = async (taskId: string, auto: boolean) => {
    if (!myTeacherId) return;
    if (!auto && !confirm("この話を終わりにしますか？（一覧から消えます）")) return;
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

  const teacherName = (id: string | null) => (id ? teachers.find((t) => t.id === id)?.name ?? "—" : "—");
  const studentOf = (id: string | null) => (id ? students.find((s) => s.id === id) ?? null : null);
  const assignCandidates = teachers.filter((t) => rankOf(t.role) <= rankOf(myRole));

  const canAssign = (task: Task) => {
    if (!task.assignee_id) return true;
    return rankOf(myRole) >= rankOf(teachers.find((t) => t.id === task.assignee_id)?.role);
  };
  // 完了できるか＝担当者本人 or 担当者より上位ロール。未割当は完了不可。
  const canComplete = (task: Task) => {
    if (!task.assignee_id) return false;
    if (task.assignee_id === myTeacherId) return true;
    return rankOf(myRole) > rankOf(teachers.find((t) => t.id === task.assignee_id)?.role);
  };

  const isAuto = (t: Task) =>
    t.source_type === "report" || t.source_type === "diagnosis" || t.source_type === "karte";
  const isUnread = (t: Task) => !readIds.has(t.id) && t.created_by !== myTeacherId;

  /* ── 上：生徒ごとにまとめる ───────────────────────── */
  const studentGroups = useMemo(() => {
    const g = new Map<string, { key: string; name: string; grade: string; tasks: Task[] }>();
    for (const t of tasks) {
      if (t.category !== "student_guidance") continue;
      const key = t.is_all_students ? "__all__" : t.student_id ?? "__none__";
      if (!g.has(key)) {
        const s = studentOf(t.student_id);
        g.set(key, {
          key,
          name: t.is_all_students ? "生徒全体" : s?.name ?? "（生徒未指定）",
          grade: t.is_all_students ? "" : s?.grade ?? "",
          tasks: [],
        });
      }
      g.get(key)!.tasks.push(t);
    }
    // 動きが新しい順。未読を含むグループを上に。
    return [...g.values()].sort((a, b) => {
      const au = a.tasks.some(isUnread) ? 1 : 0;
      const bu = b.tasks.some(isUnread) ? 1 : 0;
      if (au !== bu) return bu - au;
      const at = Math.max(...a.tasks.map((t) => new Date(lastMsg.get(t.id)?.created_at ?? t.created_at).getTime()));
      const bt = Math.max(...b.tasks.map((t) => new Date(lastMsg.get(t.id)?.created_at ?? t.created_at).getTime()));
      return bt - at;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, students, readIds, lastMsg, myTeacherId]);

  const roomTasks = useMemo(
    () => tasks.filter((t) => t.category === "classroom_management" || t.category === "school_rules"),
    [tasks],
  );

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const selectedStudent = selectedTask ? studentOf(selectedTask.student_id) : null;

  const openCompose = (category: Category, studentId?: string) => {
    setForm({ ...EMPTY_FORM, category, student_id: studentId ?? "" });
    setFormError("");
    setCreating(true);
  };

  /* ── 1件の話題の行 ──────────────────────────────── */
  const ThreadRow = ({ t, showStudent = false }: { t: Task; showStudent?: boolean }) => {
    const last = lastMsg.get(t.id);
    const n = msgCount.get(t.id) ?? 0;
    const unread = isUnread(t);
    return (
      <button
        onClick={() => selectTask(t.id)}
        className={cx(
          "flex w-full items-start gap-3 rounded-field px-3 py-3 text-left transition duration-150",
          unread ? "bg-brand-50/60 hover:bg-brand-50" : "hover:bg-canvas-sunken",
        )}
      >
        <span
          aria-hidden
          className={cx("mt-2 h-1.5 w-1.5 shrink-0 rounded-pill", unread ? "bg-brand-600" : "bg-transparent")}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            {showStudent && (
              <span className="text-xs font-bold text-ink-faint">
                {t.is_all_students ? "生徒全体" : studentOf(t.student_id)?.name ?? "—"}
              </span>
            )}
            <span className={cx("text-sm", unread ? "font-bold text-ink" : "font-semibold text-ink")}>{t.title}</span>
            {isAuto(t) && <Badge tone="caution">{AUTO_LABEL[t.source_type ?? ""] ?? "自動"}</Badge>}
          </span>

          {/* 最後の一言。これが「いま何が語られているか」 */}
          <span className="mt-1 block truncate text-sm leading-6 text-ink-muted">
            {last ? last.body : t.auto_reason ? t.auto_reason : t.description || "—"}
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
            <span>{last ? teacherName(last.teacher_id) : isAuto(t) ? "自動" : teacherName(t.created_by)}</span>
            <span>·</span>
            <time>{relTime(last?.created_at ?? t.created_at)}</time>
            {n > 0 && <><span>·</span><span data-numeric>{n}件の声</span></>}
            {n === 0 && <><span>·</span><span className="font-medium text-brand-600">まだ誰も答えていない</span></>}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-9">
      <PageHeader
        title="講師連携"
        description="気になること、うまくいったこと。ここで話しましょう。"
      />

      {/* ══ 上：生徒について ══════════════════════════ */}
      <section className="mb-10">
        <SectionTitle
          action={
            <Button size="sm" variant="secondary" onClick={() => openCompose("student_guidance")}>
              生徒のことを話す
            </Button>
          }
        >
          生徒について
        </SectionTitle>

        {loading ? (
          <Card><div className="flex justify-center py-8"><Spinner className="h-5 w-5" /></div></Card>
        ) : studentGroups.length === 0 ? (
          <EmptyState
            icon="🧑‍🎓"
            title="まだ誰の話も出ていません"
            description="気になった子のことを、ひとことでいいので書いてみてください。ほかの先生が続けてくれます。"
            action={<Button onClick={() => openCompose("student_guidance")}>生徒のことを話す</Button>}
          />
        ) : (
          <div className="space-y-2.5">
            {studentGroups.map((g) => (
              <Card key={g.key} padding="none" className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-line bg-canvas/60 px-4 py-2.5">
                  <p className="flex items-baseline gap-2">
                    <span className="font-bold text-ink">{g.name}</span>
                    {g.grade && <span className="text-xs text-ink-faint">{g.grade}</span>}
                  </p>
                  {g.key !== "__all__" && g.key !== "__none__" && (
                    <button
                      onClick={() => openCompose("student_guidance", g.key)}
                      className="text-xs font-semibold text-brand-600 transition hover:underline"
                    >
                      この子について書く
                    </button>
                  )}
                </div>
                <div className="divide-line p-1.5">
                  {g.tasks.map((t) => <ThreadRow key={t.id} t={t} />)}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ══ 下：教室運営 ══════════════════════════════ */}
      <section>
        <SectionTitle
          action={
            <Button size="sm" variant="secondary" onClick={() => openCompose("classroom_management")}>
              議題を立てる
            </Button>
          }
        >
          教室運営
        </SectionTitle>

        {loading ? (
          <Card><div className="flex justify-center py-8"><Spinner className="h-5 w-5" /></div></Card>
        ) : roomTasks.length === 0 ? (
          <EmptyState
            icon="🏫"
            title="いま議論中の議題はありません"
            description="備品・掲示・保護者対応・ルールなど、みんなで決めたいことを書いてください。"
            action={<Button onClick={() => openCompose("classroom_management")}>議題を立てる</Button>}
          />
        ) : (
          <Card padding="none" className="overflow-hidden">
            <div className="divide-line p-1.5">
              {roomTasks.map((t) => <ThreadRow key={t.id} t={t} />)}
            </div>
          </Card>
        )}
      </section>

      {/* ══ 詳細（会話） ══════════════════════════════ */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={closeDetail}>
          <div
            className="flex h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-card bg-surface shadow-pop sm:h-[85vh] sm:rounded-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 見出し */}
            <div className="shrink-0 border-b border-line px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {selectedTask.category === "student_guidance" && (
                      <span className="text-sm font-bold text-brand-700">
                        {selectedTask.is_all_students ? "生徒全体" : selectedStudent?.name ?? "—"}
                        {selectedStudent?.grade && <span className="ml-1 text-xs font-medium text-ink-faint">{selectedStudent.grade}</span>}
                      </span>
                    )}
                    {isAuto(selectedTask) && (
                      <Badge tone="caution">{AUTO_LABEL[selectedTask.source_type ?? ""] ?? "自動"}</Badge>
                    )}
                  </div>
                  <h2 className="mt-0.5 text-lg font-bold leading-7 text-ink">{selectedTask.title}</h2>
                  {selectedTask.auto_reason && (
                    <p className="mt-1 text-sm leading-6 text-caution-700">{selectedTask.auto_reason}</p>
                  )}
                  {selectedTask.description && (
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink-muted">{selectedTask.description}</p>
                  )}
                </div>
                <button onClick={closeDetail} aria-label="閉じる"
                  className="shrink-0 rounded-field px-2 py-1 text-ink-faint transition hover:bg-canvas-sunken hover:text-ink">✕</button>
              </div>
            </div>

            {/* その子の事実。会話の材料が同じ画面にある */}
            {selectedTask.category === "student_guidance" && !selectedTask.is_all_students && (
              <div className="shrink-0 border-b border-line bg-canvas px-5 py-3">
                <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-ink-faint">
                  いまの{selectedStudent?.name ?? "この子"}
                </p>
                {!facts ? (
                  <p className="text-xs text-ink-faint">読み込み中…</p>
                ) : !facts.progress && !facts.report && !facts.diagnosis && !facts.parent ? (
                  <p className="text-xs text-ink-faint">記録がまだありません。</p>
                ) : (
                  <dl className="space-y-1">
                    {facts.progress && (
                      <div className="flex gap-2 text-xs leading-5">
                        <dt aria-label="教材">📘</dt>
                        <dd className="text-ink-muted">
                          {facts.progress.textbook}
                          {facts.progress.where && ` ${facts.progress.where}`}
                          {facts.progress.understanding && ` · ${UNDERSTAND[facts.progress.understanding] ?? ""}`}
                          <span className="ml-1 text-ink-faint">{facts.progress.date}</span>
                        </dd>
                      </div>
                    )}
                    {facts.report && (
                      <div className="flex gap-2 text-xs leading-5">
                        <dt aria-label="報告書">📝</dt>
                        <dd className="text-ink-muted">
                          {facts.report.subject ?? "—"} 正答率 {facts.report.percentage ?? "—"}
                          <span className="ml-1 text-ink-faint">{facts.report.date}</span>
                        </dd>
                      </div>
                    )}
                    {facts.diagnosis && (
                      <div className="flex gap-2 text-xs leading-5">
                        <dt aria-label="診断">📊</dt>
                        <dd className="text-ink-muted">
                          {facts.diagnosis.bottleneck ?? "—"}
                          {facts.diagnosis.intervention && ` / ${facts.diagnosis.intervention}`}
                          <span className="ml-1 text-ink-faint">{facts.diagnosis.date}</span>
                        </dd>
                      </div>
                    )}
                    {facts.parent && (
                      <div className="flex gap-2 text-xs leading-5">
                        <dt aria-label="保護者">👪</dt>
                        <dd className="line-clamp-2 text-ink-muted">
                          {facts.parent.message}
                          <span className="ml-1 text-ink-faint">{facts.parent.date}</span>
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
                {selectedTask.student_id && (
                  <div className="mt-2">
                    <LinkButton href={`/teacher/dashboard/students/${selectedTask.student_id}`} variant="ghost" size="sm">
                      この子の全部を見る →
                    </LinkButton>
                  </div>
                )}
              </div>
            )}

            {/* 会話 */}
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {messages.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm font-medium text-ink">まだ誰も話していません。</p>
                  <p className="mt-1 text-sm leading-6 text-ink-faint">
                    授業で見えたこと、たった一行でかまいません。
                  </p>
                </div>
              ) : messages.map((msg) => {
                const isMe = msg.teacher_id === myTeacherId;
                return (
                  <div key={msg.id} className="flex gap-3">
                    <div className={cx(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-xs font-bold",
                      isMe ? "bg-brand-gradient text-white" : "bg-canvas-sunken text-ink-muted",
                    )}>
                      {teacherName(msg.teacher_id).slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-ink">{teacherName(msg.teacher_id)}</span>
                        <time className="text-xs text-ink-faint">{relTime(msg.created_at)}</time>
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm leading-7 text-ink-muted">{msg.body}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* 入力 */}
            <div className="shrink-0 border-t border-line px-5 py-3">
              <div className="flex gap-2">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  rows={2}
                  placeholder="思ったことを書く（Enterで送信・Shift+Enterで改行）"
                  className={cx(inputClass, "flex-1 resize-none")}
                />
                <Button onClick={sendMessage} disabled={sendingMsg || !newMessage.trim()} className="self-end">
                  送信
                </Button>
              </div>

              {/* 担当・期限・終了は前に出さない。必要な人だけ開く */}
              <div className="mt-2">
                <button
                  onClick={() => setShowDetails((v) => !v)}
                  className="text-xs font-medium text-ink-faint transition hover:text-ink"
                >
                  {showDetails ? "▲ 担当・期限をとじる" : "▼ 担当・期限・この話を終わりにする"}
                </button>

                {showDetails && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-field bg-canvas px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-ink-faint">担当</span>
                      {canAssign(selectedTask) ? (
                        <select
                          value={selectedTask.assignee_id ?? ""}
                          onChange={(e) => assignTask(selectedTask.id, e.target.value)}
                          className="rounded-field border border-line-strong bg-surface px-2 py-1 text-xs"
                        >
                          <option value="">— 未割当 —</option>
                          {assignCandidates.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}（{ROLE_LABEL[t.role] ?? t.role}）</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs font-semibold text-ink">{teacherName(selectedTask.assignee_id)}</span>
                      )}
                      {selectedTask.due_date && (
                        <span data-numeric className="text-xs text-ink-faint">期限 {selectedTask.due_date}</span>
                      )}
                    </div>

                    {canComplete(selectedTask) ? (
                      <Button size="sm" variant="secondary" onClick={() => finishTask(selectedTask.id, isAuto(selectedTask))}>
                        {isAuto(selectedTask) ? "対応した" : "この話を終わりにする"}
                      </Button>
                    ) : (
                      <span className="text-xs text-ink-faint">
                        {selectedTask.assignee_id ? "担当者か上位の先生が終了できます" : "先に担当を決めてください"}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ 書く ══════════════════════════════════════ */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
          onClick={() => setCreating(false)}>
          <div className="w-full max-w-lg rounded-card bg-surface p-6 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ink">
              {form.category === "student_guidance" ? "生徒のことを話す" : "議題を立てる"}
            </h3>
            <p className="mt-1 text-sm text-ink-muted">
              {form.category === "student_guidance"
                ? "完璧に書かなくて大丈夫です。気づいたことを一行で。"
                : "みんなで決めたいことを書いてください。"}
            </p>

            <div className="mt-5 space-y-4">
              {form.category === "student_guidance" && (
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-ink">誰のこと？</p>
                  <div className="mb-2 flex gap-2">
                    <button onClick={() => setForm({ ...form, is_all_students: false })}
                      className={cx("flex-1 rounded-field border py-2 text-xs font-semibold transition",
                        !form.is_all_students ? "border-brand-400 bg-brand-50 text-brand-700" : "border-line-strong text-ink-muted hover:bg-canvas-sunken")}>
                      ひとりの生徒
                    </button>
                    <button onClick={() => setForm({ ...form, is_all_students: true, student_id: "" })}
                      className={cx("flex-1 rounded-field border py-2 text-xs font-semibold transition",
                        form.is_all_students ? "border-brand-400 bg-brand-50 text-brand-700" : "border-line-strong text-ink-muted hover:bg-canvas-sunken")}>
                      生徒全体
                    </button>
                  </div>
                  {!form.is_all_students && (
                    <select value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                      className={inputClass}>
                      <option value="">— 生徒を選ぶ —</option>
                      {students.map((s) => <option key={s.id} value={s.id}>{s.name}（{s.grade}）</option>)}
                    </select>
                  )}
                </div>
              )}

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-ink">ひとこと</span>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder={form.category === "student_guidance"
                    ? "例：宿題が続けて出ていない"
                    : "例：自習室の私語、どこまで許すか"}
                  className={inputClass} autoFocus />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-ink">
                  もう少し詳しく <span className="font-normal text-ink-faint">（任意）</span>
                </span>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3} placeholder="見えたこと・気になったこと"
                  className={cx(inputClass, "resize-none")} />
              </label>

              {formError && <p className="text-sm font-medium text-critical-600">{formError}</p>}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreating(false)}>やめる</Button>
              <Button onClick={saveTask} disabled={saving}>
                {saving ? <><Spinner className="h-4 w-4 border-white/40 border-t-white" />投稿中…</> : "投稿する"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
