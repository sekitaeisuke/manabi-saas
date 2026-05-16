"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useSelectedStudentId } from "@/lib/useSelectedStudent";

type QResponse = {
  id: string;
  student_name: string;
  grade: string | null;
  subject: string | null;
  test_score: number | null;
  test_total: number | null;
  test_percentage: number | null;
  habit_score: number | null;
  method_score: number | null;
  verbal_score: number | null;
  skill_score: number | null;
  report_html: string | null;
  teacher_notes: string | null;
  created_at: string;
};

function ScoreBar({ label, score }: { label: string; score: number | null }) {
  const pct = score ?? 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-900">{score ?? "—"}{score != null && "%"}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full ${
            pct >= 80 ? "bg-green-500"
            : pct >= 60 ? "bg-blue-500"
            : pct >= 40 ? "bg-yellow-500"
            : "bg-red-500"
          }`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

export default function ParentDiagnosisPage() {
  const [selectedId] = useSelectedStudentId();
  const [responses, setResponses] = useState<QResponse[]>([]);
  const [selected, setSelected] = useState<QResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    const { data: stu } = await supabase.from("students").select("name").eq("id", selectedId).maybeSingle();
    if (!stu) { setLoading(false); return; }
    const { data } = await supabase
      .from("questionnaire_responses")
      .select("id, student_name, grade, subject, test_score, test_total, test_percentage, habit_score, method_score, verbal_score, skill_score, report_html, teacher_notes, created_at")
      .eq("student_name", stu.name)
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    setResponses((data as QResponse[]) ?? []);
    setLoading(false);
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  if (selected) {
    return (
      <div className="px-6 py-10 text-slate-900">
        <style>{`
          #q-html h2 { font-size:1.05rem; font-weight:700; margin:20px 0 8px; border-left:4px solid #2563eb; padding-left:10px; color:#1e293b; }
          #q-html h3 { font-size:0.95rem; font-weight:600; margin:14px 0 6px; color:#334155; }
          #q-html p, #q-html li { line-height:1.8; font-size:0.9rem; color:#475569; }
          #q-html ul { padding-left:1.5rem; }
        `}</style>
        <main className="mx-auto max-w-4xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-950">多層型学力診断レポート</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                {selected.subject} ・ {selected.grade} ・ {selected.created_at.slice(0, 10)}
              </p>
            </div>
            <button onClick={() => setSelected(null)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              一覧に戻る
            </button>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-900">スコア概要</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <ScoreBar label="学習習慣"  score={selected.habit_score} />
              <ScoreBar label="学習方法"  score={selected.method_score} />
              <ScoreBar label="言語力"    score={selected.verbal_score} />
              <ScoreBar label="技能"      score={selected.skill_score} />
            </div>
            {selected.test_percentage != null && (
              <div className="mt-6 border-t border-slate-100 pt-4">
                <ScoreBar label="診断テスト 正答率" score={selected.test_percentage} />
              </div>
            )}
          </div>

          {selected.report_html ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <div id="q-html" dangerouslySetInnerHTML={{ __html: selected.report_html }} />
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-400">
              レポート本文がありません。
            </div>
          )}

          {selected.teacher_notes && (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
              <h3 className="mb-2 font-semibold text-amber-900">【講師より】</h3>
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{selected.teacher_notes}</p>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-950">多層型学力診断</h1>
          <p className="mt-1 text-slate-600">講師が承認した診断結果のみを表示します。</p>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中...</div>
        ) : responses.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            共有された診断結果はまだありません。
          </div>
        ) : (
          <div className="space-y-3">
            <TrendChart responses={[...responses].reverse()} />
            {responses.map((r) => (
              <button key={r.id} onClick={() => setSelected(r)}
                className="block w-full rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md">
                <p className="mb-1 text-xs text-slate-400">{r.created_at.slice(0, 10)}</p>
                <p className="text-lg font-bold text-slate-900">{r.subject ?? "—"} 多層診断</p>
                <p className="mt-0.5 text-sm text-slate-500">{r.grade}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <ScorePill label="習慣" v={r.habit_score} />
                  <ScorePill label="方法" v={r.method_score} />
                  <ScorePill label="言語" v={r.verbal_score} />
                  <ScorePill label="技能" v={r.skill_score} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScorePill({ label, v }: { label: string; v: number | null }) {
  if (v == null) {
    return <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-500">{label}：—</span>;
  }
  const cls =
    v >= 80 ? "bg-green-100 text-green-700"
    : v >= 60 ? "bg-blue-100 text-blue-700"
    : v >= 40 ? "bg-yellow-100 text-yellow-700"
    : "bg-red-100 text-red-700";
  return <span className={`rounded-full px-3 py-1 font-semibold ${cls}`}>{label}：{v}%</span>;
}

function TrendChart({ responses }: { responses: QResponse[] }) {
  const points = responses.filter((r) =>
    r.habit_score != null || r.method_score != null || r.verbal_score != null || r.skill_score != null
  );
  if (points.length < 2) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">スコア推移</h3>
        <p className="mt-2 text-xs text-slate-400">2件以上の診断が蓄積されると推移グラフが表示されます。</p>
      </div>
    );
  }

  const width = 720;
  const height = 220;
  const padL = 36;
  const padR = 16;
  const padT = 16;
  const padB = 36;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const xAt = (i: number) => padL + (points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
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
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">スコア推移</h3>
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
