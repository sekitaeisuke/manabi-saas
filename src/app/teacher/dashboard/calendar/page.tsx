"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Student, School, Test } from "@/lib/supabase";

const DAY_JS: Record<string, number> = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

type Assignment = {
  id: string;
  student_id: string;
  test_id: string;
  session_id: string | null;
  scheduled_date: string;
  url_token: string | null;
  test_title: string;
  completed_at: string | null;
};

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const today = new Date();
  const [current, setCurrent] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [students, setStudents] = useState<Student[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSchool, setFilterSchool] = useState("");

  const [modal, setModal] = useState<{ student: Student; date: Date } | null>(null);
  const [selectedTestId, setSelectedTestId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState("");

  const year = current.getFullYear();
  const month = current.getMonth();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const start = dateKey(new Date(year, month, 1));
    const end = dateKey(new Date(year, month + 1, 0));

    const [{ data: s }, { data: sc }, { data: t }, { data: a }] = await Promise.all([
      supabase.from("students").select("*").order("name"),
      supabase.from("schools").select("*").order("name"),
      supabase.from("tests").select("*").order("grade").order("subject"),
      supabase
        .from("student_test_assignments")
        .select("*, test_sessions(url_token, completed_at:created_at), tests(title)")
        .gte("scheduled_date", start)
        .lte("scheduled_date", end),
    ]);

    setStudents(s ?? []);
    setSchools(sc ?? []);
    setTests(t ?? []);
    setAssignments(
      (a ?? []).map((x: any) => ({
        id: x.id,
        student_id: x.student_id,
        test_id: x.test_id,
        session_id: x.session_id,
        scheduled_date: x.scheduled_date,
        url_token: x.test_sessions?.url_token ?? null,
        test_title: x.tests?.title ?? "（不明）",
        completed_at: x.completed_at ?? null,
      }))
    );
    setLoading(false);
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // カレンダーグリッド生成
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  // 6週分になるよう末尾を埋める
  while (cells.length % 7 !== 0) cells.push(null);

  const filteredStudents = filterSchool
    ? students.filter((s) => s.school_id === filterSchool)
    : students;

  const studentsForDay = (date: Date) => {
    const jsDay = date.getDay();
    return filteredStudents.filter((s) => s.attendance_days?.some((d) => DAY_JS[d] === jsDay));
  };

  const assignmentsFor = (studentId: string, date: Date) =>
    assignments.filter((a) => a.student_id === studentId && a.scheduled_date === dateKey(date));

  const openModal = (student: Student, date: Date) => {
    setModal({ student, date });
    setSelectedTestId("");
    setGeneratedUrl("");
  };

  const assignTest = async () => {
    if (!modal || !selectedTestId) return;
    setAssigning(true);

    const token =
      Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    const { data: session, error } = await supabase
      .from("test_sessions")
      .insert({ test_id: selectedTestId, url_token: token })
      .select()
      .single();

    if (error || !session) { alert("エラー: " + error?.message); setAssigning(false); return; }

    await supabase.from("student_test_assignments").insert({
      student_id: modal.student.id,
      test_id: selectedTestId,
      session_id: session.id,
      scheduled_date: dateKey(modal.date),
    });

    setGeneratedUrl(`${window.location.origin}/test/${token}`);
    setAssigning(false);
    fetchData();
  };

  const deleteAssignment = async (id: string) => {
    if (!confirm("このテスト割当を削除しますか？")) return;
    await supabase.from("student_test_assignments").delete().eq("id", id);
    fetchData();
  };

  // 当月の生徒ごと来塾日数
  const attendanceCounts = filteredStudents.reduce<Record<string, number>>((acc, s) => {
    const count = cells.filter(
      (d) => d !== null && s.attendance_days?.some((wd) => DAY_JS[wd] === d.getDay())
    ).length;
    if (count > 0) acc[s.id] = count;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <main className="mx-auto max-w-[1400px]">
        {/* ヘッダー */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">来塾カレンダー</h1>
            <p className="mt-0.5 text-sm text-slate-500">来塾予定の生徒とテスト割当を管理します</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterSchool}
              onChange={(e) => setFilterSchool(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none shadow-sm"
            >
              <option value="">全校舎</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <Link
              href="/teacher/dashboard/schools"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
            >
              曜日設定
            </Link>
            <Link
              href="/teacher/dashboard"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
            >
              ダッシュボード
            </Link>
          </div>
        </div>

        {/* 月ナビゲーション */}
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => setCurrent(new Date(year, month - 1, 1))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-slate-50"
          >
            ◀
          </button>
          <h2 className="min-w-[120px] text-center text-lg font-bold text-slate-900">
            {year}年{month + 1}月
          </h2>
          <button
            onClick={() => setCurrent(new Date(year, month + 1, 1))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-slate-50"
          >
            ▶
          </button>
          <button
            onClick={() => setCurrent(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 shadow-sm hover:bg-slate-50"
          >
            今月
          </button>
          {!loading && (
            <span className="ml-2 text-xs text-slate-400">
              来塾生徒 {Object.keys(attendanceCounts).length}名
            </span>
          )}
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-16 text-center text-slate-400">
            読み込み中...
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
              {WEEKDAY_LABELS.map((label, i) => (
                <div
                  key={label}
                  className={`py-2 text-center text-xs font-bold tracking-widest ${
                    i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-500"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* カレンダーグリッド */}
            <div className="grid grid-cols-7">
              {cells.map((date, i) => {
                const isToday = date?.toDateString() === today.toDateString();
                const isPast = date && date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const dayStudents = date ? studentsForDay(date) : [];
                const jsDay = date?.getDay();

                return (
                  <div
                    key={i}
                    className={`min-h-[110px] border-b border-r border-slate-100 p-1 ${
                      !date ? "bg-slate-50/60" : isPast ? "bg-slate-50/30" : ""
                    }`}
                  >
                    {date && (
                      <>
                        {/* 日付 */}
                        <div className="mb-1 flex items-center justify-between px-0.5">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                              isToday
                                ? "bg-teal-500 text-white"
                                : jsDay === 0
                                ? "text-red-400"
                                : jsDay === 6
                                ? "text-blue-400"
                                : "text-slate-600"
                            }`}
                          >
                            {date.getDate()}
                          </span>
                          {dayStudents.length > 0 && (
                            <span className="text-[10px] text-slate-400">{dayStudents.length}名</span>
                          )}
                        </div>

                        {/* 生徒リスト */}
                        <div className="space-y-0.5">
                          {dayStudents.map((student) => {
                            const dayAssignments = assignmentsFor(student.id, date);
                            return (
                              <div
                                key={student.id}
                                className="group cursor-pointer rounded-lg px-1.5 py-1 transition hover:bg-teal-50"
                                onClick={() => openModal(student, date)}
                              >
                                <div className="flex items-center gap-1">
                                  <span className="truncate text-[11px] font-semibold text-slate-700 group-hover:text-teal-700">
                                    {student.name}
                                  </span>
                                  <span className="flex-shrink-0 text-[10px] text-slate-400">
                                    {student.grade}
                                  </span>
                                </div>
                                {dayAssignments.map((a) => (
                                  <div
                                    key={a.id}
                                    className="mt-0.5 flex items-center gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-teal-400" />
                                    <span className="truncate text-[10px] text-teal-700 font-medium">
                                      {a.test_title}
                                    </span>
                                    {a.url_token && (
                                      <a
                                        href={`/test/${a.url_token}`}
                                        target="_blank"
                                        className="ml-auto flex-shrink-0 rounded bg-teal-500 px-1 py-0.5 text-[9px] font-bold text-white hover:bg-teal-600"
                                      >
                                        受験
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 凡例 */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-teal-400" />
            テスト割当済み
          </span>
          <span>生徒をクリック → テスト割当・受験URL発行</span>
          <span className="text-slate-300">｜</span>
          <span>「曜日設定」で生徒の通塾曜日を設定してください</span>
        </div>
      </main>

      {/* テスト割当モーダル */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
            <div className="mb-5">
              <h3 className="text-lg font-bold text-slate-900">テスト割当</h3>
              <p className="text-sm text-slate-500">
                <span className="font-semibold text-slate-700">{modal.student.name}</span>
                　{modal.student.grade}
                　{schools.find((s) => s.id === modal.student.school_id)?.name}
              </p>
              <p className="mt-1 text-sm font-semibold text-teal-600">
                {year}年{modal.date.getMonth() + 1}月{modal.date.getDate()}日（{WEEKDAY_LABELS[modal.date.getDay()]}）
              </p>
            </div>

            {/* 割当済みテスト */}
            {assignmentsFor(modal.student.id, modal.date).length > 0 && (
              <div className="mb-5 rounded-2xl border border-teal-100 bg-teal-50 p-4">
                <p className="mb-2 text-xs font-bold text-teal-700">割当済みテスト</p>
                <div className="space-y-2">
                  {assignmentsFor(modal.student.id, modal.date).map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-teal-800">{a.test_title}</span>
                      <div className="flex flex-shrink-0 gap-1.5">
                        {a.url_token && (
                          <a
                            href={`/test/${a.url_token}`}
                            target="_blank"
                            className="rounded-xl bg-teal-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-600"
                          >
                            テスト受験
                          </a>
                        )}
                        <button
                          onClick={() => deleteAssignment(a.id)}
                          className="rounded-xl border border-red-200 px-2 py-1.5 text-xs text-red-500 hover:bg-red-50"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 新規割当フォーム */}
            {generatedUrl ? (
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                <p className="mb-2 text-sm font-bold text-indigo-700">テストURLを発行しました</p>
                <p className="mb-3 break-all rounded-xl bg-white px-3 py-2 font-mono text-xs text-indigo-900">
                  {generatedUrl}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { navigator.clipboard.writeText(generatedUrl); }}
                    className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    URLをコピー
                  </button>
                  <a
                    href={generatedUrl}
                    target="_blank"
                    className="flex-1 rounded-xl border border-indigo-300 py-2.5 text-center text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
                  >
                    テスト受験
                  </a>
                </div>
                <button
                  onClick={() => setGeneratedUrl("")}
                  className="mt-2 w-full text-center text-xs text-slate-400 hover:text-slate-600"
                >
                  さらに追加する
                </button>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  テストを割り当てる
                </label>
                <select
                  value={selectedTestId}
                  onChange={(e) => setSelectedTestId(e.target.value)}
                  className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-teal-400"
                >
                  <option value="">-- テストを選択してください --</option>
                  <optgroup label={`▼ ${modal.student.grade}のテスト`}>
                    {tests
                      .filter((t) => t.grade === modal.student.grade)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.subject}　{t.title}
                        </option>
                      ))}
                  </optgroup>
                  {tests.some((t) => t.grade !== modal.student.grade) && (
                    <optgroup label="▼ 他学年のテスト">
                      {tests
                        .filter((t) => t.grade !== modal.student.grade)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.grade}　{t.subject}　{t.title}
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={assignTest}
                    disabled={!selectedTestId || assigning}
                    className="flex-1 rounded-2xl bg-teal-500 py-3 font-semibold text-white hover:bg-teal-600 disabled:opacity-40"
                  >
                    {assigning ? "発行中..." : "URLを発行してテスト割当"}
                  </button>
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 rounded-2xl border border-slate-200 py-3 text-slate-600 hover:bg-slate-50"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            )}

            {generatedUrl && (
              <button
                onClick={() => setModal(null)}
                className="mt-3 w-full rounded-2xl border border-slate-200 py-2.5 text-sm text-slate-500 hover:bg-slate-50"
              >
                閉じる
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
