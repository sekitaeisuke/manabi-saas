"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { AttendanceRecord } from "@/lib/supabase";
import { showToast } from "@/lib/toast";

type Teacher = { id: string; name: string; email: string | null };

type Summary = {
  teacher: Teacher;
  days: number;
  workMinutes: number;
  transportTotal: number;
  records: AttendanceRecord[];
};

function calcWorkMinutes(r: AttendanceRecord): number {
  if (!r.clock_in || !r.clock_out) return 0;
  return Math.max(0, (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 60000 - r.break_minutes);
}
function fmtMin(min: number): string {
  if (min <= 0) return "0h00m";
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2,"0")}m`;
}
function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ja-JP", { hour:"2-digit", minute:"2-digit" });
}
const DOW = ["日","月","火","水","木","金","土"];

export default function AttendanceAdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [ym, setYm]           = useState<string>(new Date().toISOString().slice(0,7));
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing]   = useState<AttendanceRecord | null>(null);
  const [editForm, setEditForm] = useState({ clock_in:"", clock_out:"", break_minutes:0, transportation_fee:0, transportation_note:"", notes:"" });

  useEffect(() => {
    supabase.auth.getSession().then(({ data:{ session } }) => {
      if (!session) { setIsAdmin(false); return; }
      supabase.from("teachers").select("role").eq("email", session.user.email!).maybeSingle()
        .then(({ data }) => setIsAdmin(data?.role === "admin"));
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const startDate = `${ym}-01`;
    const endDate   = `${ym}-${new Date(parseInt(ym.slice(0,4)), parseInt(ym.slice(5,7)), 0).getDate()}`;

    const [teachersRes, recsRes] = await Promise.all([
      supabase.from("teachers").select("id,name,email").order("name"),
      supabase.from("attendance_records").select("*").gte("work_date", startDate).lte("work_date", endDate).order("work_date"),
    ]);

    const teachers = (teachersRes.data ?? []) as Teacher[];
    const recs     = (recsRes.data ?? []) as AttendanceRecord[];

    const sum: Summary[] = teachers.map((t) => {
      const myRecs = recs.filter((r) => r.teacher_id === t.id);
      return {
        teacher: t,
        days: myRecs.filter((r) => r.clock_in).length,
        workMinutes: myRecs.reduce((a, r) => a + calcWorkMinutes(r), 0),
        transportTotal: myRecs.reduce((a, r) => a + r.transportation_fee, 0),
        records: myRecs,
      };
    });

    setSummaries(sum);
    setLoading(false);
  }, [ym]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  // 月移動
  const changeMonth = (delta: number) => {
    const d = new Date(`${ym}-01`);
    d.setMonth(d.getMonth() + delta);
    setYm(d.toISOString().slice(0, 7));
  };

  // 給与システム用テキスト生成
  const exportText = () => {
    const lines = [`【${ym.replace("-","年")}月 出勤怠集計】\n`];
    for (const s of summaries) {
      if (s.days === 0) continue;
      lines.push(`■ ${s.teacher.name}`);
      lines.push(`  出勤日数: ${s.days}日  勤務時間: ${fmtMin(s.workMinutes)}  交通費: ¥${s.transportTotal.toLocaleString()}`);
      for (const r of s.records) {
        if (!r.clock_in) continue;
        const wm = calcWorkMinutes(r);
        lines.push(`  ${r.work_date.slice(5).replace("-","/")}(${DOW[new Date(r.work_date).getDay()]}) ${fmtTime(r.clock_in)}〜${fmtTime(r.clock_out)} ${fmtMin(wm)}${r.transportation_fee>0?` 交通費¥${r.transportation_fee}`:""}${r.notes?` (${r.notes})`:""}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  };

  const copyExport = () => {
    navigator.clipboard.writeText(exportText());
    showToast("クリップボードにコピーしました", "success");
  };

  // レコード編集
  const startEdit = (r: AttendanceRecord) => {
    setEditing(r);
    setEditForm({
      clock_in: r.clock_in ? new Date(r.clock_in).toISOString().slice(0,16) : "",
      clock_out: r.clock_out ? new Date(r.clock_out).toISOString().slice(0,16) : "",
      break_minutes: r.break_minutes,
      transportation_fee: r.transportation_fee,
      transportation_note: r.transportation_note ?? "",
      notes: r.notes ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase.from("attendance_records").update({
      clock_in: editForm.clock_in ? new Date(editForm.clock_in).toISOString() : null,
      clock_out: editForm.clock_out ? new Date(editForm.clock_out).toISOString() : null,
      break_minutes: editForm.break_minutes,
      transportation_fee: editForm.transportation_fee,
      transportation_note: editForm.transportation_note || null,
      notes: editForm.notes || null,
    }).eq("id", editing.id);
    if (error) { showToast("更新失敗: " + error.message, "error"); return; }
    showToast("更新しました", "success");
    setEditing(null);
    load();
  };

  const deleteRec = async (id: string) => {
    if (!confirm("この記録を削除しますか？\n出勤・退勤・交通費すべて削除されます。")) return;
    const { error } = await supabase.from("attendance_records").delete().eq("id", id);
    if (error) { showToast("削除失敗: " + error.message, "error"); return; }
    showToast("削除しました", "success");
    load();
  };

  if (isAdmin === null) return <div className="flex h-screen items-center justify-center text-slate-400">確認中...</div>;
  if (!isAdmin) return (
    <div className="flex h-screen flex-col items-center justify-center text-slate-500">
      <span className="text-4xl">🔒</span><p className="mt-2 font-semibold">管理者のみアクセスできます</p>
    </div>
  );

  const totalDays = summaries.reduce((a, s) => a + s.days, 0);
  const totalTransport = summaries.reduce((a, s) => a + s.transportTotal, 0);

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl">

        {/* ヘッダー */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">出勤怠 月次集計</h1>
            <p className="text-sm text-slate-500 mt-0.5">給与システムへの入力用データ</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => changeMonth(-1)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">←</button>
            <span className="min-w-[7rem] text-center font-semibold text-slate-800">{ym.replace("-","年")}月</span>
            <button onClick={() => changeMonth(1)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">→</button>
            {ym !== new Date().toISOString().slice(0,7) && (
              <button onClick={() => setYm(new Date().toISOString().slice(0,7))}
                className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                今月
              </button>
            )}
          </div>
        </div>

        {/* 月合計サマリー */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          {[
            { label: "出勤延日数", value: `${totalDays}日` },
            { label: "交通費合計", value: `¥${totalTransport.toLocaleString()}` },
            { label: "記録講師数", value: `${summaries.filter(s=>s.days>0).length}名` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-2xl bg-white p-4 shadow-sm text-center">
              <p className="text-xs text-slate-400">{label}</p>
              <p className="text-xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        {/* エクスポート */}
        <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">給与システム用テキスト</p>
            <button onClick={copyExport}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
              📋 コピー
            </button>
          </div>
          <pre className="mt-3 max-h-48 overflow-y-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-600 whitespace-pre-wrap">
            {exportText()}
          </pre>
        </div>

        {/* 講師別テーブル */}
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-8 text-slate-400">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
              <span>読み込み中...</span>
            </div>
          ) : (
            summaries.map((s) => (
              <div key={s.teacher.id} className="rounded-2xl bg-white shadow-sm overflow-hidden">
                {/* 講師ヘッダー行 */}
                <button
                  onClick={() => setExpanded(expanded === s.teacher.id ? null : s.teacher.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-slate-800">{s.teacher.name}</span>
                    {s.days === 0 && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-400">記録なし</span>}
                  </div>
                  <div className="flex items-center gap-5 text-sm">
                    <span className="text-slate-500">{s.days}日</span>
                    <span className="font-semibold text-indigo-600">{fmtMin(s.workMinutes)}</span>
                    <span className={`font-semibold ${s.transportTotal > 0 ? "text-green-700" : "text-slate-300"}`}>
                      ¥{s.transportTotal.toLocaleString()}
                    </span>
                    <span className="text-slate-300 text-xs">{expanded === s.teacher.id ? "▲" : "▼"}</span>
                  </div>
                </button>

                {/* 展開: 日別詳細 */}
                {expanded === s.teacher.id && (
                  <div className="border-t border-slate-100 px-5 pb-4">
                    {s.records.length === 0 ? (
                      <p className="py-3 text-sm text-slate-400">この月の記録はありません</p>
                    ) : (
                      <table className="w-full text-sm mt-3">
                        <thead>
                          <tr className="text-xs text-slate-400 border-b border-slate-100">
                            <th className="pb-2 text-left">日付</th>
                            <th className="pb-2 text-center">出勤</th>
                            <th className="pb-2 text-center">退勤</th>
                            <th className="pb-2 text-center">勤務</th>
                            <th className="pb-2 text-center">休憩</th>
                            <th className="pb-2 text-center">交通費</th>
                            <th className="pb-2 text-left">備考</th>
                            <th className="pb-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {s.records.map((r) => (
                            <tr key={r.id} className="text-slate-700">
                              <td className="py-2 font-medium whitespace-nowrap">
                                {r.work_date.slice(5).replace("-","/")}
                                <span className="text-xs text-slate-400 ml-1">({DOW[new Date(r.work_date).getDay()]})</span>
                              </td>
                              <td className="py-2 text-center">{fmtTime(r.clock_in)}</td>
                              <td className="py-2 text-center">{fmtTime(r.clock_out)}</td>
                              <td className="py-2 text-center font-semibold text-indigo-600">{fmtMin(calcWorkMinutes(r))}</td>
                              <td className="py-2 text-center text-xs text-slate-400">{r.break_minutes}分</td>
                              <td className="py-2 text-center">
                                {r.transportation_fee > 0
                                  ? <span className="text-green-700 font-medium">¥{r.transportation_fee.toLocaleString()}</span>
                                  : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="py-2 text-xs text-slate-400 max-w-[8rem] truncate">{r.notes ?? r.transportation_note ?? ""}</td>
                              <td className="py-2 text-right whitespace-nowrap">
                                <button onClick={() => startEdit(r)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 border border-blue-200">編集</button>
                                <button onClick={() => deleteRec(r.id)} className="ml-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 border border-red-200">削除</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-slate-200 font-semibold text-sm">
                            <td className="pt-2 text-slate-500">合計</td>
                            <td /><td />
                            <td className="pt-2 text-center text-indigo-600">{fmtMin(s.workMinutes)}</td>
                            <td />
                            <td className="pt-2 text-center text-green-700">¥{s.transportTotal.toLocaleString()}</td>
                            <td /><td />
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 編集モーダル */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="mb-5 text-lg font-bold text-slate-900">記録を編集</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">出勤時刻</label>
                  <input type="datetime-local" value={editForm.clock_in} onChange={(e) => setEditForm({...editForm, clock_in:e.target.value})}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">退勤時刻</label>
                  <input type="datetime-local" value={editForm.clock_out} onChange={(e) => setEditForm({...editForm, clock_out:e.target.value})}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">休憩（分）</label>
                  <input type="number" value={editForm.break_minutes} onChange={(e) => setEditForm({...editForm, break_minutes:parseInt(e.target.value)||0})}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">交通費（円）</label>
                  <input type="number" value={editForm.transportation_fee} onChange={(e) => setEditForm({...editForm, transportation_fee:parseInt(e.target.value)||0})}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">交通費メモ</label>
                <input value={editForm.transportation_note} onChange={(e) => setEditForm({...editForm, transportation_note:e.target.value})}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">備考</label>
                <input value={editForm.notes} onChange={(e) => setEditForm({...editForm, notes:e.target.value})}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setEditing(null)} className="flex-1 rounded-2xl border-2 border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                キャンセル
              </button>
              <button onClick={saveEdit} className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
