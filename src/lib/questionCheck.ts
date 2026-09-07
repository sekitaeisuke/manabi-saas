// 四択問題の「形」の点検。AIを呼ばずにできる検査をここに集める。
//
// AIに解かせる検算（/api/generate/verify）は1問あたりトークンを使うので、
// その前に機械で分かる欠陥を落としておく。ここで拾えるものは実際によく出る:
//   ・選択肢が3つしかない／5つある
//   ・正解として書かれた文字列が、選択肢のどれとも一致しない
//   ・同じ文言の選択肢が2つある（＝採点が文字列比較なので、どちらを選んでも正解になる）
//   ・タグやLaTeXの書き残し（x<sup>2</sup> や \frac{1}{2}）
//
// 「正解が選択肢と一致しない」は、全角半角や前後の空白の違いだけのことが多い。
// それはここで選択肢の文言に寄せて直す（autoFix）。直せないものだけAIへ回す。

import { mathText } from "@/lib/mathText";
import { CHOICE_COUNT, type TestQuestion } from "@/lib/testHtml";

/** 比較用のゆるい正規化。全角→半角・空白除去・小文字化 */
export function looseKey(s: unknown): string {
  return String(s ?? "")
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s　]/g, "")
    .toLowerCase();
}

/** 問題文の重複判定に使うキー（問題バンクの一意キーもこれ） */
export function questionKey(text: unknown): string {
  return looseKey(text).slice(0, 80);
}

const TAG_RE = /<\/?[a-zA-Z][^>]*>/;
const LATEX_RE = /\\(frac|sqrt|times|div|pm|leq|geq|neq|pi|circ|angle|triangle|left|right)\b|\$[^$]*\$|\^\{|_\{/;

export type CheckResult = {
  /** 直したうえでの問題。autoFix で直せた分は反映済み */
  question: TestQuestion;
  /** AIに直してもらう必要がある欠陥。空なら形は正常 */
  issues: string[];
  /** 機械で直した内容（ログ・画面表示用） */
  fixes: string[];
};

/**
 * 四択問題1件の形を点検し、直せるところは直す。
 * 「AIに直してもらうしかない欠陥」だけを issues に残す。
 */
export function checkQuestion(input: TestQuestion): CheckResult {
  const issues: string[] = [];
  const fixes: string[] = [];

  // 表記そろえ（タグ・LaTeXをふつうの文字へ）。これで多くの書き残しは消える
  const text = mathText(input.text);
  const rawOptions = Array.isArray(input.options) ? input.options : [];
  const options = rawOptions.map((o) => mathText(o)).filter((o) => o.trim() !== "");
  let correct = mathText(input.correct_answer ?? "");

  if (!text.trim()) issues.push("問題文が空です");

  if (options.length !== CHOICE_COUNT) {
    issues.push(`選択肢が${options.length}つです（${CHOICE_COUNT}つにしてください）`);
  }

  const keys = options.map(looseKey);
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dup.length > 0) {
    issues.push("同じ内容の選択肢が2つ以上あります（どちらを選んでも正解になってしまいます）");
  }

  if (!correct.trim()) {
    issues.push("正解が設定されていません");
  } else if (!options.includes(correct)) {
    // 全角半角・空白の違いだけなら、選択肢の文言にそろえる
    const hit = options.find((o) => looseKey(o) === looseKey(correct));
    if (hit) {
      fixes.push(`正解を選択肢の文言にそろえました（「${correct}」→「${hit}」）`);
      correct = hit;
    } else {
      issues.push("正解として書かれた文字列が、どの選択肢とも一致しません");
    }
  }

  // 正規化を通してもタグ・LaTeXが残るのは、AIが想定外の記法で書いている
  const all = [text, ...options, correct].join("\n");
  if (TAG_RE.test(all)) issues.push("HTMLタグが残っています");
  if (LATEX_RE.test(all)) issues.push("LaTeX記法が残っています");

  // 本文つき（国語の読解）は、本文が実際に付いているか
  if (input.passage_id && !String(input.passage ?? "").trim()) {
    issues.push("本文つきの設問ですが、本文がありません");
  }

  return {
    question: { ...input, text, options, correct_answer: correct },
    issues,
    fixes,
  };
}

/** テスト全体の形を点検する */
export function checkAll(questions: TestQuestion[]): CheckResult[] {
  return questions.map((q) => checkQuestion(q));
}
