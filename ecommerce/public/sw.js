/**
 * Service worker PWA Sessa.
 * Strategia:
 *  - Navigazioni pubbliche: network-first, cache solo come ripiego.
 *  - Checkout, account, ordini, admin e API: rete sempre, fallback offline.
 *  - Asset statici: stale-while-revalidate.
 *  - Richieste non GET: mai intercettate.
 */
const VERSION = "sessa-shop-v6";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/admin.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/admin-192.png"
];

const SENSITIVE_PREFIXES = ["/api", "/admin", "/account", "/checkout", "/carrello", "/ordine"];

function canCacheNavigation(pathname) {
  if (SENSITIVE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return false;
  }
  return pathname === "/" || pathname.startsWith("/sede/");
}

function isCacheableResponse(response) {
  if (!response || !response.ok || (response.type !== "basic" && response.type !== "default")) {
    return false;
  }
  const cacheControl = (response.headers.get("cache-control") || "").toLowerCase();
  return !cacheControl.includes("no-store") && !cacheControl.includes("no-cache") && !cacheControl.includes("private");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then(async (cache) => {
        // La pagina offline è il requisito minimo. Icone/manifest sono best-effort:
        // un singolo asset temporaneamente assente non deve invalidare l'intero SW.
        await cache.add(OFFLINE_URL);
        await Promise.allSettled(PRECACHE.filter((url) => url !== OFFLINE_URL).map((url) => cache.add(url)));
      })
      // Rollout una-tantum di v6: sostituisce subito v5, che poteva conservare
      // HTML pubblico marcato private/no-store. Rimuovere su v7 e usare la UI update.
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
      (async () => {
        try {
          const response = await fetch(request);
          if (canCacheNavigation(url.pathname) && isCacheableResponse(response)) {
            const cache = await caches.open(VERSION);
            await cache.put(request, response.clone());
          }
          return response;
        } catch {
          const fallback = canCacheNavigation(url.pathname)
            ? (await caches.match(request)) ?? caches.match(OFFLINE_URL)
            : caches.match(OFFLINE_URL);
          return (
            (await fallback) ??
            new Response("Sei offline. Riprova quando la connessione torna disponibile.", {
              status: 503,
              headers: { "content-type": "text/plain; charset=utf-8" }
            })
          );
        }
      })()
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
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/admin.webmanifest";
  if (isStatic) {
    const fresh = fetch(request).then(async (response) => {
      if (isCacheableResponse(response)) {
        const cache = await caches.open(VERSION);
        await cache.put(request, response.clone());
      }
      return response;
    });
    event.waitUntil(fresh.then(() => undefined).catch(() => undefined));
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fresh)
    );
  }
});
