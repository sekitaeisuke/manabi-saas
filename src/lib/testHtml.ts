// テスト用紙のHTMLを問題データから機械的に組み立てる。
//
// もともとHTMLはAIに書かせていたが、問題数が増えると出力トークン上限で途中で切れ、
// 「20問作ったのに10問しか載っていない」という取りこぼしが起きていた。
// 問題データ(JSON)は配列として揃っているので、用紙の組版はここで確実に行う。
// AIには問題文の推敲（JSON→JSON）だけを任せ、載せ落としが構造的に起きないようにする。
//
// このファイルはブラウザからも呼べる（mathText 以外に依存しない）。
// 講師が問題を1問直すたびにAPIを叩かず、その場で用紙を組み直すため。

import { mathText } from "@/lib/mathText";

/** 検算（別のAIに正解を伏せて解かせる工程）の結果 */
export type VerifyStatus = "ok" | "fixed" | "needs_review" | "unverified";

export type TestQuestion = {
  id?: string;
  difficulty?: string;
  section?: string;
  text: string;
  type?: string;
  options?: string[] | null;
  correct_answer?: string;
  points?: number;
  /** なぜその答えになるかの短い説明。解答つき用紙と報告書で使う */
  explanation?: string;
  /** 国語の読解: 同じ本文を共有する設問は同じ passage_id を持つ */
  passage?: string;
  passage_id?: string;
  verify_status?: VerifyStatus;
  verify_note?: string;
};

const DIFF_ORDER = ["basic", "standard", "advanced"];
export const DIFF_LABEL: Record<string, string> = {
  basic: "基礎",
  standard: "標準",
  advanced: "応用",
};

/** 選択肢は必ず4つ。ここを1か所に置いて、生成・検証・画面で同じ数を使う */
export const CHOICE_COUNT = 4;

/** 選択肢の番号。用紙・解答・生徒の受験画面で同じ記号を使う */
export const CHOICE_MARKS = ["①", "②", "③", "④", "⑤", "⑥"];

/* ------------------------------------------------------------------ *
 * 並べ替え
 * ------------------------------------------------------------------ */

const diffRank = (d?: string) => {
  const i = DIFF_ORDER.indexOf(d ?? "");
  return i === -1 ? DIFF_ORDER.length : i;
};

/**
 * 基礎→標準→応用の順に並べ替える（同難易度内の順序は保つ）。
 *
 * 国語の読解のように本文を共有する設問は、1問ずつ動かすと本文からはぐれてしまう。
 * passage_id を持つ問題は「かたまり」として扱い、かたまりの中の順序は保ったまま、
 * かたまりごと動かす。難易度はかたまりの中で一番やさしいものを代表とする。
 */
export function sortByDifficulty<T extends { difficulty?: string; passage_id?: string }>(
  questions: T[],
): T[] {
  type Group = { rank: number; first: number; items: T[] };
  const groups: Group[] = [];
  const byPassage = new Map<string, Group>();

  questions.forEach((q, i) => {
    const pid = q.passage_id ? String(q.passage_id) : "";
    if (pid) {
      const found = byPassage.get(pid);
      if (found) {
        found.items.push(q);
        found.rank = Math.min(found.rank, diffRank(q.difficulty));
        return;
      }
      const g: Group = { rank: diffRank(q.difficulty), first: i, items: [q] };
      byPassage.set(pid, g);
      groups.push(g);
      return;
    }
    groups.push({ rank: diffRank(q.difficulty), first: i, items: [q] });
  });

  return groups
    .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.first - b.first))
    .flatMap((g) => g.items);
}

/* ------------------------------------------------------------------ *
 * 選択肢のシャッフル
 * ------------------------------------------------------------------ */

/**
 * 四択の選択肢を並べ替える。
 *
 * 「正解が1番目に偏らないように」とAIに頼んでも守られない（実際に偏る）ので、
 * 位置の分散はコードで確定させる。correct_answer は選択肢の「文字列」を持っており、
 * 採点も文字列比較なので、並べ替えても正解の対応は崩れない。
 *
 * 同じ文言の選択肢が2つあると文字列比較の採点が壊れるため、そういう問題は
 * 並べ替えず、検証側（構造チェック）で弾く。
 */
export function shuffleChoices<T extends TestQuestion>(q: T): T {
  const opts = Array.isArray(q.options) ? q.options.filter((o) => String(o ?? "").trim()) : [];
  if (opts.length < 2) return q;
  if (new Set(opts).size !== opts.length) return q; // 重複あり：触らない
  const answer = q.correct_answer;
  if (!answer || !opts.includes(answer)) return q; // 正解が選択肢に無い：触らない

  const shuffled = [...opts];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { ...q, options: shuffled };
}

/** テスト全体の選択肢を並べ替える */
export function shuffleAllChoices<T extends TestQuestion>(questions: T[]): T[] {
  return questions.map((q) => shuffleChoices(q));
}

/* ------------------------------------------------------------------ *
 * 配点・採番
 * ------------------------------------------------------------------ */

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

/** 正解が何番目かを返す（1始まり）。求まらなければ 0 */
export function answerIndex(q: TestQuestion): number {
  if (!Array.isArray(q.options) || !q.correct_answer) return 0;
  const i = q.options.indexOf(q.correct_answer);
  return i === -1 ? 0 : i + 1;
}

/* ------------------------------------------------------------------ *
 * 用紙の組版
 * ------------------------------------------------------------------ */

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

const normDiff = (q: TestQuestion) =>
  DIFF_ORDER.includes(q.difficulty ?? "") ? (q.difficulty as string) : "other";

/**
 * 用紙の上でどの難易度の見出しに入れるかを1問ずつ返す。
 *
 * 国語の読解は、1つの本文に「やさしい問→難しい問」をぶら下げるのが自然なので、
 * 設問ごとの難易度はばらつく。それをそのまま見出しに使うと、本文のまとまりの
 * 途中に「標準」の見出しが割り込み、本文も設問の数だけ繰り返し印刷されてしまう。
 * そこで本文を共有する設問は、一番やさしい難易度を代表として同じまとまりに入れる。
 * （設問ごとの difficulty はデータとしては残す。分析・バンクではそちらを使う）
 */
function groupDifficulties(questions: TestQuestion[]): string[] {
  const byPassage = new Map<string, string>();
  for (const q of questions) {
    const pid = q.passage_id ? String(q.passage_id) : "";
    if (!pid) continue;
    const d = normDiff(q);
    const cur = byPassage.get(pid);
    if (!cur || diffRank(d) < diffRank(cur)) byPassage.set(pid, d);
  }
  return questions.map((q) => {
    const pid = q.passage_id ? String(q.passage_id) : "";
    return pid ? byPassage.get(pid) ?? normDiff(q) : normDiff(q);
  });
}

type Group = {
  /** 見出しに使う難易度キー */
  dkey: string;
  label: string;
  /** 本文つき（国語の読解）の場合の本文。無ければ空 */
  passage: string;
  items: { q: TestQuestion; no: number }[];
};

/** まとまりを作る。本文つきは本文ごとに1かたまり、それ以外は難易度ごと */
function buildGroups(questions: TestQuestion[], dkeys: string[]): Group[] {
  const groups: Group[] = [];
  let lastKey: string | null = null;
  let last: Group | null = null;

  questions.forEach((q, i) => {
    const dkey = dkeys[i];
    const pid = q.passage_id ? String(q.passage_id) : "";
    const key = pid ? "P::" + pid : dkey;

    if (!last || lastKey !== key) {
      last = {
        dkey,
        label: DIFF_LABEL[dkey] ?? (q.section || "問題"),
        passage: pid ? String(q.passage ?? "") : "",
        items: [],
      };
      lastKey = key;
      groups.push(last);
    }
    last.items.push({ q, no: i + 1 });
  });

  return groups;
}

/**
 * 問題データからテスト用紙HTMLを組み立てる。全問が必ず載る。
 * withAnswers=true なら正解と解説も出す（先生用の解答つき用紙）。
 */
export function renderTestHtml(opts: {
  title: string;
  grade?: string;
  subject?: string;
  questions: TestQuestion[];
  withAnswers?: boolean;
}): string {
  const { title, grade, subject, questions, withAnswers = false } = opts;

  const head = [
    `<h1>${esc(title)}${withAnswers ? "　【解答・解説】" : ""}</h1>`,
    "<table>",
    `<tr><th>学年</th><td>${esc(grade ?? "")}</td><th>科目</th><td>${esc(subject ?? "")}</td></tr>`,
    withAnswers
      ? `<tr><th>用途</th><td colspan="3">先生用（生徒に配らないこと）</td></tr>`
      : `<tr><th>氏名</th><td></td><th>実施日</th><td>　　　年　　月　　日</td></tr>`,
    `<tr><th>問題数</th><td>全${questions.length}問</td><th>得点</th><td>　　　　／100点</td></tr>`,
    "</table>",
  ].join("\n");

  // 難易度の見出しは1回だけ出す（本文で細かく割れても見出しは繰り返さない）
  const dkeys = groupDifficulties(questions);
  const groups = buildGroups(questions, dkeys);
  const headingShown = new Set<string>();

  const body = groups
    .map((g) => {
      const dkey = g.dkey;
      const parts: string[] = [];

      if (!headingShown.has(dkey)) {
        headingShown.add(dkey);
        const idxs = dkeys.map((d, i) => (d === dkey ? i : -1)).filter((i) => i >= 0);
        const pts = idxs.reduce((s, i) => s + (questions[i].points ?? 0), 0);
        parts.push(`<h2>${esc(g.label)}（全${idxs.length}問・${pts}点）</h2>`);
      }

      if (g.passage) {
        parts.push(
          `<div class="passage"><p class="passage-label">次の文章を読んで、あとの問いに答えなさい。</p>` +
            `<p class="passage-body">${escText(g.passage)}</p></div>`,
        );
      }

      parts.push(
        g.items
          .map(({ q, no }) => {
            const block: string[] = [];
            block.push(
              `<p><strong>問${no}</strong>（${esc(g.label)}・${q.points ?? 0}点）${escText(q.text)}</p>`,
            );
            if (Array.isArray(q.options) && q.options.length > 0) {
              block.push(
                "<ol>" +
                  q.options
                    .map((o, oi) => {
                      const correct = withAnswers && o === q.correct_answer;
                      const mark = CHOICE_MARKS[oi] ?? `${oi + 1}`;
                      return (
                        `<li${correct ? ` class="correct"` : ""}>` +
                        `<span class="mark">${esc(mark)}</span>${escText(o)}</li>`
                      );
                    })
                    .join("") +
                  "</ol>",
              );
            }
            if (withAnswers) {
              const n = answerIndex(q);
              block.push(
                `<p class="answer-line"><strong>正解</strong>：${n ? esc(CHOICE_MARKS[n - 1]) : ""} ${escText(q.correct_answer ?? "")}</p>`,
              );
              if (q.explanation) {
                block.push(`<p class="explanation">${escText(q.explanation)}</p>`);
              }
              if (q.verify_status === "needs_review") {
                block.push(
                  `<p class="needs-review">⚠ この問題は検算で正解が確定しませんでした。配る前に確認してください。</p>`,
                );
              }
            } else {
              block.push(`<div class="answer-box"></div>`);
            }
            return `<div class="question">\n${block.join("\n")}\n</div>`;
          })
          .join("\n"),
      );

      return parts.join("\n");
    })
    .join("\n");

  return `<div id="test-body">\n${head}\n${body}\n</div>`;
}

/**
 * 解答用紙（番号を書き込むだけの薄い用紙）。
 * 全問四択なので、生徒は番号を書くだけでよく、丸つけもここだけ見れば済む。
 */
export function renderAnswerSheetHtml(opts: {
  title: string;
  grade?: string;
  subject?: string;
  questions: TestQuestion[];
  withAnswers?: boolean;
}): string {
  const { title, grade, subject, questions, withAnswers = false } = opts;
  const rows = questions
    .map((q, i) => {
      const n = withAnswers ? answerIndex(q) : 0;
      return `<tr><th>問${i + 1}</th><td class="ans">${n ? esc(CHOICE_MARKS[n - 1]) : "&nbsp;"}</td><td class="pt">${q.points ?? 0}点</td></tr>`;
    })
    .join("");

  return `<div id="test-body">
<h1>${esc(title)}　解答用紙${withAnswers ? "【解答】" : ""}</h1>
<table>
<tr><th>学年</th><td>${esc(grade ?? "")}</td><th>科目</th><td>${esc(subject ?? "")}</td></tr>
<tr><th>氏名</th><td></td><th>得点</th><td>　　　　／100点</td></tr>
</table>
<p class="answer-hint">答えは番号（①②③④）で書きなさい。</p>
<table class="answer-sheet">${rows}</table>
</div>`;
}
