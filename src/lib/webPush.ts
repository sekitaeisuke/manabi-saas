"use client";

export type WebPushSupport =
  | { ok: true }
  | { ok: false; reason: string };

export function checkWebPushSupport(): WebPushSupport {
  if (typeof window === "undefined") return { ok: false, reason: "サーバ環境" };
  if (!("serviceWorker" in navigator)) return { ok: false, reason: "Service Worker 非対応のブラウザ" };
  if (!("PushManager" in window)) return { ok: false, reason: "Push API 非対応のブラウザ" };
  if (!("Notification" in window)) return { ok: false, reason: "Notification API 非対応のブラウザ" };
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return { ok: false, reason: "VAPID 公開鍵が未設定" };
  return { ok: true };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** Requests permission, subscribes, and returns the subscription as JSON. */
export async function subscribeWebPush(): Promise<{
  ok: true; subscription: PushSubscriptionJSON;
} | { ok: false; error: string }> {
  const support = checkWebPushSupport();
  if (!support.ok) return { ok: false, error: support.reason };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, error: `通知許可が得られませんでした（${permission}）` };

  try {
    const reg = await ensureServiceWorker();
    await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      return { ok: true, subscription: existing.toJSON() };
    }
    const key = urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!);
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key.buffer as ArrayBuffer,
    });
    return { ok: true, subscription: sub.toJSON() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function unsubscribeWebPush(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
}

export async function getCurrentSubscriptionEndpoint(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return null;
  const sub = await reg.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}
