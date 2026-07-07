// 学力診断（三角測定・三層固定モデル）の構造化診断 → HTML レンダリング。
// Claude が返す JSON をパースし、講師向け（尖った5項目）／保護者向け（温かい）の
// 2種のHTMLに変換する。API ルートから利用し、単体でもテスト可能。

export type Diagnosis = {
  observations: { source: string; fact: string; consistency: "一致" | "矛盾" | "不明" }[];
  hypotheses: { H1: string; H2: string; H3: string };
  bottleneck: { layer: "H1" | "H2" | "H3"; label: string; reason: string };
  intervention: string;
  parent_message: string;
};

export const LAYER_NAME: Record<string, string> = {
  H1: "下位能力",
  H2: "学習方法",
  H3: "学習習慣",
};

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function consistencyBadge(c: string): string {
  const color = c === "一致" ? "#16a34a" : c === "矛盾" ? "#dc2626" : "#94a3b8";
  return `<span style="display:inline-block;padding:1px 8px;border-radius:9999px;font-size:0.75rem;font-weight:700;color:#fff;background:${color}">${esc(c)}</span>`;
}

// 講師向け：尖った5項目診断（id="diagnosis-report" で既存スタイルを継承）
export function renderTeacherReport(d: Diagnosis): string {
  const rows = d.observations.map(
    (o) =>
      `<tr><td>${esc(o.source)}</td><td>${esc(o.fact)}</td><td style="text-align:center;white-space:nowrap">${consistencyBadge(o.consistency)}</td></tr>`
  ).join("");
  const layerName = LAYER_NAME[d.bottleneck.layer] ?? d.bottleneck.layer;
  return `<div id="diagnosis-report">
<h2>▼ 観測事実 ／ 整合性分類</h2>
<p style="font-size:0.8rem;color:#64748b">答案・学習法・学習習慣を突き合わせた観測。<b>「矛盾」は主因判定から除外</b>し、<b>「一致」のみ</b>を根拠に主因を決めている。</p>
<table>
<thead><tr><th style="width:22%">観点</th><th>観測事実</th><th style="width:14%">整合性</th></tr></thead>
<tbody>${rows}</tbody>
</table>

<h2>▼ 成立しうる多重仮説</h2>
<ul>
<li><b>H1 下位能力：</b>${esc(d.hypotheses.H1)}</li>
<li><b>H2 学習方法：</b>${esc(d.hypotheses.H2)}</li>
<li><b>H3 学習習慣：</b>${esc(d.hypotheses.H3)}</li>
</ul>

<h2>▼ 主ボトルネック（1つ）</h2>
<div style="border:2px solid #dc2626;border-radius:12px;padding:12px 16px;background:#fef2f2">
<p style="margin:0"><span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:0.8rem;font-weight:700;color:#fff;background:#dc2626">${esc(d.bottleneck.layer)}：${esc(layerName)}</span> <b style="font-size:1.05rem;color:#991b1b">${esc(d.bottleneck.label)}</b></p>
<p style="margin:8px 0 0;font-size:0.9rem;color:#7f1d1d">${esc(d.bottleneck.reason)}</p>
</div>

<h2>▼ 主介入（次回すぐ実行する具体行動・1つ）</h2>
<div style="border:2px solid #2563eb;border-radius:12px;padding:14px 18px;background:#eff6ff">
<p style="margin:0;font-size:1.05rem;font-weight:700;color:#1e3a8a">${esc(d.intervention)}</p>
</div>
</div>`;
}

// 保護者向け：温かく。主因は1つだけ、専門用語（H1等）と「矛盾」は出さない。
export function renderParentReport(d: Diagnosis): string {
  return `<div id="diagnosis-report">
<h2>お子さまの学びの様子</h2>
<p>${esc(d.parent_message)}</p>

<h2>いま、いちばん伸びる一歩</h2>
<div style="border:1px solid #bfdbfe;border-radius:12px;padding:14px 18px;background:#eff6ff">
<p style="margin:0 0 6px;font-size:0.85rem;color:#2563eb;font-weight:700">今の伸びしろ：${esc(d.bottleneck.label)}</p>
<p style="margin:0;font-size:1.02rem;font-weight:700;color:#1e3a8a">${esc(d.intervention)}</p>
</div>
<p style="font-size:0.85rem;color:#64748b;margin-top:10px">教室でもこの一歩をいっしょに続けていきます。ご家庭では「できたね」と声をかけていただけると、いちばんの力になります。</p>
</div>`;
}

export function parseDiagnosis(raw: string): Diagnosis {
  let t = raw.trim();
  if (t.startsWith("```json")) t = t.slice(7);
  else if (t.startsWith("```")) t = t.slice(3);
  if (t.endsWith("```")) t = t.slice(0, -3);
  t = t.trim();
  // 前後に説明文が混じっても最初の { 〜 最後の } を拾う
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  const obj = JSON.parse(t) as Partial<Diagnosis>;
  const layer = obj.bottleneck?.layer;
  return {
    observations: Array.isArray(obj.observations) ? obj.observations : [],
    hypotheses: {
      H1: obj.hypotheses?.H1 ?? "",
      H2: obj.hypotheses?.H2 ?? "",
      H3: obj.hypotheses?.H3 ?? "",
    },
    bottleneck: {
      layer: layer === "H1" || layer === "H2" || layer === "H3" ? layer : "H3",
      label: obj.bottleneck?.label ?? "",
      reason: obj.bottleneck?.reason ?? "",
    },
    intervention: obj.intervention ?? "",
    parent_message: obj.parent_message ?? "",
  };
}
