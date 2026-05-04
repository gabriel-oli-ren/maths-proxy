/**
 * sw.js — Service Worker for browse.mathssupport.cat
 * Caches the app shell; all proxy requests go direct to the network.
 */

const CACHE     = "mathsbrowser-v1";
const PROXY     = "https://search.mathssupport.cat";
const SELF_HOST = self.location.origin; // https://browse.mathssupport.cat

// App shell — pre-cached on install
const SHELL = [
  "./",
  "./index.html",
  "./sw.js",
];

// ── Install: cache shell ──────────────────────────────────────────────────────
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// ── Activate: clear old caches ────────────────────────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== "GET") return;

  // NETWORK ONLY: anything not on our own GitHub Pages origin
  // (i.e. all requests to the Cloudflare proxy go straight to the network)
  if (url.origin !== SELF_HOST) {
    e.respondWith(fetch(request).catch(() =>
      new Response(JSON.stringify({ error: "Network unavailable", offline: true }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    ));
    return;
  }

  // CACHE FIRST: app shell and same-origin assets
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return res;
      }).catch(() =>
        caches.match("./index.html") // offline fallback
      );
    })
  );
});

// ── Message: skip waiting / version query ─────────────────────────────────────
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (e.data?.type === "VERSION") e.ports[0]?.postMessage({ cache: CACHE });
});
