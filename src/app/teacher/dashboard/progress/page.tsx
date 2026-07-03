"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/lib/toast";
import { Skeleton } from "@/components/Skeleton";
import { GRADE_ORDER, SUBJECT_LIST } from "@/lib/curriculum";

type Student = { id: string; name: string; grade: string; school_id: string | null };

type Progress = {
  id: string;
  student_id: string;
  student_name: string;
  teacher_id: string;
  teacher_name: string | null;
  lesson_date: string;
  subject: string | null;
  textbook: string;
  progress_where: string | null;
  amount: string | null;
  understanding: "good" | "normal" | "weak" | null;
  comment: string | null;
  created_at: string;
};

// 「未入力」とみなす日数（最終入力からこれ以上空いたら停滞扱い）
const STALE_DAYS = 7;

const UNDERSTANDING = [
  { key: "good",   label: "◎ 手応えあり", cls: "bg-green-100 text-green-700 border-green-300" },
  { key: "normal", label: "○ ふつう",     cls: "bg-blue-100 text-blue-700 border-blue-300" },
  { key: "weak",   label: "△ 不安",       cls: "bg-amber-100 text-amber-700 border-amber-300" },
] as const;

function understandingPill(u: Progress["understanding"]) {
  const m = UNDERSTANDING.find((x) => x.key === u);
  if (!m) return null;
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${m.cls}`}>{m.label}</span>;
}

function daysAgo(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86400000);
}

function todayStr(): string {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export default function ProgressPage() {
  const [loading, setLoading] = useState(true);
  const [teacher, setTeacher] = useState<{ id: string; name: string } | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<Progress[]>([]);

  // フォーム
  const [studentId, setStudentId] = useState("");
  const [lessonDate, setLessonDate] = useState(todayStr());
  const [subject, setSubject] = useState("");
  const [textbook, setTextbook] = useState("");
  const [where, setWhere] = useState("");
  const [amount, setAmount] = useState("");
  const [understanding, setUnderstanding] = useState<Progress["understanding"]>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  // 状況ボードのフィルタ
  const [gradeFilter, setGradeFilter] = useState("");

  const loadRecords = useCallback(async () => {
    const { data } = await supabase
      .from("textbook_progress")
      .select("*")
      .order("lesson_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000);
    setRecords((data as Progress[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email ?? "";
      const [{ data: t }, { data: studs }] = await Promise.all([
        supabase.from("teachers").select("id,name").eq("email", email).single(),
        supabase.from("students").select("id,name,grade,school_id").order("grade"),
      ]);
      if (t) setTeacher({ id: t.id, name: t.name });
      setStudents((studs as Student[]) ?? []);
      await loadRecords();
      setLoading(false);
    })();
  }, [loadRecords]);

  // 生徒ごとの最新進捗（教科を問わず一番新しい1件）── サマリー・停滞判定に使う
  const latestByStudent = useMemo(() => {
    const m = new Map<string, Progress>();
    for (const r of records) {
      if (!m.has(r.student_id)) m.set(r.student_id, r); // records は新しい順
    }
    return m;
  }, [records]);

  // 生徒×教科ごとの最新進捗。複数教科を入力しても各教科の最新が漏れず出るようにする。
  const latestByStudentSubject = useMemo(() => {
    const m = new Map<string, Progress[]>();      // student_id → 教科ごと最新の配列
    const seen = new Map<string, Set<string>>();  // student_id → 既出の教科キー
    for (const r of records) {                    // records は新しい順
      const subjectKey = r.subject ?? "__none__";
      let subjects = seen.get(r.student_id);
      if (!subjects) { subjects = new Set(); seen.set(r.student_id, subjects); m.set(r.student_id, []); }
      if (!subjects.has(subjectKey)) {
        subjects.add(subjectKey);
        m.get(r.student_id)!.push(r);             // 各教科で最初に出た＝最新
      }
    }
    return m;
  }, [records]);

  // 既存テキスト名（入力補完用）
  const knownTextbooks = useMemo(
    () => Array.from(new Set(records.map((r) => r.textbook).filter(Boolean))),
    [records]
  );

  const sortedStudents = useMemo(() => {
    const filtered = gradeFilter ? students.filter((s) => s.grade === gradeFilter) : students;
    return [...filtered].sort((a, b) => {
      const ga = GRADE_ORDER.indexOf(a.grade), gb = GRADE_ORDER.indexOf(b.grade);
      if (ga !== gb) return ga - gb;
      return a.name.localeCompare(b.name, "ja");
    });
  }, [students, gradeFilter]);

  const grades = useMemo(
    () => GRADE_ORDER.filter((g) => students.some((s) => s.grade === g)),
    [students]
  );

  // 記入率サマリー
  const summary = useMemo(() => {
    const total = students.length || 1;
    let filled = 0, stale = 0, missing = 0;
    for (const s of students) {
      const last = latestByStudent.get(s.id);
      if (!last) { missing++; continue; }
      if (daysAgo(last.lesson_date) > STALE_DAYS) stale++;
      else filled++;
    }
    return { total: students.length, filled, stale, missing, rate: Math.round((filled / total) * 100) };
  }, [students, latestByStudent]);

  const submit = async () => {
    if (!teacher) { showToast("講師情報を取得できませんでした。再ログインしてください。", "error"); return; }
    if (!studentId) { showToast("生徒を選んでください", "error"); return; }
    if (!textbook.trim()) { showToast("使用テキストを入力してください", "error"); return; }
    const stud = students.find((s) => s.id === studentId);
    setSaving(true);
    const { error } = await supabase.from("textbook_progress").insert({
      student_id: studentId,
      student_name: stud?.name ?? "",
      teacher_id: teacher.id,
      teacher_name: teacher.name,
      lesson_date: lessonDate,
      subject: subject || null,
      textbook: textbook.trim(),
      progress_where: where.trim() || null,
      amount: amount.trim() || null,
      understanding: understanding,
      comment: comment.trim() || null,
    });
    setSaving(false);
    if (error) { showToast("保存に失敗しました: " + error.message, "error"); return; }
    showToast("進捗を記録しました", "success");
    // フォームを軽くリセット（生徒・テキストは続けて入れやすいよう残す）
    setWhere(""); setAmount(""); setComment(""); setUnderstanding(null);
    await loadRecords();
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 lg:p-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">教材進捗</h1>
        <p className="mt-1 text-sm text-slate-500">
          使用テキストと進捗を記録します。記録には<strong>入力者（あなた）</strong>が残ります。
        </p>
      </header>

      {/* ── 入力フォーム ───────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">進捗を入力</h2>
          {teacher && (
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              入力者：{teacher.name}
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">生徒 *</span>
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="">選択してください</option>
              {sortedStudents.map((s) => (
                <option key={s.id} value={s.id}>{`【${s.grade}】${s.name}`}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">授業日</span>
            <input type="date" value={lessonDate} onChange={(e) => setLessonDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">科目</span>
            <select value={subject} onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
              <option value="">（任意）</option>
              {SUBJECT_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">使用テキスト *</span>
            <input list="known-textbooks" value={textbook} onChange={(e) => setTextbook(e.target.value)}
              placeholder="例）eng3合本" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            <datalist id="known-textbooks">
              {knownTextbooks.map((t) => <option key={t} value={t} />)}
            </datalist>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">どこまで（単元・ページ）</span>
            <input value={where} onChange={(e) => setWhere(e.target.value)}
              placeholder="例）Lesson7 p.42" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">量（今日進んだ範囲）</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="例）4ページ / 大問3つ" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </div>

        <div className="mt-4">
          <span className="text-xs font-semibold text-slate-600">手応え</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {UNDERSTANDING.map((u) => (
              <button key={u.key} type="button"
                onClick={() => setUnderstanding(understanding === u.key ? null : u.key)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                  understanding === u.key ? u.cls : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                }`}>
                {u.label}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-semibold text-slate-600">様子・つまずき・次回方針</span>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
            placeholder="例）符号ミスが続く。次回は復習から。"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        </label>

        <div className="mt-5 flex justify-end">
          <button onClick={submit} disabled={saving}
            className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "保存中…" : "記録する"}
          </button>
        </div>
      </section>

      {/* ── 入力状況ボード ───────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-800">入力状況</h2>
          <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">全学年</option>
            {grades.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* サマリー */}
        <div className="mb-4 grid grid-cols-4 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 py-2">
            <p className="text-lg font-bold text-slate-800">{summary.rate}%</p>
            <p className="text-xs text-slate-500">記入率</p>
          </div>
          <div className="rounded-xl bg-green-50 py-2">
            <p className="text-lg font-bold text-green-700">{summary.filled}</p>
            <p className="text-xs text-slate-500">記入済</p>
          </div>
          <div className="rounded-xl bg-amber-50 py-2">
            <p className="text-lg font-bold text-amber-700">{summary.stale}</p>
            <p className="text-xs text-slate-500">{STALE_DAYS}日以上停滞</p>
          </div>
          <div className="rounded-xl bg-red-50 py-2">
            <p className="text-lg font-bold text-red-600">{summary.missing}</p>
            <p className="text-xs text-slate-500">未入力</p>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {sortedStudents.map((s) => {
            const subjectRows = latestByStudentSubject.get(s.id) ?? [];
            const overallLast = latestByStudent.get(s.id);
            const stale = overallLast && daysAgo(overallLast.lesson_date) > STALE_DAYS;
            return (
              <div key={s.id} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                  {s.grade}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">{s.name}</span>
                    {!overallLast && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">未入力</span>}
                    {stale && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">{daysAgo(overallLast!.lesson_date)}日停滞</span>}
                  </div>
                  {subjectRows.length > 0 ? (
                    <div className="mt-1 space-y-1.5">
                      {subjectRows.map((p) => (
                        <div key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                          <span className="shrink-0 rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold text-indigo-600">
                            {p.subject || "科目なし"}
                          </span>
                          <span className="font-medium text-slate-700">{p.textbook}</span>
                          {p.progress_where && <span className="text-slate-500">／ {p.progress_where}</span>}
                          {understandingPill(p.understanding)}
                          <span className="ml-auto shrink-0 text-xs text-slate-400">
                            {p.lesson_date}・入力：{p.teacher_name ?? "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-slate-400">まだ記録がありません</p>
                  )}
                </div>
              </div>
            );
          })}
          {sortedStudents.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">該当する生徒がいません</p>
          )}
        </div>
      </section>
    </div>
  );
}
