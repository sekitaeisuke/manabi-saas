"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import type { Student, Teacher } from "@/lib/supabase";
import {
  Badge, Button, Card, EmptyState, LinkButton, PageHeader,
  Spinner, cx, inputClass,
} from "@/components/ui";

/* ──────────────────────────────────────────────────────────
   講師連携

     まず教室を選ぶ。教室ごとに「教務」と「事務」を左右に並べる。

       教室名
         ├ 教務タスク（報告書・保護者とのやりとりをAIが読んで自動掲載＋講師の入力）
         ├ 事務タスク（講師の入力）
         ├ 教務タスクの入力
         └ 事務タスクの入力

     掲示先は「この教室」か「全社」。全社にすると、すべての教室に同じタスクが出る。
     終わったタスクは各行の「終了」で閉じる（一覧から消えるが記録は残る）。
     担当・期限・会話はタスクを開いた先にある。
   ────────────────────────────────────────────────────────── */

type SourceType = "manual" | "report" | "diagnosis" | "karte" | "parent";
type TaskKind = "academic" | "admin";

const AUTO_LABEL: Record<string, string> = {
  report: "報告書から", diagnosis: "診断から", karte: "カルテから", parent: "保護者から",
};

const KIND_LABEL: Record<TaskKind, string> = { academic: "教務タスク", admin: "事務タスク" };

type Category = "student_guidance" | "classroom_management" | "school_rules";

type Task = {
  id: string;
  created_by: string | null;
  category: Category;
  task_kind: TaskKind | null;
  title: string;
  description: string | null;
  status: string;
  student_id: string | null;
  school_id: string | null;
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

type SchoolRow = { id: string; name: string; group_name: string | null };

/** 会話の隣に置く「その子の事実」。ここがあるから議論が具体になる。 */
type StudentFacts = {
  progress: { textbook: string; where: string | null; understanding: string | null; date: string } | null;
  report: { subject: string | null; percentage: number | null; date: string } | null;
  diagnosis: { bottleneck: string | null; intervention: string | null; date: string } | null;
  parent: { message: string; date: string } | null;
};

// ロール上下: 管理者 > 講師 > 非常勤（担当を決められる範囲の判定に使う）
const ROLE_RANK: Record<string, number> = { admin: 3, teacher: 2, "part-time": 1 };
const ROLE_LABEL: Record<string, string> = { admin: "管理者", teacher: "講師", "part-time": "非常勤" };
const rankOf = (role: string | null | undefined) => ROLE_RANK[role ?? ""] ?? 1;

const UNDERSTAND: Record<string, string> = { good: "◎手応えあり", normal: "○ふつう", weak: "△不安" };

const LAST_SCHOOL_KEY = "teacher.collaboration.schoolId";
const ALL_SCHOOLS = "__all__";
const COMPANY_KEY = "__company__";

type ComposeForm = {
  title: string;
  description: string;
  student_id: string;
  toCompany: boolean;   // true = 全社（すべての教室に掲示）
};

const EMPTY_COMPOSE: ComposeForm = { title: "", description: "", student_id: "", toCompany: false };

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
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [view, setView] = useState<string>(ALL_SCHOOLS);   // ALL_SCHOOLS または school.id
  const [tasks, setTasks] = useState<Task[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [lastMsg, setLastMsg] = useState<Map<string, Message>>(new Map());
  const [msgCount, setMsgCount] = useState<Map<string, number>>(new Map());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [facts, setFacts] = useState<StudentFacts | null>(null);
  const [showDetails, setShowDetails] = useState(false); // 担当・期限の畳み
  const [composeAt, setComposeAt] = useState<string | null>(null); // "<blockKey>:<kind>"
  const [form, setForm] = useState<ComposeForm>(EMPTY_COMPOSE);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(true);
  const [finishing, setFinishing] = useState<string | null>(null);
  const [tidying, setTidying] = useState(false);                  // 整理モード（削除の選択）
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* ── 自分・名簿・教室 ───────────────────────────────── */
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const [{ data: ts }, { data: ss }, { data: sc }] = await Promise.all([
        supabase.from("teachers").select("*").order("name"),
        supabase.from("students").select("*").order("name"),
        supabase.from("schools").select("id, name, group_name").order("name"),
      ]);
      setTeachers((ts as Teacher[]) ?? []);
      setStudents((ss as Student[]) ?? []);
      const schoolList = (sc as SchoolRow[]) ?? [];
      setSchools(schoolList);

      const me = session?.user?.email
        ? ((ts as Teacher[]) ?? []).find((t) => t.email === session.user.email) ?? null
        : null;
      if (me) { setMyTeacherId(me.id); setMyRole(me.role); }

      // 最後に見ていた教室 → 自分の所属教室 → 全教室
      const stored = typeof window !== "undefined" ? localStorage.getItem(LAST_SCHOOL_KEY) : null;
      const initial =
        (stored === ALL_SCHOOLS && ALL_SCHOOLS) ||
        (stored && schoolList.some((s) => s.id === stored) && stored) ||
        (me?.school_id && schoolList.some((s) => s.id === me.school_id) && me.school_id) ||
        ALL_SCHOOLS;
      setView(initial);
    })();
  }, []);

  const selectView = (next: string) => {
    setView(next);
    setComposeAt(null);
    try { localStorage.setItem(LAST_SCHOOL_KEY, next); } catch { /* 保存できなくても動く */ }
  };

  /* ── タスクと、その最後の一言 ─────────────────────── */
  const fetchTasks = useCallback(async () => {
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

  // 開いたら報告書・保護者メッセージ・診断から教務タスクを自動掲載して再取得
  useEffect(() => {
    (async () => {
      try { await authFetch("/api/collaboration/sync", { method: "POST" }); } catch { /* 同期失敗は無視 */ }
      setSyncing(false);
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

  /* ── 種別・掲示先の読み取り ─────────────────────────
     task_kind / school_id は collaboration-kind-school-setup.sql で足す列。
     未適用でも画面が壊れないよう、無ければ category から教務/事務を推定し、
     掲示先不明は全社として扱う。
     ────────────────────────────────────────────── */
  const schoolIds = useMemo(() => new Set(schools.map((s) => s.id)), [schools]);
  const kindOf = (t: Task): TaskKind =>
    t.task_kind ?? (t.category === "student_guidance" ? "academic" : "admin");
  const isCompanyWide = (t: Task) => !t.school_id || !schoolIds.has(t.school_id);

  /* ── 書き込み系 ──────────────────────────────────── */
  const openCompose = (blockKey: string, kind: TaskKind, schoolId: string | null) => {
    const key = `${blockKey}:${kind}`;
    if (composeAt === key) { setComposeAt(null); return; }
    setForm({ ...EMPTY_COMPOSE, toCompany: schoolId === null });
    setFormError("");
    setComposeAt(key);
  };

  const saveTask = async (kind: TaskKind, schoolId: string | null) => {
    if (!form.title.trim()) { setFormError("やることを一行で入力してください"); return; }
    if (!myTeacherId) { setFormError("講師として認識できませんでした。再ログインしてください"); return; }
    setSaving(true); setFormError("");
    const { error } = await supabase.from("collaboration_tasks").insert({
      created_by: myTeacherId,
      // category は従来のまま残す（教務=生徒の話 / 事務=教室運営）
      category: kind === "academic" ? "student_guidance" : "classroom_management",
      task_kind: kind,
      title: form.title.trim(),
      description: form.description.trim() || null,
      student_id: kind === "academic" && form.student_id ? form.student_id : null,
      school_id: form.toCompany ? null : schoolId,
      is_all_students: false,
      status: "open",
    });
    setSaving(false);
    if (error) {
      // 列が無い＝collaboration-kind-school-setup.sql をまだ流していない
      setFormError(
        /task_kind|school_id/.test(error.message)
          ? "collaboration-kind-school-setup.sql をSupabaseで実行してください（教務/事務・教室の列がまだありません）"
          : error.message
      );
      return;
    }
    setComposeAt(null); setForm(EMPTY_COMPOSE); fetchTasks();
  };

  const assignTask = async (taskId: string, assigneeId: string) => {
    if (!myTeacherId) return;
    const patch = assigneeId
      ? { assignee_id: assigneeId, assigned_by: myTeacherId, assigned_at: new Date().toISOString() }
      : { assignee_id: null, assigned_by: null, assigned_at: null };
    await supabase.from("collaboration_tasks").update(patch).eq("id", taskId);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  };

  /** 終了。誰でも押せる（誰が終わらせたかは completed_by に残る）。 */
  const finishTask = async (taskId: string, title: string) => {
    if (!myTeacherId) return;
    if (!confirm(`「${title}」を終了しますか？\n一覧から消えますが、記録は残ります。`)) return;
    setFinishing(taskId);
    await supabase.from("collaboration_tasks")
      .update({ status: "completed", completed_by: myTeacherId, completed_at: new Date().toISOString() })
      .eq("id", taskId);
    setFinishing(null);
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
  const schoolName = (id: string | null) => (id ? schools.find((s) => s.id === id)?.name ?? null : null);
  const assignCandidates = teachers.filter((t) => rankOf(t.role) <= rankOf(myRole));

  const canAssign = (task: Task) => {
    if (!task.assignee_id) return true;
    return rankOf(myRole) >= rankOf(teachers.find((t) => t.id === task.assignee_id)?.role);
  };

  const isAuto = (t: Task) => !!t.source_type && t.source_type !== "manual";
  const isUnread = (t: Task) => !readIds.has(t.id) && t.created_by !== myTeacherId;

  /* ── 削除 ──────────────────────────────────────────
     「終了」(completed) とは意味が違う。
       終了 … やり終えた
       削除 … そもそも要らなかった（自動掲載のノイズ・誤投稿）
     どちらも行は消さず status を変えるだけなので、あとから戻せる。

     人が書いたものを他人が消せると連携の場として成立しないので、
     手動投稿は「書いた本人か管理者」だけが消せる。自動掲載は誰でも消せる。
     ────────────────────────────────────────────── */
  const canDelete = (t: Task) => {
    if (isAuto(t)) return true;
    return t.created_by === myTeacherId || myRole === "admin";
  };

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const deletePicked = async () => {
    if (!myTeacherId || picked.size === 0) return;
    const targets = tasks.filter((t) => picked.has(t.id) && canDelete(t));
    if (targets.length === 0) return;
    const mine = targets.filter((t) => !isAuto(t)).length;
    const msg =
      `${targets.length}件を削除します。` +
      (mine > 0 ? `\nうち${mine}件は先生が書いた投稿です。` : "") +
      `\n\n一覧からは消えますが記録は残るので、あとから戻せます。`;
    if (!confirm(msg)) return;

    setDeleting(true);
    await supabase.from("collaboration_tasks")
      .update({ status: "deleted", completed_by: myTeacherId, completed_at: new Date().toISOString() })
      .in("id", targets.map((t) => t.id));
    setPicked(new Set());
    setDeleting(false);
    if (selectedTaskId && targets.some((t) => t.id === selectedTaskId)) closeDetail();
    fetchTasks();
  };

  const stopTidying = () => { setTidying(false); setPicked(new Set()); };

  /* ── 教室のかたまり ───────────────────────────────
       全教室ビュー … ①全社ブロック（全教室に掲示されているもの）②教室ごと
       教室ビュー   … その教室ぶん＋全社ぶんを混ぜて1ブロック
     ────────────────────────────────────────────── */
  type Block = { key: string; schoolId: string | null; name: string; withCompany: boolean };

  const blocks: Block[] = useMemo(() => {
    if (view === ALL_SCHOOLS) {
      return [
        { key: COMPANY_KEY, schoolId: null, name: "全社（すべての教室に掲示）", withCompany: true },
        ...schools.map((s) => ({ key: s.id, schoolId: s.id, name: s.name, withCompany: false })),
      ];
    }
    const s = schools.find((x) => x.id === view);
    if (!s) return [];
    return [{ key: s.id, schoolId: s.id, name: s.name, withCompany: true }];
  }, [view, schools]);

  const sortTasks = useCallback((list: Task[]) => {
    return [...list].sort((a, b) => {
      const au = isUnread(a) ? 1 : 0;
      const bu = isUnread(b) ? 1 : 0;
      if (au !== bu) return bu - au;
      const at = new Date(lastMsg.get(a.id)?.created_at ?? a.created_at).getTime();
      const bt = new Date(lastMsg.get(b.id)?.created_at ?? b.created_at).getTime();
      return bt - at;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMsg, readIds, myTeacherId]);

  const tasksIn = useCallback((b: Block, kind: TaskKind) => {
    return sortTasks(tasks.filter((t) => {
      if (kindOf(t) !== kind) return false;
      if (b.schoolId === null) return isCompanyWide(t);
      if (t.school_id === b.schoolId) return true;
      return b.withCompany && isCompanyWide(t);
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, sortTasks, schoolIds]);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const selectedStudent = selectedTask ? studentOf(selectedTask.student_id) : null;

  /* ── 1件のタスク行 ──────────────────────────────── */
  const renderRow = (t: Task, blockSchoolId: string | null) => {
    const last = lastMsg.get(t.id);
    const n = msgCount.get(t.id) ?? 0;
    const unread = isUnread(t);
    const deletable = canDelete(t);
    const s = studentOf(t.student_id);
    // その教室のブロックに全社タスクが混ざっているときだけ「全社」と分かるようにする
    const showCompanyBadge = blockSchoolId !== null && isCompanyWide(t);

    return (
      <div
        key={t.id}
        className={cx(
          "flex items-start gap-1 rounded-field transition duration-150",
          picked.has(t.id) ? "bg-critical-50" : unread ? "bg-brand-50/60 hover:bg-brand-50" : "hover:bg-canvas-sunken",
        )}
      >
        {tidying && (
          <label
            className={cx(
              "flex shrink-0 cursor-pointer items-center self-stretch py-3 pl-3",
              !deletable && "cursor-not-allowed opacity-30",
            )}
            title={deletable ? "選んで削除できます" : "書いた本人か管理者だけが削除できます"}
          >
            <input
              type="checkbox"
              checked={picked.has(t.id)}
              disabled={!deletable}
              onChange={() => togglePick(t.id)}
              className="h-4 w-4 rounded accent-[var(--color-critical-600)]"
            />
          </label>
        )}

        <button
          onClick={() => selectTask(t.id)}
          className="flex min-w-0 flex-1 items-start gap-2.5 rounded-field py-3 pl-3 text-left"
        >
          <span
            aria-hidden
            className={cx("mt-2 h-1.5 w-1.5 shrink-0 rounded-pill", unread ? "bg-brand-600" : "bg-transparent")}
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {s && <span className="text-xs font-bold text-ink-faint">{s.name}</span>}
              <span className={cx("text-sm", unread ? "font-bold text-ink" : "font-semibold text-ink")}>{t.title}</span>
              {isAuto(t) && <Badge tone="caution">{AUTO_LABEL[t.source_type ?? ""] ?? "自動"}</Badge>}
              {showCompanyBadge && <Badge tone="brand">全社</Badge>}
            </span>

            {/* 最後の一言。これが「いま何が語られているか」 */}
            <span className="mt-1 block truncate text-sm leading-6 text-ink-muted">
              {last ? last.body : t.auto_reason ? t.auto_reason : t.description || "—"}
            </span>

            <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
              <span>{last ? teacherName(last.teacher_id) : isAuto(t) ? "自動" : teacherName(t.created_by)}</span>
              <span>·</span>
              <time>{relTime(last?.created_at ?? t.created_at)}</time>
              {t.assignee_id && <><span>·</span><span>担当 {teacherName(t.assignee_id)}</span></>}
              {t.due_date && <><span>·</span><span data-numeric>期限 {t.due_date}</span></>}
              {n > 0 && <><span>·</span><span data-numeric>{n}件の声</span></>}
            </span>
          </span>
        </button>

        {/* 終了ボタン。行から直接押せる */}
        <div className="shrink-0 self-center py-2 pr-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => finishTask(t.id, t.title)}
            disabled={finishing === t.id}
          >
            {finishing === t.id ? <Spinner className="h-3 w-3" /> : "終了"}
          </Button>
        </div>
      </div>
    );
  };

  /* ── 教務／事務の1列（タスク一覧＋入力） ─────────── */
  const renderColumn = (b: Block, kind: TaskKind) => {
    const list = tasksIn(b, kind);
    const composeKey = `${b.key}:${kind}`;
    const open = composeAt === composeKey;
    // 教務は生徒を選べる。その教室の生徒を出す（未所属しかいなければ全員）。
    const schoolStudents = b.schoolId
      ? students.filter((s) => s.school_id === b.schoolId)
      : students;
    const studentOptions = schoolStudents.length > 0 ? schoolStudents : students;

    return (
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <p className="flex items-baseline gap-2">
            <span className={cx("text-sm font-bold", kind === "academic" ? "text-brand-700" : "text-ink")}>
              {KIND_LABEL[kind]}
            </span>
            <span data-numeric className="text-xs text-ink-faint">{list.length}件</span>
          </p>
          {kind === "academic" && (
            <span className="text-[0.6875rem] text-ink-faint">報告書・保護者から自動掲載</span>
          )}
        </div>

        <div className="flex-1 p-1.5">
          {list.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs leading-5 text-ink-faint">
              {kind === "academic"
                ? "いま気がかりな生徒はいません。"
                : "事務のやることはありません。"}
            </p>
          ) : (
            list.map((t) => renderRow(t, b.schoolId))
          )}
        </div>

        {/* 入力 */}
        <div className="border-t border-line px-3 py-2.5">
          {!open ? (
            <button
              onClick={() => openCompose(b.key, kind, b.schoolId)}
              className="w-full rounded-field border border-dashed border-line-strong py-2 text-xs font-semibold text-ink-muted transition hover:border-brand-400 hover:text-brand-700"
            >
              ＋ {KIND_LABEL[kind]}を追加
            </button>
          ) : (
            <div className="space-y-2.5">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={kind === "academic" ? "例：長文の読み方を来週から変える" : "例：プリンターのトナーを発注する"}
                className={inputClass}
                autoFocus
              />
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="詳しく（任意）"
                className={cx(inputClass, "resize-none")}
              />

              {kind === "academic" && (
                <select
                  value={form.student_id}
                  onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                  className={inputClass}
                >
                  <option value="">— 生徒を選ぶ（任意）—</option>
                  {studentOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}（{s.grade}）</option>
                  ))}
                </select>
              )}

              {b.schoolId !== null && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setForm({ ...form, toCompany: false })}
                    className={cx("flex-1 rounded-field border py-1.5 text-xs font-semibold transition",
                      !form.toCompany ? "border-brand-400 bg-brand-50 text-brand-700" : "border-line-strong text-ink-muted hover:bg-canvas-sunken")}
                  >
                    この教室だけ
                  </button>
                  <button
                    onClick={() => setForm({ ...form, toCompany: true })}
                    className={cx("flex-1 rounded-field border py-1.5 text-xs font-semibold transition",
                      form.toCompany ? "border-brand-400 bg-brand-50 text-brand-700" : "border-line-strong text-ink-muted hover:bg-canvas-sunken")}
                  >
                    全社（全教室に掲示）
                  </button>
                </div>
              )}

              {formError && <p className="text-xs font-medium text-critical-600">{formError}</p>}

              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setComposeAt(null)}>やめる</Button>
                <Button size="sm" onClick={() => saveTask(kind, b.schoolId)} disabled={saving}>
                  {saving ? <><Spinner className="h-3 w-3 border-white/40 border-t-white" />追加中…</> : "追加する"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-9">
      <PageHeader
        title="講師連携"
        description="教室ごとに、教務と事務のやることを並べています。終わったら「終了」を押してください。"
        actions={
          tasks.length > 0 ? (
            tidying ? (
              <button onClick={stopTidying} className="text-xs font-medium text-ink-faint transition hover:text-ink">
                整理をやめる
              </button>
            ) : (
              <button onClick={() => setTidying(true)} className="text-xs font-medium text-ink-faint transition hover:text-ink">
                いらないものを整理する
              </button>
            )
          ) : null
        }
      />

      {/* ══ 教室を選ぶ ════════════════════════════════ */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => selectView(ALL_SCHOOLS)}
          aria-pressed={view === ALL_SCHOOLS}
          className={cx(
            "rounded-pill border px-4 py-1.5 text-sm font-semibold transition",
            view === ALL_SCHOOLS
              ? "border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600"
              : "border-line-strong bg-surface text-ink-muted hover:border-brand-200 hover:text-ink",
          )}
        >
          全教室
        </button>
        {schools.map((s) => {
          const active = view === s.id;
          const open = tasks.filter((t) => t.school_id === s.id || isCompanyWide(t)).length;
          return (
            <button
              key={s.id}
              onClick={() => selectView(s.id)}
              aria-pressed={active}
              className={cx(
                "rounded-pill border px-4 py-1.5 text-sm font-semibold transition",
                active
                  ? "border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600"
                  : "border-line-strong bg-surface text-ink-muted hover:border-brand-200 hover:text-ink",
              )}
            >
              {s.name}
              <span data-numeric className="ml-1.5 text-xs font-normal text-ink-faint">{open}</span>
            </button>
          );
        })}
      </div>

      {/* 整理モードの操作バー */}
      {tidying && (
        <div className="sticky top-2 z-20 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-critical-200 bg-critical-50 px-4 py-3 shadow-card">
          <p className="text-sm font-semibold text-critical-700">
            <span data-numeric>{picked.size}</span> 件を選択中
            <span className="ml-2 font-normal text-critical-600">
              削除しても記録は残ります（一覧から消えるだけ）
            </span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPicked(new Set(tasks.filter(canDelete).map((t) => t.id)))}
              className="text-xs font-semibold text-critical-700 transition hover:underline"
            >
              すべて選択
            </button>
            <Button size="sm" variant="ghost" onClick={stopTidying}>やめる</Button>
            <Button size="sm" variant="danger" onClick={deletePicked} disabled={deleting || picked.size === 0}>
              {deleting ? <><Spinner className="h-3 w-3" />削除中…</> : `${picked.size}件を削除`}
            </Button>
          </div>
        </div>
      )}

      {/* ══ 教室ごと：教務／事務を並べる ═══════════════ */}
      {loading ? (
        <Card><div className="flex justify-center py-10"><Spinner className="h-5 w-5" /></div></Card>
      ) : schools.length === 0 ? (
        <EmptyState
          icon="🏫"
          title="教室が登録されていません"
          description="先に「教室・名簿」で教室を登録してください。"
          action={<LinkButton href="/teacher/dashboard/schools">教室・名簿へ</LinkButton>}
        />
      ) : (
        <div className="space-y-6">
          {syncing && (
            <p className="flex items-center gap-2 text-xs text-ink-faint">
              <Spinner className="h-3 w-3" />
              報告書と保護者とのやりとりを読んでいます…
            </p>
          )}

          {blocks.map((b) => (
            <Card key={b.key} padding="none" className="overflow-hidden">
              {/* 教室名 */}
              <div className="flex items-center justify-between gap-3 border-b border-line bg-canvas/60 px-4 py-3">
                <p className="flex items-baseline gap-2">
                  <span className="text-base font-bold text-ink">{b.name}</span>
                  {b.schoolId && schools.find((s) => s.id === b.schoolId)?.group_name && (
                    <span className="text-xs text-ink-faint">
                      {schools.find((s) => s.id === b.schoolId)?.group_name}
                    </span>
                  )}
                </p>
                <span data-numeric className="text-xs text-ink-faint">
                  教務 {tasksIn(b, "academic").length} ／ 事務 {tasksIn(b, "admin").length}
                </span>
              </div>

              {/* 教務タスク ｜ 事務タスク */}
              <div className="grid grid-cols-1 divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0">
                {renderColumn(b, "academic")}
                {renderColumn(b, "admin")}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ══ 詳細（会話・担当・期限） ═══════════════════ */}
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
                    <Badge tone={kindOf(selectedTask) === "academic" ? "brand" : "neutral"}>
                      {KIND_LABEL[kindOf(selectedTask)]}
                    </Badge>
                    <span className="text-xs font-semibold text-ink-faint">
                      {isCompanyWide(selectedTask) ? "全社" : schoolName(selectedTask.school_id) ?? "教室未設定"}
                    </span>
                    {selectedStudent && (
                      <span className="text-sm font-bold text-brand-700">
                        {selectedStudent.name}
                        {selectedStudent.grade && <span className="ml-1 text-xs font-medium text-ink-faint">{selectedStudent.grade}</span>}
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
            {selectedTask.student_id && (
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
                <div className="mt-2">
                  <LinkButton href={`/teacher/dashboard/students/${selectedTask.student_id}`} variant="ghost" size="sm">
                    この子の全部を見る →
                  </LinkButton>
                </div>
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

              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={() => setShowDetails((v) => !v)}
                  className="text-xs font-medium text-ink-faint transition hover:text-ink"
                >
                  {showDetails ? "▲ 担当・期限をとじる" : "▼ 担当・期限を決める"}
                </button>
                <Button size="sm" variant="secondary"
                  onClick={() => finishTask(selectedTask.id, selectedTask.title)}
                  disabled={finishing === selectedTask.id}>
                  {finishing === selectedTask.id ? <Spinner className="h-3 w-3" /> : "終了"}
                </Button>
              </div>

              {showDetails && (
                <div className="mt-2 flex flex-wrap items-center gap-3 rounded-field bg-canvas px-3 py-2.5">
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
                  <span className="text-xs font-semibold text-ink-faint">期限</span>
                  <input
                    type="date"
                    value={selectedTask.due_date ?? ""}
                    onChange={async (e) => {
                      const due = e.target.value || null;
                      await supabase.from("collaboration_tasks").update({ due_date: due }).eq("id", selectedTask.id);
                      setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? { ...t, due_date: due } : t)));
                    }}
                    className="rounded-field border border-line-strong bg-surface px-2 py-1 text-xs"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
