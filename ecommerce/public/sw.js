/**
 * Service worker PWA Sessa.
 * Strategia:
 *  - Navigazioni pubbliche: network-first, cache solo come ripiego.
 *  - Checkout, account, ordini, admin e API: rete sempre, fallback offline.
 *  - Asset statici: stale-while-revalidate.
 *  - Richieste non GET: mai intercettate.
 */
const VERSION = "sessa-shop-v3";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/brand/sessa-logo-white.webp"
];

const SENSITIVE_PREFIXES = ["/api", "/admin", "/account", "/checkout", "/carrello", "/ordine"];

function canCacheNavigation(pathname) {
  if (SENSITIVE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return false;
  }
  return pathname === "/" || pathname.startsWith("/sede/");
}

function isCacheableResponse(response) {
  return response && response.ok && (response.type === "basic" || response.type === "default");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigazioni: rete prima. Cache solo per catalogo pubblico.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (canCacheNavigation(url.pathname) && isCacheableResponse(response)) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          canCacheNavigation(url.pathname)
            ? caches.match(request).then((cached) => cached ?? caches.match(OFFLINE_URL))
            : caches.match(OFFLINE_URL)
        )
    );
    return;
  }

  // Asset statici: cache subito, aggiorna in background.
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname.startsWith("/patterns/") ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/manifest.webmanifest";
  if (isStatic) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fresh = fetch(request)
          .then((response) => {
            if (isCacheableResponse(response)) {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached ?? fresh;
      })
    );
  }
});
