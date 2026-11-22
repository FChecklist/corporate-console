// FALSIFIED BY: consent31-worker-ignores-cookie, consent31-stop-ignored, consent31-old-worker-not-freed, consent31-no-stop-message, consent31-page-no-follow, consent31-install-keeps-after-decline, worker32-no-grant-marker, worker32-install-copies-unknown, worker32-token-cached, worker32-go-after-stop, signin32-reload-on-token-page
// Declining must END the offline worker's writing, on EVERY page (0.3.1). Two audit findings on 0.3.0:
//  M1: after "Only what is needed" the old worker, still holding the open page, put files back into the cache.
//  M2: declining on the sign-in link page, the payee page, the owner page or the 404 page left the worker and the cache in place (only the console app listened).
// The worker (public/sw.js) is run here for real, in a small fake of a worker's world, and the page side (offline.js, page-consent.js) in a fake browser.
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const SW = readFileSync(join(root, "public/sw.js"), "utf8");
const tick = (ms = 15) => new Promise((r) => setTimeout(r, ms));

/** runs public/sw.js exactly as written, with a fake `self`, a fake cache store and a fake network; returns handles to fire its events */
function worker(o: { cookie?: string | null; cookieStore?: boolean; gpc?: boolean; cached?: string[]; store?: Map<string, Map<string, number>> } = {}) {
  const handlers: Record<string, (e: any) => void> = {};
  const store = o.store || new Map<string, Map<string, number>>(); // `store`: the same browser cache storage, kept when a worker is stopped and started again
  for (const k of o.cached || []) store.set(k, new Map([["/", 1]]));
  const writes: string[] = [];
  let unregistered = 0, cookie = o.cookie === undefined ? null : o.cookie;
  const fakeCaches = {
    open: async (n: string) => { if (!store.has(n)) store.set(n, new Map()); const m = store.get(n)!; return { addAll: async (l: string[]) => { l.forEach((u) => { m.set("https://console.test" + u, 1); writes.push("addAll " + u); }); }, put: async (r: any) => { m.set(r.url, 1); writes.push("put " + r.url); } }; },
    keys: async () => [...store.keys()], delete: async (n: string) => store.delete(n),
    match: async (r: any) => { for (const [k, m] of store) if (k.startsWith("console-shell-") && m.has(r.url) && m.get(r.url) === 1) return { fromCache: true, url: r.url }; return undefined; },
  };
  const self: any = {
    addEventListener: (t: string, f: any) => { handlers[t] = f; }, location: { origin: "https://console.test" }, skipWaiting() {}, clients: { claim: async () => {} },
    registration: { unregister: async () => { unregistered++; return true; } }, navigator: { globalPrivacyControl: o.gpc ? true : undefined },
    ...(o.cookieStore === false ? {} : { cookieStore: { get: async () => (cookie ? { name: "cg_consent", value: cookie } : null) } }),
  };
  const net = async (req: any) => ({ ok: true, type: "basic", url: req.url, clone() { return this; } });
  new Function("self", "caches", "fetch", "URL", SW)(self, fakeCaches, net, URL);
  return {
    store, writes, setCookie: (v: string | null) => { cookie = v; }, unregistered: () => unregistered,
    async get(path: string) { let p: any, r: any; handlers.fetch({ request: { method: "GET", url: "https://console.test" + path }, respondWith: (x: any) => { p = x; } }); if (p) r = await p; await tick(2); return r; },
    async fire(type: string, e: any = {}) { let p: any; handlers[type]({ ...e, waitUntil: (x: any) => { p = x; } }); if (p) await p; },
    cacheFiles: () => [...store.entries()].filter(([k]) => k.startsWith("console-shell-")).reduce((n, [, m]) => n + m.size, 0),
  };
}

test("M1: after a decline a worker that is still running writes NOTHING, even for the page it still holds", async () => {
  const w = worker({ cookie: "v1.prefs" });
  await w.get("/core/app.css");
  expect(w.cacheFiles()).toBe(1); // the answer allows it: pages are kept (so this test can tell the two cases apart)
  w.setCookie("v1.needed"); // the person declines; the old worker is still alive
  w.store.clear();
  for (const p of ["/core/app.css", "/games/", "/changes", "/core/steps.js", "/screens/home.js"]) await w.get(p);
  expect(w.cacheFiles()).toBe(0);
  expect(w.writes.filter((x) => x.startsWith("put")).length).toBe(1); // only the one from before the decline
});

test("M1: the page's 'stop' message ends the writing at once, clears the cache and is answered; it holds even if the cookie still looks like 'yes'", async () => {
  const w = worker({ cookie: "v1.prefs", cached: ["console-shell-v1", "other-cache"] });
  const said: string[] = [];
  await w.fire("message", { data: "stop", source: { postMessage: (m: string) => said.push(m) } });
  expect(said).toEqual(["stopped"]);
  expect(w.store.has("console-shell-v1")).toBe(false);
  expect(w.store.has("other-cache")).toBe(true); // only the console's own cache is touched
  await w.get("/core/app.css"); await w.get("/changes");
  expect(w.cacheFiles()).toBe(0);
});

test("a browser that cannot show the cookie to a worker: nothing is written until the page says 'go', and never after 'stop'", async () => {
  const w = worker({ cookieStore: false });
  await w.get("/core/app.css");
  expect(w.cacheFiles()).toBe(0); // no word from the page yet: the safe answer is no
  await w.fire("message", { data: "go" });
  await w.get("/core/app.css");
  expect(w.cacheFiles()).toBe(6); // the shell that `go` copies (5 files, 0.3.2) and the page just kept
  await w.fire("message", { data: "stop", source: { postMessage() {} } });
  await w.get("/changes");
  expect(w.cacheFiles()).toBe(0);
});

// ---- 0.3.2 (audit finding M1 of 0.3.1): browsers without cookieStore (Firefox, older Safari) ------------------------------------------------------------------------------
test("M1 (0.3.2): without cookieStore a RESTARTED worker still serves the saved pages (the page's 'go' is remembered, not lost with the worker's memory)", async () => {
  const first = worker({ cookieStore: false });
  await first.fire("message", { data: "go" });
  await first.get("/core/app.css");
  expect(first.cacheFiles()).toBe(6);
  const again = worker({ cookieStore: false, store: first.store }); // the browser stopped the worker and started it again: its variables are new, the browser's cache storage is the same
  const hit = await again.get("/core/app.css");
  expect(hit && hit.fromCache).toBe(true); // served from the saved copy (works offline)
  const shell = await again.get("/index.html");
  expect(shell && shell.fromCache).toBe(true);
});

test("M1 (0.3.2): without cookieStore the install step copies nothing and the worker stays until the page says 'go' (no files for a person who has not said yes)", async () => {
  const w = worker({ cookieStore: false });
  await w.fire("install");
  expect(w.writes.length).toBe(0);
  await w.fire("activate");
  expect(w.unregistered()).toBe(0); // it cannot read the answer, so it waits for the page (it is not removed)
  expect(w.cacheFiles()).toBe(0);
  await w.fire("message", { data: "go" });
  expect(w.writes.filter((x) => x.startsWith("addAll")).length).toBe(5);
  // with cookieStore the cookie decides and a 'go' changes nothing
  const c = worker({ cookie: "v1.needed" });
  await c.fire("message", { data: "go" });
  expect(c.writes.length).toBe(0);
  expect(c.store.has("console-shell-grant")).toBe(false);
});

test("M1 (0.3.2): a decline ends it for good without cookieStore: 'stop' removes the remembered 'go' with the cache, and a worker restarted afterwards serves and writes nothing", async () => {
  const w = worker({ cookieStore: false });
  await w.fire("message", { data: "go" });
  await w.get("/core/app.css");
  await w.fire("message", { data: "stop", source: { postMessage() {} } });
  expect([...w.store.keys()].filter((k) => k.startsWith("console-shell-"))).toEqual([]); // the marker too
  const again = worker({ cookieStore: false, store: w.store });
  const r = await again.get("/core/app.css");
  expect(r && r.fromCache).toBeFalsy();
  expect(again.cacheFiles()).toBe(0);
});

test("M1 (0.3.2): a 'stop' that arrives while 'go' is still working wins: nothing is left behind", async () => {
  const w = worker({ cookieStore: false });
  const go = w.fire("message", { data: "go" }); // not awaited yet
  await w.fire("message", { data: "stop", source: { postMessage() {} } });
  await go;
  expect([...w.store.keys()].filter((k) => k.startsWith("console-shell-"))).toEqual([]);
  await w.fire("message", { data: "go" }); // and it stays stopped
  expect([...w.store.keys()].filter((k) => k.startsWith("console-shell-"))).toEqual([]);
});

test("a privacy signal also wins over a remembered 'go' (without cookieStore)", async () => {
  const first = worker({ cookieStore: false });
  await first.fire("message", { data: "go" });
  const again = worker({ cookieStore: false, store: first.store, gpc: true });
  const r = await again.get("/core/app.css");
  expect(r && r.fromCache).toBeFalsy();
});

test("H1 (0.3.2): addresses that carry a one-time code are never kept, whatever the path (/signin, anything with t=); the plain pay-link page itself is still kept", async () => {
  const w = worker({ cookie: "v1.prefs" });
  for (const p of ["/signin?t=abc", "/signin", "/pay-link?t=abc", "/pay-link.html?t=abc", "/anything.js?t=abc"]) await w.get(p);
  expect(w.cacheFiles()).toBe(0);
  await w.get("/core/app.css"); await w.get("/pay-link.html");
  expect(w.cacheFiles()).toBe(2); // other files, and the page without a code in its address, are kept as before
});

test("a privacy signal (Global Privacy Control) means no writing, whatever the cookie says", async () => {
  const w = worker({ cookie: "v1.prefs", gpc: true });
  await w.get("/core/app.css");
  expect(w.cacheFiles()).toBe(0);
});

test("a worker that starts or wakes up without a 'remember' answer keeps nothing and removes itself and its cache", async () => {
  for (const cookie of [null, "v1.needed"]) {
    const w = worker({ cookie, cached: ["console-shell-v1"] });
    await w.fire("install");
    expect([cookie, w.writes.filter((x) => x.startsWith("addAll")).length]).toEqual([cookie, 0]); // the shell is not copied
    await w.fire("activate");
    expect([cookie, w.unregistered(), w.cacheFiles()]).toEqual([cookie, 1, 0]);
  }
  const yes = worker({ cookie: "v1.prefs" });
  await yes.fire("install"); await yes.fire("activate");
  expect(yes.writes.filter((x) => x.startsWith("addAll")).length).toBe(5); // with a 'remember' answer it works as before
  expect(yes.unregistered()).toBe(0);
});

test("the worker still never keeps private or other-site files (unchanged rule)", async () => {
  const w = worker({ cookie: "v1.prefs" });
  for (const p of ["/auth/me", "/pay/quote", "/stats/x", "/report/x", "/signin.html", "/version.json", "/sw-config.json", "/api/x"]) await w.get(p);
  expect(w.cacheFiles()).toBe(0);
});

// ---- the page side -------------------------------------------------------------------------------------------------------------------------------------------------------
const C = await import("../public/core/consent.js");
const O = await import("../public/core/offline.js");

/** a fake browser: a worker container that can be told things, registrations, a cache store, and a page address bar (history) */
function browser(o: { cookie?: string; controller?: "new" | "old" | "none"; caches?: string[]; page?: string } = {}) {
  const win: any = new Window({ url: "https://console.corporatetambola.com" + (o.page || "/") });
  Object.assign(globalThis, { window: win, document: win.document, CustomEvent: win.CustomEvent });
  if (o.cookie) win.document.cookie = o.cookie;
  const log: string[] = [], listeners: Array<(e: any) => void> = [];
  const mk = (name: string, answers: boolean) => ({ postMessage: (m: string) => { log.push(`${name} <- ${m}`); if (answers && m === "stop") queueMicrotask(() => listeners.slice().forEach((f) => f({ data: "stopped" }))); } });
  const controller = o.controller === "none" ? null : mk("controller", o.controller !== "old");
  const regs = [{ active: mk("active", o.controller !== "old"), unregister: async () => { log.push("unregister"); return true; } }];
  const cacheNames = [...(o.caches || ["console-shell-v1"])];
  const sw: any = { controller, getRegistrations: async () => regs, register: async (u: string) => { log.push("register " + u); return { addEventListener() {}, waiting: null, active: null }; }, addEventListener: (t: string, f: any) => { if (t === "message") listeners.push(f); }, removeEventListener: (t: string, f: any) => { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); }, startMessages() {} };
  const nav: any = { serviceWorker: sw };
  const store = { keys: async () => [...cacheNames], delete: async (k: string) => { log.push("delete " + k); cacheNames.splice(cacheNames.indexOf(k), 1); return true; } };
  return { win, doc: win.document, nav, store, log, cacheNames, opts: { doc: win.document, win, nav } };
}

test("M1 page side: a decline tells every worker 'stop' BEFORE the registration is removed, then clears the cache; a worker that answers means no reload", async () => {
  const b = browser();
  let reloads = 0;
  const r = await O.syncOffline({ nav: b.nav, caches: b.store, state: { answered: true, choice: "needed", signal: false }, reload: () => { reloads++; } });
  expect(r.registered).toBe(false);
  expect(b.log.indexOf("controller <- stop")).toBeGreaterThanOrEqual(0);
  expect(b.log).toContain("active <- stop");
  expect(b.log.indexOf("controller <- stop")).toBeLessThan(b.log.indexOf("unregister"));
  expect(b.log.indexOf("unregister")).toBeLessThan(b.log.indexOf("delete console-shell-v1"));
  expect(b.cacheNames).toEqual([]);
  expect(reloads).toBe(0);
});

test("M1 page side: a page held by an OLDER worker (one that does not answer 'stop') is loaded once more so it is free; never twice", async () => {
  const b = browser({ controller: "old" });
  let reloads = 0;
  const run = () => O.syncOffline({ nav: b.nav, caches: b.store, state: { answered: true, choice: "needed", signal: false }, reload: () => { reloads++; }, ackMs: 30 });
  const first = await run();
  expect(first.reloaded).toBe(true);
  expect(reloads).toBe(1);
  expect(b.log).toContain("unregister");
  expect(b.cacheNames).toEqual([]);
  b.cacheNames.push("console-shell-v1");
  await run(); // the mark in the page's history says it was freed already: no endless loading
  expect(reloads).toBe(1);
  expect(b.cacheNames).toEqual([]); // but the cache is still removed
});

test("M1 page side: a page that no worker holds is not reloaded", async () => {
  const b = browser({ controller: "none" });
  let reloads = 0;
  await O.syncOffline({ nav: b.nav, caches: b.store, state: { answered: false, choice: "needed", signal: false }, reload: () => { reloads++; }, ackMs: 30 });
  expect(reloads).toBe(0);
  expect(b.cacheNames).toEqual([]);
});

test("M2: on a page that is NOT the console app (sign-in link page, payee page, owner page, 404) a decline removes the worker and the cache", async () => {
  for (const page of ["/pay-link.html", "/signin.html", "/owner-funnel/", "/404.html"]) {
    const b = browser({ cookie: C.answerCookie("prefs", true), page });
    Object.defineProperty(globalThis, "navigator", { value: b.nav, configurable: true, writable: true });
    Object.assign(globalThis, { caches: b.store });
    await import("../public/core/page-consent.js?page=" + encodeURIComponent(page)); // what every one of those pages loads
    await tick();
    expect([page, b.log.some((l) => l.startsWith("register"))]).toEqual([page, true]); // answered 'remember' earlier: the worker is as before
    b.log.length = 0; b.cacheNames.splice(0, 9, "console-shell-v1");
    C.openChoices(b.win); await tick();
    b.doc.getElementById("cookie-needed").click(); await tick(60);
    expect([page, b.log.includes("unregister"), b.log.includes("delete console-shell-v1"), b.cacheNames.length]).toEqual([page, true, true, 0]);
    expect([page, b.log.includes("controller <- stop")]).toEqual([page, true]); // and the worker that holds the open page is told
  }
});

test("M2: on those pages leftovers from an earlier visit go at once, with no answer given (no worker before the answer)", async () => {
  const b = browser({ page: "/pay-link.html" });
  Object.defineProperty(globalThis, "navigator", { value: b.nav, configurable: true, writable: true });
  Object.assign(globalThis, { caches: b.store });
  await import("../public/core/page-consent.js?page=" + "leftovers");
  await tick(60);
  expect(b.log.some((l) => l.startsWith("register"))).toBe(false);
  expect(b.log).toContain("unregister");
  expect(b.cacheNames).toEqual([]);
});

test("every page that has the footer's 'Cookie choices' follows the answer: page-consent.js listens to it, and the files that make the clean-up are all served", () => {
  const pc = readFileSync(join(root, "public/core/page-consent.js"), "utf8");
  expect(pc).toContain('addEventListener("cg-consent-changed"');
  expect(pc).toContain("syncOffline");
  expect(readFileSync(join(root, "public/core/boot.js"), "utf8")).toContain('addEventListener("cg-consent-changed"');
});

test("H1 (0.3.2): a page that holds a one-time code or typed input is NEVER reloaded by the clean-up, even when an older worker holds it; the worker and the cache still go", async () => {
  for (const page of ["/signin.html?t=0123456789abcdef", "/signin?t=x", "/pay-link.html", "/pay/abcdefghijklmnopqrst", "/owner-funnel/", "/anything?t=1"]) {
    const b = browser({ controller: "old", page });
    let reloads = 0;
    const r = await O.syncOffline({ nav: b.nav, caches: b.store, state: { answered: false, choice: "needed", signal: false }, reload: () => { reloads++; }, ackMs: 20 });
    expect([page, reloads, r.reloaded]).toEqual([page, 0, false]);
    expect([page, b.log.includes("unregister"), b.cacheNames.length]).toEqual([page, true, 0]);
  }
  const normal = browser({ controller: "old", page: "/" }); // the console app itself holds nothing that cannot be asked again: freed once, as in 0.3.1
  let reloads = 0;
  await O.syncOffline({ nav: normal.nav, caches: normal.store, state: { answered: false, choice: "needed", signal: false }, reload: () => { reloads++; }, ackMs: 20 });
  expect(reloads).toBe(1);
});

test("H1 (0.3.2): the real page-consent.js on the sign-in link page, held by an older worker that cannot be told, does not reload it", async () => {
  const b = browser({ page: "/signin.html?t=0123456789abcdef", controller: "old" });
  Object.defineProperty(globalThis, "navigator", { value: b.nav, configurable: true, writable: true });
  Object.assign(globalThis, { caches: b.store });
  let reloaded = 0;
  Object.defineProperty(b.win.location, "reload", { value: () => { reloaded++; }, configurable: true });
  await import("../public/core/page-consent.js?page=signin-token");
  await tick(500); // longer than the wait for the worker's answer (400 ms)
  expect(reloaded).toBe(0);
  expect(b.log).toContain("unregister"); // the clean-up itself still ran
  expect(b.cacheNames).toEqual([]);
});
