"use client";

import { useEffect, useRef, useState } from "react";

type FaceCameraProps = {
  onDescriptor: (descriptor: Float32Array) => void;
  onError?: (msg: string) => void;
  label?: string;
  /** 平均をとるサンプル数。登録時は多め（6）、照合時は既定の3で足りる。 */
  samples?: number;
};

const MODEL_URL = "/models";
const MIN_SCORE = 0.6;        // 検出の信頼度がこれ未満のコマは使わない
const MIN_FACE_RATIO = 0.18;  // 顔の幅 ÷ 映像の幅。小さすぎる顔は特徴量が荒れる
const CONSISTENCY = 0.45;     // 同一人物とみなすサンプル間の距離
const TICK_MS = 120;          // 次の検出までの間隔（前の検出が終わってから測る）

// モデルは1回だけ読む。並行呼び出しでも二重に落とさない。
let modelsPromise: Promise<void> | null = null;
function loadModels(): Promise<void> {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      const faceapi = await import("face-api.js");
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
    })().catch((e) => {
      modelsPromise = null; // 失敗をキャッシュしない（次回やり直せる）
      throw e;
    });
  }
  return modelsPromise;
}

function distance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sum += d * d; }
  return Math.sqrt(sum);
}

/** 複数コマの平均をとる。1コマだけの特徴量より、まばたき・向き・明るさのブレに強い。 */
function average(list: Float32Array[]): Float32Array {
  const out = new Float32Array(list[0].length);
  for (const v of list) for (let i = 0; i < out.length; i++) out[i] += v[i];
  for (let i = 0; i < out.length; i++) out[i] /= list.length;
  return out;
}

function cameraErrorMessage(e: unknown): string {
  const name = (e as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "カメラの使用が許可されていません。アドレスバーの🔒からカメラを「許可」にして開き直してください。";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "カメラが見つかりません。端末にカメラがあるか確認してください。";
  if (name === "NotReadableError")
    return "カメラを他のアプリが使用中です。カメラアプリやビデオ会議を閉じてから開き直してください。";
  return e instanceof Error ? e.message : String(e);
}

export function FaceCamera({
  onDescriptor,
  onError,
  label = "顔をカメラに向けてください",
  samples = 3,
}: FaceCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 親が再描画するたびに関数の同一性が変わってもカメラを開き直さないよう、
  // コールバックと必要数は ref 経由で読む（起動の useEffect は依存なしで1回だけ）。
  const cbRef = useRef({ onDescriptor, onError });
  const needRef = useRef(Math.max(1, samples));
  useEffect(() => { cbRef.current = { onDescriptor, onError }; });
  useEffect(() => { needRef.current = Math.max(1, samples); }, [samples]);

  const [phase, setPhase] = useState<"loading" | "scanning" | "captured" | "error">("loading");
  const [hint, setHint] = useState("");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stream: MediaStream | null = null;
    const collected: Float32Array[] = [];

    const stop = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    const fail = (msg: string) => {
      stop();
      if (cancelled) return;
      setPhase("error");
      setHint(msg);
      cbRef.current.onError?.(msg);
    };

    // 映像は object-cover ＋ 左右反転で出しているので、枠もその座標に合わせる。
    const draw = (box: { x: number; y: number; width: number; height: number } | null) => {
      const canvas = canvasRef.current, video = videoRef.current, wrap = wrapRef.current;
      if (!canvas || !video || !wrap) return;
      const cw = wrap.clientWidth, ch = wrap.clientHeight;
      if (!cw || !ch) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      if (!box || !video.videoWidth) return;
      const scale = Math.max(cw / video.videoWidth, ch / video.videoHeight);
      const ox = (cw - video.videoWidth * scale) / 2;
      const oy = (ch - video.videoHeight * scale) / 2;
      const w = box.width * scale, h = box.height * scale;
      const x = cw - (box.x * scale + ox) - w; // 左右反転ぶん
      const y = box.y * scale + oy;
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
    };

    (async () => {
      try {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          fail("この端末ではカメラを使えません。https:// か localhost で開いてください（社内IP直打ちの http:// では使えません）。");
          return;
        }

        setHint("モデルを読み込み中...");
        await loadModels();
        if (cancelled) return;
        const faceapi = await import("face-api.js");

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (cancelled || !videoRef.current) { stop(); return; }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (cancelled) { stop(); return; }

        setPhase("scanning");
        setHint("");
        const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

        // setInterval だと検出が間に合わない端末で処理が重なる。前の検出が終わってから次を積む。
        const tick = async () => {
          if (cancelled) return;
          const video = videoRef.current;
          if (!video || video.readyState < 2 || !video.videoWidth) {
            timer = setTimeout(tick, 200);
            return;
          }

          let det;
          try {
            det = await faceapi
              .detectSingleFace(video, options)
              .withFaceLandmarks()
              .withFaceDescriptor();
          } catch (e) {
            fail("顔の検出に失敗しました: " + (e instanceof Error ? e.message : String(e)));
            return;
          }
          if (cancelled) return;

          draw(det?.detection.box ?? null);

          if (!det) {
            collected.length = 0;
            setProgress(0);
            setHint("顔が見つかりません。カメラの正面を向いてください");
            timer = setTimeout(tick, TICK_MS);
            return;
          }

          const box = det.detection.box;
          if (det.detection.score < MIN_SCORE || box.width < video.videoWidth * MIN_FACE_RATIO) {
            setHint("もう少しカメラに近づいてください");
            timer = setTimeout(tick, TICK_MS);
            return;
          }

          collected.push(det.descriptor);
          // 途中で人が入れ替わった／大きくブレたぶんは捨てる
          while (collected.length > 1 && distance(collected[0], collected[collected.length - 1]) > CONSISTENCY) {
            collected.shift();
          }
          const need = needRef.current;
          setProgress(collected.length);

          if (collected.length < need) {
            setHint(`そのままお願いします（${collected.length} / ${need}）`);
            timer = setTimeout(tick, TICK_MS);
            return;
          }

          setPhase("captured");
          setHint("顔を確認しました");
          stop();
          cbRef.current.onDescriptor(average(collected));
        };

        tick();
      } catch (e) {
        fail(cameraErrorMessage(e));
      }
    })();

    return () => { cancelled = true; stop(); };
    // 起動は1回だけ。label や onDescriptor が変わってもカメラは開き直さない。
  }, []);

  const need = Math.max(1, samples);
  const message =
    phase === "loading" ? (hint || "読み込み中...") :
    phase === "captured" ? "顔を確認しました" :
    phase === "error" ? hint :
    (hint || label);

  return (
    <div className="relative w-full max-w-sm mx-auto">
      <div ref={wrapRef} className="relative rounded-2xl overflow-hidden bg-black aspect-video">
        <video ref={videoRef} className="w-full h-full object-cover -scale-x-100" muted playsInline autoPlay />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        {phase === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
            読み込み中...
          </div>
        )}
        {phase === "captured" && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-500/30">
            <span className="text-4xl">✓</span>
          </div>
        )}
      </div>

      {need > 1 && phase === "scanning" && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-green-500 transition-all"
            style={{ width: `${Math.round((progress / need) * 100)}%` }} />
        </div>
      )}

      <p className={`mt-2 text-center text-sm font-medium ${
        phase === "captured" ? "text-green-600" :
        phase === "error" ? "text-red-600" : "text-slate-600"
      }`}>{message}</p>
    </div>
  );
}
