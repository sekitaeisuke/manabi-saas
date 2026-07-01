"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import { showToast } from "@/lib/toast";
import { sanitizeHtml } from "@/lib/sanitize";
import type { Student, StudentKarte } from "@/lib/supabase";
import { Skeleton } from "@/components/Skeleton";

const LESSON_STATUS_JA: Record<string, string> = {
  scheduled: "予定",
  completed: "実施済",
  canceled: "中止",
  rescheduled: "振替済",
};

type ParentLinked = { id: string; name: string; email: string; phone: string | null };
type LessonRow = { id: string; subject: string | null; scheduled_at: string; status: string; teacher_id: string | null };
type ReportRow = { id: string; test_title: string; test_subject: string | null; percentage: number | null; status: string; created_at: string };
type KarteRow = { id: string; subject: string; grade: string; status: string; created_at: string };
type ProgressRow = {
  id: string; lesson_date: string; subject: string | null; textbook: string;
  progress_where: string | null; amount: string | null;
  understanding: "good" | "normal" | "weak" | null; comment: string | null; teacher_name: string | null;
};
type DiagRow = {
  id: string; subject: string | null; grade: string | null; status: string;
  test_percentage: number | null;
  habit_score: number | null; method_score: number | null; verbal_score: number | null; skill_score: number | null;
  created_at: string;
};
type Msg = {
  id: string; thread_id: string | null; subject: string | null; message: string;
  direction: "parent_to_teacher" | "teacher_to_parent";
  status: string; created_at: string;
};

type DailyTaskRow = { id: string; task_date: string; subject: string | null; content: string; amount: string | null; done: boolean };

type HubTab = "overview" | "karte" | "learning" | "contact";

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function taskDateLabel(key: string) {
  const [y, m, dd] = key.split("-").map(Number);
  const wd = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, m - 1, dd).getDay()];
  return `${m}/${dd}（${wd}）`;
}

const UNDERSTAND: Record<string, { label: string; cls: string }> = {
  good:   { label: "◎ 手応え", cls: "bg-green-100 text-green-700" },
  normal: { label: "○ ふつう", cls: "bg-blue-100 text-blue-700" },
  weak:   { label: "△ 不安",   cls: "bg-amber-100 text-amber-700" },
};

export default function StudentDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const studentId = params?.id;

  const [student, setStudent] = useState<Student | null>(null);
  const [parents, setParents] = useState<ParentLinked[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [karte, setKarte] = useState<KarteRow[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [diagnoses, setDiagnoses] = useState<DiagRow[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [dailyKarte, setDailyKarte] = useState<StudentKarte | null>(null);
  const [dailyTasks, setDailyTasks] = useState<DailyTaskRow[]>([]);
  const [schoolName, setSchoolName] = useState<string>("—");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<HubTab>("overview");
  const [karteBusy, setKarteBusy] = useState(false);
  // 「現在時刻」はマウント時に一度だけ確定させ、レンダーを純粋に保つ（授業の前後判定の基準）
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);

    const { data: s } = await supabase.from("students").select("*").eq("id", studentId).maybeSingle();
    setStudent(s);
    if (!s) { setLoading(false); return; }

    if (s.school_id) {
      const { data: sch } = await supabase.from("schools").select("name").eq("id", s.school_id).maybeSingle();
      setSchoolName(sch?.name ?? "—");
    }

    const [
      { data: links },
      { data: ls },
      { data: rs },
      { data: ks },
      { data: ps },
      { data: ds },
      { data: msgs },
      { data: dk },
      { data: dts },
    ] = await Promise.all([
      supabase.from("parent_student_links")
        .select("parent:parents(id, name, email, phone)")
        .eq("student_id", studentId),
      supabase.from("lessons")
        .select("id, subject, scheduled_at, status, teacher_id")
        .eq("student_id", studentId)
        .order("scheduled_at", { ascending: false })
        .limit(20),
      supabase.from("lesson_reports")
        .select("id, test_title, test_subject, percentage, status, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("learning_plans")
        .select("id, subject, grade, status, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("textbook_progress")
        .select("id, lesson_date, subject, textbook, progress_where, amount, understanding, comment, teacher_name")
        .eq("student_id", studentId)
        .order("lesson_date", { ascending: false })
        .limit(10),
      supabase.from("questionnaire_responses")
        .select("id, subject, grade, status, test_percentage, habit_score, method_score, verbal_score, skill_score, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("parent_messages")
        .select("id, thread_id, subject, message, direction, status, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("student_karte")
        .select("*")
        .eq("student_id", studentId)
        .order("generated_at", { ascending: false })
        .limit(1),
      supabase.from("daily_tasks")
        .select("id, task_date, subject, content, amount, done")
        .eq("student_id", studentId)
        .gte("task_date", keyOf(new Date()))
        .lte("task_date", keyOf(addDays(new Date(), 6)))
        .order("task_date", { ascending: true })
        .order("sort_order", { ascending: true }),
    ]);

    setParents((links ?? []).map((l: { parent: ParentLinked | ParentLinked[] | null }) =>
      Array.isArray(l.parent) ? l.parent[0] : l.parent
    ).filter((p): p is ParentLinked => Boolean(p)));
    setLessons((ls as LessonRow[]) ?? []);
    setReports((rs as ReportRow[]) ?? []);
    setKarte((ks as KarteRow[]) ?? []);
    setProgress((ps as ProgressRow[]) ?? []);
    setDiagnoses((ds as DiagRow[]) ?? []);
    setMessages((msgs as Msg[]) ?? []);
    setDailyKarte(((dk as StudentKarte[]) ?? [])[0] ?? null);
    setDailyTasks((dts as DailyTaskRow[]) ?? []);
    setLoading(false);
  }, [studentId]);

  useEffect(() => { setNow(Date.now()); load(); }, [load]);

  const regenerateKarte = async () => {
    if (!studentId) return;
    setKarteBusy(true);
    try {
      const res = await authFetch("/api/karte/daily-view/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error, "error"); return; }
      showToast("カルテを更新しました", "success");
      await load();
    } catch (e) {
      showToast("再生成に失敗しました: " + String(e), "error");
    } finally {
      setKarteBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="px-6 py-10">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-36" />
            </div>
            <Skeleton className="h-10 w-28 rounded-2xl" />
          </div>
          <div className="flex gap-2">
            {[1,2,3,4].map((i) => <Skeleton key={i} className="h-9 w-24 rounded-2xl" />)}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (!student) {
    return (
      <div className="px-6 py-10">
        <p className="text-slate-500">生徒が見つかりません。</p>
        <button onClick={() => router.back()} className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm">戻る</button>
      </div>
    );
  }

  const upcomingLessons = lessons.filter((l) => new Date(l.scheduled_at).getTime() >= now).slice(0, 5);
  const pastLessons = lessons.filter((l) => new Date(l.scheduled_at).getTime() < now).slice(0, 5);

  const TABS: { key: HubTab; label: string; badge?: number }[] = [
    { key: "overview", label: "概要" },
    { key: "karte", label: "カルテ" },
    { key: "learning", label: "学習記録", badge: reports.length + progress.length + diagnoses.length },
    { key: "contact", label: "やりとり", badge: messages.length },
  ];

  return (
    <div className="px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* ヘッダー */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400">{schoolName}</p>
            <h1 className="text-3xl font-bold text-slate-950">{student.name}</h1>
            <p className="mt-1 text-sm text-slate-600">{student.grade} ・ ログインID：{student.login_id ?? "—"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/teacher/dashboard/lessons`}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">
              授業予定へ
            </Link>
            <Link href={`/teacher/dashboard/messages`}
              className="rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
              メッセージ
            </Link>
          </div>
        </div>

        {/* タブ */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                tab === t.key ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}>
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                  tab === t.key ? "bg-white/25 text-white" : "bg-slate-200 text-slate-600"
                }`}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── 概要 ── */}
        {tab === "overview" && (
          <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-2">
              <Card title="保護者">
                {parents.length === 0 ? (
                  <p className="text-xs text-slate-400">紐付けされた保護者はいません。</p>
                ) : (
                  <ul className="space-y-2">
                    {parents.map((p) => (
                      <li key={p.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                        <p className="text-xs text-slate-500">{p.email}</p>
                        {p.phone && <p className="text-xs text-slate-500">{p.phone}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="出席曜日">
                {!student.attendance_days || student.attendance_days.length === 0 ? (
                  <p className="text-xs text-slate-400">未設定</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {student.attendance_days.map((d) => (
                      <span key={d} className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">{d}</span>
                    ))}
                  </div>
                )}
              </Card>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <Card title={`今後の授業（${upcomingLessons.length}）`}>
                {upcomingLessons.length === 0 ? (
                  <p className="text-xs text-slate-400">予定なし</p>
                ) : (
                  <ul className="space-y-2">
                    {upcomingLessons.map((l) => (
                      <li key={l.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                        <p className="font-semibold text-slate-900">
                          {new Date(l.scheduled_at).toLocaleString("ja-JP", { month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">{l.subject ?? "—"} ・ {LESSON_STATUS_JA[l.status] ?? l.status}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title={`過去の授業（${pastLessons.length}）`}>
                {pastLessons.length === 0 ? (
                  <p className="text-xs text-slate-400">記録なし</p>
                ) : (
                  <ul className="space-y-2">
                    {pastLessons.map((l) => (
                      <li key={l.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                        <p className="font-semibold text-slate-900">
                          {new Date(l.scheduled_at).toLocaleString("ja-JP", { month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">{l.subject ?? "—"} ・ {LESSON_STATUS_JA[l.status] ?? l.status}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>

            {diagnoses.length > 0 && <TrendChart responses={[...diagnoses].reverse()} />}
          </div>
        )}

        {/* ── カルテ（日次＋3か月ビジョン）── */}
        {tab === "karte" && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold text-slate-900">日次カルテ（現状＋今日/今週すべきこと）</h2>
                  <p className="text-xs text-slate-500">
                    {dailyKarte ? `更新 ${new Date(dailyKarte.generated_at).toLocaleString("ja-JP")}` : "まだ生成されていません"}
                  </p>
                </div>
                <button onClick={regenerateKarte} disabled={karteBusy}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40">
                  {karteBusy ? "生成中…" : dailyKarte ? "再生成" : "カルテを生成"}
                </button>
              </div>
              <style>{`
                #student-karte h2 { font-size:1rem; font-weight:700; margin:16px 0 6px; padding:6px 12px; background:#f5f3ff; border-left:4px solid #7c3aed; color:#3730a3; border-radius:0 6px 6px 0; }
                #student-karte p { line-height:1.85; font-size:0.9rem; color:#374151; margin:4px 0; }
                #student-karte ul { padding-left:1.4rem; margin:4px 0; }
                #student-karte li { line-height:1.8; font-size:0.9rem; color:#374151; }
                #student-karte .meta { color:#64748b; font-size:0.8rem; }
                #student-karte .empty { color:#94a3b8; }
              `}</style>
              {dailyKarte?.karte_html ? (
                <div id="student-karte" dangerouslySetInnerHTML={{ __html: sanitizeHtml(dailyKarte.karte_html) }} />
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                  「カルテを生成」を押すと、3か月ビジョン・教材進捗・報告書・保護者要望から今日/今週やることを自動でまとめます。
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
              <h2 className="mb-1 font-bold text-slate-900">毎日のTODO（今日〜今週）</h2>
              <p className="mb-3 text-xs text-slate-500">3か月ビジョンから自動生成。生徒がチェックします（ここは閲覧のみ）。</p>
              {dailyTasks.length === 0 ? (
                <p className="text-sm text-slate-400">この期間のTODOはありません（3か月ビジョンを作成すると生成されます）。</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(dailyTasks.reduce<Record<string, DailyTaskRow[]>>((acc, t) => { (acc[t.task_date] ??= []).push(t); return acc; }, {})).map(([date, items]) => (
                    <div key={date}>
                      <p className="mb-1 text-xs font-semibold text-slate-500">{taskDateLabel(date)}</p>
                      <ul className="space-y-1">
                        {items.map((t) => (
                          <li key={t.id} className="flex items-center gap-2 text-sm">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${t.done ? "bg-emerald-400" : "bg-slate-300"}`} />
                            <span className={t.done ? "text-slate-400 line-through" : "text-slate-700"}>{t.content}</span>
                            {t.subject && <span className="text-xs text-slate-400">· {t.subject}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Card title="3か月ビジョン（北極星）" link={{ href: "/teacher/dashboard/karte", label: "ビジョン画面 →" }}>
              {karte.length === 0 ? (
                <p className="text-xs text-slate-400">まだ3か月ビジョンはありません</p>
              ) : (
                <ul className="space-y-2">
                  {karte.slice(0, 5).map((k) => (
                    <li key={k.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <p className="truncate font-semibold text-slate-900">{k.subject}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          k.status === "shared" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}>{k.status === "shared" ? "共有済" : "下書き"}</span>
                      </div>
                      <p className="mt-0.5 text-slate-500">{k.created_at.slice(0, 10)} ・ {k.grade}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {/* ── 学習記録（報告書・進捗・診断）── */}
        {tab === "learning" && (
          <div className="space-y-6">
            <Card title="教材進捗（何をどこまで）" link={{ href: "/teacher/dashboard/progress", label: "進捗を入力 →" }}>
              {progress.length === 0 ? (
                <p className="text-xs text-slate-400">まだ進捗の記録はありません</p>
              ) : (
                <ul className="space-y-2">
                  {progress.slice(0, 6).map((p) => (
                    <li key={p.id} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                      <span className="mt-0.5 shrink-0 text-slate-400">{p.lesson_date.slice(5)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">
                          {p.textbook}{p.progress_where && <span className="font-normal text-slate-500"> ／ {p.progress_where}</span>}
                        </p>
                        {p.comment && <p className="mt-0.5 line-clamp-1 text-slate-500">{p.comment}</p>}
                      </div>
                      {p.understanding && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${UNDERSTAND[p.understanding].cls}`}>
                          {UNDERSTAND[p.understanding].label}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="報告書" link={{ href: "/teacher/dashboard/reports", label: "報告書を作成 →" }}>
              {reports.length === 0 ? (
                <p className="text-xs text-slate-400">まだ報告書はありません</p>
              ) : (
                <ul className="space-y-2">
                  {reports.slice(0, 5).map((r) => (
                    <li key={r.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <p className="truncate font-semibold text-slate-900">{r.test_title}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          r.status === "sent" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}>{r.status === "sent" ? "送信済" : "下書き"}</span>
                      </div>
                      <p className="mt-0.5 text-slate-500">{r.created_at.slice(0, 10)} ・ {r.test_subject ?? "—"} ・ {r.percentage ?? "—"}%</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="多層診断" link={{ href: "/teacher/dashboard/diagnosis", label: "診断画面 →" }}>
              {diagnoses.length === 0 ? (
                <p className="text-xs text-slate-400">まだ診断はありません</p>
              ) : (
                <ul className="space-y-2">
                  {diagnoses.slice(0, 5).map((d) => (
                    <li key={d.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <p className="truncate font-semibold text-slate-900">{d.subject ?? "—"}</p>
                        <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                          {d.status === "pending" ? "未分析" : d.status === "analyzed" ? "分析済" : "承認済"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-slate-500">{d.created_at.slice(0, 10)} ・ 正答率 {d.test_percentage ?? "—"}%</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {/* ── やりとり（保護者メッセージ）── */}
        {tab === "contact" && (
          <Card title="保護者とのメッセージ（最新）" link={{ href: "/teacher/dashboard/messages", label: "メッセージ画面 →" }}>
            {messages.length === 0 ? (
              <p className="text-xs text-slate-400">記録なし</p>
            ) : (
              <ul className="space-y-2">
                {messages.map((m) => {
                  const fromTeacher = m.direction === "teacher_to_parent";
                  return (
                    <li key={m.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-semibold text-slate-900">
                          {fromTeacher ? "→ " : "← "}{m.subject ?? "(件名なし)"}
                        </p>
                        <span className="shrink-0 text-slate-400">{m.created_at.slice(0, 10)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-slate-500">{m.message}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

function Card({ title, link, children }: { title: string; link?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {link && (
          <Link href={link.href} className="text-xs font-medium text-indigo-600 hover:underline">
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function TrendChart({ responses }: { responses: DiagRow[] }) {
  const points = responses.filter((r) =>
    r.habit_score != null || r.method_score != null || r.verbal_score != null || r.skill_score != null
  );
  if (points.length < 2) return null;

  const width = 720, height = 200, padL = 36, padR = 16, padT = 16, padB = 36;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const xAt = (i: number) => padL + (i * innerW) / (points.length - 1);
  const yAt = (v: number) => padT + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;
  const series = [
    { key: "habit_score",  label: "学習習慣", color: "#6366f1" },
    { key: "method_score", label: "学習方法", color: "#0ea5e9" },
    { key: "verbal_score", label: "言語力",   color: "#10b981" },
    { key: "skill_score",  label: "技能",     color: "#f59e0b" },
  ] as const;
  const pathFor = (key: typeof series[number]["key"]) => {
    const segs: string[] = [];
    let started = false;
    points.forEach((p, i) => {
      const v = p[key];
      if (v == null) { started = false; return; }
      segs.push(`${started ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`);
      started = true;
    });
    return segs.join(" ");
  };
  const dotsFor = (key: typeof series[number]["key"]) =>
    points.map((p, i) => ({ v: p[key], i }))
      .filter((d): d is { v: number; i: number } => d.v != null);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">診断スコア推移</h2>
        <div className="flex flex-wrap gap-3 text-xs">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-3 rounded" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
          {[0, 25, 50, 75, 100].map((g) => (
            <g key={g}>
              <line x1={padL} x2={width - padR} y1={yAt(g)} y2={yAt(g)} stroke="#e2e8f0" strokeDasharray="2 3" />
              <text x={padL - 6} y={yAt(g) + 3} fontSize="9" fill="#94a3b8" textAnchor="end">{g}</text>
            </g>
          ))}
          {points.map((p, i) => (
            <text key={p.id} x={xAt(i)} y={height - 12} fontSize="9" fill="#94a3b8" textAnchor="middle">
              {p.created_at.slice(5, 10)}
            </text>
          ))}
          {series.map((s) => (
            <g key={s.key}>
              <path d={pathFor(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {dotsFor(s.key).map((d) => (
                <circle key={`${s.key}-${d.i}`} cx={xAt(d.i)} cy={yAt(d.v)} r={3} fill={s.color} />
              ))}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
