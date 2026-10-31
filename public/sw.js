/**
 * sw.js — Shree Royal Car BMS Service Worker
 * ─────────────────────────────────────────────────────────────────────────────
 * Strategy:
 *   • App shell (HTML, JS, CSS) — Cache-First with network fallback
 *   • API routes (/api/*) — Network-Only (never cache sensitive responses)
 *   • Supabase requests — Network-Only
 *   • Static assets (fonts, images) — Cache-First
 *   • Navigation requests — Cache-First with offline fallback page
 *
 * This worker does NOT cache Supabase auth tokens or API payloads.
 * All business data lives in IndexedDB (managed by Dexie in the app).
 */

const CACHE_VERSION   = "src-bms-v1";
const OFFLINE_URL     = "/offline.html";

// Assets to pre-cache on install (app shell)
const PRECACHE_ASSETS = [
  "/",
  "/offline.html",
  "/favicon.ico",
];

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_VERSION)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept: cross-origin, Supabase, API routes, Next.js internals
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase.co") ||
    url.pathname.startsWith("/_next/webpack-hmr") ||
    request.method !== "GET"
  ) {
    return; // let the browser handle it
  }

  // Next.js build chunks — Network-First (always want latest JS)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(networkFirstThenCache(request));
    return;
  }

  // Static assets (fonts, images, favicon)
  if (
    url.pathname.startsWith("/fonts/") ||
    url.pathname.match(/\.(ico|png|jpg|jpeg|svg|webp|woff2?|ttf|otf)$/)
  ) {
    event.respondWith(cacheFirstThenNetwork(request));
    return;
  }

  // Navigation (HTML pages) — Cache-First with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }
});

// ─── Strategies ───────────────────────────────────────────────────────────────

async function cacheFirstThenNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirstThenCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response("Offline", { status: 503 });
  }
}

async function navigationHandler(request) {
  try {
    // Try network first for navigation so updates propagate
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
      return response;
    }
    throw new Error("Non-OK response");
  } catch {
    // Try the cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // Last resort: serve the root cached shell or offline page
    const root = await caches.match("/");
    if (root) return root;

    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;

    return new Response("<h1>Offline</h1><p>Please check your connection.</p>", {
      status: 503,
      headers: { "Content-Type": "text/html" },
    });
  }
}
