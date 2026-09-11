// 読解の本文（国語の文章・詩、英語の英文）の扱いを1か所にまとめる。
//
// 本文が抜け落ちた問題が実際に配られていた（2026-09-11 の中1国語で15問中7問が
// 「本文中で…」「筆者が…」と書いてあるのに本文なし）。原因は1つではなかった:
//   ・読解の単元を判定する正規表現が狭く、詩・古文や英語の長文、単元未指定の診断では
//     本文を作る指示が出ていなかった → AIは本文なしで「次の文章を読んで」と書く
//   ・本文を「各設問に同じ全文を入れて」と頼んでいたので、2問目以降を空にされる
//   ・passage_id を持たない本文は、用紙にも受験画面にも出ない
//   ・passage_id が "r1_p1" のように毎回同じで、別の本文とかたまりが混ざる
// ここでは「本文は passages に1本ずつ書かせ、設問は id で指す」「id はこちらで一意にする」
// 「本文を読む設問なのに本文が無いものは通さない」を共通の部品にする。
//
// ブラウザからも呼ぶ（編集画面）ので、サーバ専用のものに依存しないこと。
// questionCheck からも読むので、こちらからは import しない（循環させない）。

/** 国語で本文（作品）が要る単元。詩・短歌・俳句・古文・漢文も作品そのものが要る */
const KOKUGO_READING_RE = /読解|説明文|論説|評論|物語|小説|随筆|文脈|現代文|詩|短歌|俳句|古文|漢文|古典/;
/** 英語で本文（英文・会話文）が要る単元 */
const EIGO_READING_RE = /読解|長文|英文の読み|読み書き|会話文/;
/** 追加指示にこう書かれていれば、単元にかかわらず読解を作る */
const INSTRUCTION_READING_RE = /読解|長文|本文|文章を読/;

export type ReadingMode =
  /** 読解の単元が選ばれている：本文つきの設問を必ず作る */
  | "required"
  /** 国語・英語で単元が決まっていない：読解を入れるなら本文つきで */
  | "allowed"
  /** 本文を読ませる設問は作らせない */
  | "none";

export function isReadingUnit(subject: string, unit: string): boolean {
  if (subject === "国語") return KOKUGO_READING_RE.test(unit);
  if (subject === "英語") return EIGO_READING_RE.test(unit);
  return false;
}

export function readingMode(
  subject: string,
  units: { unit: string }[],
  instructions?: string,
): ReadingMode {
  if (subject !== "国語" && subject !== "英語") return "none";
  if (units.some((u) => isReadingUnit(subject, u.unit ?? ""))) return "required";
  if (INSTRUCTION_READING_RE.test(instructions ?? "")) return "required";
  return units.length === 0 ? "allowed" : "none";
}

/** 用紙・受験画面で本文の上に出す指示文 */
export function passageLead(subject?: string): string {
  return subject === "英語" ? "次の英文を読んで" : "次の文章を読んで";
}

/** 学年と科目に合った本文の長さの目安 */
export function passageLength(subject: string, grade: string): string {
  const elementary = grade.startsWith("小");
  if (subject === "英語") {
    return elementary ? "3〜5文（30〜50語）程度のやさしい英文" : grade.startsWith("高") ? "150〜220語程度の英文" : "80〜150語程度の英文（会話文でもよい）";
  }
  return elementary ? "8行程度（240〜320字）" : "10行程度（300〜400字）";
}

/* ------------------------------------------------------------------ *
 * 「本文を読まないと解けない設問」かどうか
 * ------------------------------------------------------------------ */

// 本文が別にあることを前提にした言い回し。
// 「『枕草子』の筆者は誰か」「次の詩人は誰か」のような知識問題に掛からないよう、
// 筆者・詩は続く語まで見る。
const JA_MARKERS =
  /本文|筆者(が|の(考え|主張|意見|思い|気持ち|言いたい|伝えたい|述べ)|は(どのように|なぜ|何を|どう))|傍線|線部|文章中|この文章|上の文章|前の文章|次の文章|この詩(?!人)|次の詩(?!人)|上の詩(?!人)|この英文|次の英文を読|英文を読んで|会話文|この物語|この場面/;
const EN_MARKERS = /\b(the passage|the story|the text|the conversation|the dialogue|according to the)\b/i;

/** 問題文の中に材料（引用・例文）がまるごと書かれているか */
function carriesMaterialInline(text: string): boolean {
  // 「…」『…』で20字以上くくってあれば、読む材料は問題文の中にある
  const quoted = text.match(/[「『]([^」』]{20,})[」』]/);
  if (quoted) return true;
  // 英文をまるごと載せている（60文字以上の英字の連なり）
  if (/[A-Za-z][A-Za-z ,.'"?!;:\-]{59,}/.test(text)) return true;
  // 問いの前に長い文章を載せている
  return text.replace(/\s/g, "").length >= 120;
}

/**
 * 本文が付いていないのに、本文を読む前提で書かれた設問か。
 * 用紙に出すと生徒は解けないので、作成の段で落とし、点検でも要確認にする。
 */
export function needsMissingPassage(q: { text?: string; passage?: string | null }): boolean {
  if (String(q.passage ?? "").trim()) return false;
  const text = String(q.text ?? "");
  if (!JA_MARKERS.test(text) && !EN_MARKERS.test(text)) return false;
  return !carriesMaterialInline(text);
}

/* ------------------------------------------------------------------ *
 * AIの応答から本文を設問にひも付ける
 * ------------------------------------------------------------------ */

/** 本文の中身で同じかどうかを見るためのキー（バンクで本文ごとにまとめるときにも使う） */
export function passageKey(passage: unknown): string {
  return String(passage ?? "")
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s　]/g, "")
    .toLowerCase()
    .slice(0, 60);
}

/** かたまりを区別するための一意な接頭辞。"r1_p1" を毎回使っていたので別の本文と混ざっていた */
export function newPassagePrefix(tag = "p"): string {
  return `${tag}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

type WithPassage = { passage?: string; passage_id?: string };

/**
 * AIが返した設問に本文をひも付ける。
 *
 * 本文は passages: [{id, text}] に1本ずつ書かせているが、応答は崩れることがある。
 * 次のどれで返ってきても、同じ本文の設問には同じ本文・同じ id が付くようにする:
 *   ・passages に本文、設問は passage_id だけ（頼んでいる形）
 *   ・設問に passage を直書き（古い形）。先頭の設問にだけ書いて残りは空、も含む
 *   ・passage はあるが passage_id が無い → 本文の中身でまとめる
 * id は prefix を付けて一意にする。本文の見つからない passage_id は外す
 * （id だけ残ると「本文つきなのに本文が無い」設問になる）。
 */
export function attachPassages<T extends WithPassage>(
  items: T[],
  passages: unknown,
  prefix: string,
  clean: (s: unknown) => string = (s) => String(s ?? "").trim(),
): T[] {
  const byId = new Map<string, string>();
  if (Array.isArray(passages)) {
    for (const p of passages as { id?: unknown; text?: unknown; passage?: unknown }[]) {
      const id = String(p?.id ?? "").trim();
      const text = clean(p?.text ?? p?.passage ?? "");
      if (id && text) byId.set(id, text);
    }
  }
  // 設問に直書きされた本文も id ごとに拾う（先頭の設問にだけ書かれていても残りに回す）
  for (const q of items) {
    const id = String(q.passage_id ?? "").trim();
    const text = clean(q.passage ?? "");
    if (id && text && !byId.has(id)) byId.set(id, text);
  }

  const idOfText = new Map<string, string>();
  let anon = 0;
  return items.map((q) => {
    const rawId = String(q.passage_id ?? "").trim();
    const text = (rawId && byId.get(rawId)) || clean(q.passage ?? "");
    const { passage: _p, passage_id: _id, ...rest } = q;
    void _p; void _id;
    if (!text) return rest as T;

    // 同じ本文には同じ id。AIの id が無ければ本文の中身でまとめる
    const key = passageKey(text);
    let id = idOfText.get(key);
    if (!id) {
      id = `${prefix}_${rawId ? rawId.replace(/[^\w-]/g, "") || `a${++anon}` : `a${++anon}`}`;
      idOfText.set(key, id);
    }
    return { ...rest, passage: text, passage_id: id } as T;
  });
}
