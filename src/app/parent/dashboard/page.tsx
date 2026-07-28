"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Student } from "@/lib/supabase";
import { useSelectedStudentId } from "@/lib/useSelectedStudent";
import { Skeleton } from "@/components/Skeleton";
import {
  Card, CardLink, EmptyState, LinkButton, PageHeader, SectionTitle, cx,
} from "@/components/ui";

type UpcomingLesson = {
  id: string;
  subject: string | null;
  scheduled_at: string;
  status: string;
};

type LatestReport = {
  id: string;
  test_title: string;
  test_subject: string | null;
  percentage: number | null;
  message_to_child: string | null;
  created_at: string;
};

type LatestDiagnosis = {
  id: string;
  subject: string | null;
  test_percentage: number | null;
  created_at: string;
};

type LatestKarte = {
  id: string;
  subject: string;
  grade: string;
  test_percentage: number | null;
  teacher_notes: string | null;
  created_at: string;
};

type Announcement = {
  id: string;
  title: string;
  content: string;
  target_grade: string | null;
  target_school_id: string | null;
  created_at: string;
};

type WeekTask = {
  id: string;
  task_date: string;
  subject: string | null;
  content: string;
  done: boolean;
  sort_order: number;
};

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function ParentOverviewPage() {
  const [selectedId] = useSelectedStudentId();
  const [student, setStudent] = useState<Student | null>(null);
  const [messageToChild, setMessageToChild] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [upcoming, setUpcoming] = useState<UpcomingLesson[]>([]);
  const [latestReport, setLatestReport] = useState<LatestReport | null>(null);
  const [latestDiagnosis, setLatestDiagnosis] = useState<LatestDiagnosis | null>(null);
  const [latestKarte, setLatestKarte] = useState<LatestKarte | null>(null);
  const [weekTasks, setWeekTasks] = useState<WeekTask[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async (sid: string) => {
    setLoading(true);

    const { data: s } = await supabase.from("students").select("*").eq("id", sid).maybeSingle();
    setStudent(s);

    const { data: ann } = await supabase
      .from("announcements")
      .select("id, title, content, target_grade, target_school_id, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    const filtered = (ann ?? []).filter((a) => {
      if (!a.target_grade && !a.target_school_id) return true;
      const gradeOk  = !!a.target_grade     && a.target_grade     === s?.grade;
      const schoolOk = !!a.target_school_id && a.target_school_id === s?.school_id;
      return gradeOk || schoolOk;
    });
    setAnnouncements(filtered.slice(0, 5) as Announcement[]);

    const { count: unreadCount } = await supabase
      .from("parent_messages")
      .select("*", { count: "exact", head: true })
      .eq("student_id", sid)
      .eq("direction", "teacher_to_parent")
      .eq("parent_read", false);
    setUnread(unreadCount ?? 0);

    const nowIso = new Date().toISOString();
    const { data: lessons } = await supabase
      .from("lessons")
      .select("id, subject, scheduled_at, status")
      .eq("student_id", sid)
      .gte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(3);
    setUpcoming((lessons as UpcomingLesson[]) ?? []);

    if (s?.name) {
      const { data: rep } = await supabase
        .from("lesson_reports")
        .select("id, test_title, test_subject, percentage, message_to_child, created_at")
        .eq("student_name", s.name)
        .eq("test_grade", s.grade)
        .eq("status", "sent")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setLatestReport((rep as LatestReport) ?? null);
      setMessageToChild((rep as LatestReport | null)?.message_to_child ?? null);
    }

    const { data: diag } = await supabase
      .from("questionnaire_responses")
      .select("id, subject, test_percentage, created_at")
      .eq("student_id", sid)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatestDiagnosis((diag as LatestDiagnosis) ?? null);

    if (s?.name) {
      const { data: karte } = await supabase
        .from("learning_plans")
        .select("id, subject, grade, test_percentage, teacher_notes, created_at")
        .eq("student_name", s.name)
        .eq("status", "shared")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setLatestKarte((karte as LatestKarte) ?? null);

      // 今週の取り組み（共有された最新カルテの毎日のTODO）
      if (karte?.id) {
        const today = new Date();
        const end = new Date(); end.setDate(end.getDate() + 6);
        const { data: dt } = await supabase
          .from("daily_tasks")
          .select("id, task_date, subject, content, done, sort_order")
          .eq("learning_plan_id", karte.id)
          .gte("task_date", ymd(today)).lte("task_date", ymd(end))
          .order("task_date", { ascending: true })
          .order("sort_order", { ascending: true });
        setWeekTasks((dt as WeekTask[]) ?? []);
      } else {
        setWeekTasks([]);
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedId) fetchAll(selectedId);
  }, [selectedId, fetchAll]);

  if (!selectedId) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <EmptyState
          icon="👦"
          title="お子さまが登録されていません"
          description="アカウントにお子さまがひも付いていません。塾までご連絡ください。"
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-9">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="お子さまの学習状況"
          description={student ? `${student.name} さん（${student.grade}）の最新情報` : "..."}
        />

        {loading ? (
          <div className="grid gap-5">
            <Card padding="lg">
              <Skeleton className="mb-3 h-4 w-32" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="mt-2 h-5 w-3/4" />
            </Card>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[1,2,3,4].map((i) => (
                <Card key={i}><Skeleton className="mb-3 h-4 w-24" /><Skeleton className="h-8 w-16" /></Card>
              ))}
            </div>
            <Card padding="lg">
              <Skeleton className="mb-4 h-6 w-40" />
              {[1,2].map((i) => <Skeleton key={i} className="mb-3 h-16 w-full rounded-card" />)}
            </Card>
          </div>
        ) : (
          <div className="grid gap-5">
            {messageToChild && (
              <section className="rounded-card border border-caution-200 bg-caution-50 p-6">
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="text-xl" aria-hidden>⭐</span>
                  <p className="font-bold text-caution-700">先生からお子さまへのメッセージ</p>
                </div>
                <p className="leading-8 text-ink">{messageToChild}</p>
                {latestReport && (
                  <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-caution-700">
                    <span>{latestReport.created_at.slice(0,10)} の授業報告書より</span>
                    <Link href="/parent/dashboard/reports" className="font-semibold underline underline-offset-2 hover:no-underline">
                      報告書を開く →
                    </Link>
                  </p>
                )}
              </section>
            )}

            {latestKarte && (
              <section className="rounded-card border border-brand-200 bg-brand-50 p-6">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-2.5">
                    <span className="text-xl" aria-hidden>📋</span>
                    <div>
                      <p className="font-bold text-brand-900">3か月ビジョンが共有されました</p>
                      <p className="mt-0.5 text-xs text-brand-700">
                        {latestKarte.created_at.slice(0, 10)} ・ {latestKarte.grade} ・ {latestKarte.subject}
                        {latestKarte.test_percentage != null && (
                          <span className="ml-2 font-semibold">診断 {latestKarte.test_percentage}%</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <LinkButton href="/parent/dashboard/karte" size="sm">
                    3か月ビジョンを開く
                  </LinkButton>
                </div>
                {latestKarte.teacher_notes && (
                  <div className="rounded-field border border-brand-200 bg-surface px-4 py-3">
                    <p className="mb-1 text-xs font-bold text-brand-700">講師より</p>
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-7 text-ink-muted">
                      {latestKarte.teacher_notes}
                    </p>
                  </div>
                )}
              </section>
            )}

            {weekTasks.length > 0 && (
              <Card padding="sm" className="sm:p-6">
                <div className="mb-4 flex items-start gap-2.5">
                  <span className="text-xl" aria-hidden>🗓️</span>
                  <div>
                    <h2 className="font-bold text-ink">今週の取り組み</h2>
                    <p className="text-xs text-ink-faint">
                      3か月ビジョンから作成した、お子さまの毎日のやること（
                      <span data-numeric>{weekTasks.filter((t) => t.done).length}/{weekTasks.length}</span> 完了）
                    </p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {Object.entries(
                    weekTasks.reduce<Record<string, WeekTask[]>>((acc, t) => {
                      (acc[t.task_date] ??= []).push(t); return acc;
                    }, {})
                  ).map(([date, items]) => {
                    const [y, m, d] = date.split("-").map(Number);
                    const wd = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, m - 1, d).getDay()];
                    const isToday = date === ymd(new Date());
                    return (
                      <div key={date} className={cx(
                        "rounded-field border px-4 py-3",
                        isToday ? "border-brand-200 bg-brand-50" : "border-line bg-canvas",
                      )}>
                        <p className="mb-1.5 text-xs font-bold text-ink-muted">
                          <span data-numeric>{m}月{d}日</span>（{wd}）
                          {isToday && <span className="ml-1.5 text-brand-600">今日</span>}
                        </p>
                        <ul className="space-y-1">
                          {items.map((t) => (
                            <li key={t.id} className="flex items-start gap-2 text-sm">
                              <span
                                aria-hidden
                                className={cx("mt-0.5 leading-none", t.done ? "text-positive-600" : "text-ink-faint/50")}
                              >
                                {t.done ? "✓" : "○"}
                              </span>
                              <span className={t.done ? "text-ink-faint line-through" : "text-ink-muted"}>
                                {t.content}
                              </span>
                              {t.subject && <span className="text-xs text-ink-faint">· {t.subject}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryCard
                title="未読メッセージ"
                value={`${unread}件`}
                href="/parent/dashboard/messages"
                tone={unread > 0 ? "alert" : "default"}
              />
              <SummaryCard
                title="直近の報告書"
                value={latestReport ? `${latestReport.percentage ?? "-"}%` : "なし"}
                sub={latestReport ? latestReport.test_title : "授業後に講師が作成します"}
                href="/parent/dashboard/reports"
              />
              <SummaryCard
                title="直近の多層診断"
                value={latestDiagnosis ? `${latestDiagnosis.test_percentage ?? "-"}%` : "なし"}
                sub={latestDiagnosis ? (latestDiagnosis.subject ?? "—") : "診断テスト受験後に共有されます"}
                href="/parent/dashboard/diagnosis"
              />
              <SummaryCard
                title="3か月ビジョン"
                value={latestKarte ? latestKarte.subject : "なし"}
                sub={latestKarte ? `${latestKarte.grade} ・ ${latestKarte.created_at.slice(0, 10)}` : "講師が作成・共有します"}
                href="/parent/dashboard/karte"
                tone={latestKarte ? "karte" : "default"}
              />
            </section>

            <section>
              <SectionTitle
                action={
                  <Link href="/parent/dashboard/calendar" className="text-sm font-semibold text-brand-600 hover:underline">
                    カレンダーを見る →
                  </Link>
                }
              >
                次回以降の授業
              </SectionTitle>
              {upcoming.length === 0 ? (
                <Card>
                  <p className="text-sm text-ink-faint">
                    予定されている授業はありません。授業日時は講師にご確認ください。
                  </p>
                </Card>
              ) : (
                <div className="space-y-2.5">
                  {upcoming.map((l) => (
                    <Card key={l.id} padding="sm" className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p data-numeric className="font-semibold text-ink">
                          {new Date(l.scheduled_at).toLocaleString("ja-JP", {
                            month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                        <p className="mt-0.5 text-sm text-ink-muted">{l.subject ?? "—"}</p>
                      </div>
                      <LinkButton
                        href={`/parent/dashboard/reschedule?lesson=${l.id}`}
                        variant="secondary"
                        size="sm"
                      >
                        振替を申請
                      </LinkButton>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {announcements.length > 0 && (
              <section>
                <SectionTitle>お知らせ</SectionTitle>
                <div className="space-y-2.5">
                  {announcements.map((a) => (
                    <Card key={a.id} padding="sm">
                      <div className="mb-1 flex items-baseline justify-between gap-3">
                        <p className="min-w-0 font-semibold text-ink">{a.title}</p>
                        <time data-numeric className="shrink-0 text-xs text-ink-faint">
                          {a.created_at.slice(0, 10)}
                        </time>
                      </div>
                      <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-7 text-ink-muted">{a.content}</p>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            <section className="grid gap-3 md:grid-cols-2">
              <QuickLink
                href="/parent/dashboard/karte"
                title="3か月ビジョン"
                description="お子さまの3か月ビジョン（共有された分のみ）を閲覧できます。"
              />
              <QuickLink
                href="/parent/dashboard/reports"
                title="授業報告書"
                description="送信済みの授業報告書を一覧でご覧いただけます。"
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  title, value, sub, href, tone,
}: { title: string; value: string; sub?: string; href: string; tone?: "default" | "alert" | "karte" }) {
  const isEmpty = value === "なし";
  return (
    <CardLink
      href={href}
      className={cx(
        tone === "alert" && "border-critical-200",
        tone === "karte" && "border-brand-200",
      )}
    >
      <p className="text-xs font-semibold text-ink-faint">{title}</p>
      <p
        data-numeric
        className={cx(
          "mt-2 truncate text-xl font-bold",
          tone === "alert" ? "text-critical-600"
            : tone === "karte" ? "text-brand-700"
            : isEmpty ? "text-ink-faint" : "text-ink",
        )}
      >
        {value}
      </p>
      {sub && (
        <p className={cx("mt-1.5 truncate text-xs", isEmpty ? "italic text-ink-faint" : "text-ink-faint")}>
          {sub}
        </p>
      )}
    </CardLink>
  );
}

function QuickLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <CardLink href={href} className="group">
      <div className="flex items-center justify-between gap-3">
        <p className="font-bold text-ink">{title}</p>
        <svg
          className="h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand-600"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
      <p className="mt-1.5 text-sm leading-7 text-ink-muted">{description}</p>
    </CardLink>
  );
}
