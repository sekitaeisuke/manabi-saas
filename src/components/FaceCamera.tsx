"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type FaceCameraProps = {
  onDescriptor: (descriptor: Float32Array) => void;
  onError?: (msg: string) => void;
  label?: string;
};

let modelsLoaded = false;

async function loadModels() {
  if (modelsLoaded) return;
  const faceapi = await import("face-api.js");
  const MODEL_URL = "/models";
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

export function FaceCamera({ onDescriptor, onError, label = "顔をカメラに向けてください" }: FaceCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "detecting" | "detected" | "error">("loading");
  const [message, setMessage] = useState("モデルを読み込み中...");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        await loadModels();
        if (cancelled) return;

        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        setStatus("ready");
        setMessage(label);

        const faceapi = await import("face-api.js");

        intervalRef.current = setInterval(async () => {
          if (!videoRef.current || !canvasRef.current) return;
          const detection = await faceapi
            .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
            .withFaceLandmarks()
            .withFaceDescriptor();

          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (detection) {
            const box = detection.detection.box;
            ctx.strokeStyle = "#22c55e";
            ctx.lineWidth = 3;
            ctx.strokeRect(box.x, box.y, box.width, box.height);

            setStatus("detected");
            setMessage("顔を検出しました");
            if (intervalRef.current) clearInterval(intervalRef.current);
            stopCamera();
            onDescriptor(detection.descriptor);
          } else {
            setStatus("ready");
            setMessage(label);
          }
        }, 500);

      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setStatus("error");
        setMessage("カメラエラー: " + msg);
        onError?.(msg);
      }
    };

    start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [label, onDescriptor, onError, stopCamera]);

  return (
    <div className="relative w-full max-w-sm mx-auto">
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
            読み込み中...
          </div>
        )}
        {status === "detected" && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-500/30">
            <span className="text-4xl">✓</span>
          </div>
        )}
      </div>
      <p className={`mt-2 text-center text-sm font-medium ${
        status === "detected" ? "text-green-600" :
        status === "error" ? "text-red-600" : "text-slate-600"
      }`}>{message}</p>
    </div>
  );
}
