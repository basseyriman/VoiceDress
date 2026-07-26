/* VoiceDress — installability + light offline shell. Never pin stale JS. */
const CACHE = "voicedress-shell-v5";
const PRECACHE = ["/", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Always prefer network for app navigations and Next bundles
  if (
    request.mode === "navigate" ||
    url.pathname.startsWith("/_next/")
  ) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (request.mode === "navigate" && res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() =>
          request.mode === "navigate"
            ? caches.match(request).then((r) => r || caches.match("/"))
            : Promise.reject(new Error("offline"))
        )
    );
    return;
  }

  // Cache-first only for static media
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/garments/")
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          })
      )
    );
  }
});
