"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import { showToast } from "@/lib/toast";
import { Skeleton } from "@/components/Skeleton";
import { ECON } from "@/lib/economyFeatures";
import { FEATURES } from "@/lib/features";
import { resolveEnabled, type ModuleSettingRow } from "@/lib/modules";
import { StockChart, type StockPoint } from "@/components/StockChart";
import {
  Badge, Callout, Card, CountBadge, EmptyState,
  LinkButton, PageHeader, SectionTitle, Spinner, cx,
} from "@/components/ui";

/* ──────────────────────────────────────────────────────────
   講師の今日のホーム
     ① 教室カード（クリックで選択）
     ② 選んだ教室の「今日来る生徒」を時間順に列挙
        └ 使用中の教材（textbook_progress・機械的に列挙）
        └ 今日詰めること（teaching_focus・AI選定／無ければカルテで代替）
        └ そのまま報告書を書くボタン
     ③ 教室カードの下に「最近お休みしている生徒」
   ────────────────────────────────────────────────────────── */

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];
const LAST_SCHOOL_KEY = "teacher.home.schoolId";

type SchoolRow = { id: string; name: string };

type FocusSource = "progress" | "report" | "parent" | "diagnosis" | "collab";
type FocusItem = {
  action: string; why: string; source: FocusSource;
  sourceDate: string | null; priority: "high" | "normal";
};
type FocusJson = { headline: string; items: FocusItem[] };

const SOURCE_LABEL: Record<FocusSource, string> = {
  progress: "教材進捗", report: "報告書", parent: "保護者", diagnosis: "多層診断", collab: "講師連携",
};
const SOURCE_ICON: Record<FocusSource, string> = {
  progress: "📘", report: "📝", parent: "👪", diagnosis: "📊", collab: "🤝",
};

type TextbookNow = {
  subject: string | null; textbook: string; where: string | null;
  understanding: string | null; lessonDate: string;
};

type TodayStudent = {
  id: string; name: string; grade: string; schoolId: string | null;
  firstAt: string | null;          // 授業予定の時刻（出席曜日だけの子は null）
  subjects: string[];
  textbooks: TextbookNow[];        // いま使っている教材
  focus: FocusJson | null;         // AI選定
  karteCautions: string | null;    // AI未生成のときの代替
  kartePace: string | null;
  lastProgress: string | null;
  reportToday: boolean;            // 今日ぶんの報告書を出したか
};

type RestingStudent = {
  id: string; name: string; grade: string; schoolId: string | null;
  lastSeen: string | null;         // 最後に記録が付いた日
  missedCount: number;             // 来るはずだったのに記録が無い回数
  canceledCount: number;           // 授業が「中止」になった回数
};

type Counts = {
  pendingReschedules: number; unreadParentMessages: number; unreadStudentMessages: number;
  pendingDiagnoses: number; draftReports: number; concerns: number;
  economyApprovals: number; economyVoices: number; economyReferrals: number;
};

type StockHist = {
  price: number; prev_price: number | null; calculated_at: string;
  study_score: number | null; contrib_score: number | null;
  growth_score: number | null; penalty_score: number | null;
};
type StockData = {
  school_name: string | null;
  current_price: number;
  history: StockHist[];
};
// どの教室ぶんを読んだかを一緒に持つ。教室を切り替えた瞬間に
// 前の教室の株価が一瞬見えるのを防ぐ（描画側でIDが一致するかを見る）。
type StockState = { schoolId: string; data: StockData | null };

const UNDERSTAND: Record<string, { label: string; tone: "positive" | "neutral" | "caution" }> = {
  good:   { label: "◎手応えあり", tone: "positive" },
  normal: { label: "○ふつう",     tone: "neutral" },
  weak:   { label: "△不安",       tone: "caution" },
};

const keyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };

function daysSince(date: string | null): number | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor((startOfToday().getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000);
}

/** 出席曜日から「直近days日で来るはずだった日」を数える */
function expectedVisits(attendanceDays: string[] | null, days: number): string[] {
  if (!attendanceDays || attendanceDays.length === 0) return [];
  const out: string[] = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (attendanceDays.includes(WEEKDAY[d.getDay()])) out.push(keyOf(d));
  }
  return out;
}

export default function TeacherDashboardPage() {
  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
  const todayKey = keyOf(new Date());

  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [students, setStudents] = useState<TodayStudent[]>([]);
  const [resting, setResting] = useState<RestingStudent[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [failedNotifications, setFailedNotifications] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyFocus, setBusyFocus] = useState<string | null>(null);
  // 塾内経済は既定OFFのモジュール。ONの塾でだけ株価を出す。
  const [stockEnabled, setStockEnabled] = useState(false);
  const [stockState, setStockState] = useState<StockState | null>(null);

  /* ── 教室一覧＋最後に見ていた教室＋モジュール解決 ────────── */
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const [{ data: schoolRows }, { data: me }] = await Promise.all([
        supabase.from("schools").select("id, name").order("name"),
        session?.user?.email
          ? supabase.from("teachers").select("school_id").eq("email", session.user.email).maybeSingle()
          : Promise.resolve({ data: null } as { data: { school_id: string | null } | null }),
      ]);
      const list = (schoolRows as SchoolRow[]) ?? [];
      setSchools(list);

      const stored = typeof window !== "undefined" ? localStorage.getItem(LAST_SCHOOL_KEY) : null;
      const initial =
        (stored && list.some((s) => s.id === stored) && stored) ||
        (me?.school_id && list.some((s) => s.id === me.school_id) && me.school_id) ||
        null;
      setSchoolId(initial);

      // 塾内経済モジュールが自分のグループで有効か（ナビと同じ解決を使う）
      let groupName: string | null = null;
      if (me?.school_id) {
        const { data: sc } = await supabase
          .from("schools").select("group_name").eq("id", me.school_id).maybeSingle();
        groupName = sc?.group_name ?? null;
      }
      const { data: ms } = await supabase.from("module_settings").select("scope, module_key, enabled");
      setStockEnabled(resolveEnabled((ms as ModuleSettingRow[]) ?? [], groupName).class_stock);
    })();
  }, []);

  /* ── 選んだ教室の株価推移 ─────────────────────────────── */
  useEffect(() => {
    if (!stockEnabled || !schoolId) return;
    const sid = schoolId;
    let cancelled = false;
    (async () => {
      let data: StockData | null = null;
      try {
        const res = await authFetch(`/api/stock/chart?school_id=${encodeURIComponent(sid)}&limit=26`);
        const j = await res.json();
        // class-stock-setup.sql 未実行など、取れなければ黙って出さない（ホームを止めない）
        if (res.ok && !j.error) data = j as StockData;
      } catch {
        data = null;
      }
      if (!cancelled) setStockState({ schoolId: sid, data });
    })();
    return () => { cancelled = true; };
  }, [stockEnabled, schoolId]);

  const selectSchool = (id: string) => {
    const next = schoolId === id ? null : id;   // もう一度押したら選択解除
    setSchoolId(next);
    setOpenId(null);
    if (typeof window !== "undefined") {
      if (next) localStorage.setItem(LAST_SCHOOL_KEY, next);
      else localStorage.removeItem(LAST_SCHOOL_KEY);
    }
  };

  /* ── 本体の読み込み ───────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    const todayStart = startOfToday().toISOString();
    const todayEnd = endOfToday().toISOString();
    const todayLabel = WEEKDAY[new Date().getDay()];

    /* A. 今日来る生徒 = 授業予定がある人 ∪ 出席曜日が今日の人 */
    const [{ data: lessonRows }, { data: attStudents }] = await Promise.all([
      supabase.from("lessons")
        .select("student_id, subject, scheduled_at, students(name, grade, school_id)")
        .gte("scheduled_at", todayStart).lte("scheduled_at", todayEnd).neq("status", "canceled")
        .order("scheduled_at", { ascending: true }),
      supabase.from("students")
        .select("id, name, grade, school_id, attendance_days")
        .contains("attendance_days", [todayLabel]),
    ]);

    const map = new Map<string, TodayStudent>();
    const blank = (id: string, name: string, grade: string, sid: string | null): TodayStudent => ({
      id, name, grade, schoolId: sid, firstAt: null, subjects: [],
      textbooks: [], focus: null, karteCautions: null, kartePace: null,
      lastProgress: null, reportToday: false,
    });

    for (const l of (lessonRows ?? []) as {
      student_id: string | null; subject: string | null; scheduled_at: string;
      students: { name: string; grade: string; school_id: string | null }
        | { name: string; grade: string; school_id: string | null }[] | null;
    }[]) {
      if (!l.student_id) continue;
      const stu = Array.isArray(l.students) ? l.students[0] : l.students;
      if (!map.has(l.student_id)) {
        const e = blank(l.student_id, stu?.name ?? "—", stu?.grade ?? "", stu?.school_id ?? null);
        e.firstAt = l.scheduled_at;
        map.set(l.student_id, e);
      }
      const e = map.get(l.student_id)!;
      if (l.subject && !e.subjects.includes(l.subject)) e.subjects.push(l.subject);
    }
    for (const s of (attStudents ?? []) as
      { id: string; name: string; grade: string; school_id: string | null }[]) {
      if (!map.has(s.id)) map.set(s.id, blank(s.id, s.name, s.grade, s.school_id));
    }

    const ids = [...map.keys()];
    if (ids.length > 0) {
      const [{ data: progRows }, { data: focusRows }, { data: karteRows }, { data: repRows }] =
        await Promise.all([
          supabase.from("textbook_progress")
            .select("student_id, subject, textbook, progress_where, understanding, lesson_date")
            .in("student_id", ids).order("lesson_date", { ascending: false }),
          supabase.from("teaching_focus")
            .select("student_id, focus_json").eq("focus_date", todayKey).in("student_id", ids),
          supabase.from("student_karte").select("student_id, karte_json").in("student_id", ids),
          supabase.from("lesson_reports")
            .select("student_id, created_at").in("student_id", ids).gte("created_at", todayStart),
        ]);

      // 教材は「科目ごとの最新1件」だけを、いま使っているものとして出す
      const seen = new Set<string>();
      for (const p of (progRows ?? []) as {
        student_id: string; subject: string | null; textbook: string;
        progress_where: string | null; understanding: string | null; lesson_date: string;
      }[]) {
        const e = map.get(p.student_id); if (!e) continue;
        if (!e.lastProgress) e.lastProgress = p.lesson_date;
        const k = `${p.student_id}::${p.subject ?? ""}::${p.textbook}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (e.textbooks.length < 4) {
          e.textbooks.push({
            subject: p.subject, textbook: p.textbook, where: p.progress_where,
            understanding: p.understanding, lessonDate: p.lesson_date,
          });
        }
      }
      for (const f of (focusRows ?? []) as { student_id: string; focus_json: FocusJson | null }[]) {
        const e = map.get(f.student_id); if (e) e.focus = f.focus_json;
      }
      for (const k of (karteRows ?? []) as {
        student_id: string; karte_json: { cautions?: string; textbookPace?: string } | null;
      }[]) {
        const e = map.get(k.student_id); if (!e) continue;
        e.karteCautions = k.karte_json?.cautions ?? null;
        e.kartePace = k.karte_json?.textbookPace ?? null;
      }
      for (const r of (repRows ?? []) as { student_id: string }[]) {
        const e = map.get(r.student_id); if (e) e.reportToday = true;
      }
    }

    setStudents([...map.values()].sort((a, b) => {
      if (a.firstAt && b.firstAt) return a.firstAt.localeCompare(b.firstAt);
      if (a.firstAt) return -1;
      if (b.firstAt) return 1;
      return a.name.localeCompare(b.name, "ja");
    }));

    /* B. 最近お休みしている生徒
         「来るはずだった日（出席曜日）に記録が無い」＋「授業が中止になった」で拾う。
         あくまで記録からの推定なので、UI にもそう書く。 */
    const since = keyOf(new Date(Date.now() - 21 * 86_400_000));
    const [{ data: allStudents }, { data: recentProg }, { data: canceled }] = await Promise.all([
      supabase.from("students").select("id, name, grade, school_id, attendance_days"),
      supabase.from("textbook_progress").select("student_id, lesson_date").gte("lesson_date", since),
      supabase.from("lessons")
        .select("student_id, scheduled_at").eq("status", "canceled")
        .gte("scheduled_at", new Date(Date.now() - 21 * 86_400_000).toISOString()),
    ]);

    const seenDates = new Map<string, Set<string>>();
    for (const p of (recentProg ?? []) as { student_id: string; lesson_date: string }[]) {
      if (!seenDates.has(p.student_id)) seenDates.set(p.student_id, new Set());
      seenDates.get(p.student_id)!.add(p.lesson_date);
    }
    const cancelCount = new Map<string, number>();
    for (const c of (canceled ?? []) as { student_id: string | null }[]) {
      if (c.student_id) cancelCount.set(c.student_id, (cancelCount.get(c.student_id) ?? 0) + 1);
    }

    const rest: RestingStudent[] = [];
    for (const s of (allStudents ?? []) as {
      id: string; name: string; grade: string; school_id: string | null; attendance_days: string[] | null;
    }[]) {
      const expected = expectedVisits(s.attendance_days, 21);
      const got = seenDates.get(s.id) ?? new Set<string>();
      const missed = expected.filter((d) => !got.has(d)).length;
      const canceledN = cancelCount.get(s.id) ?? 0;
      // 2回以上空けている、または中止が2回以上。1回はただの欠席なので拾わない。
      if (missed < 2 && canceledN < 2) continue;
      const lastSeen = [...got].sort().pop() ?? null;
      rest.push({
        id: s.id, name: s.name, grade: s.grade, schoolId: s.school_id,
        lastSeen, missedCount: missed, canceledCount: canceledN,
      });
    }
    rest.sort((a, b) => (b.missedCount + b.canceledCount) - (a.missedCount + a.canceledCount));
    setResting(rest);

    /* C. さばくこと */
    const [
      { count: pendingReschedules }, { count: unreadParent }, { count: unreadStudent },
      { count: pendingDiagnoses }, { count: draftReports }, { count: concerns },
      { count: ecoApprovals }, { count: ecoVoices }, { count: ecoReferrals },
    ] = await Promise.all([
      supabase.from("reschedule_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("parent_messages").select("*", { count: "exact", head: true }).eq("status", "unread").eq("direction", "parent_to_teacher"),
      supabase.from("student_messages").select("*", { count: "exact", head: true }).eq("status", "unread").eq("direction", "student_to_teacher"),
      supabase.from("questionnaire_responses").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("lesson_reports").select("*", { count: "exact", head: true }).eq("status", "draft"),
      supabase.from("collaboration_tasks").select("*", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("reward_exchanges").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("shareholder_voices").select("*", { count: "exact", head: true }).neq("status", "done"),
      supabase.from("referral_rewards").select("*", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    setCounts({
      pendingReschedules: pendingReschedules ?? 0,
      unreadParentMessages: unreadParent ?? 0,
      unreadStudentMessages: unreadStudent ?? 0,
      pendingDiagnoses: pendingDiagnoses ?? 0,
      draftReports: draftReports ?? 0,
      concerns: concerns ?? 0,
      economyApprovals: ecoApprovals ?? 0,
      economyVoices: ecoVoices ?? 0,
      economyReferrals: ecoReferrals ?? 0,
    });

    const past24h = new Date(Date.now() - 86_400_000).toISOString();
    const { count: failedCount } = await supabase.from("notification_log")
      .select("*", { count: "exact", head: true }).eq("status", "failed").gte("created_at", past24h);
    setFailedNotifications(failedCount ?? 0);

    setLoading(false);
  }, [todayKey]);

  useEffect(() => { load(); }, [load]);

  /* ── 「今日詰めること」を作り直す ──────────────────────── */
  const regenerateFocus = async (id: string, name: string) => {
    setBusyFocus(id);
    try {
      const res = await authFetch("/api/teaching-focus/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: id }),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error, "error"); return; }
      if (data.noMaterial > 0) {
        showToast(`${name} は材料（進捗・報告書・診断など）がまだありません`, "error");
        return;
      }
      showToast(`${name} の「今日詰めること」を更新しました`, "success");
      await load();
    } catch (e) {
      showToast("生成に失敗しました: " + String(e), "error");
    } finally {
      setBusyFocus(null);
    }
  };

  /* ── 教室ごとの集計 ───────────────────────────────────── */
  const perSchool = useMemo(() => {
    const m = new Map<string, { today: number; noReport: number; staleProgress: number; resting: number }>();
    for (const s of schools) m.set(s.id, { today: 0, noReport: 0, staleProgress: 0, resting: 0 });
    for (const st of students) {
      if (!st.schoolId) continue;
      const e = m.get(st.schoolId); if (!e) continue;
      e.today++;
      if (!st.reportToday) e.noReport++;
      const d = daysSince(st.lastProgress);
      if (d == null || d >= 7) e.staleProgress++;
    }
    for (const r of resting) {
      if (!r.schoolId) continue;
      const e = m.get(r.schoolId); if (e) e.resting++;
    }
    return m;
  }, [schools, students, resting]);

  /* ── 株価チャート用の派生値 ───────────────────────────── */
  // 読み込み済みのものが「今選んでいる教室」のものであるときだけ使う
  const stockReady = !!schoolId && stockState?.schoolId === schoolId;
  const stock = stockReady ? stockState!.data : null;
  const stockPoints: StockPoint[] = useMemo(
    () => (stock?.history ?? []).map((h) => ({
      price: h.price,
      label: new Date(h.calculated_at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }),
    })),
    [stock],
  );
  const stockLatest = stock?.history?.[stock.history.length - 1] ?? null;
  const stockDelta =
    stockLatest && stockLatest.prev_price != null
      ? stockLatest.price - stockLatest.prev_price
      : null;

  const shownStudents = schoolId ? students.filter((s) => s.schoolId === schoolId) : [];
  const shownResting = schoolId ? resting.filter((r) => r.schoolId === schoolId) : resting;
  const selectedSchool = schools.find((s) => s.id === schoolId) ?? null;
  const unassigned = students.filter((s) => !s.schoolId).length;

  const inbox = counts ? [
    { label: "保護者からの未読", count: counts.unreadParentMessages, href: "/teacher/dashboard/messages" },
    { label: "生徒からの未読", count: counts.unreadStudentMessages, href: "/teacher/dashboard/messages" },
    { label: "申請中の振替", count: counts.pendingReschedules, href: FEATURES.separateSchedulePages ? "/teacher/dashboard/reschedules" : "/teacher/dashboard/calendar" },
    { label: "未分析の診断", count: counts.pendingDiagnoses, href: "/teacher/dashboard/diagnosis" },
    { label: "未送信の報告書", count: counts.draftReports, href: "/teacher/dashboard/reports" },
    { label: "気がかりな生徒", count: counts.concerns, href: "/teacher/dashboard/collaboration" },
    { label: "報酬交換の承認", count: counts.economyApprovals, href: "/teacher/dashboard/economy" },
    ...(ECON.voice ? [{ label: "株主の声", count: counts.economyVoices, href: "/teacher/dashboard/economy" }] : []),
    ...(ECON.referral ? [{ label: "友達紹介の申請", count: counts.economyReferrals, href: "/teacher/dashboard/economy" }] : []),
  ].filter((i) => i.count > 0) : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-9">
      <PageHeader
        eyebrow={today}
        title="今日のホーム"
        description="教室を選ぶと、今日来る生徒と「その子に今日やること」が出ます。"
      />

      {failedNotifications > 0 && (
        <div className="mb-6">
          <Callout
            tone="critical"
            title={`直近24時間に通知の送信失敗が ${failedNotifications} 件あります`}
            action={
              <LinkButton href="/teacher/dashboard/notifications?status=failed" variant="secondary" size="sm">
                通知ログで確認
              </LinkButton>
            }
          />
        </div>
      )}

      {/* ── ① 教室カード ─────────────────────────────── */}
      <section className="mb-8">
        <SectionTitle>教室をえらぶ</SectionTitle>
        {loading && schools.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 w-full rounded-card" />)}
          </div>
        ) : schools.length === 0 ? (
          <EmptyState
            title="教室が登録されていません"
            description="生徒一覧・登録から教室を追加すると、ここに並びます。"
            action={<LinkButton href="/teacher/dashboard/schools">教室を登録する</LinkButton>}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {schools.map((s) => {
              const st = perSchool.get(s.id) ?? { today: 0, noReport: 0, staleProgress: 0, resting: 0 };
              const active = schoolId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => selectSchool(s.id)}
                  aria-pressed={active}
                  className={cx(
                    "rounded-card border p-5 text-left transition duration-200 ease-out-soft",
                    active
                      ? "border-brand-600 bg-brand-50 shadow-card-hover ring-1 ring-brand-600"
                      : "border-line bg-surface shadow-card hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={cx("font-bold", active ? "text-brand-800" : "text-ink")}>{s.name}</p>
                    {active && <Badge tone="brand">表示中</Badge>}
                  </div>
                  <p className="mt-2 flex items-baseline gap-1.5">
                    <span data-numeric className={cx("text-3xl font-bold", active ? "text-brand-700" : "text-ink")}>
                      {st.today}
                    </span>
                    <span className="text-xs text-ink-faint">人が今日来ます</span>
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {st.noReport > 0 && <Badge tone="caution">報告書まだ {st.noReport}</Badge>}
                    {st.staleProgress > 0 && <Badge tone="neutral">進捗が空き {st.staleProgress}</Badge>}
                    {st.resting > 0 && <Badge tone="critical">お休み気味 {st.resting}</Badge>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {unassigned > 0 && (
          <p className="mt-2 text-xs text-ink-faint">
            ※ 教室が未設定の生徒が {unassigned} 人います（どの教室カードにも出ません）。
          </p>
        )}
      </section>

      {/* ── ①.5 選んだ教室の株価推移（塾内経済がONの塾だけ） ── */}
      {stockEnabled && schoolId && (
        <section className="mb-8">
          <SectionTitle
            action={
              <Link href="/teacher/dashboard/economy" className="text-sm font-semibold text-brand-600 hover:underline">
                塾内経済を開く →
              </Link>
            }
          >
            {selectedSchool ? `${selectedSchool.name}・自塾株の推移` : "自塾株の推移"}
          </SectionTitle>

          {!stockReady ? (
            <Skeleton className="h-56 w-full rounded-card" />
          ) : !stock ? (
            <Card>
              <p className="text-sm text-ink-faint">
                株価の記録がまだありません。週次の株価計算が動くと、ここに推移が出ます。
              </p>
            </Card>
          ) : (
            <Card padding="lg">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-ink-faint">現在の株価</p>
                  <p className="mt-1 flex items-baseline gap-2">
                    <span data-numeric className="text-4xl font-bold tracking-tight text-ink">
                      {stock.current_price.toLocaleString()}
                    </span>
                    <span className="text-sm font-semibold text-ink-faint">AC</span>
                    {stockDelta != null && stockDelta !== 0 && (
                      <span
                        data-numeric
                        className={cx(
                          "rounded-pill px-2 py-0.5 text-xs font-bold",
                          stockDelta > 0
                            ? "bg-positive-50 text-positive-700"
                            : "bg-critical-50 text-critical-700",
                        )}
                      >
                        {stockDelta > 0 ? "▲" : "▼"} {Math.abs(stockDelta).toLocaleString()}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">
                    生徒の学習・貢献・成長で毎週動きます（直近{stock.history.length}回）
                  </p>
                </div>

                {/* 直近の内訳。何が効いて動いたのかが分かるように */}
                {stockLatest && (
                  <dl className="flex flex-wrap gap-1.5">
                    {([
                      ["学習", stockLatest.study_score, "positive"],
                      ["貢献", stockLatest.contrib_score, "brand"],
                      ["成長", stockLatest.growth_score, "positive"],
                      ["減点", stockLatest.penalty_score, "critical"],
                    ] as const).map(([label, v, tone]) =>
                      v == null ? null : (
                        <div key={label} className="rounded-field bg-canvas-sunken px-2.5 py-1.5 text-center">
                          <dt className="text-[0.6875rem] font-semibold text-ink-faint">{label}</dt>
                          <dd
                            data-numeric
                            className={cx(
                              "text-sm font-bold",
                              tone === "critical" && v > 0 ? "text-critical-700"
                                : tone === "brand" ? "text-brand-700"
                                : "text-ink",
                            )}
                          >
                            {v.toLocaleString()}
                          </dd>
                        </div>
                      ),
                    )}
                  </dl>
                )}
              </div>

              <StockChart points={stockPoints} />
            </Card>
          )}
        </section>
      )}

      {/* ── ② 選んだ教室の今日の生徒 ──────────────────── */}
      <section className="mb-8">
        <SectionTitle>
          {selectedSchool ? `${selectedSchool.name}・今日来る生徒（${shownStudents.length}人）` : "今日来る生徒"}
        </SectionTitle>

        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-card" />)}
          </div>
        ) : !schoolId ? (
          <EmptyState
            icon="🏫"
            title="上の教室カードを選んでください"
            description="選んだ教室の、今日来る生徒とその子にやることが並びます。"
          />
        ) : shownStudents.length === 0 ? (
          <EmptyState
            icon="🗓️"
            title="この教室に今日来る生徒がいません"
            description="生徒管理で「出席曜日」を入れると、その曜日に自動でここへ並びます。"
            action={<LinkButton href="/teacher/dashboard/schools">出席曜日を入力する</LinkButton>}
          />
        ) : (
          <div className="space-y-2.5">
            {shownStudents.map((s) => (
              <StudentRow
                key={s.id}
                s={s}
                open={openId === s.id}
                onToggle={() => setOpenId(openId === s.id ? null : s.id)}
                busy={busyFocus === s.id}
                onRegenerate={() => regenerateFocus(s.id, s.name)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── ③ 最近お休みしている生徒 ──────────────────── */}
      <section className="mb-8">
        <SectionTitle>
          最近お休みしている生徒{!loading && shownResting.length > 0 && `（${shownResting.length}人）`}
        </SectionTitle>
        {loading ? (
          <Skeleton className="h-20 w-full rounded-card" />
        ) : shownResting.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-faint">
              {schoolId ? "この教室では、続けてお休みしている生徒はいません。" : "続けてお休みしている生徒はいません。"}
            </p>
          </Card>
        ) : (
          <Card padding="sm">
            <p className="mb-3 text-xs leading-5 text-ink-faint">
              出席曜日に教材進捗の記録が付いていない回数と、授業が「中止」になった回数からの<strong>推定</strong>です
              （直近3週間）。記録の入れ忘れも混ざります。
            </p>
            <div className="flex flex-wrap gap-2">
              {shownResting.map((r) => {
                const gap = daysSince(r.lastSeen);
                return (
                  <Link
                    key={r.id}
                    href={`/teacher/dashboard/students/${r.id}`}
                    className="group flex items-center gap-2 rounded-pill border border-critical-200 bg-critical-50 py-1.5 pl-3.5 pr-3 text-sm transition hover:border-critical-600/40 hover:bg-critical-100"
                  >
                    <span className="font-semibold text-critical-700">{r.name}</span>
                    <span className="text-xs text-critical-600">{r.grade}</span>
                    <span data-numeric className="text-xs text-critical-600">
                      {r.missedCount >= 2 && `${r.missedCount}回分空き`}
                      {r.missedCount >= 2 && r.canceledCount >= 2 && " / "}
                      {r.canceledCount >= 2 && `中止${r.canceledCount}回`}
                      {gap != null && `・最終 ${gap}日前`}
                      {gap == null && "・記録なし"}
                    </span>
                  </Link>
                );
              })}
            </div>
          </Card>
        )}
      </section>

      {/* ── さばくこと ────────────────────────────────── */}
      <section>
        <SectionTitle>今日さばくこと</SectionTitle>
        {loading ? (
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-32 rounded-pill" />)}
          </div>
        ) : inbox.length === 0 ? (
          <p className="rounded-card border border-positive-200 bg-positive-50 px-4 py-3 text-sm font-medium text-positive-700">
            今さばくものはありません 🎉
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {inbox.map((i) => (
              <Link key={i.label} href={i.href}
                className="flex items-center gap-2 rounded-pill border border-critical-200 bg-critical-50 py-2 pl-4 pr-2 text-sm font-semibold text-critical-700 transition duration-150 hover:border-critical-600/40 hover:bg-critical-100">
                {i.label}
                <CountBadge count={i.count} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   生徒1人の行。閉じているときは名前・時刻・要点だけ。
   開くと 使用教材 / 今日詰めること / 操作。
   ────────────────────────────────────────────────────────── */
function StudentRow({
  s, open, onToggle, busy, onRegenerate,
}: {
  s: TodayStudent; open: boolean; onToggle: () => void;
  busy: boolean; onRegenerate: () => void;
}) {
  const stale = daysSince(s.lastProgress);
  const isStale = stale == null || stale >= 7;
  const items = s.focus?.items ?? [];
  const time = s.firstAt
    ? new Date(s.firstAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
    : "出席予定";

  return (
    <Card padding="none" className="overflow-hidden">
      {/* 見出し行（クリックで開閉） */}
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-canvas/70 sm:px-5"
      >
        <span
          data-numeric
          className={cx(
            "w-16 shrink-0 text-sm font-bold tabular-nums",
            s.firstAt ? "text-brand-700" : "text-ink-faint",
          )}
        >
          {time}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-bold text-ink">{s.name}</span>
            <span className="text-xs text-ink-faint">{s.grade}</span>
            {s.subjects.length > 0 && (
              <span className="text-xs text-ink-faint">・{s.subjects.join("・")}</span>
            )}
          </span>
          {/* 閉じていても要点だけは見える */}
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {items.length > 0 ? (
              <Badge tone="brand">やること {items.length}</Badge>
            ) : (
              <Badge tone="neutral">やること未生成</Badge>
            )}
            {!s.reportToday && <Badge tone="caution">報告書まだ</Badge>}
            {isStale && (
              <Badge tone="neutral">進捗{stale == null ? "未入力" : `${stale}日空き`}</Badge>
            )}
            {s.focus?.headline && (
              <span className="truncate text-xs text-ink-muted">{s.focus.headline}</span>
            )}
          </span>
        </span>

        <svg
          className={cx("h-5 w-5 shrink-0 text-ink-faint transition-transform duration-200", open && "rotate-180")}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-line bg-canvas/50 px-4 py-4 sm:px-5">
          {/* 使用中の教材（textbook_progress から機械的に） */}
          <div className="mb-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-ink-faint">いま使っている教材</p>
            {s.textbooks.length === 0 ? (
              <p className="text-sm text-ink-faint">
                教材進捗がまだありません。
                <Link href="/teacher/dashboard/progress" className="ml-1 font-semibold text-brand-600 hover:underline">
                  入力する →
                </Link>
              </p>
            ) : (
              <ul className="space-y-1.5">
                {s.textbooks.map((t, i) => {
                  const u = t.understanding ? UNDERSTAND[t.understanding] : null;
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-2 rounded-field border border-line bg-surface px-3 py-2">
                      <span aria-hidden>📘</span>
                      {t.subject && <span className="text-xs font-semibold text-ink-faint">{t.subject}</span>}
                      <span className="text-sm font-semibold text-ink">{t.textbook}</span>
                      {t.where && <span className="text-sm text-ink-muted">{t.where}</span>}
                      {u && <Badge tone={u.tone}>{u.label}</Badge>}
                      <time data-numeric className="ml-auto text-xs text-ink-faint">{t.lessonDate}</time>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* 今日詰めること */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-faint">今日この授業で詰めること</p>
              <button
                onClick={onRegenerate}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-field bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-40"
              >
                {busy ? <><Spinner className="h-3 w-3" />作成中…</> : items.length > 0 ? "作り直す" : "AIに選ばせる"}
              </button>
            </div>

            {items.length > 0 ? (
              <ul className="space-y-1.5">
                {items.map((it, i) => (
                  <li
                    key={i}
                    className={cx(
                      "rounded-field border px-3 py-2.5",
                      it.priority === "high"
                        ? "border-caution-200 bg-caution-50"
                        : "border-line bg-surface",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {it.priority === "high" && <span className="shrink-0 text-sm" aria-hidden>🔥</span>}
                      <p className="flex-1 text-sm font-semibold leading-6 text-ink">{it.action}</p>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 pl-0 text-xs text-ink-faint">
                      <span aria-hidden>{SOURCE_ICON[it.source]}</span>
                      <span className="font-medium">{SOURCE_LABEL[it.source]}</span>
                      {it.sourceDate && <time data-numeric>{it.sourceDate}</time>}
                      <span>—</span>
                      <span>{it.why}</span>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              // AI未生成でも手ぶらにしない。カルテがあれば代わりに出す。
              <div className="rounded-field border border-dashed border-line-strong bg-surface px-3 py-3">
                {s.karteCautions || s.kartePace ? (
                  <>
                    <p className="mb-1.5 text-xs text-ink-faint">まだAIが選んでいません。カルテの内容を出しています。</p>
                    {s.karteCautions && (
                      <p className="text-sm leading-6 text-ink-muted"><span aria-hidden>⚠️ </span>{s.karteCautions}</p>
                    )}
                    {s.kartePace && (
                      <p className="mt-1 text-sm leading-6 text-ink-muted"><span aria-hidden>📖 </span>{s.kartePace}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-ink-faint">
                    まだ材料（教材進捗・報告書・診断など）が足りません。進捗を入力すると出せるようになります。
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 操作 — 報告書をその場で書ける */}
          <div className="flex flex-wrap gap-2">
            <LinkButton
              href={`/teacher/dashboard/reports?new=1&student=${encodeURIComponent(s.name)}`}
              size="sm"
            >
              報告書を書く
            </LinkButton>
            <LinkButton href="/teacher/dashboard/progress" variant="secondary" size="sm">
              進捗を入力
            </LinkButton>
            <LinkButton href={`/teacher/dashboard/students/${s.id}`} variant="secondary" size="sm">
              操作卓
            </LinkButton>
          </div>
        </div>
      )}
    </Card>
  );
}
