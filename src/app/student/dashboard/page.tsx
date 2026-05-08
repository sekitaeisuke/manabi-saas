"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Student } from "@/lib/supabase";

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

export default function StudentDashboardPage() {
  const [student, setStudent] = useState<Student | null>(null);
  const [tests, setTests] = useState<AssignedTest[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/student/login");
  };

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // 生徒プロファイル取得
      const { data: studentData } = await supabase
        .from("students")
        .select("*")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!studentData) return;
      setStudent(studentData as Student);

      // 割り当てテスト取得
      const { data: assignments } = await supabase
        .from("test_assignments")
        .select("id, test_session_id")
        .eq("student_id", studentData.id);

      if (!assignments || assignments.length === 0) { setLoading(false); return; }

      const sessionIds = assignments.map((a: { id: string; test_session_id: string }) => a.test_session_id);

      // test_sessions + tests を結合取得
      const { data: sessions } = await supabase
        .from("test_sessions")
        .select("id, url_token, tests(title, subject, grade)")
        .in("id", sessionIds);

      // questionnaire_responses で完了確認
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
      setLoading(false);
    };
    init();
  }, []);

  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 border-b border-white/60 bg-white/80 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white">つ</div>
            <span className="font-bold text-slate-900">つながるまなび</span>
          </div>
          <button onClick={logout} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
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

        {/* 受験するテスト */}
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">受験するテスト</h2>

          {loading ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">読み込み中...</div>
          ) : tests.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <p className="text-slate-500">まだテストが割り当てられていません</p>
              <p className="mt-1 text-sm text-slate-400">先生からテストが届いたら、ここに表示されます</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tests.map((t) => (
                <div key={t.assignment_id}
                  className={`rounded-3xl border bg-white p-6 shadow-sm ${t.completed ? "border-green-200" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{t.test_title}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{t.test_subject} ・ {t.test_grade}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {t.completed ? (
                        <div className="text-right">
                          <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">完了 ✓</span>
                          {t.percentage != null && (
                            <p className="mt-1 text-xs text-slate-400">{Math.round(t.percentage)}点</p>
                          )}
                        </div>
                      ) : (
                        <a
                          href={`/test/${t.url_token}?studentName=${encodeURIComponent(student?.name ?? "")}`}
                          className="rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
                        >
                          受験する →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
