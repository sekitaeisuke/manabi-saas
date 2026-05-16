"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { findMatch } from "@/lib/faceRecognition";
import { FaceCamera } from "@/components/FaceCamera";
import type { Teacher } from "@/lib/supabase";

type AttendanceLog = {
  id: string;
  teacher_id: string;
  type: "clock_in" | "clock_out";
  recorded_at: string;
  method: string;
};

export default function TeacherAttendancePage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanType, setScanType] = useState<"clock_in" | "clock_out">("clock_in");
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [{ data: ts }, { data: ls }] = await Promise.all([
      supabase.from("teachers").select("*").order("name"),
      supabase.from("teacher_attendance")
        .select("*")
        .gte("recorded_at", todayStart.toISOString())
        .order("recorded_at", { ascending: false }),
    ]);
    setTeachers(ts ?? []);
    setLogs((ls as AttendanceLog[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleDescriptor = async (descriptor: Float32Array) => {
    setScanning(false);
    const matchedId = await findMatch("teacher", descriptor);
    if (!matchedId) {
      setResult({ ok: false, msg: "登録された顔と一致しませんでした。顔登録が必要です。" });
      return;
    }
    const teacher = teachers.find(t => t.id === matchedId);
    const { error } = await supabase.from("teacher_attendance").insert({
      teacher_id: matchedId,
      type: scanType,
      method: "face",
    });
    if (error) {
      setResult({ ok: false, msg: `記録失敗: ${error.message}` });
    } else {
      setResult({
        ok: true,
        msg: `${teacher?.name ?? "不明"} の${scanType === "clock_in" ? "出勤" : "退勤"}を記録しました`,
      });
      loadLogs();
    }
  };

  const teacherName = (id: string) => teachers.find(t => t.id === id)?.name ?? "—";

  const todayStatus = (teacherId: string) => {
    const tLogs = logs.filter(l => l.teacher_id === teacherId);
    const clockIn = tLogs.find(l => l.type === "clock_in");
    const clockOut = tLogs.find(l => l.type === "clock_out");
    if (clockOut) return { label: "退勤済", cls: "bg-slate-100 text-slate-600" };
    if (clockIn) return { label: "出勤中", cls: "bg-green-100 text-green-700" };
    return { label: "未出勤", cls: "bg-amber-50 text-amber-600" };
  };

  return (
    <div className="px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">出退勤管理</h1>
            <p className="mt-1 text-slate-500 text-sm">{today}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setScanType("clock_in"); setResult(null); setScanning(true); }}
              className="rounded-2xl bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700">
              顔認証で出勤
            </button>
            <button
              onClick={() => { setScanType("clock_out"); setResult(null); setScanning(true); }}
              className="rounded-2xl bg-slate-700 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
              顔認証で退勤
            </button>
          </div>
        </div>

        {result && (
          <div className={`mb-6 rounded-2xl px-5 py-4 text-sm font-semibold ${result.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {result.msg}
            <button onClick={() => setResult(null)} className="ml-4 text-xs opacity-60 hover:opacity-100">閉じる</button>
          </div>
        )}

        {scanning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
              <h3 className="mb-4 text-center text-lg font-bold text-slate-950">
                {scanType === "clock_in" ? "出勤" : "退勤"}認証
              </h3>
              <FaceCamera
                label="顔をカメラに向けてください（自動認識）"
                onDescriptor={handleDescriptor}
                onError={(msg) => { setResult({ ok: false, msg }); setScanning(false); }}
              />
              <button onClick={() => setScanning(false)} className="mt-4 w-full rounded-2xl border border-slate-300 py-2 text-sm text-slate-600 hover:bg-slate-50">
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* 本日の状況 */}
        <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-800">本日の出退勤状況</h2>
          {loading ? (
            <p className="text-sm text-slate-400">読み込み中...</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {teachers.map(t => {
                const s = todayStatus(t.id);
                return (
                  <div key={t.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                    <span className="text-sm font-medium text-slate-800">{t.name}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.cls}`}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ログ */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-800">本日のログ</h2>
          {logs.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">本日の記録はありません</p>
          ) : (
            <div className="space-y-2">
              {logs.map(l => (
                <div key={l.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-2.5 text-sm">
                  <span className="font-medium text-slate-900">{teacherName(l.teacher_id)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${l.type === "clock_in" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700"}`}>
                    {l.type === "clock_in" ? "出勤" : "退勤"}
                  </span>
                  <span className="text-slate-500">
                    {new Date(l.recorded_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-xs text-slate-400">{l.method === "face" ? "顔認証" : "手動"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
