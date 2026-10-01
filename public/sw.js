/*
 * 3256 Tools service worker — offline app shell.
 *
 *  - Page navigations: network first (6 s cap), fall back to the last cached
 *    copy of that page, then to the cached home dashboard ("/").
 *  - /_next/static and icons: cache first.
 *  - Everything else (server actions, RSC fetches, /api, Supabase): network only.
 *
 * Server actions made while offline are queued by the app itself
 * (components/offline.tsx), not here.
 */
const VERSION = "bt-v8";
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const NAV_TIMEOUT_MS = 6000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES).then((c) => Promise.all(
      ["/", "/battery", "/battery/batteries", "/battery/log", "/battery/comp", "/stock"].map(async (path) => {
        try {
          const res = await fetch(path);
          if (res.ok && !res.redirected) await c.put(path, res);
        } catch {
          // One unavailable page must not prevent the others from being cached.
        }
      }),
    )),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Development assets reuse URLs across edits and must always stay fresh.
  if (url.pathname.startsWith("/_next/") && ["localhost", "127.0.0.1"].includes(url.hostname)) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/work" || url.pathname.startsWith("/work/") || url.pathname.startsWith("/auth/work/")) return;
  // RSC payloads / prefetches are not page shells; let the app handle failures.
  if (req.headers.get("RSC") === "1" || req.headers.get("Next-Router-Prefetch") === "1") return;

  if (url.pathname.startsWith("/_next/static/") || /\.(png|ico|svg|json|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(ASSETS).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      caches.open(PAGES).then(async (c) => {
        try {
          const res = await withTimeout(fetch(req), NAV_TIMEOUT_MS);
          // Only cache real pages (not the login redirect target of a signed-out user).
          if (res.ok && !res.redirected && !url.pathname.startsWith("/login")) c.put(req, res.clone());
          return res;
        } catch {
          const hit = await c.match(req, { ignoreSearch: true });
          return hit ?? (await c.match("/")) ?? Response.error();
        }
      }),
    );
  }
});
