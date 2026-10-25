const CACHE_NAME = "crownstore-shell-v16";
const APP_SHELL = ["/", "/manifest.webmanifest", "/favicon.svg?v=2", "/crownstore-icon.svg?v=3", "/crownstore-maskable.svg?v=3", "/crownstore-pwa-icon.svg?v=3"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("crownstore-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});


self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof payload.title === "string" ? payload.title.slice(0, 140) : "CrownStore alert";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 500) : typeof payload.message === "string" ? payload.message.slice(0, 500) : "";
  const candidate = typeof payload.url === "string" && payload.url.startsWith("/") && !payload.url.startsWith("//") ? payload.url : "/";
  const target = new URL(candidate, self.location.origin);
  const safeUrl = target.origin === self.location.origin ? target.pathname + target.search + target.hash : "/";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: typeof payload.tag === "string" ? payload.tag.slice(0, 160) : "crownstore-alert",
    icon: "/crownstore-pwa-icon.svg?v=3",
    badge: "/crownstore-pwa-icon.svg?v=3",
    data: { url: safeUrl }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const candidate = event.notification.data && typeof event.notification.data.url === "string"
    ? event.notification.data.url
    : "/";
  const target = new URL(candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/", self.location.origin);
  const safeUrl = target.origin === self.location.origin ? target.href : self.location.origin + "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    const openWindow = windows.find((client) => {
      try { return new URL(client.url).origin === self.location.origin; } catch { return false; }
    });
    if (openWindow) {
      await openWindow.navigate(safeUrl);
      return openWindow.focus();
    }
    return self.clients.openWindow(safeUrl);
  }));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Never cache API responses or downloads; only cache the app shell and static assets.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/")))
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname === "/manifest.webmanifest" || url.pathname.endsWith(".svg")) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }))
    );
  }
});