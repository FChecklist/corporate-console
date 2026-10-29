// Shell-only service worker. It keeps the app's own files (pages, styles, scripts, icons) so the console opens fast and can be installed.
// It NEVER keeps: anything under /auth/, anything from another address (the games), any non-GET request, anything with a cookie-bearing or personal answer.
// Kill switch: if /sw-config.json says {"enabled": false} this worker removes its caches and unregisters itself (also used when this file is retired).
const CACHE = "console-shell-v1";
const SHELL = ["/", "/index.html", "/core/tokens.css", "/core/boot.js", "/manifest.webmanifest"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    try { const r = await fetch("/sw-config.json", { cache: "no-store" }); const j = await r.json(); if (j && j.enabled === false) { await caches.delete(CACHE); await self.registration.unregister(); return; } } catch { /* offline: keep working */ }
    await self.clients.claim();
  })());
});

const cacheable = (url) => url.origin === self.location.origin && !url.pathname.startsWith("/auth/") && !url.pathname.startsWith("/api/") && url.pathname !== "/signin.html" && url.pathname !== "/version.json" && url.pathname !== "/sw-config.json" && url.pathname !== "/sw.js";

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || !cacheable(url)) return; // the browser handles it as if there were no worker
  e.respondWith((async () => {
    const hit = await caches.match(req);
    const net = fetch(req).then(async (res) => { if (res.ok && res.type === "basic") (await caches.open(CACHE)).put(req, res.clone()); return res; });
    return hit ? (net.catch(() => {}), hit) : net;
  })());
});

self.addEventListener("message", (e) => { if (e.data === "skip-waiting") self.skipWaiting(); });
