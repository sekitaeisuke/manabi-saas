"use client";

import { sanitizeHtml } from "@/lib/sanitize";
import { TEST_PAPER_CSS } from "@/lib/testPaperStyle";

/**
 * テスト用紙を印刷する。
 *
 * window.print() をそのまま呼ぶと、画面のボタンやサイドバーごと印刷されてしまう。
 * 用紙だけの新しいウィンドウを開いて、そこを印刷する。
 * （ボタンのクリックから直接呼ぶこと。そうでないとポップアップが止められる）
 */
export function printPaper(title: string, bodyHtml: string): boolean {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false; // ポップアップがブロックされた

  const safeTitle = String(title ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  w.document.write(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8">` +
      `<title>${safeTitle}</title>` +
      `<style>${TEST_PAPER_CSS}
@page { margin: 16mm; }
body { margin: 0; padding: 0; background: #fff; }
</style></head><body>${sanitizeHtml(bodyHtml)}</body></html>`,
  );
  w.document.close();
  w.focus();
  // 描画が終わってから印刷ダイアログを出す
  setTimeout(() => w.print(), 300);
  return true;
}
