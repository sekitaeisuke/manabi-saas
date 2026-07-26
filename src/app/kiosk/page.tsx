"use client";

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { findMatch } from "@/lib/faceRecognition";
import { FaceCamera } from "@/components/FaceCamera";

type RecognitionResult = {
  ok: boolean;
  studentId: string;
  name: string;
  grade: string;
  type: "entry" | "exit";
};

type CleanState = "idle" | "busy" | "done" | "already";

export default function KioskPage() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clean, setClean] = useState<CleanState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResetTimer = () => { if (resetTimer.current) { clearTimeout(resetTimer.current); resetTimer.current = null; } };

  const reset = useCallback(() => {
    clearResetTimer();
    setResult(null);
    setError(null);
    setScanning(false);
    setClean("idle");
  }, []);

  const scheduleReset = useCallback((ms: number) => {
    clearResetTimer();
    resetTimer.current = setTimeout(reset, ms);
  }, [reset]);

  const handleDescriptor = useCallback(async (descriptor: Float32Array) => {
    setScanning(false);
    const matchedId = await findMatch("student", descriptor);
    if (!matchedId) {
      setError("認識できませんでした。もう一度試してください。");
      scheduleReset(3000);
      return;
    }

    const { data: student } = await supabase
      .from("students").select("name, grade").eq("id", matchedId).maybeSingle();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: last } = await supabase
      .from("student_room_logs")
      .select("type")
      .eq("student_id", matchedId)
      .gte("recorded_at", today.toISOString())
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const type: "entry" | "exit" = last?.type === "entry" ? "exit" : "entry";

    await supabase.from("student_room_logs").insert({
      student_id: matchedId,
      type,
      method: "face",
    });

    setResult({ ok: true, studentId: matchedId, name: student?.name ?? "—", grade: student?.grade ?? "—", type });
    setClean("idle");
    scheduleReset(6000); // 掃除ボタンを押す余地を持たせる
  }, [scheduleReset]);

  const doClean = useCallback(async () => {
    if (!result) return;
    clearResetTimer();
    setClean("busy");
    try {
      const r = await fetch("/api/economy/kiosk-action", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ student_id: result.studentId, kind: "clean" }),
      });
      const d = await r.json().catch(() => ({}));
      setClean(r.ok && d.awarded > 0 ? "done" : "already");
    } catch {
      setClean("already");
    }
    scheduleReset(2500);
  }, [result, scheduleReset]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-6 text-white">
      <div className="w-full max-w-sm text-center">

        <h1 className="mb-2 text-3xl font-bold tracking-tight">教育工房</h1>
        <p className="mb-8 text-slate-400">入退室管理</p>

        {!scanning && !result && !error && (
          <button
            onClick={() => setScanning(true)}
            className="w-full rounded-3xl bg-indigo-600 py-5 text-xl font-bold text-white hover:bg-indigo-700 active:scale-95 transition-transform">
            顔認証でチェックイン
          </button>
        )}

        {scanning && (
          <div>
            <FaceCamera
              label="カメラに顔を向けてください"
              onDescriptor={handleDescriptor}
              onError={(msg) => { setError(msg); scheduleReset(3000); }}
            />
            <button onClick={reset} className="mt-4 text-sm text-slate-400 hover:text-white">キャンセル</button>
          </div>
        )}

        {result && (
          <div className={`rounded-3xl p-8 ${result.type === "entry" ? "bg-green-600" : "bg-blue-600"}`}>
            <p className="text-6xl mb-4">{result.type === "entry" ? "👋" : "🚪"}</p>
            <p className="text-4xl font-bold mb-1">{result.name}</p>
            <p className="text-lg text-white/80 mb-4">{result.grade}</p>
            <p className="text-2xl font-semibold">
              {result.type === "entry" ? "入室しました" : "退室しました"}
            </p>
            <p className="mt-2 text-white/60 text-sm">
              {new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
            </p>

            {/* 掃除ボタン（押すと当日1回だけACが入る） */}
            <div className="mt-5 border-t border-white/20 pt-4">
              {clean === "done" ? (
                <p className="text-lg font-bold">🧹 掃除ありがとう！ ＋AC を付与しました</p>
              ) : clean === "already" ? (
                <p className="text-white/80">本日はもう掃除ポイント済みです</p>
              ) : (
                <button
                  onClick={doClean}
                  disabled={clean === "busy"}
                  className="w-full rounded-2xl bg-white/15 py-3 text-lg font-bold text-white hover:bg-white/25 active:scale-95 transition disabled:opacity-50">
                  🧹 掃除した（AC ゲット）
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-3xl bg-red-800 p-8">
            <p className="text-4xl mb-3">⚠️</p>
            <p className="text-lg font-semibold">{error}</p>
          </div>
        )}

      </div>
    </div>
  );
}
