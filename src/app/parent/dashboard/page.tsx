"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Student } from "@/lib/supabase";
import { useSelectedStudentId } from "@/lib/useSelectedStudent";
import { Skeleton } from "@/components/Skeleton";

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

type Announcement = {
  id: string;
  title: string;
  content: string;
  target_grade: string | null;
  target_school_id: string | null;
  created_at: string;
};

export default function ParentOverviewPage() {
  const [selectedId] = useSelectedStudentId();
  const [student, setStudent] = useState<Student | null>(null);
  const [messageToChild, setMessageToChild] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [upcoming, setUpcoming] = useState<UpcomingLesson[]>([]);
  const [latestReport, setLatestReport] = useState<LatestReport | null>(null);
  const [latestDiagnosis, setLatestDiagnosis] = useState<LatestDiagnosis | null>(null);
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

    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedId) fetchAll(selectedId);
  }, [selectedId, fetchAll]);

  if (!selectedId) {
    return (
      <div className="px-6 py-10 text-slate-600">お子さまが登録されていません。</div>
    );
  }

  return (
    <div className="px-4 py-5 text-slate-900 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">お子さまの学習状況</h1>
          <p className="mt-2 text-slate-600">
            {student ? `${student.name} さん（${student.grade}）の最新情報` : "..."}
          </p>
        </div>

        {loading ? (
          <div className="grid gap-6">
            <div className="rounded-3xl border border-yellow-200 bg-yellow-50 p-6">
              <Skeleton className="mb-3 h-4 w-32" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="mt-2 h-5 w-3/4" />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[1,2,3].map((i) => <div key={i} className="rounded-3xl border border-slate-200 bg-white p-6"><Skeleton className="mb-3 h-4 w-24" /><Skeleton className="h-8 w-16" /></div>)}
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-8"><Skeleton className="mb-4 h-6 w-40" />{[1,2].map((i)=><Skeleton key={i} className="mb-3 h-16 rounded-2xl w-full" />)}</div>
          </div>
        ) : (
          <div className="grid gap-6">
            {messageToChild && (
              <section className="rounded-3xl border-2 border-yellow-300 bg-gradient-to-r from-yellow-50 to-amber-50 p-6 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-2xl">⭐</span>
                  <p className="font-bold text-yellow-900">先生からお子様へのメッセージ</p>
                </div>
                <p className="leading-relaxed text-slate-800">{messageToChild}</p>
                {latestReport && (
                  <p className="mt-3 text-xs text-yellow-700">
                    {latestReport.created_at.slice(0,10)} の授業報告書より
                    <Link href="/parent/dashboard/reports" className="ml-2 underline hover:text-yellow-900">報告書を開く →</Link>
                  </p>
                )}
              </section>
            )}
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
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
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-8">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-950">次回以降の授業</h2>
                <Link href="/parent/dashboard/calendar" className="text-sm font-medium text-blue-600 hover:underline">
                  カレンダーを見る →
                </Link>
              </div>
              {upcoming.length === 0 ? (
                <p className="text-sm text-slate-500">予定されている授業はありません。授業日時は講師にご確認ください。</p>
              ) : (
                <div className="space-y-3">
                  {upcoming.map((l) => (
                    <div key={l.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-950">
                            {new Date(l.scheduled_at).toLocaleString("ja-JP", {
                              month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">{l.subject ?? "—"}</p>
                        </div>
                        <Link
                          href={`/parent/dashboard/reschedule?lesson=${l.id}`}
                          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          振替を申請
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {announcements.length > 0 && (
              <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-8">
                <h2 className="mb-6 text-xl font-semibold text-slate-950">お知らせ</h2>
                <div className="space-y-3">
                  {announcements.map((a) => (
                    <div key={a.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900">{a.title}</p>
                        <span className="shrink-0 text-xs text-slate-400">{a.created_at.slice(0, 10)}</span>
                      </div>
                      <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{a.content}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="grid gap-4 md:grid-cols-2">
              <QuickLink
                href="/parent/dashboard/karte"
                title="カルテ"
                description="お子さまの学習カルテ（共有された分のみ）を閲覧できます。"
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
}: { title: string; value: string; sub?: string; href: string; tone?: "default" | "alert" }) {
  const isEmpty = value === "なし";
  return (
    <Link href={href}
      className={`block rounded-3xl border bg-white p-6 shadow-sm transition hover:shadow-md ${
        tone === "alert" ? "border-red-200" : "border-slate-200"
      }`}>
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className={`mt-3 text-2xl font-bold ${tone === "alert" ? "text-red-600" : isEmpty ? "text-slate-400" : "text-slate-950"}`}>{value}</p>
      {sub && <p className={`mt-2 truncate text-sm ${isEmpty ? "text-slate-400 italic" : "text-slate-600"}`}>{sub}</p>}
    </Link>
  );
}

function QuickLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="block rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md sm:p-6">
      <p className="text-lg font-bold text-slate-950">{title}</p>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </Link>
  );
}
