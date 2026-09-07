"use client";

import { useMemo, useState } from "react";
import { mathText } from "@/lib/mathText";
import { CHOICE_MARKS, type TestQuestion, type VerifyStatus } from "@/lib/testHtml";

// テストの問題を1問ずつ直すための編集画面。
//
// これまでプレビューはHTMLの塊で、気に入らない問題が1つあると全部作り直すしかなかった。
// ここでは問題文・選択肢・正解・解説をその場で直せる。
// 作成の途中（プレビュー）と、保存済みテストを開いたときの両方で同じものを使う。

const DIFF_OPTIONS: { id: string; label: string }[] = [
  { id: "basic", label: "基礎" },
  { id: "standard", label: "標準" },
  { id: "advanced", label: "応用" },
];

const VERIFY_BADGE: Record<VerifyStatus, { label: string; className: string; hint: string }> = {
  ok: {
    label: "✓ 検算OK",
    className: "bg-green-100 text-green-700",
    hint: "別のAIに正解を伏せて解かせ、同じ答えになりました",
  },
  fixed: {
    label: "⚠ 自動修正",
    className: "bg-amber-100 text-amber-800",
    hint: "検算で食い違いが出たため直してあります。念のためご確認ください",
  },
  needs_review: {
    label: "🔴 要確認",
    className: "bg-red-100 text-red-700",
    hint: "正解が1つに決まりませんでした。配る前に必ずご確認ください",
  },
  unverified: {
    label: "— 未検算",
    className: "bg-slate-200 text-slate-600",
    hint: "時間内に検算できませんでした",
  },
};

export type EditorHandlers<T extends TestQuestion> = {
  questions: T[];
  onChange: (next: T[]) => void;
  /** 「この1問を作り直す」。未指定ならボタンを出さない */
  onRegenerate?: (index: number) => void | Promise<void>;
  /** 「問題を1問足す」。未指定ならボタンを出さない */
  onAdd?: () => void | Promise<void>;
  /** 処理中の問題の番号（作り直し中のカードを止めるため） */
  busyIndex?: number | null;
  /** 追加処理中 */
  adding?: boolean;
};

export function TestQuestionEditor<T extends TestQuestion>({
  questions, onChange, onRegenerate, onAdd, busyIndex = null, adding = false,
}: EditorHandlers<T>) {
  // 「1問ずつ」は、目の前の1問だけを出して確認していくモード。
  // 一覧で流し読みすると見落とすので、既定はこちらにしてある。
  const [mode, setMode] = useState<"one" | "list">("one");
  const [cursor, setCursor] = useState(0);
  // 本文（国語の読解）は複数の設問で共有している。1か所で直したら全部に反映する
  const passageGroups = useMemo(() => {
    const m = new Map<string, number[]>();
    questions.forEach((q, i) => {
      const pid = q.passage_id ? String(q.passage_id) : "";
      if (!pid) return;
      if (!m.has(pid)) m.set(pid, []);
      m.get(pid)!.push(i);
    });
    return m;
  }, [questions]);

  const patch = (i: number, changes: Partial<TestQuestion>) => {
    const next = questions.map((q, idx) => (idx === i ? ({ ...q, ...changes } as T) : q));
    onChange(next);
  };

  const patchPassage = (pid: string, passage: string) => {
    const next = questions.map((q) =>
      String(q.passage_id ?? "") === pid ? ({ ...q, passage } as T) : q,
    );
    onChange(next);
  };

  const setOption = (i: number, oi: number, value: string) => {
    const q = questions[i];
    const opts = [...(q.options ?? [])];
    const wasCorrect = opts[oi] === q.correct_answer;
    opts[oi] = value;
    patch(i, { options: opts, ...(wasCorrect ? { correct_answer: value } : {}) });
  };

  const remove = (i: number) => {
    if (!confirm(`問${i + 1}を削除しますか？`)) return;
    onChange(questions.filter((_, idx) => idx !== i));
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const totalPoints = questions.reduce((s, q) => s + (q.points ?? 0), 0);
  const flagged = questions.filter((q) => q.verify_status === "needs_review").length;
  const checkedCount = questions.filter((q) => q.teacher_checked).length;

  const at = Math.min(cursor, Math.max(0, questions.length - 1));
  const visible = mode === "one"
    ? questions.map((_, i) => i).filter((i) => i === at)
    : questions.map((_, i) => i);

  /** 次の未確認の問題へ飛ぶ。無ければ何もしない */
  const goNextUnchecked = () => {
    const next = questions.findIndex((q, i) => i > at && !q.teacher_checked);
    const wrap = next === -1 ? questions.findIndex((q) => !q.teacher_checked) : next;
    if (wrap !== -1) setCursor(wrap);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-slate-800">全{questions.length}問</span>
          <span className="text-slate-500">合計{totalPoints}点</span>
          <span className={`rounded-full px-3 py-1 font-semibold ${
            checkedCount === questions.length
              ? "bg-green-100 text-green-800"
              : "bg-amber-100 text-amber-800"
          }`}>
            確認済み {checkedCount}/{questions.length}問
          </span>
          {flagged > 0 && (
            <span className="rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700">
              🔴 要確認 {flagged}問
            </span>
          )}
          <div className="ml-auto flex rounded-xl border border-slate-200 p-0.5 text-xs">
            <button onClick={() => setMode("one")}
              className={`rounded-lg px-3 py-1.5 ${mode === "one" ? "bg-slate-800 font-semibold text-white" : "text-slate-600"}`}>
              1問ずつ
            </button>
            <button onClick={() => setMode("list")}
              className={`rounded-lg px-3 py-1.5 ${mode === "list" ? "bg-slate-800 font-semibold text-white" : "text-slate-600"}`}>
              一覧
            </button>
          </div>
        </div>
        {/* 1問ずつの進み具合。押すとその問題へ飛ぶ */}
        <div className="mt-3 flex flex-wrap gap-1">
          {questions.map((q, i) => (
            <button key={q.id ?? i}
              onClick={() => { setMode("one"); setCursor(i); }}
              title={`問${i + 1}`}
              className={`h-7 w-7 rounded-lg text-xs font-semibold transition ${
                q.verify_status === "needs_review"
                  ? "bg-red-100 text-red-700 hover:bg-red-200"
                  : q.teacher_checked
                    ? "bg-green-600 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              } ${mode === "one" && cursor === i ? "ring-2 ring-slate-800 ring-offset-1" : ""}`}>
              {i + 1}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          配点は保存・印刷のときに合計100点へ自動でそろえます。
          未確認の問題が残っているテストは配信できません。
        </p>
      </div>

      {visible.map((i) => {
        const q = questions[i];
        const pid = q.passage_id ? String(q.passage_id) : "";
        const group = pid ? passageGroups.get(pid) ?? [] : [];
        // 一覧では本文はかたまりの先頭で1回だけ。1問ずつのときは常に出す（無いと読めない）
        const isPassageHead = pid !== "" && (mode === "one" || group[0] === i);
        const badge = q.verify_status ? VERIFY_BADGE[q.verify_status] : null;
        const busy = busyIndex === i;
        const optionCount = (q.options ?? []).length;

        return (
          <div key={q.id ?? i}>
            {isPassageHead && (
              <div className="mb-2 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-indigo-900">
                    本文（問{group.map((g) => g + 1).join("・")}で共通）
                  </span>
                  <span className="text-xs text-indigo-600">
                    ここを直すと、この本文の設問すべてに反映されます
                  </span>
                </div>
                <textarea
                  value={q.passage ?? ""}
                  onChange={(e) => patchPassage(pid, e.target.value)}
                  rows={6}
                  className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm leading-7 outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            )}

            <div
              className={`rounded-2xl border-2 bg-white p-5 shadow-sm transition ${
                q.verify_status === "needs_review" ? "border-red-300" : "border-slate-200"
              } ${busy ? "opacity-50" : ""}`}
            >
              {/* ヘッダー */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-900">問{i + 1}</span>
                <select
                  value={q.difficulty ?? "basic"}
                  onChange={(e) => patch(i, { difficulty: e.target.value })}
                  disabled={busy}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                >
                  {DIFF_OPTIONS.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  <input
                    type="number" min={1} max={100} value={q.points ?? 1}
                    onChange={(e) => patch(i, { points: Math.max(1, Number(e.target.value) || 1) })}
                    disabled={busy}
                    className="w-14 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1"
                  />
                  点
                </label>
                {badge && (
                  <span
                    title={badge.hint}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => move(i, -1)} disabled={busy || i === 0}
                    title="上へ"
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-30">↑</button>
                  <button onClick={() => move(i, 1)} disabled={busy || i === questions.length - 1}
                    title="下へ"
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-30">↓</button>
                  {onRegenerate && (
                    <button onClick={() => onRegenerate(i)} disabled={busy}
                      className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-40">
                      {busy ? "作り直し中…" : "この1問を作り直す"}
                    </button>
                  )}
                  <button onClick={() => remove(i)} disabled={busy}
                    className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40">削除</button>
                </div>
              </div>

              {q.verify_note && q.verify_status !== "ok" && (
                <p className={`mb-3 rounded-xl px-3 py-2 text-xs ${
                  q.verify_status === "needs_review"
                    ? "bg-red-50 text-red-700"
                    : "bg-amber-50 text-amber-800"
                }`}>
                  {q.verify_note}
                </p>
              )}

              {/* 問題文 */}
              <label className="mb-3 block text-xs font-semibold text-slate-500">
                問題文
                <textarea
                  value={q.text ?? ""}
                  onChange={(e) => patch(i, { text: e.target.value })}
                  disabled={busy}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </label>

              {/* 選択肢 */}
              <div className="mb-3">
                <p className="mb-1 text-xs font-semibold text-slate-500">
                  選択肢（左の丸が正解）
                  {optionCount !== 4 && (
                    <span className="ml-2 font-normal text-red-600">
                      いま{optionCount}つです。4つにしてください
                    </span>
                  )}
                </p>
                <div className="space-y-1.5">
                  {(q.options ?? []).map((opt, oi) => (
                    <label key={oi} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${q.id ?? i}`}
                        checked={opt === q.correct_answer}
                        onChange={() => patch(i, { correct_answer: opt })}
                        disabled={busy}
                        className="accent-green-600"
                      />
                      <span className="w-5 shrink-0 text-sm text-slate-400">{CHOICE_MARKS[oi] ?? oi + 1}</span>
                      <input
                        type="text" value={opt}
                        onChange={(e) => setOption(i, oi, e.target.value)}
                        disabled={busy}
                        className={`flex-1 rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300 ${
                          opt === q.correct_answer
                            ? "border-green-300 bg-green-50 font-medium"
                            : "border-slate-200 bg-white"
                        }`}
                      />
                    </label>
                  ))}
                </div>
                {optionCount > 0 && !(q.options ?? []).includes(q.correct_answer ?? "") && (
                  <p className="mt-1.5 text-xs font-semibold text-red-600">
                    正解が選ばれていません。正しい選択肢の丸を押してください。
                  </p>
                )}
              </div>

              {/* 解説 */}
              <label className="block text-xs font-semibold text-slate-500">
                解説（先生用の解答に載ります）
                <textarea
                  value={q.explanation ?? ""}
                  onChange={(e) => patch(i, { explanation: e.target.value })}
                  disabled={busy}
                  rows={2}
                  placeholder="なぜその答えになるかを1〜2文で"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </label>

              {/* 表示の確認（実際の用紙ではこの文字がそのまま出る） */}
              {mathText(q.text) !== (q.text ?? "") && (
                <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  用紙での見え方：{mathText(q.text)}
                </p>
              )}

              {/* 確認の確定。AIの検算は最後の砦ではないので、人が目を通した印を必ず取る */}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <button
                  onClick={() => patch(i, { teacher_checked: !q.teacher_checked })}
                  disabled={busy}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-40 ${
                    q.teacher_checked
                      ? "bg-green-600 text-white hover:bg-green-700"
                      : "border-2 border-green-300 bg-white text-green-700 hover:bg-green-50"
                  }`}>
                  {q.teacher_checked ? "✓ 確認しました" : "確認しました"}
                </button>
                {mode === "one" && (
                  <>
                    <button onClick={() => setCursor(Math.max(0, at - 1))} disabled={at === 0}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-30">
                      ← 前の問題
                    </button>
                    <button onClick={() => setCursor(Math.min(questions.length - 1, at + 1))}
                      disabled={at >= questions.length - 1}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-30">
                      次の問題 →
                    </button>
                    <button onClick={goNextUnchecked}
                      disabled={checkedCount >= questions.length}
                      className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-30">
                      次の未確認へ
                    </button>
                    <span className="ml-auto text-sm text-slate-400">{i + 1} / {questions.length}問目</span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {onAdd && (
        <button onClick={onAdd} disabled={adding}
          className="w-full rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-4 text-sm font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50">
          {adding ? "作成中…" : "＋ 問題を1問足す"}
        </button>
      )}
    </div>
  );
}
