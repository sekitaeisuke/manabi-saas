"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Period = "1m" | "3m" | "6m";

type StudentRow = { id: string; name: string; grade: string | null };
type ResultRow = { student_name: string; percentage: number; completed_at: string };
type DiagnosisRow = {
  student_name: string;
  grade: string | null;
  subject: string | null;
  habit_score: number | null;
  method_score: number | null;
  verbal_score: number | null;
  skill_score: number | null;
  status: string;
  created_at: string;
};
type LessonRow = { id: string; status: string; scheduled_at: string };
type ReportRow = {
  student_name: string;
  test_subject: string | null;
  percentage: number | null;
  created_at: string;
};

const PERIOD_MS: Record<Period, number> = {
  "1m": 30 * 86400000,
  "3m": 90 * 86400000,
  "6m": 180 * 86400000,
};
const PERIOD_LABEL: Record<Period, string> = { "1m": "1ヶ月", "3m": "3ヶ月", "6m": "6ヶ月" };

function mean(arr: number[]) {
  return arr.length === 0 ? 0 : Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
}

function filterByPeriod<T extends { created_at: string }>(rows: T[], period: Period, now: number): T[] {
  const since = now - PERIOD_MS[period];
  return rows.filter((r) => new Date(r.created_at).getTime() >= since);
}

function normalizeScore(v: number): number {
  if (v <= 4) return Math.round(v * 25);
  if (v <= 20) return Math.round((v / 20) * 100);
  return Math.min(100, Math.round(v));
}

function scoreColor(pct: number) {
  return pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-indigo-600" : "text-rose-500";
}
function barColor(pct: number) {
  return pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-indigo-500" : "bg-rose-400";
}

// ── Primitive components ────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${accent ?? "text-slate-800"}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function HBar({ value, max = 100, color = "bg-indigo-500" }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, max === 0 ? 0 : Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-semibold text-slate-600">{value}%</span>
    </div>
  );
}

function LineChart({ data }: { data: { label: string; avg: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-sm text-slate-400">
        この期間にデータがありません
      </div>
    );
  }

  const W = 560;
  const H = 160;
  const PL = 36;
  const PR = 16;
  const PT = 20;
  const PB = 28;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;

  const xs = data.map((_, i) =>
    data.length === 1 ? PL + chartW / 2 : PL + (i / (data.length - 1)) * chartW
  );
  const ys = data.map((d) => PT + chartH - (d.avg / 100) * chartH);
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  const area = `${xs[0]},${PT + chartH} ${pts} ${xs[xs.length - 1]},${PT + chartH}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {[0, 25, 50, 75, 100].map((v) => {
        const y = PT + chartH - (v / 100) * chartH;
        return (
          <g key={v}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={PL - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
              {v}
            </text>
          </g>
        );
      })}
      <polygon points={area} fill="#6366f1" fillOpacity="0.08" />
      {data.length > 1 && (
        <polyline
          points={pts}
          fill="none"
          stroke="#6366f1"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {xs.map((x, i) => (
        <g key={i}>
          <circle cx={x} cy={ys[i]} r="4.5" fill="#6366f1" stroke="white" strokeWidth="2" />
          <text x={x} y={ys[i] - 10} textAnchor="middle" fontSize="10" fill="#4f46e5" fontWeight="700">
            {data[i].avg}%
          </text>
          <text x={x} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
            {data[i].label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const [period, setPeriod] = useState<Period>("3m");
  // 「現在時刻」はマウント時に一度だけ確定させ、レンダーを純粋に保つ（期間フィルタの基準）
  const [now, setNow] = useState(0);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [diagnoses, setDiagnoses] = useState<DiagnosisRow[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);

  useEffect(() => {
    setNow(Date.now());
    (async () => {
      setLoading(true);
      const [s, r, d, l, rp] = await Promise.all([
        supabase.from("students").select("id, name, grade"),
        supabase
          .from("results")
          .select("student_name, percentage, completed_at")
          .order("completed_at", { ascending: true }),
        supabase
          .from("questionnaire_responses")
          .select(
            "student_name, grade, subject, habit_score, method_score, verbal_score, skill_score, status, created_at"
          )
          .order("created_at", { ascending: true }),
        supabase.from("lessons").select("id, status, scheduled_at"),
        supabase
          .from("lesson_reports")
          .select("student_name, test_subject, percentage, created_at")
          .order("created_at", { ascending: true }),
      ]);
      setStudents((s.data ?? []) as StudentRow[]);
      setResults((r.data ?? []) as ResultRow[]);
      setDiagnoses((d.data ?? []) as DiagnosisRow[]);
      setLessons((l.data ?? []) as LessonRow[]);
      setReports((rp.data ?? []) as ReportRow[]);
      setLoading(false);
    })();
  }, []);

  const filteredResults = useMemo(() => {
    const since = now - PERIOD_MS[period];
    return results.filter((r) => new Date(r.completed_at).getTime() >= since);
  }, [results, period, now]);
  const filteredDiagnoses = useMemo(() => filterByPeriod(diagnoses, period, now), [diagnoses, period, now]);
  const filteredLessons = useMemo(() => {
    const since = now - PERIOD_MS[period];
    return lessons.filter((l) => new Date(l.scheduled_at).getTime() >= since);
  }, [lessons, period, now]);
  const filteredReports = useMemo(() => filterByPeriod(reports, period, now), [reports, period, now]);

  // Summary stats
  const avgScore = mean(filteredResults.map((r) => r.percentage));
  const analyzedCount = filteredDiagnoses.filter(
    (d) => d.status === "analyzed" || d.status === "approved"
  ).length;
  const completedLessons = filteredLessons.filter((l) => l.status === "completed").length;

  // Monthly trend from results
  const monthlyTrend = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const r of filteredResults) {
      const dt = new Date(r.completed_at);
      const key = `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r.percentage);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, vals]) => ({ label, avg: mean(vals) }));
  }, [filteredResults]);

  // Subject breakdown (lesson_reports + results labelled "テスト")
  const subjectData = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const r of filteredResults) {
      const key = "テスト";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r.percentage);
    }
    for (const rp of filteredReports) {
      if (rp.percentage == null) continue;
      const key = rp.test_subject ?? "その他";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(rp.percentage);
    }
    return Array.from(map.entries())
      .map(([subject, vals]) => ({ subject, avg: mean(vals), count: vals.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 7);
  }, [filteredResults, filteredReports]);

  // Diagnosis axis averages
  const diagAxes = useMemo(() => {
    const scored = filteredDiagnoses.filter(
      (d) => d.habit_score != null || d.method_score != null
    );
    if (scored.length === 0) return null;
    const pick = (key: keyof DiagnosisRow) =>
      scored
        .filter((d) => d[key] != null)
        .map((d) => normalizeScore(d[key] as number));
    return {
      habit: mean(pick("habit_score")),
      method: mean(pick("method_score")),
      verbal: mean(pick("verbal_score")),
      skill: mean(pick("skill_score")),
    };
  }, [filteredDiagnoses]);

  // Per-student summary table
  const studentSummary = useMemo(() => {
    return students
      .map((s) => {
        const sRes = filteredResults.filter((r) => r.student_name === s.name);
        const sDiag = filteredDiagnoses.filter(
          (d) =>
            d.student_name === s.name &&
            (d.status === "analyzed" || d.status === "approved")
        );
        const latest = sRes.at(-1);
        const latestDiag = sDiag.at(-1);
        const habitRaw = latestDiag?.habit_score ?? null;
        return {
          name: s.name,
          grade: s.grade,
          latestScore: latest?.percentage ?? null,
          diagCount: sDiag.length,
          habitScore: habitRaw != null ? normalizeScore(habitRaw) : null,
        };
      })
      .filter((s) => s.latestScore != null || s.diagCount > 0)
      .sort((a, b) => (b.latestScore ?? 0) - (a.latestScore ?? 0));
  }, [students, filteredResults, filteredDiagnoses]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-slate-400">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />
          読み込み中...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* ヘッダー */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">分析ダッシュボード</h1>
            <p className="mt-0.5 text-sm text-slate-400">テスト結果・学習診断スコアの集計</p>
          </div>
          <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {(["1m", "3m", "6m"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 text-sm font-medium transition ${
                  period === p
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
        </div>

        {/* サマリーカード */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="総生徒数"
            value={students.length}
            sub="登録済み"
          />
          <StatCard
            label="平均スコア"
            value={filteredResults.length > 0 ? `${avgScore}%` : "—"}
            sub={`${filteredResults.length}件のテスト`}
            accent={filteredResults.length > 0 ? scoreColor(avgScore) : "text-slate-400"}
          />
          <StatCard
            label="診断実施"
            value={analyzedCount}
            sub={`${PERIOD_LABEL[period]}以内`}
            accent="text-indigo-600"
          />
          <StatCard
            label="完了授業"
            value={completedLessons}
            sub={`${PERIOD_LABEL[period]}以内`}
          />
        </div>

        {/* スコア推移 + 科目別 */}
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">
              テストスコア推移（月別平均）
            </h2>
            <LineChart data={monthlyTrend} />
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">科目別平均スコア</h2>
            {subjectData.length === 0 ? (
              <p className="text-sm text-slate-400">この期間にデータがありません</p>
            ) : (
              <div className="space-y-4">
                {subjectData.map(({ subject, avg: a, count }) => (
                  <div key={subject}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">{subject}</span>
                      <span className="text-slate-400">{count}件</span>
                    </div>
                    <HBar value={a} color={barColor(a)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 学習診断4軸 */}
        {diagAxes ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-5 text-sm font-semibold text-slate-700">
              学習診断スコア（4軸平均 · {PERIOD_LABEL[period]}）
            </h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "習慣スコア", value: diagAxes.habit, color: "bg-violet-500", text: "text-violet-600" },
                { label: "方法スコア", value: diagAxes.method, color: "bg-indigo-500", text: "text-indigo-600" },
                { label: "言語スコア", value: diagAxes.verbal, color: "bg-sky-500", text: "text-sky-600" },
                { label: "スキルスコア", value: diagAxes.skill, color: "bg-teal-500", text: "text-teal-600" },
              ].map(({ label, value, color, text }) => (
                <div key={label} className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500 mb-1">{label}</p>
                  <p className={`text-2xl font-bold mb-3 ${text}`}>{value}%</p>
                  <HBar value={value} color={color} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">学習診断スコア（4軸平均）</h2>
            <p className="text-sm text-slate-400">
              この期間に分析済みの診断データがありません
            </p>
          </div>
        )}

        {/* 生徒別サマリー */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">
            生徒別サマリー（{PERIOD_LABEL[period]}）
          </h2>
          {studentSummary.length === 0 ? (
            <p className="text-sm text-slate-400">この期間にデータのある生徒がいません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-3 text-left text-xs font-semibold text-slate-400">生徒名</th>
                    <th className="pb-3 text-left text-xs font-semibold text-slate-400">学年</th>
                    <th className="pb-3 text-right text-xs font-semibold text-slate-400">最新スコア</th>
                    <th className="pb-3 text-right text-xs font-semibold text-slate-400">診断回数</th>
                    <th className="pb-3 text-right text-xs font-semibold text-slate-400">習慣スコア</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {studentSummary.map((s) => (
                    <tr key={s.name} className="transition hover:bg-slate-50">
                      <td className="py-3 font-medium text-slate-700">{s.name}</td>
                      <td className="py-3 text-slate-500">{s.grade ?? "—"}</td>
                      <td className="py-3 text-right">
                        {s.latestScore != null ? (
                          <span className={`font-bold ${scoreColor(s.latestScore)}`}>
                            {s.latestScore}%
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-3 text-right text-slate-500">
                        {s.diagCount > 0 ? `${s.diagCount}回` : "—"}
                      </td>
                      <td className="py-3 text-right">
                        {s.habitScore != null ? (
                          <span className="font-semibold text-violet-600">{s.habitScore}%</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
