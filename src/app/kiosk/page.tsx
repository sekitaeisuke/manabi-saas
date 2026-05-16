"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { findMatch } from "@/lib/faceRecognition";
import { FaceCamera } from "@/components/FaceCamera";

type RecognitionResult = {
  ok: boolean;
  name: string;
  grade: string;
  type: "entry" | "exit";
};

export default function KioskPage() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setScanning(false);
  }, []);

  const handleDescriptor = useCallback(async (descriptor: Float32Array) => {
    setScanning(false);
    const matchedId = await findMatch("student", descriptor);
    if (!matchedId) {
      setError("認識できませんでした。もう一度試してください。");
      setTimeout(reset, 3000);
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

    setResult({
      ok: true,
      name: student?.name ?? "—",
      grade: student?.grade ?? "—",
      type,
    });
    setTimeout(reset, 4000);
  }, [reset]);

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
              onError={(msg) => { setError(msg); setTimeout(reset, 3000); }}
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
