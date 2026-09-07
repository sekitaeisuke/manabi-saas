// テスト用紙の見た目。renderTestHtml / renderAnswerSheetHtml が吐く HTML に当てる。
//
// 作成画面のプレビュー・保存済みテストの確認ページ・印刷のどれでも同じ見た目になるよう、
// スタイルはここ1か所に置く（別々に書くと、画面で整っていたのに印刷すると崩れる）。
export const TEST_PAPER_CSS = `
#test-body { font-family: sans-serif; line-height: 1.8; color: #0f172a; }
#test-body h1 { font-size: 1.4rem; font-weight: bold; text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 16px; }
#test-body h2 { font-size: 1.1rem; font-weight: bold; background: #f1f5f9; padding: 6px 12px; margin: 24px 0 12px; border-left: 4px solid #6366f1; }
#test-body .question { margin: 16px 0; break-inside: avoid; page-break-inside: avoid; }
/* 選択肢の番号（①②③④）は HTML 側に文字として入れてある。
   ブラウザの自動採番に頼ると、用紙・解答・解答用紙で記号がずれるため。 */
#test-body ol { list-style: none; padding-left: 0.4rem; margin: 6px 0; }
#test-body ol li { margin: 2px 0; }
#test-body ol li .mark { color: #475569; font-weight: 600; margin-right: 4px; }
#test-body .answer-hint { font-size: 0.8rem; color: #64748b; margin: 2px 0; }
#test-body .answer-box { border-bottom: 1px solid #94a3b8; min-height: 40px; margin: 8px 0 16px; }
#test-body table { border-collapse: collapse; width: 100%; margin: 12px 0; }
#test-body td, #test-body th { border: 1px solid #cbd5e1; padding: 6px 10px; }
#test-body th { background: #f8fafc; font-weight: bold; }

/* 国語の読解：本文は設問より先に、囲んで1回だけ出す */
#test-body .passage { border: 1px solid #cbd5e1; background: #fcfcfd; border-radius: 8px; padding: 12px 16px; margin: 12px 0 18px; break-inside: avoid; page-break-inside: avoid; }
#test-body .passage-label { font-size: 0.85rem; font-weight: 700; color: #475569; margin: 0 0 6px; }
#test-body .passage-body { margin: 0; line-height: 2; }

/* 先生用（解答つき）でだけ出るもの */
#test-body ol li.correct { background: #ecfdf5; font-weight: 700; }
#test-body .answer-line { margin: 4px 0 0; color: #047857; }
#test-body .explanation { margin: 2px 0 0; font-size: 0.875rem; color: #475569; }
#test-body .needs-review { margin: 4px 0 0; font-size: 0.875rem; font-weight: 700; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 4px 8px; }

/* 解答用紙 */
#test-body table.answer-sheet th { width: 4.5rem; text-align: left; }
#test-body table.answer-sheet td.ans { height: 2.2rem; font-size: 1.1rem; font-weight: 700; }
#test-body table.answer-sheet td.pt { width: 4rem; color: #64748b; font-size: 0.8rem; }
`;
