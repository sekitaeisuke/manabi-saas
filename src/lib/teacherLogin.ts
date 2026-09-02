/**
 * 講師のログインID。
 *
 * 講師のログインは Supabase Auth のメールで成立し、teachers 行も email で突合する。
 * ところが実際の教室には「業務用メールを持たない講師」が多く、その人たちは
 * アカウントを作れずログインできないままだった。
 * そこで生徒（@students.local）と同じ考え方で、メールの代わりに短いログインID
 * （t001 など）を発行し、内部では <id>@teachers.local として扱う。
 *
 * メールを持っている講師は今までどおりメールで入れる（どちらでもよい）。
 */
export const TEACHER_ID_DOMAIN = "@teachers.local";

/** 発行するログインIDの形（英小文字＋数字）。人が口頭で伝えられる短さにする。 */
export const TEACHER_ID_PATTERN = /^[a-z][a-z0-9]{1,15}$/;

/** 入力がメールならそのまま、ログインIDなら内部のメール形式に組み立てる */
export function toLoginEmail(input: string): string {
  const v = (input ?? "").trim();
  return v.includes("@") ? v.toLowerCase() : `${v.toLowerCase()}${TEACHER_ID_DOMAIN}`;
}

/** 画面に出す表記。内部ドメインは見せず、発行したIDだけを見せる。 */
export function toDisplayId(email: string | null | undefined): string {
  const v = (email ?? "").trim();
  return v.toLowerCase().endsWith(TEACHER_ID_DOMAIN) ? v.slice(0, -TEACHER_ID_DOMAIN.length) : v;
}
