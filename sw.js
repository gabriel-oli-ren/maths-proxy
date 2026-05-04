/**
 * sw.js — Service Worker for GitHub Pages
 * Place this file at the ROOT of your repository (same level as index.html)
 */

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
const CACHE_NAME = "app-v1";

// Your Cloudflare Worker proxy URL
const PROXY_ORIGIN = "https://your-worker.your-subdomain.workers.dev";

// Files to pre-cache on install (app shell)
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./sw.js",
  // Add your CSS, JS, icon paths here:
  // "./style.css",
  // "./app.js",
  // "./icons/icon-192.png",
];

// API path patterns that should ALWAYS go to the network (via proxy)
const NETWORK_ONLY_PATTERNS = [
  /\/api\//,
  new RegExp(PROXY_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
];
// ──────────────────────────────────────────────────────────────────────────────

// ── Install ────────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  console.log("[SW] Installing…");
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

// ── Activate ───────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating…");
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => {
              console.log("[SW] Deleting old cache:", key);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim()) // take control immediately
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== "GET" || url.protocol === "chrome-extension:") return;

  // Network-only for API / proxy calls
  if (NETWORK_ONLY_PATTERNS.some((p) => p.test(request.url))) {
    event.respondWith(networkOnly(request));
    return;
  }

  // Cache-first for everything else (app shell, assets)
  event.respondWith(cacheFirst(request));
});

// ── Strategies ─────────────────────────────────────────────────────────────────

/** Cache-first: serve from cache, fall back to network, then cache the result */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback
    const fallback = await caches.match("./index.html");
    if (fallback) return fallback;
    return new Response("Offline — no cached content available.", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

/** Network-only: always hit the network, no caching */
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(
      JSON.stringify({ error: "Network unavailable", offline: true }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// ── Background sync helper (optional) ─────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "GET_VERSION") {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});
