// manabi-saas Web Push Service Worker
// Registered from src/lib/webPush.ts

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { title: "manabi-saas", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "manabi-saas";
  const body = data.body || "";
  const url = data.url || "/";

  const options = {
    body,
    data: { url },
    icon: "/favicon.ico",
    badge: "/favicon.ico",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url === url) return w.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
