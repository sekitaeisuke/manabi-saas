"use client";

import DOMPurify from "dompurify";

/**
 * Claude / AI が生成した HTML を安全にレンダリングするためのサニタイザ。
 * dangerouslySetInnerHTML に渡す前に必ずこれを通す。
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") {
    // SSR時は document が無くサニタイズできないため、未検証HTMLを素通しせず空で返す。
    // これらは "use client" ページのため、実コンテンツはクライアント側の再レンダーで描画される。
    return "";
  }
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: [
      "h1","h2","h3","h4","h5","h6","p","br","hr","ul","ol","li",
      "strong","em","b","i","u","s","span","div","table","thead","tbody",
      "tr","th","td","a","img","blockquote","pre","code",
    ],
    ALLOWED_ATTR: ["href","src","alt","class","id","style","target","rel"],
    FORCE_BODY: false,
  });
}
