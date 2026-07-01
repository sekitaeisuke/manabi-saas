"use client";
import { sanitizeHtml } from "@/lib/sanitize";
import { authFetch } from "@/lib/authFetch";
import { showToast } from "@/lib/toast";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { StudentKarte } from "@/lib/supabase";

type StudentLite = { id: string; name: string; grade: string };
type DailyTaskRow = { id: string; task_date: string; subject: string | null; content: string; amount: string | null; done: boolean; sort_order: number };

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function taskDateLabel(key: string) {
  const [y, m, dd] = key.split("-").map(Number);
  const wd = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, m - 1, dd).getDay()];
  return `${m}/${dd}（${wd}）`;
}
function groupByDate(tasks: DailyTaskRow[]): Record<string, DailyTaskRow[]> {
  return tasks.reduce<Record<string, DailyTaskRow[]>>((acc, t) => { (acc[t.task_date] ??= []).push(t); return acc; }, {});
}

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-rose-500",
  "bg-amber-500", "bg-indigo-500", "bg-teal-500", "bg-orange-500",
];
const avatarColor = (name: string) => AVATAR_COLORS[(name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function KarteDailyPage() {
  const [rows, setRows] = useState<StudentKarte[]>([]);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StudentKarte | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [genName, setGenName] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [detailTasks, setDetailTasks] = useState<DailyTaskRow[]>([]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const [{ data: karteData }, { data: stuData }] = await Promise.all([
      supabase.from("student_karte").select("*").order("generated_at", { ascending: false }),
      supabase.from("students").select("id, name, grade").order("name"),
    ]);
    setRows((karteData as StudentKarte[]) ?? []);
    setStudents((stuData as StudentLite[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // 詳細を開いたら、その生徒の「毎日のTODO（今日〜今週）」を取得（3か月ビジョン由来・単一の真実）
  useEffect(() => {
    if (!selected) { setDetailTasks([]); return; }
    (async () => {
      let q = supabase
        .from("daily_tasks")
        .select("id, task_date, subject, content, amount, done, sort_order")
        .gte("task_date", keyOf(new Date()))
        .lte("task_date", keyOf(addDays(new Date(), 6)))
        .order("task_date", { ascending: true })
        .order("sort_order", { ascending: true });
      q = selected.learning_plan_id
        ? q.eq("learning_plan_id", selected.learning_plan_id)
        : q.eq("student_id", selected.student_id ?? "");
      const { data } = await q;
      setDetailTasks((data as DailyTaskRow[]) ?? []);
    })();
  }, [selected]);

  const regenerate = async (studentId: string | null, studentName: string) => {
    setBusyId(studentId ?? studentName);
    try {
      const res = await authFetch("/api/karte/daily-view/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(studentId ? { studentId } : { studentName }),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error, "error"); return; }
      showToast(`${studentName} のカルテを更新しました`, "success");
      await fetchRows();
    } catch (e) {
      showToast("再生成に失敗しました: " + String(e), "error");
    } finally {
      setBusyId(null);
    }
  };

  const generateForName = async () => {
    if (!genName.trim()) return;
    setGenBusy(true);
    try {
      const res = await authFetch("/api/karte/daily-view/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentName: genName.trim() }),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error, "error"); return; }
      showToast(`${genName} のカルテを作成しました`, "success");
      setGenName("");
      await fetchRows();
    } catch (e) {
      showToast("作成に失敗しました: " + String(e), "error");
    } finally {
      setGenBusy(false);
    }
  };

  const bulkRegenerate = async () => {
    setBulkBusy(true);
    try {
      const res = await authFetch("/api/karte/daily-view/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error, "error"); return; }
      showToast(`一括生成：${data.created ?? 0}件更新${data.failed ? `（失敗${data.failed}）` : ""}`, "success", 4000);
      await fetchRows();
    } catch (e) {
      showToast("一括生成に失敗しました: " + String(e), "error");
    } finally {
      setBulkBusy(false);
    }
  };

  // ── 詳細 ──────────────────────────────────────────────
  if (selected) {
    const bg = avatarColor(selected.student_name);
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
          <button onClick={() => setSelected(null)}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            ← 一覧
          </button>
          <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${bg} text-sm font-bold text-white`}>
            {selected.student_name.charAt(0)}
          </div>
          <div className="flex-1">
            <span className="font-bold text-slate-900">{selected.student_name}</span>
            <span className="ml-2 text-sm text-slate-400">{selected.grade} ・ 更新 {fmtWhen(selected.generated_at)}</span>
          </div>
          <a href="/teacher/dashboard/progress" className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">教材進捗</a>
          <a href="/teacher/dashboard/reports" className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">報告書</a>
          <button onClick={() => regenerate(selected.student_id, selected.student_name)}
            disabled={busyId === (selected.student_id ?? selected.student_name)}
            className="rounded-xl bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40">
            {busyId === (selected.student_id ?? selected.student_name) ? "更新中…" : "再生成"}
          </button>
        </div>
        <div className="mx-auto max-w-3xl px-6 py-8">
          <div className="rounded-3xl border border-slate-100 bg-white px-8 py-8 shadow-sm">
            <style>{`
              #student-karte h2 { font-size:1rem; font-weight:700; margin:20px 0 8px; padding:6px 12px; background:#f5f3ff; border-left:4px solid #7c3aed; color:#3730a3; border-radius:0 6px 6px 0; }
              #student-karte p { line-height:1.85; font-size:0.9rem; color:#374151; margin:4px 0; }
              #student-karte ul { padding-left:1.4rem; margin:4px 0; }
              #student-karte li { line-height:1.8; font-size:0.9rem; color:#374151; }
              #student-karte .meta { color:#64748b; font-size:0.8rem; }
              #student-karte .empty { color:#94a3b8; }
            `}</style>
            {selected.karte_html
              ? <div id="student-karte" dangerouslySetInnerHTML={{ __html: sanitizeHtml(selected.karte_html) }} />
              : <p className="text-slate-400">カルテHTMLがありません。</p>}
          </div>

          {/* 毎日のTODO（3か月ビジョン由来・チェックは生徒側／ここは閲覧のみ） */}
          <div className="mt-6 rounded-3xl border border-emerald-100 bg-white px-6 py-6 shadow-sm">
            <h3 className="mb-1 font-bold text-slate-900">毎日のTODO（今日〜今週）</h3>
            <p className="mb-3 text-xs text-slate-500">3か月ビジョンから自動生成。生徒がチェックします（ここでは閲覧のみ）。</p>
            {detailTasks.length === 0 ? (
              <p className="text-sm text-slate-400">この期間のTODOはありません（3か月ビジョンを作成すると生成されます）。</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(groupByDate(detailTasks)).map(([date, items]) => (
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
        </div>
      </div>
    );
  }

  // ── 一覧 ──────────────────────────────────────────────
  const filtered = rows.filter((r) => !search || r.student_name.includes(search));

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">カルテ（日次）</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              3か月ビジョン・教材進捗・報告書・保護者要望を集約した「現状＋今日/今週すべきこと」
            </p>
          </div>
          <button onClick={bulkRegenerate} disabled={bulkBusy}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40">
            {bulkBusy ? "一括生成中…" : "全員ぶんを一括再生成"}
          </button>
        </div>

        {/* 個別生成 */}
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-sm font-semibold text-slate-700">生徒を選んで作成:</span>
          <input list="karte-daily-students" value={genName} onChange={(e) => setGenName(e.target.value)}
            placeholder="生徒名を入力または選択"
            className="min-w-[14rem] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400" />
          <datalist id="karte-daily-students">
            {students.map((s) => <option key={s.id} value={s.name}>{s.name}（{s.grade}）</option>)}
          </datalist>
          <button onClick={generateForName} disabled={genBusy || !genName.trim()}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40">
            {genBusy ? "作成中…" : "カルテを作成/更新"}
          </button>
        </div>

        {rows.length > 0 && (
          <div className="mb-4">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="生徒名で検索..."
              className="w-full max-w-sm rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
          </div>
        )}

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-400">読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white py-16 text-center text-slate-500">
            <p className="text-4xl mb-3">🗂️</p>
            <p className="font-semibold text-slate-700">まだカルテがありません</p>
            <p className="mt-1 text-sm">上の「生徒を選んで作成」または「全員ぶんを一括再生成」から作成できます。</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r) => {
              const bg = avatarColor(r.student_name);
              const busy = busyId === (r.student_id ?? r.student_name);
              return (
                <div key={r.id} className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <button onClick={() => setSelected(r)} className="text-left">
                    <div className={`flex items-center gap-3 px-5 py-4 ${bg} bg-opacity-10`}>
                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${bg} text-xl font-bold text-white`}>
                        {r.student_name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-slate-900">{r.student_name}</p>
                        <p className="text-xs text-slate-500">{r.grade} ・ 更新 {fmtWhen(r.generated_at)}</p>
                      </div>
                    </div>
                    <div className="px-5 py-3">
                      <p className="mb-1 text-xs font-semibold text-slate-500">今の状況</p>
                      <p className="line-clamp-3 text-xs text-slate-600">
                        {r.karte_json?.currentStatus || "（未生成）"}
                      </p>
                    </div>
                  </button>
                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-2.5">
                    <button onClick={() => setSelected(r)} className="text-xs font-medium text-violet-600 hover:underline">開く →</button>
                    <button onClick={() => regenerate(r.student_id, r.student_name)} disabled={busy}
                      className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-40">
                      {busy ? "更新中…" : "再生成"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
