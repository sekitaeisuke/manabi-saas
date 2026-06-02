"use client";

type ToastType = "success" | "error" | "info";

const CFG: Record<ToastType, { grad: string; icon: string; bar: string }> = {
  success: { grad: "linear-gradient(135deg,#10b981,#059669)", icon: "✓", bar: "rgba(255,255,255,0.7)" },
  error:   { grad: "linear-gradient(135deg,#ef4444,#dc2626)", icon: "✕", bar: "rgba(255,255,255,0.7)" },
  info:    { grad: "linear-gradient(135deg,#6366f1,#4f46e5)", icon: "ℹ", bar: "rgba(255,255,255,0.7)" },
};

export function showToast(message: string, type: ToastType = "info", durationMs = 3500) {
  if (typeof window === "undefined") return;

  const cfg = CFG[type];
  const existing = document.querySelectorAll("[data-toast]");
  const bottomOffset = 24 + existing.length * 76;

  const el = document.createElement("div");
  el.setAttribute("data-toast", "1");
  el.style.cssText = `
    position:fixed; bottom:${bottomOffset}px; right:24px; z-index:9999;
    transform:translateX(calc(100% + 32px)); opacity:0;
    transition:transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease;
    max-width:340px; min-width:240px;
    border-radius:16px; overflow:hidden;
    box-shadow:0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.12);
    background:${cfg.grad};
    cursor:pointer;
  `;

  const inner = document.createElement("div");
  inner.style.cssText = "display:flex; align-items:center; gap:12px; padding:14px 18px;";

  const iconEl = document.createElement("span");
  iconEl.style.cssText = `
    display:flex; align-items:center; justify-content:center;
    width:28px; height:28px; border-radius:50%;
    background:rgba(255,255,255,0.25); flex-shrink:0;
    font-size:14px; font-weight:800; color:#fff;
  `;
  iconEl.textContent = cfg.icon;

  const textEl = document.createElement("span");
  textEl.style.cssText = "font-size:13px; font-weight:600; color:#fff; line-height:1.4;";
  textEl.textContent = message;

  inner.appendChild(iconEl);
  inner.appendChild(textEl);

  const progressWrap = document.createElement("div");
  progressWrap.style.cssText = "height:3px; background:rgba(255,255,255,0.2);";
  const progressBar = document.createElement("div");
  progressBar.style.cssText = `height:100%; width:100%; background:${cfg.bar}; transition:width ${durationMs}ms linear;`;
  progressWrap.appendChild(progressBar);

  el.appendChild(inner);
  el.appendChild(progressWrap);
  document.body.appendChild(el);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transform = "translateX(0)";
    el.style.opacity = "1";
    setTimeout(() => { progressBar.style.width = "0"; }, 50);
  }));

  const hide = () => {
    el.style.transform = "translateX(calc(100% + 32px))";
    el.style.opacity = "0";
    setTimeout(() => {
      el.remove();
      document.querySelectorAll("[data-toast]").forEach((t, i) => {
        (t as HTMLElement).style.bottom = `${24 + i * 76}px`;
      });
    }, 350);
  };

  el.addEventListener("click", hide);
  setTimeout(hide, durationMs);
}
