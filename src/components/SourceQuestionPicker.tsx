"use client";

import { useRef, useState } from "react";

import { showToast } from "@/lib/toast";
import { authFetch } from "@/lib/authFetch";
import { mathText } from "@/lib/mathText";
import { ACCEPT, prepareFiles, formatBytes, type PreparedFile } from "@/lib/fileToAttachment";

// 塾のプリント・問題集を撮った写真やPDFから、問題を読み取って原題として並べる。
//
// 読み取ったものをそのまま類題づくりに流さない。AIは字を読み違える（6とb、x²とx2、
// 分数の上下、選択肢の取り違え）ので、**ここで講師が直してから**次へ渡す。
// 原本はサーバに保存しない。読み取ったら捨てる。

export type SourceQuestion = {
  text: string;
  options: string[] | null;
  correct_answer: string;
  needs_figure: boolean;
  unit_guess: string;
  difficulty_guess: "basic" | "standard" | "advanced";
  note: string;
  /** 類題づくりに使うか。図が要る問題は既定で外す */
  use: boolean;
};

const DIFF_LABEL: Record<string, string> = { basic: "基礎", standard: "標準", advanced: "応用" };

export function SourceQuestionPicker({
  subject, grade, sources, onChange,
}: {
  subject: string;
  grade: string;
  sources: SourceQuestion[];
  onChange: (next: SourceQuestion[]) => void;
}) {
  const [files, setFiles] = useState<PreparedFile[]>([]);
  const [reading, setReading] = useState(false);
  const [warn, setWarn] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const totalBytes = files.reduce((s, f) => s + f.bytes, 0);
  const tooBig = totalBytes > 4 * 1024 * 1024;

  const pick = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setWarn("");
    try {
      const prepared = await prepareFiles(Array.from(fileList).slice(0, 6));
      setFiles(prepared);
    } catch (e) {
      showToast(`ファイルを読めませんでした（${String(e)}）`, "error");
    }
  };

  const read = async () => {
    if (files.length === 0) return;
    setReading(true);
    setWarn("");
    try {
      const res = await authFetch("/api/extract/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject, grade,
          files: files.map((f) => ({ mediaType: f.mediaType, data: f.data, name: f.name })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!data || data.error) {
        showToast(data?.error ?? "読み取りに失敗しました", "error");
        return;
      }
      if (data.warning) setWarn(String(data.warning));
      const got = (data.questions ?? []) as Omit<SourceQuestion, "use">[];
      // 図が要る問題は図を作れないので、既定では類題づくりから外しておく
      onChange([...sources, ...got.map((q) => ({ ...q, use: !q.needs_figure }))]);
      if (got.length > 0) {
        showToast(`${got.length}問を読み取りました。中身をご確認ください`, "success");
        setFiles([]);
        if (inputRef.current) inputRef.current.value = "";
      }
    } finally {
      setReading(false);
    }
  };

  const patch = (i: number, changes: Partial<SourceQuestion>) =>
    onChange(sources.map((q, idx) => (idx === i ? { ...q, ...changes } : q)));

  const remove = (i: number) => onChange(sources.filter((_, idx) => idx !== i));

  const useCount = sources.filter((q) => q.use).length;

  return (
    <div className="space-y-4">
      {/* ── ファイルを選ぶ ── */}
      <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5">
        <input
          ref={inputRef} type="file" accept={ACCEPT} multiple
          onChange={(e) => pick(e.target.files)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-indigo-700"
        />
        <p className="mt-2 text-xs text-slate-500">
          プリントや問題集のページを撮った写真（JPEG・PNG）、またはPDF。一度に6枚まで。
          写真は送る前に自動で小さくします。<strong>原本は保存しません。</strong>
        </p>

        {files.length > 0 && (
          <div className="mt-3 space-y-1">
            {files.map((f) => (
              <div key={f.name} className="flex items-center gap-2 text-xs text-slate-600">
                <span className="rounded bg-white px-2 py-0.5 border border-slate-200">
                  {f.mediaType === "application/pdf" ? "PDF" : "画像"}
                </span>
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-slate-400">{formatBytes(f.bytes)}</span>
              </div>
            ))}
            <p className={`text-xs ${tooBig ? "font-semibold text-red-600" : "text-slate-400"}`}>
              合計 {formatBytes(totalBytes)}
              {tooBig && " — 大きすぎます。枚数を減らしてください"}
            </p>
            <button
              onClick={read} disabled={reading || tooBig}
              className="mt-2 w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400">
              {reading ? "読み取り中…（30秒ほどかかります）" : "問題を読み取る"}
            </button>
          </div>
        )}
      </div>

      {warn && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {warn}
        </div>
      )}

      {/* ── 読み取った原題 ── */}
      {sources.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <span className="font-semibold text-slate-800">読み取った原題 {sources.length}問</span>
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-indigo-800">
              類題を作る対象 {useCount}問
            </span>
            <button onClick={() => onChange([])}
              className="ml-auto text-xs text-slate-400 hover:text-red-600">
              すべて消す
            </button>
          </div>

          <p className="text-xs text-slate-500">
            AIは字を読み違えます（6とb、x²とx2、分数の上下など）。
            <strong>おかしいところは直してから</strong>類題を作ってください。
            ここで直した原題はテストには載りません。類題を作るための下敷きです。
          </p>

          {sources.map((q, i) => (
            <div key={i}
              className={`rounded-2xl border-2 p-4 transition ${
                q.use ? "border-indigo-200 bg-white" : "border-slate-200 bg-slate-50 opacity-70"
              }`}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={q.use}
                    onChange={(e) => patch(i, { use: e.target.checked })}
                    className="accent-indigo-600" />
                  原題{i + 1}
                </label>
                <select value={q.difficulty_guess}
                  onChange={(e) => patch(i, { difficulty_guess: e.target.value as SourceQuestion["difficulty_guess"] })}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
                  {Object.entries(DIFF_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input type="text" value={q.unit_guess}
                  onChange={(e) => patch(i, { unit_guess: e.target.value })}
                  placeholder="単元"
                  className="w-40 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs" />
                {q.needs_figure && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
                    title="図・グラフ・表が要る問題です。用紙に図を載せられないため、既定では対象から外しています">
                    図が必要
                  </span>
                )}
                <button onClick={() => remove(i)}
                  className="ml-auto text-xs text-slate-400 hover:text-red-600">削除</button>
              </div>

              {q.note && (
                <p className="mb-2 rounded-xl bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                  読み取りメモ：{q.note}
                </p>
              )}

              <textarea value={q.text} onChange={(e) => patch(i, { text: e.target.value })}
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />

              {q.options && q.options.length > 0 && (
                <div className="mt-2 space-y-1">
                  {q.options.map((o, oi) => (
                    <input key={oi} type="text" value={o}
                      onChange={(e) => {
                        const opts = [...(q.options ?? [])];
                        opts[oi] = e.target.value;
                        patch(i, { options: opts });
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm" />
                  ))}
                </div>
              )}

              {mathText(q.text) !== q.text && (
                <p className="mt-2 text-xs text-slate-400">読み取り結果：{mathText(q.text)}</p>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
