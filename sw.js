/**
 * sw.js — Service Worker for browse.mathssupport.cat
 * v2: smarter cache versioning, better offline fallback,
 *     proxy requests always go to network.
 */

const CACHE_VERSION = "mathsbrowser-v2";
const PROXY_ORIGIN  = "https://search.mathssupport.cat";
const SELF_HOST     = self.location.origin; // e.g. https://browse.mathssupport.cat

// App shell — pre-cached on install
const SHELL = [
  "./",
  "./index.html",
  "./sw.js",
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener("install", (e) => {
  console.log("[SW] Installing", CACHE_VERSION);
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener("activate", (e) => {
  console.log("[SW] Activating", CACHE_VERSION);
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION)
          .map(k => { console.log("[SW] Deleting old cache:", k); return caches.delete(k); })
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Only intercept GET
  if (request.method !== "GET") return;

  // ── NETWORK ONLY: proxy origin ─────────────────────────────────────────────
  // All requests to the Cloudflare proxy go straight to the network.
  // We never cache proxied content (privacy + freshness).
  if (url.origin === PROXY_ORIGIN) {
    e.respondWith(
      fetch(request, { credentials: "omit" }).catch(() =>
        new Response(
          `<html><body style="font-family:monospace;background:#0d0d10;color:#f87171;padding:2rem">
            <h2>⚠ Proxy Unreachable</h2>
            <p>Cannot reach ${PROXY_ORIGIN}.<br>Check your connection.</p>
           </body></html>`,
          { status: 503, headers: { "Content-Type": "text/html" } }
        )
      )
    );
    return;
  }

  // ── NETWORK ONLY: cross-origin assets (fonts, CDN, etc.) ──────────────────
  if (url.origin !== SELF_HOST) {
    e.respondWith(fetch(request).catch(() => new Response("", { status: 503 })));
    return;
  }

  // ── STALE-WHILE-REVALIDATE: app shell & same-origin assets ────────────────
  e.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(request);

      // Kick off a revalidation in the background (don't wait)
      const networkFetch = fetch(request).then(res => {
        if (res.ok && res.type !== "opaque") {
          cache.put(request, res.clone());
        }
        return res;
      }).catch(() => null);

      if (cached) {
        // Return cached immediately; revalidation runs in background
        e.waitUntil(networkFetch);
        return cached;
      }

      // Not cached — wait for network
      const res = await networkFetch;
      if (res) return res;

      // Offline fallback: serve index.html for navigation requests
      if (request.mode === "navigate") {
        return cache.match("./index.html") || new Response("Offline", { status: 503 });
      }

      return new Response("", { status: 503 });
    })
  );
});

// ── Messages ──────────────────────────────────────────────────────────────────
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (e.data?.type === "VERSION") {
    e.ports[0]?.postMessage({ cache: CACHE_VERSION });
  }
  if (e.data?.type === "CLEAR_CACHE") {
    caches.delete(CACHE_VERSION).then(() => {
      e.ports[0]?.postMessage({ cleared: true });
    });
  }
});
