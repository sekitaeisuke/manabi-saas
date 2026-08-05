// テスト用紙のHTMLを問題データから機械的に組み立てる。
//
// もともとHTMLはAIに書かせていたが、問題数が増えると出力トークン上限で途中で切れ、
// 「20問作ったのに10問しか載っていない」という取りこぼしが起きていた。
// 問題データ(JSON)は配列として揃っているので、用紙の組版はここで確実に行う。
// AIには問題文の推敲（JSON→JSON）だけを任せ、載せ落としが構造的に起きないようにする。

import { mathText } from "@/lib/mathText";

export type TestQuestion = {
  id?: string;
  difficulty?: string;
  section?: string;
  text: string;
  type?: string;
  options?: string[] | null;
  correct_answer?: string;
  points?: number;
};

const DIFF_ORDER = ["basic", "standard", "advanced"];
export const DIFF_LABEL: Record<string, string> = {
  basic: "基礎",
  standard: "標準",
  advanced: "応用",
};

/** 基礎→標準→応用の順に並べ替える（同難易度内の順序は保つ） */
export function sortByDifficulty<T extends { difficulty?: string }>(questions: T[]): T[] {
  return questions
    .map((q, i) => ({ q, i }))
    .sort((a, b) => {
      const ai = DIFF_ORDER.indexOf(a.q.difficulty ?? "");
      const bi = DIFF_ORDER.indexOf(b.q.difficulty ?? "");
      const an = ai === -1 ? DIFF_ORDER.length : ai;
      const bn = bi === -1 ? DIFF_ORDER.length : bi;
      return an !== bn ? an - bn : a.i - b.i;
    })
    .map((x) => x.q);
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 問題文は mathText で「そのまま読める文字列」に直したうえで、全部エスケープして出す。
 * 累乗は x² のようなUnicode文字になっているので、タグを通さなくても数式のまま表示される。
 * （タグを通していた頃は <span style="…"> のような想定外の記法がそのまま画面に出ていた）
 */
function escText(s: unknown): string {
  return esc(mathText(s)).replace(/\n/g, "<br>");
}

/** 各問の配点の合計が必ず100点になるよう比例配分する（端数は最大剰余法） */
export function normalizePoints<T extends { points?: number }>(questions: T[]): T[] {
  const total = questions.reduce((s, q) => s + (q.points ?? 0), 0);
  if (total <= 0 || questions.length === 0) return questions;
  const raw = questions.map((q) => ((q.points ?? 1) / total) * 100);
  const floored = raw.map((v) => Math.floor(v));
  let remainder = 100 - floored.reduce((s, v) => s + v, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const bonus: number[] = new Array(raw.length).fill(0);
  for (const { i } of order) {
    if (remainder <= 0) break;
    bonus[i] = 1;
    remainder--;
  }
  return questions.map((q, i) => ({ ...q, points: floored[i] + bonus[i] }));
}

/** id を q1..qN に振り直す（分割生成でぶつかった id を一意にする） */
export function renumber<T extends { id?: string }>(questions: T[]): T[] {
  return questions.map((q, i) => ({ ...q, id: `q${i + 1}` }));
}

/** 問題データからテスト用紙HTMLを組み立てる。全問が必ず載る */
export function renderTestHtml(opts: {
  title: string;
  grade?: string;
  subject?: string;
  questions: TestQuestion[];
}): string {
  const { title, grade, subject, questions } = opts;
  const isMath = subject === "数学" || subject === "算数";

  const groups: { key: string; label: string; items: { q: TestQuestion; no: number }[] }[] = [];
  questions.forEach((q, i) => {
    const key = DIFF_ORDER.includes(q.difficulty ?? "") ? (q.difficulty as string) : "other";
    const label = DIFF_LABEL[key] ?? (q.section || "問題");
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label, items: [] };
      groups.push(g);
    }
    g.items.push({ q, no: i + 1 });
  });

  const head = [
    `<h1>${esc(title)}</h1>`,
    "<table>",
    `<tr><th>学年</th><td>${esc(grade ?? "")}</td><th>科目</th><td>${esc(subject ?? "")}</td></tr>`,
    `<tr><th>氏名</th><td></td><th>実施日</th><td>　　　年　　月　　日</td></tr>`,
    `<tr><th>問題数</th><td>全${questions.length}問</td><th>得点</th><td>　　　　／100点</td></tr>`,
    "</table>",
  ].join("\n");

  const body = groups
    .map((g) => {
      const pts = g.items.reduce((s, x) => s + (x.q.points ?? 0), 0);
      const blocks = g.items
        .map(({ q, no }) => {
          const parts: string[] = [];
          parts.push(
            `<p><strong>問${no}</strong>（${esc(g.label)}・${q.points ?? 0}点）${escText(q.text)}</p>`,
          );
          if (q.type === "multiple-choice" && Array.isArray(q.options) && q.options.length > 0) {
            parts.push(
              "<ol>" + q.options.map((o) => `<li>${escText(o)}</li>`).join("") + "</ol>",
            );
          }
          const hint =
            q.type !== "multiple-choice" && isMath ? "<p class=\"answer-hint\">（半角数字で答えなさい）</p>" : "";
          parts.push(hint);
          parts.push('<div class="answer-box"></div>');
          return `<div class="question">\n${parts.filter(Boolean).join("\n")}\n</div>`;
        })
        .join("\n");
      return `<h2>${esc(g.label)}（全${g.items.length}問・${pts}点）</h2>\n${blocks}`;
    })
    .join("\n");

  return `<div id="test-body">\n${head}\n${body}\n</div>`;
}
