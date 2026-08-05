// 問題文の数式表記をそろえる。
//
// AIは指示しても x<sup>2</sup> / <span style="...">2</span> / $x^2$ / \frac{1}{2} のような
// 「見えない前提の記法」を混ぜてくる。問題文は解答画面・生徒の受験画面・成績画面では
// そのまま文字として表示されるため、タグがそのまま「<span…>」と出てしまう。
//
// そこで問題文は常に「そのまま読める文字列」に正規化する。
// 累乗・添字はUnicodeの上付き/下付き文字（x²、a₁）にし、タグとLaTeXは残さない。
// 生成時に通すが、以前に作られたテストのために表示側でも通す（二重に通しても結果は変わらない）。

const SUP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  n: "ⁿ", i: "ⁱ", a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ",
  k: "ᵏ", m: "ᵐ", p: "ᵖ", t: "ᵗ", x: "ˣ", y: "ʸ",
};

const SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎",
  n: "ₙ", i: "ᵢ", a: "ₐ", k: "ₖ", m: "ₘ", t: "ₜ", x: "ₓ",
};

function toScript(inner: string, map: Record<string, string>, mark: string): string {
  const body = inner.trim();
  if (!body) return "";
  const chars = [...body];
  if (chars.every((c) => map[c])) return chars.map((c) => map[c]).join("");
  // Unicodeに無い文字が混ざるときは、化けさせずに読める形で残す
  return chars.length === 1 ? `${mark}${body}` : `${mark}(${body})`;
}

const toSup = (s: string) => toScript(s, SUP, "^");
const toSub = (s: string) => toScript(s, SUB, "_");

/** 問題文・選択肢を「そのまま表示して読める」文字列に直す */
export function mathText(input: unknown): string {
  let s = String(input ?? "");
  if (!s) return "";

  // ① 実体参照を戻す（AIが &lt;sup&gt; と書いてくることがある）
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");

  // ② 改行タグ → 改行
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p[^>]*>/gi, "\n");

  // ③ 上付き・下付きタグ → Unicode
  s = s.replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, (_m, inner: string) => toSup(stripTags(inner)));
  s = s.replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, (_m, inner: string) => toSub(stripTags(inner)));

  // ④ 上付きのつもりの span（vertical-align:super / class="exp" 等）も拾う。
  //    ただ外すだけだと x<span …>3</span> が「x3」になり、指数が消えて意味が変わってしまう
  s = s.replace(
    /<span[^>]*(?:super|sup|exp|exponent|powers?)[^>]*>([\s\S]*?)<\/span>/gi,
    (_m, inner: string) => toSup(stripTags(inner)),
  );
  s = s.replace(
    /<span[^>]*(?:sub|下付|添字)[^>]*>([\s\S]*?)<\/span>/gi,
    (_m, inner: string) => toSub(stripTags(inner)),
  );

  // ④ 残りのタグは外して中身だけ残す（<span style="...">2</span> 等）
  s = stripTags(s);

  // ⑤ LaTeX風の記法をふつうの記号に
  s = s
    .replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1/$2")
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√$1")
    .replace(/\\sqrt\s*(\d+)/g, "√$1")
    .replace(/\\times/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\pm/g, "±")
    .replace(/\\neq|\\ne\b/g, "≠")
    .replace(/\\leq|\\le\b/g, "≤")
    .replace(/\\geq|\\ge\b/g, "≥")
    .replace(/\\cdot/g, "・")
    .replace(/\\pi\b/g, "π")
    .replace(/\\circ\b/g, "°")
    .replace(/\\angle/g, "∠")
    .replace(/\\triangle/g, "△")
    .replace(/\\left|\\right/g, "")
    .replace(/\\[()[\]]/g, "")
    .replace(/\${1,2}/g, "");

  // ⑥ ^2 / ^{n+1} → 上付き（英数字か閉じ括弧の直後だけ。ふつうの文の記号は触らない）
  s = s
    .replace(/([A-Za-z0-9)）])\^\s*\{([^{}]{1,10})\}/g, (_m, head: string, inner: string) => head + toSup(inner))
    .replace(/([A-Za-z0-9)）])\^\s*([A-Za-z0-9]{1,2})(?![A-Za-z0-9])/g,
      (_m, head: string, inner: string) => head + toSup(inner));

  // ⑦ a_1 / a_{12} → 下付き（数字の添字だけに限る。語中のアンダースコアは触らない）
  s = s
    .replace(/([A-Za-z0-9)）])_\s*\{(\d{1,2})\}/g, (_m, head: string, inner: string) => head + toSub(inner))
    .replace(/([A-Za-z])_(\d{1,2})(?![A-Za-z0-9])/g, (_m, head: string, inner: string) => head + toSub(inner));

  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripTags(s: string): string {
  return s.replace(/<\/?[a-zA-Z][^>]*>/g, "");
}

type QuestionLike = {
  text?: unknown;
  options?: unknown;
  correct_answer?: unknown;
  section?: unknown;
  [k: string]: unknown;
};

/** 問題1件ぶんの表示用テキストをまとめて正規化する（選択肢・正答も同じ規則にそろえる） */
export function normalizeQuestionMath<T extends QuestionLike>(q: T): T {
  return {
    ...q,
    text: mathText(q.text),
    ...(Array.isArray(q.options)
      ? { options: (q.options as unknown[]).map((o) => mathText(o)) }
      : {}),
    ...(q.correct_answer != null ? { correct_answer: mathText(q.correct_answer) } : {}),
  };
}
