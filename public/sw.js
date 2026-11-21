// Shell-only service worker. It keeps the app's own files (pages, styles, scripts, icons) so the console opens fast and can be installed.
// It NEVER keeps: anything under /auth/, anything from another address (the games), any non-GET request, anything with a cookie-bearing or personal answer.
// Kill switch: if /sw-config.json says {"enabled": false} this worker removes its caches and unregisters itself (also used when this file is retired).
// 0.3.1: it keeps pages ONLY while the visitor's cookie answer is "Also remember your choices" (cg_consent=v1.prefs). After a decline it stops writing at once, even while an
// already-open page is still controlled by it: it re-reads the answer before every write, and it obeys the page's "stop" message (which also clears its cache). Where the browser
// cannot show a worker the cookie (no cookieStore), it writes only after the page has said "go", and never after "stop"; when it restarts it starts from "no".
const CACHE = "console-shell-v1";
const SHELL = ["/", "/index.html", "/core/tokens.css", "/core/boot.js", "/manifest.webmanifest"];
const COOKIE = "cg_consent", PREFS = "v1.prefs";
let stopped = false, granted = false;

/** may this worker keep a page right now? `starting`: the install step, which only runs because a page asked for the worker after the answer */
async function mayKeep(starting) {
  if (stopped) return false;
  try { if (self.navigator && (self.navigator.globalPrivacyControl === true || self.navigator.doNotTrack === "1")) return false; } catch { /* no signal to read */ } // a privacy signal always means no
  try { if (self.cookieStore && self.cookieStore.get) { const c = await self.cookieStore.get(COOKIE); return !!c && c.value === PREFS; } } catch { /* fall through: the page's messages decide */ }
  return starting === true || granted;
}
const dropCaches = async () => { for (const k of await caches.keys()) if (k.startsWith("console-shell-")) await caches.delete(k); };

self.addEventListener("install", (e) => { e.waitUntil((async () => { if (await mayKeep(true)) await (await caches.open(CACHE)).addAll(SHELL); await self.skipWaiting(); })()); });

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    if (!(await mayKeep(true))) { await dropCaches(); await self.registration.unregister(); return; } // no "remember" answer: this worker has no reason to exist
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    try { const r = await fetch("/sw-config.json", { cache: "no-store" }); const j = await r.json(); if (j && j.enabled === false) { await caches.delete(CACHE); await self.registration.unregister(); return; } } catch { /* offline: keep working */ }
    await self.clients.claim();
  })());
});

const cacheable = (url) => url.origin === self.location.origin && !url.pathname.startsWith("/auth/") && !url.pathname.startsWith("/api/") && url.pathname !== "/signin.html" && url.pathname !== "/version.json" && url.pathname !== "/sw-config.json" && url.pathname !== "/sw.js" && !/^\/(pay|stats|report)\//.test(url.pathname); // the pay step, the statistics and the reports answer with the moment's own facts (a quote, an amount due, "paid"): never kept, never shown late

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || !cacheable(url) || stopped) return; // the browser handles it as if there were no worker
  e.respondWith((async () => {
    const keep = await mayKeep(false);
    if (!keep) return fetch(req); // declined (or stopped): the page is served straight from the network and nothing is written
    const hit = await caches.match(req);
    const net = fetch(req).then(async (res) => { if (res.ok && res.type === "basic" && (await mayKeep(false))) (await caches.open(CACHE)).put(req, res.clone()); return res; });
    return hit ? (net.catch(() => {}), hit) : net;
  })());
});

self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") self.skipWaiting();
  else if (e.data === "go") { granted = true; } // the page says the answer allows it (browsers that cannot show the cookie to a worker)
  else if (e.data === "stop") e.waitUntil((async () => { stopped = true; granted = false; await dropCaches(); try { e.source && e.source.postMessage("stopped"); } catch { /* the page is gone */ } })());
});
