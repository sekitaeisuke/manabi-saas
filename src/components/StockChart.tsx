"use client";

// 自塾株の推移チャート。外部ライブラリ（Recharts等）を足さず、house style の
// 手書きSVGで描く（diagnosisReport 等と同じ方針）。レスポンシブに viewBox で伸縮。

export type StockPoint = { price: number; label: string };

export function StockChart({
  points,
  height = 180,
}: {
  points: StockPoint[];
  height?: number;
}) {
  const W = 640;
  const H = height;
  const padX = 44;
  const padY = 18;

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-400"
        style={{ height: H }}
      >
        まだ株価の履歴がありません（毎週日曜に更新されます）
      </div>
    );
  }

  // 1点だけでも線が引けるよう複製
  const pts = points.length === 1 ? [points[0], points[0]] : points;
  const prices = pts.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = Math.max(1, max - min);
  // 上下に少し余白を持たせる
  const lo = min - span * 0.12;
  const hi = max + span * 0.12;
  const range = Math.max(1, hi - lo);

  const x = (i: number) => padX + (i * (W - padX - 8)) / Math.max(1, pts.length - 1);
  const y = (v: number) => padY + (H - padY * 2) * (1 - (v - lo) / range);

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${(H - padY).toFixed(1)} L${x(0).toFixed(1)},${(H - padY).toFixed(1)} Z`;

  const first = pts[0].price;
  const last = pts[pts.length - 1].price;
  const up = last >= first;
  const stroke = up ? "#059669" : "#dc2626";
  const fillFrom = up ? "rgba(5,150,105,0.18)" : "rgba(220,38,38,0.16)";

  // Y 軸グリッド（3本）
  const gridVals = [hi, (hi + lo) / 2, lo].map((v) => Math.round(v));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img" aria-label="自塾株価チャート">
      <defs>
        <linearGradient id="stockArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillFrom} />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>

      {gridVals.map((v, i) => {
        const gy = padY + (i * (H - padY * 2)) / 2;
        return (
          <g key={i}>
            <line x1={padX} y1={gy} x2={W - 8} y2={gy} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="3 3" />
            <text x={padX - 6} y={gy + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
              {v.toLocaleString()}
            </text>
          </g>
        );
      })}

      <path d={area} fill="url(#stockArea)" />
      <path d={line} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

      {/* 最終点マーカー */}
      <circle cx={x(pts.length - 1)} cy={y(last)} r={4} fill={stroke} stroke="#fff" strokeWidth={2} />

      {/* X 軸の端ラベル（最初と最後） */}
      <text x={padX} y={H - 4} textAnchor="start" fontSize={10} fill="#94a3b8">{points[0].label}</text>
      <text x={W - 8} y={H - 4} textAnchor="end" fontSize={10} fill="#94a3b8">{points[points.length - 1].label}</text>
    </svg>
  );
}
