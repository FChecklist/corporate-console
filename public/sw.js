// Shell-only service worker. It keeps the app's own files (pages, styles, scripts, icons) so the console opens fast and can be installed.
// It NEVER keeps: anything under /auth/, anything from another address (the games), any non-GET request, anything with a cookie-bearing or personal answer.
// Kill switch: if /sw-config.json says {"enabled": false} this worker removes its caches and unregisters itself (also used when this file is retired).
// 0.3.1: it keeps pages ONLY while the visitor's cookie answer is "Also remember your choices" (cg_consent=v1.prefs). After a decline it stops writing at once, even while an
// already-open page is still controlled by it: it re-reads the answer before every write, and it obeys the page's "stop" message (which also clears its cache). Where the browser
// cannot show a worker the cookie (no cookieStore: Firefox, older Safari), it writes only after the page has said "go", and never after "stop". 0.3.2: the page's "go" is remembered across worker restarts
// by a marker cache (console-shell-grant, removed together with the other console caches by a decline), so a restarted worker keeps serving the saved pages; and the install step copies nothing there until "go".
const CACHE = "console-shell-v1", GRANT = "console-shell-grant";
const SHELL = ["/", "/index.html", "/core/tokens.css", "/core/boot.js", "/manifest.webmanifest"];
const COOKIE = "cg_consent", PREFS = "v1.prefs";
let stopped = false, granted = false;

/** the cookie answer as far as this worker can see it: "yes", "no", or "unknown" (the browser cannot show a worker the cookie: the page's messages decide) */
async function answer() {
  if (stopped) return "no";
  try { if (self.navigator && (self.navigator.globalPrivacyControl === true || self.navigator.doNotTrack === "1")) return "no"; } catch { /* no signal to read */ } // a privacy signal always means no
  try { if (self.cookieStore && self.cookieStore.get) { const c = await self.cookieStore.get(COOKIE); return c && c.value === PREFS ? "yes" : "no"; } } catch { /* fall through: the page's messages decide */ }
  return "unknown";
}
/** where the cookie cannot be read: did the page say "go" (now, or before this worker was restarted)? The marker cache is removed by every decline, like the other console caches. */
const hasGrant = async () => granted || (await caches.keys()).includes(GRANT);
/** may this worker keep a page right now? */
async function mayKeep() { const a = await answer(); return a === "unknown" ? await hasGrant() : a === "yes"; }
const dropCaches = async () => { for (const k of await caches.keys()) if (k.startsWith("console-shell-")) await caches.delete(k); };
const keepShell = async () => { await (await caches.open(CACHE)).addAll(SHELL); };

self.addEventListener("install", (e) => { e.waitUntil((async () => { if (await mayKeep()) await keepShell(); await self.skipWaiting(); })()); });

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    if ((await answer()) === "no") { await dropCaches(); await self.registration.unregister(); return; } // a "no" answer: this worker has no reason to exist ("unknown" waits for the page's "go")
    for (const k of await caches.keys()) if (k !== CACHE && k !== GRANT) await caches.delete(k);
    try { const r = await fetch("/sw-config.json", { cache: "no-store" }); const j = await r.json(); if (j && j.enabled === false) { await dropCaches(); await self.registration.unregister(); return; } } catch { /* offline: keep working */ }
    await self.clients.claim();
  })());
});

const cacheable = (url) => url.origin === self.location.origin && !url.pathname.startsWith("/auth/") && !url.pathname.startsWith("/api/") && url.pathname !== "/signin.html" && url.pathname !== "/signin" && !url.searchParams.has("t") && url.pathname !== "/version.json" && url.pathname !== "/sw-config.json" && url.pathname !== "/sw.js" && !/^\/(pay|stats|report)\//.test(url.pathname); // the pay step, the statistics and the reports answer with the moment's own facts (a quote, an amount due, "paid"): never kept, never shown late

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || !cacheable(url) || stopped) return; // the browser handles it as if there were no worker
  e.respondWith((async () => {
    const keep = await mayKeep();
    if (!keep) return fetch(req); // declined (or stopped): the page is served straight from the network and nothing is written
    const hit = await caches.match(req);
    const net = fetch(req).then(async (res) => { if (res.ok && res.type === "basic" && (await mayKeep())) (await caches.open(CACHE)).put(req, res.clone()); return res; });
    return hit ? (net.catch(() => {}), hit) : net;
  })());
});

self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") self.skipWaiting();
  else if (e.data === "go") e.waitUntil((async () => { // the page says the answer allows it. Only used where the browser cannot show a worker the cookie; elsewhere the cookie decides. Remembered, so a restart does not forget it.
    if ((await answer()) !== "unknown") return;
    granted = true;
    try { const had = (await caches.keys()).includes(GRANT); await caches.open(GRANT); if (!had) await keepShell(); } catch { /* offline: the pages are kept as they are visited */ }
    if (stopped) { granted = false; await dropCaches(); } // a "stop" that came in while this was running wins: nothing stays behind
  })());
  else if (e.data === "stop") e.waitUntil((async () => { stopped = true; granted = false; await dropCaches(); try { e.source && e.source.postMessage("stopped"); } catch { /* the page is gone */ } })());
});

// 0.5.0: the two handlers of the notify service (corporate-push client/sw-push-snippet.js, pinned in docs/KNOWLEDGE.md), pasted unchanged. They touch no caching and no fetch code above.
// A push can only arrive for a browser that tapped "Yes, notify me when my game begins" and allowed the browser prompt, and that worker exists only after "Also remember your choices" (a decline removes it, see public/core/push-end.js).
// Links in a notification may open on this site, or on these exact company hosts (the same list the service
// accepts). Anything else opens '/'. Add a host here only when it is also in ALLOWED_ORIGINS_EXTRA on the service.
var CP_ALLOWED_HOSTS = ['home', 'console', 'housie', 'luck', 'bingo'].map(function (s) { return s + '.corporatetambola.com'; });

self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  // A browser requires every push to show a notification, so there is always a safe fallback text.
  var title = typeof data.title === 'string' && data.title ? data.title.slice(0, 80) : 'Corporate Tambola';
  var body = typeof data.body === 'string' ? data.body.slice(0, 200) : 'Open the app to see what is new.';
  var options = {
    body: body,
    tag: typeof data.tag === 'string' ? data.tag.slice(0, 100) : undefined,
    data: { url: typeof data.url === 'string' ? data.url : '/' },
    // Optional: icon: '/icons/icon-192.png', badge: '/icons/badge-72.png',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = self.location.origin + '/';
  try {
    var u = new URL(event.notification.data && event.notification.data.url, self.location.origin);
    var sameSite = u.origin === self.location.origin;
    var company = u.protocol === 'https:' && u.port === '' && CP_ALLOWED_HOSTS.indexOf(u.hostname) !== -1;
    if (sameSite || company) target = u.href;
  } catch (e) {}
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url === target && 'focus' in list[i]) return list[i].focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
