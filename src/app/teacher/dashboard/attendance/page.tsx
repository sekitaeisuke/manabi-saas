"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { AttendanceRecord } from "@/lib/supabase";
import { FaceCamera } from "@/components/FaceCamera";
import { findMatch } from "@/lib/faceRecognition";
import { showToast } from "@/lib/toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Skeleton } from "@/components/Skeleton";
import { triggerConfetti } from "@/lib/confetti";
import Link from "next/link";

function calcWorkMinutes(rec: AttendanceRecord): number {
  if (!rec.clock_in || !rec.clock_out) return 0;
  return Math.max(0, (new Date(rec.clock_out).getTime() - new Date(rec.clock_in).getTime()) / 60000 - rec.break_minutes);
}
function fmtMin(min: number): string {
  if (min <= 0) return "—";
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2,"0")}m`;
}
function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ja-JP", { hour:"2-digit", minute:"2-digit" });
}
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type InputMode = "select" | "face" | "manual";

export default function AttendancePage() {
  const [teacherId, setTeacherId]   = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState("");
  const [schoolId, setSchoolId]     = useState<string | null>(null);
  const [todayRec, setTodayRec]     = useState<AttendanceRecord | null>(null);
  const [monthRecs, setMonthRecs]   = useState<AttendanceRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [mode, setMode]             = useState<InputMode>("select");
  const [busy, setBusy]             = useState(false);

  // 退勤フォーム
  const [showForm, setShowForm]           = useState(false);
  const [pendingMethod, setPendingMethod] = useState<"face"|"manual">("manual");
  const [transportFee, setTransportFee]   = useState("");
  const [transportNote, setTransportNote] = useState("");
  const [breakMin, setBreakMin]           = useState("0");
  const [noteText, setNoteText]           = useState("");
  const [faceRetryCount, setFaceRetryCount] = useState(0);
  const [showDetails, setShowDetails]     = useState(true);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const today   = todayStr();
  const ym      = today.slice(0, 7);
  const monthEnd = `${ym}-${new Date(parseInt(ym.slice(0,4)), parseInt(ym.slice(5,7)), 0).getDate()}`;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      supabase.from("teachers").select("id,name,school_id").eq("email", session.user.email!).maybeSingle()
        .then(({ data }) => {
          if (data) { setTeacherId(data.id); setTeacherName(data.name); setSchoolId(data.school_id ?? null); }
        });
    });
  }, []);

  const load = useCallback(async () => {
    if (!teacherId) return;
    setLoading(true);
    const [a, b] = await Promise.all([
      supabase.from("attendance_records").select("*").eq("teacher_id", teacherId).eq("work_date", today).maybeSingle(),
      supabase.from("attendance_records").select("*").eq("teacher_id", teacherId).gte("work_date", `${ym}-01`).lte("work_date", monthEnd).order("work_date", { ascending: false }),
    ]);
    setTodayRec(a.data as AttendanceRecord | null);
    setMonthRecs((b.data ?? []) as AttendanceRecord[]);
    setLoading(false);
  }, [teacherId, today, ym, monthEnd]);

  useEffect(() => { load(); }, [load]);

  const doClockIn = async (method: "face"|"manual") => {
    if (!teacherId || busy) return;
    // すでに出勤記録がある場合は何もしない
    if (todayRec?.clock_in) { showToast("本日はすでに出勤済みです", "info"); setMode("select"); return; }
    setBusy(true);
    const { data, error } = await supabase.from("attendance_records").insert({
      teacher_id: teacherId, school_id: schoolId, work_date: today,
      clock_in: new Date().toISOString(), entry_method: method, status: "present",
    }).select().single();
    setBusy(false);
    if (error) { showToast("出勤記録に失敗: " + error.message, "error"); return; }
    if (!data) { showToast("記録の取得に失敗しました", "error"); return; }
    setTodayRec(data as AttendanceRecord);
    setMode("select");
    triggerConfetti();
    showToast("出勤しました！今日もよろしくお願いします", "success", 4000);
    load();
  };

  const openClockOutForm = (method: "face"|"manual") => {
    setPendingMethod(method); setMode("select"); setShowForm(true);
  };

  const doClockOut = async () => {
    if (!teacherId || !todayRec || busy) return;
    setBusy(true);
    const { data, error } = await supabase.from("attendance_records").update({
      clock_out: new Date().toISOString(),
      break_minutes: parseInt(breakMin) || 0,
      transportation_fee: parseInt(transportFee) || 0,
      transportation_note: transportNote || null,
      notes: noteText || null,
      entry_method: pendingMethod,
    }).eq("id", todayRec.id).select().single();
    setBusy(false);
    if (error) { showToast("退勤記録に失敗: " + error.message, "error"); return; }
    if (!data) { showToast("記録の取得に失敗しました", "error"); return; }
    setTodayRec(data as AttendanceRecord);
    setShowForm(false);
    setShowDetails(false);
    setTransportFee(""); setTransportNote(""); setBreakMin("0"); setNoteText("");
    showToast("退勤しました！お疲れさまでした", "success", 4000);
    load();
  };

  const onFace = async (descriptor: Float32Array) => {
    const matchId = await findMatch("teacher", descriptor);
    if (!matchId || matchId !== teacherId) {
      const newCount = faceRetryCount + 1;
      setFaceRetryCount(newCount);
      if (newCount === 1) {
        showToast("もう一度カメラを見てください", "info");
      } else if (newCount >= 2) {
        showToast("顔認証できませんでした。手動入力に切り替えてください。", "error");
        setMode("select");
        setFaceRetryCount(0);
      }
      return;
    }
    setFaceRetryCount(0);
    const isIn = !!todayRec?.clock_in && !todayRec?.clock_out;
    if (!todayRec?.clock_in) { await doClockIn("face"); }
    else if (isIn) { openClockOutForm("face"); }
    else { showToast("本日はすでに退勤済みです。", "info"); setMode("select"); }
  };

  // 退勤取り消し（誤打刻対応）
  const cancelClockOut = () => { setConfirmCancelOpen(true); };

  const doCancelClockOut = async () => {
    setConfirmCancelOpen(false);
    if (!todayRec) return;
    setBusy(true);
    const { error } = await supabase.from("attendance_records").update({
      clock_out: null, break_minutes: 0, transportation_fee: 0,
      transportation_note: null, notes: null,
    }).eq("id", todayRec.id);
    setBusy(false);
    if (error) { showToast("取り消しに失敗: " + error.message, "error"); return; }
    showToast("退勤記録を取り消しました", "success");
    load();
  };

  const isWorking = !!todayRec?.clock_in && !todayRec?.clock_out;
  const isDone    = !!todayRec?.clock_in && !!todayRec?.clock_out;

  const statusLabel = isDone ? "退勤済" : isWorking ? "出勤中" : "未出勤";
  const statusColor = isDone ? "bg-blue-100 text-blue-700" : isWorking ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500";

  const monthTotal = monthRecs.reduce((a, r) => ({
    workMin: a.workMin + calcWorkMinutes(r),
    transport: a.transport + r.transportation_fee,
    days: a.days + (r.clock_in ? 1 : 0),
  }), { workMin: 0, transport: 0, days: 0 });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-2xl">

        {/* ヘッダー */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">出退勤</h1>
            <p className="mt-0.5 text-sm text-slate-400">
              {new Date().toLocaleDateString("ja-JP", { year:"numeric", month:"long", day:"numeric", weekday:"long" })}
            </p>
          </div>
          <Link href="/teacher/dashboard/attendance/admin"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 shadow-sm">
            月次集計 →
          </Link>
        </div>

        {/* 今日のステータスカード（退勤済みは大きく表示） */}
        {isDone ? (
          <div className="mb-6 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-80">本日の勤務完了</p>
                <p className="mt-1 text-3xl font-extrabold">お疲れさまでした！</p>
              </div>
              <div className="text-4xl">✅</div>
            </div>
            {todayRec && (
              <div className="mt-4 grid grid-cols-3 gap-3 rounded-2xl bg-white/20 p-3 text-sm">
                <div className="text-center">
                  <p className="opacity-70 text-xs">出勤</p>
                  <p className="font-bold text-base">{fmtTime(todayRec.clock_in)}</p>
                </div>
                <div className="text-center">
                  <p className="opacity-70 text-xs">退勤</p>
                  <p className="font-bold text-base">{fmtTime(todayRec.clock_out)}</p>
                </div>
                <div className="text-center">
                  <p className="opacity-70 text-xs">勤務時間</p>
                  <p className="font-bold text-base">{fmtMin(calcWorkMinutes(todayRec))}</p>
                </div>
              </div>
            )}
            {todayRec && todayRec.transportation_fee > 0 && (
              <p className="mt-3 text-center text-sm opacity-80">
                交通費: ¥{todayRec.transportation_fee.toLocaleString()}
                {todayRec.transportation_note ? ` (${todayRec.transportation_note})` : ""}
              </p>
            )}
            <button onClick={cancelClockOut} disabled={busy}
              className="mt-3 w-full rounded-2xl bg-white/10 py-1.5 text-xs hover:bg-white/20 disabled:opacity-50">
              退勤記録を取り消す（誤打刻の場合）
            </button>
          </div>
        ) : (
          <div className={`mb-6 rounded-3xl border p-5 shadow-sm ${
            isWorking ? "border-green-200 bg-green-50" : "border-slate-200 bg-white"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 mb-1">本日の状況</p>
                <span className={`rounded-full px-4 py-1.5 text-sm font-bold ${statusColor}`}>{statusLabel}</span>
              </div>
              {isWorking && todayRec?.clock_in && (
                <div className="text-right">
                  <p className="text-xs text-slate-400">出勤</p>
                  <p className="font-bold text-lg text-green-700">{fmtTime(todayRec.clock_in)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 打刻エリア */}
        {!isDone && (
          <div className="space-y-3 mb-8">
            {mode === "select" && (
              <>
                <button onClick={() => setMode("face")} disabled={busy}
                  className={`w-full rounded-3xl py-7 text-2xl font-extrabold shadow-lg transition active:scale-95 disabled:opacity-50
                    ${isWorking ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-green-500 text-white hover:bg-green-600"}`}>
                  {isWorking ? "📸　顔認証で退勤" : "📸　顔認証で出勤"}
                </button>
                <button onClick={() => setMode("manual")} disabled={busy}
                  className="w-full rounded-3xl border-2 border-slate-200 bg-white py-4 text-base font-semibold text-slate-600 hover:bg-slate-50 active:scale-95">
                  ✏️　手動で{isWorking ? "退勤" : "出勤"}
                </button>
              </>
            )}

            {mode === "face" && (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-semibold text-slate-700">{isWorking ? "退勤" : "出勤"}顔認証</p>
                  <button onClick={() => setMode("select")} className="text-sm text-slate-400 hover:text-slate-600">キャンセル</button>
                </div>
                <FaceCamera onDescriptor={onFace}
                  onError={(e) => { showToast(e, "error"); setMode("select"); }}
                  label={`${teacherName}さん、カメラを見てください`} />
              </div>
            )}

            {mode === "manual" && (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-semibold text-slate-700">手動{isWorking ? "退勤" : "出勤"}</p>
                  <button onClick={() => setMode("select")} className="text-sm text-slate-400 hover:text-slate-600">キャンセル</button>
                </div>
                <p className="mb-4 text-sm text-slate-500">
                  現在時刻 <strong className="text-slate-800 text-base">{new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}</strong> で記録します
                </p>
                <button onClick={() => isWorking ? openClockOutForm("manual") : doClockIn("manual")} disabled={busy}
                  className={`w-full rounded-2xl py-4 text-base font-bold text-white disabled:opacity-50
                    ${isWorking ? "bg-amber-500 hover:bg-amber-600" : "bg-green-500 hover:bg-green-600"}`}>
                  {busy ? "記録中..." : isWorking ? "退勤する" : "出勤する"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 今月のサマリー */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-slate-900">{new Date().getMonth()+1}月の記録</h2>
            <div className="flex gap-4 text-sm">
              <span className="text-slate-500">{monthTotal.days}日</span>
              <span className="font-semibold text-indigo-600">{fmtMin(monthTotal.workMin)}</span>
              <span className="font-semibold text-green-700">交通費 ¥{monthTotal.transport.toLocaleString()}</span>
            </div>
          </div>
          {loading ? (
            <div className="space-y-2 py-2">
              {[1,2,3].map((i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-14" />
                </div>
              ))}
            </div>
          ) : monthRecs.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 py-8 text-center">
              <p className="text-2xl mb-2">📋</p>
              <p className="text-sm text-slate-500">今月の出勤記録はありません</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {monthRecs.map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-16 font-medium text-slate-700">
                    {r.work_date.slice(5).replace("-","/")}
                    <span className="text-[10px] text-slate-400 ml-0.5">({["日","月","火","水","木","金","土"][new Date(r.work_date).getDay()]})</span>
                  </span>
                  <span className="flex-1 text-slate-500 text-xs">{fmtTime(r.clock_in)} 〜 {fmtTime(r.clock_out)}</span>
                  <span className="text-indigo-600 font-medium w-16 text-right">{fmtMin(calcWorkMinutes(r))}</span>
                  <span className={`w-16 text-right font-medium ${r.transportation_fee > 0 ? "text-green-700" : "text-slate-300"}`}>
                    {r.transportation_fee > 0 ? `¥${r.transportation_fee.toLocaleString()}` : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmCancelOpen && (
        <ConfirmModal
          title="退勤記録を取り消す"
          message={"本日の退勤記録を取り消しますか？\n出勤記録は残ります。"}
          confirmLabel="取り消す"
          cancelLabel="戻る"
          danger
          onConfirm={doCancelClockOut}
          onCancel={() => setConfirmCancelOpen(false)}
        />
      )}

      {/* 退勤フォーム（スライドアップ） */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
            <h3 className="mb-5 text-lg font-bold text-slate-900">退勤 — 確認</h3>
            <p className="mb-5 text-sm text-slate-500">
              退勤時刻 <strong className="text-slate-800 text-base">{new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}</strong>
            </p>

            <div className="space-y-5">
              {/* 交通費（必須項目のみ最初に表示） */}
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">交通費（円）</label>
                <div className="flex items-center gap-2">
                  <span className="text-lg text-slate-400">¥</span>
                  <input type="number" inputMode="numeric" value={transportFee}
                    onChange={(e) => setTransportFee(e.target.value)} placeholder="0"
                    className="flex-1 rounded-2xl border-2 border-slate-200 px-4 py-3 text-xl font-semibold focus:border-blue-400 focus:outline-none" />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[0, 200, 330, 500, 660, 820, 1000, 1320].map((v) => (
                    <button key={v} onClick={() => setTransportFee(String(v))}
                      className={`rounded-xl border px-3 py-1 text-xs font-semibold transition
                        ${transportFee === String(v) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                      ¥{v.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* 詳細入力（折りたたみ） */}
              <button type="button" onClick={() => setShowDetails(!showDetails)}
                className="flex w-full items-center gap-2 text-xs text-slate-400 hover:text-slate-600">
                <span>{showDetails ? "▲" : "▼"}</span>
                <span>{showDetails ? "詳細を閉じる" : "交通費メモ・休憩時間・備考を入力する"}</span>
              </button>

              {showDetails && (
                <div className="space-y-4 rounded-2xl bg-slate-50 p-4">
                  {/* 交通費メモ */}
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">交通費メモ（任意）</label>
                    <input value={transportNote} onChange={(e) => setTransportNote(e.target.value)}
                      placeholder="例: 電車往復、バス" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
                  </div>
                  {/* 休憩 */}
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">休憩時間</label>
                    <div className="flex gap-2">
                      {["0","15","30","45","60"].map((v) => (
                        <button key={v} onClick={() => setBreakMin(v)}
                          className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition
                            ${breakMin === v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
                          {v}分
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 備考 */}
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">備考（任意）</label>
                    <input value={noteText} onChange={(e) => setNoteText(e.target.value)}
                      placeholder="例: 早退、補講など" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 rounded-2xl border-2 border-slate-200 py-3.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                戻る
              </button>
              <button onClick={doClockOut} disabled={busy}
                className="flex-1 rounded-2xl bg-amber-500 py-3.5 text-base font-bold text-white hover:bg-amber-600 disabled:opacity-50">
                {busy ? "記録中..." : "退勤する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
