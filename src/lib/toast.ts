"use client";

type ToastType = "success" | "error" | "info";

/**
 * alert() の代替。DOM に直接マウントする命令型トースト。
 * React の state 管理なしにどこからでも呼べる。
 */
export function showToast(message: string, type: ToastType = "info", durationMs = 3500) {
  if (typeof window === "undefined") return;

  const colors: Record<ToastType, string> = {
    success: "bg-green-600",
    error:   "bg-red-600",
    info:    "bg-blue-600",
  };
  const icons: Record<ToastType, string> = {
    success: "✓",
    error:   "✕",
    info:    "ℹ",
  };

  const el = document.createElement("div");
  el.className = [
    "fixed bottom-6 right-6 z-[9999]",
    "flex items-center gap-2 rounded-2xl px-5 py-3",
    "text-sm font-semibold text-white shadow-lg",
    "transition-opacity duration-300",
    colors[type],
  ].join(" ");
  el.innerHTML = `<span aria-hidden="true">${icons[type]}</span><span>${message}</span>`;
  document.body.appendChild(el);

  const hide = () => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  };

  // クリックで即閉じ
  el.addEventListener("click", hide);
  setTimeout(hide, durationMs);
}
