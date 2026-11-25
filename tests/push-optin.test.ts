// FALSIFIED BY: push50-client-js-edited, push50-client-css-edited, push50-config-not-empty, push50-block-without-address, push50-block-before-answer, push50-block-after-decline, push50-worker-no-push, push50-worker-no-click, push50-send-call, push50-decline-keeps-subscription, push50-decline-keeps-notes, push50-decline-not-wired, push50-csp-always-open, push50-csp-missing, push50-privacy-missing
// The "Yes, notify me when my game begins" block in the console (0.5.0), shipped DARK. The notify service's own client file (public/push-optin.js, .css) is run here for real in a fake browser;
// the console's worker (public/sw.js) is run for real in a fake worker; the cookie rules of 0.3.0 to 0.3.2 must hold: nothing loads or is kept before the answer, and a decline leaves no push worker.
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync, readdirSync, statSync, mkdtempSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { build, pushApiOf, gamesConfigJs, headersFile, lintHeaders } from "../build.mjs";

const root = join(import.meta.dir, "..");
const src = (p: string) => readFileSync(join(root, p), "utf8");
const tick = (ms = 15) => new Promise((r) => setTimeout(r, ms));
const C = await import("../public/core/consent.js");
const O = await import("../public/core/offline.js");
const B = await import("../public/core/push-block.js");
const E = await import("../public/core/push-end.js");
const API = "https://push.example.com";
const PREFS = "cg_consent=v1.prefs", NEEDED = "cg_consent=v1.needed";

const blobSha = (p: string) => { const b = readFileSync(join(root, p)); return createHash("sha1").update("blob " + b.length + String.fromCharCode(0)).update(b).digest("hex"); };

/** a console page in a fake browser. `cookie`: the cookie answer already on the device. Scripts and styles are never fetched. */
function page(o: { cookie?: string; gpc?: boolean } = {}) {
  const win: any = new Window({ url: "https://console.corporatetambola.com/", settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  Object.assign(globalThis, { window: win, document: win.document, CustomEvent: win.CustomEvent });
  if (o.cookie) win.document.cookie = o.cookie;
  const nav: any = { userAgent: "Mozilla/5.0 Chrome/130", platform: "Win32", maxTouchPoints: 0, globalPrivacyControl: o.gpc ? true : undefined };
  const opts = { doc: win.document, win, nav, store: win.localStorage };
  return { win, doc: win.document, nav, opts, state: () => C.currentState(opts) };
}

/** a slot as the Home screen builds it, put on the page, then brought in line with the answer */
function withSlot(p: ReturnType<typeof page>, api = API) {
  const slot = B.pushSection({ pushApi: api }, p.doc);
  if (slot) p.doc.body.append(slot);
  return slot;
}

/** runs the REAL public/push-optin.js on the page with a fake browser around it; returns what it did */
function runClient(p: ReturnType<typeof page>, o: { permission?: string; answer?: string } = {}) {
  const calls = { permission: 0, fetch: [] as string[], register: 0, getRegistration: 0 };
  const Notification: any = { permission: o.permission || "default", requestPermission: () => { calls.permission++; return Promise.resolve(o.answer || "denied"); } };
  const sw: any = { getRegistration: async () => { calls.getRegistration++; return undefined; }, register: async () => { calls.register++; return {}; }, ready: new Promise(() => {}) };
  const nav: any = { ...p.nav, serviceWorker: sw };
  p.win.PushManager = function PushManager() {}; p.win.Notification = Notification;
  const fetchFake = async (u: string) => { calls.fetch.push(String(u)); return { ok: false, json: async () => ({}) }; };
  new Function("window", "document", "navigator", "Notification", "fetch", src("public/push-optin.js"))(p.win, p.doc, nav, Notification, fetchFake);
  return calls;
}

// ---------------------------------------------------------------- the notify service's files are copied, not edited
test("public/push-optin.js and push-optin.css are byte for byte the files of corporate-push at the pinned commit (blob ids), and the pin is written down", () => {
  expect(blobSha("public/push-optin.js")).toBe("44cdc9b9431dedf3a6530a71645ada930f6237e8");
  expect(blobSha("public/push-optin.css")).toBe("452e3d8dbeae5f9d4f707cb60aad94924e8a9840");
  const k = src("docs/KNOWLEDGE.md");
  expect(k).toContain("f1e93f59f45444711edbb66e632fe1333bf8f9cb");
  expect(k).toContain("44cdc9b9431dedf3a6530a71645ada930f6237e8");
});

// ---------------------------------------------------------------- dark by default: one empty config value
test("config/games.json has ONE notify value, pushApi, and it is empty: a build ships the block dark (PUSH_API is empty, the page policy has no new address)", () => {
  const cfg = JSON.parse(src("config/games.json"));
  expect(cfg.pushApi).toBe("");
  expect(gamesConfigJs(cfg, "live")).toContain('export const PUSH_API = "";');
  expect(headersFile(cfg, "live")).not.toContain("push.");
});

test("only a bare https address counts: http, a path, a query, a bare word, a wildcard and the empty value all give nothing", () => {
  expect(pushApiOf("https://Push.Example.com/")).toBe(API);
  expect(pushApiOf("https://push.example.com:8443")).toBe("https://push.example.com:8443");
  for (const bad of ["", "   ", undefined, null, "http://push.example.com", "https://push.example.com/send", "https://push.example.com?x=1", "https://localhost", "push.example.com", "https://*.example.com", "https://push.example.com@evil.example"]) expect([bad, pushApiOf(bad as any)]).toEqual([bad, ""]);
  for (const bad of ["", "http://push.example.com", "https://push.example.com/send", "https://localhost"]) expect([bad, B.validPushApi(bad)]).toEqual([bad, ""]);
  expect(B.validPushApi(API)).toBe(API);
});

test("when the value is set, the generated config carries it and the page policy lets the browser talk to that one address only (still no wildcard)", () => {
  const cfg = { ...JSON.parse(src("config/games.json")), pushApi: "https://push.example.com/" };
  expect(gamesConfigJs(cfg, "live")).toContain('export const PUSH_API = "https://push.example.com";');
  const h = headersFile(cfg, "live");
  const connect = /connect-src ([^;]*)/.exec(h)![1].split(" ");
  expect(connect).toContain(API);
  expect(connect.filter((x: string) => x.includes("push.")).length).toBe(1);
  expect(lintHeaders(h)).toEqual([]);
  const bad = headersFile({ ...cfg, pushApi: "http://push.example.com" }, "live");
  expect(bad).not.toContain("push.example.com");
});

test("a real build writes PUSH_API into core/games.config.js and ships privacy.html, push-optin.js and push-optin.css", () => {
  const out = mkdtempSync(join(tmpdir(), "push50-"));
  build({ env: "live", out, version: "9.9.9", commit: "0123456789ab", releasedAt: "2026-11-25T00:00:00.000Z" });
  expect(readFileSync(join(out, "core/games.config.js"), "utf8")).toContain('export const PUSH_API = "";');
  for (const f of ["privacy.html", "push-optin.js", "push-optin.css"]) expect([f, existsSync(join(out, f))]).toEqual([f, true]);
  expect(readFileSync(join(out, "_headers"), "utf8")).toMatch(/X-Robots-Tag: noindex/);
});

// ---------------------------------------------------------------- absent when unconfigured
test("unconfigured: the Home page gets no place for the block, no script and no stylesheet, whatever the cookie answer is", () => {
  for (const cookie of [undefined, PREFS, NEEDED]) {
    const p = page({ cookie });
    for (const api of ["", undefined as any, "http://push.example.com", "https://push.example.com/send"]) expect([cookie, api, B.pushSection({ pushApi: api }, p.doc)]).toEqual([cookie, api, null]);
    expect(B.pushSection({}, p.doc)).toBeNull();
    expect(p.doc.querySelector("[data-push-optin]")).toBeNull();
    expect(p.doc.querySelector("script[data-push-js], link[data-push-css]")).toBeNull();
    expect(p.win.localStorage.length).toBe(0);
  }
  const home = src("public/screens/home.js");
  expect(home).toContain("pushSection(ctx)"); // the one place it is put: the organizer's Home
  expect(src("public/core/boot.js")).toContain('pushApi: CONFIG.PUSH_API || ""');
});

// ---------------------------------------------------------------- consent order: nothing loads or is kept before the answer
test("configured, but before any answer: the place is there, the block is NOT: no script, no stylesheet, nothing kept on the device, no cookie written", () => {
  const p = page();
  const slot = withSlot(p)!;
  expect(slot).toBeTruthy();
  expect(slot.querySelector("[data-push-optin]")).toBeNull();
  expect(p.doc.querySelector("script[data-push-js]")).toBeNull();
  expect(p.doc.querySelector("link[data-push-css]")).toBeNull();
  expect(p.win.localStorage.length).toBe(0);
  expect(p.doc.cookie).toBe("");
});

test("after 'Only what is needed', and with a privacy signal (even with an old 'prefs' cookie): no block, no script, no stylesheet", () => {
  for (const o of [{ cookie: NEEDED }, { cookie: PREFS, gpc: true }, { gpc: true }]) {
    const p = page(o);
    const slot = withSlot(p)!;
    expect([JSON.stringify(o), slot.querySelector("[data-push-optin]")]).toEqual([JSON.stringify(o), null]);
    expect(p.doc.querySelector("script[data-push-js], link[data-push-css]")).toBeNull();
    expect(p.win.localStorage.length).toBe(0);
  }
});

test("after 'Also remember your choices' the block appears (console wording, the console's own worker, the privacy page) and the one script and one stylesheet are added; a second look adds nothing", () => {
  const p = page({ cookie: PREFS });
  const slot = withSlot(p)!;
  const block = slot.querySelector("[data-push-optin]")!;
  expect(block).toBeTruthy();
  expect(block.getAttribute("data-push-site")).toBe("console");
  expect(block.getAttribute("data-push-api")).toBe(API);
  expect(block.getAttribute("data-push-sw")).toBe("/sw.js");
  expect(block.getAttribute("data-push-privacy")).toBe("/privacy");
  expect(p.doc.querySelectorAll('script[src="/push-optin.js"]').length).toBe(1);
  expect(p.doc.querySelectorAll('link[href="/push-optin.css"]').length).toBe(1);
  B.syncPush({ doc: p.doc, state: p.state() });
  expect(slot.querySelectorAll("[data-push-optin]").length).toBe(1);
  expect(p.doc.querySelectorAll("script[data-push-js]").length).toBe(1);
});

test("the answer is followed live: the cookie banner's 'Also remember your choices' brings the block, a later 'Only what is needed' takes it away", async () => {
  const p = page();
  C.startConsent(p.opts);
  const slot = withSlot(p)!;
  expect(slot.querySelector("[data-push-optin]")).toBeNull();
  p.doc.getElementById("cookie-prefs").click(); await tick();
  expect(slot.querySelector("[data-push-optin]")).toBeTruthy();
  C.openChoices(p.win); await tick();
  p.doc.getElementById("cookie-needed").click(); await tick();
  expect(slot.querySelector("[data-push-optin]")).toBeNull();
});

// ---------------------------------------------------------------- the real client: no prompt, no request on load; Stop always visible
test("the real push-optin.js on the console block: it shows the console wording and Stop notifications (visible), and on load it opens NO permission prompt, makes NO request and registers NO worker", async () => {
  const p = page({ cookie: PREFS });
  const slot = withSlot(p)!;
  const calls = runClient(p);
  await tick(40);
  const box = slot.querySelector(".cp-optin")!;
  expect(box).toBeTruthy();
  expect(box.querySelector(".cp-optin__btn")!.textContent).toBe("Yes, notify me when my game begins");
  const stop = box.querySelector(".cp-optin__stop")!;
  expect(stop.textContent).toBe("Stop notifications");
  expect(stop.hasAttribute("hidden")).toBe(false);
  const link = box.querySelector(".cp-optin__privacy a")!;
  expect(link.getAttribute("href")).toBe("/privacy");
  expect(calls.permission).toBe(0);
  expect(calls.fetch).toEqual([]);
  expect(calls.register).toBe(0);
  expect(p.win.localStorage.length).toBe(0); // nothing is kept until a tap succeeds
});

test("only a tap on the button asks the browser; a 'no thanks' answer saves nothing and sends nothing", async () => {
  const p = page({ cookie: PREFS });
  const slot = withSlot(p)!;
  const calls = runClient(p, { answer: "denied" });
  await tick(40);
  (slot.querySelector(".cp-optin__btn") as any).click();
  await tick(40);
  expect(calls.permission).toBe(1);
  expect(calls.fetch).toEqual([]);
  expect(p.win.localStorage.length).toBe(0);
});

test("the block is mounted on the organizer's Home only: no other screen or page of the console asks for it", () => {
  const users: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(join(root, d))) { const rel = d + "/" + f; if (statSync(join(root, rel)).isDirectory()) { if (!rel.startsWith("public/games")) walk(rel); } else if (/[.](js|html)$/.test(f) && src(rel).includes("pushSection")) users.push(rel); } };
  walk("public");
  expect(users.sort()).toEqual(["public/core/push-block.js", "public/screens/home.js"]);
});

// ---------------------------------------------------------------- the worker: push handlers, caching untouched
/** public/sw.js run exactly as written in a small fake worker; returns the handlers it registered and what the notification calls did */
function worker() {
  const handlers: Record<string, (e: any) => void> = {};
  const shown: any[] = [], opened: string[] = [], focused: string[] = [];
  let windows: any[] = [];
  const self: any = {
    addEventListener: (t: string, f: any) => { handlers[t] = f; }, location: { origin: "https://console.corporatetambola.com" }, skipWaiting() {}, clients: { claim: async () => {}, matchAll: async () => windows, openWindow: async (u: string) => { opened.push(u); } },
    registration: { unregister: async () => true, showNotification: async (t: string, o: any) => { shown.push({ t, o }); } }, navigator: {},
  };
  new Function("self", "caches", "fetch", "URL", src("public/sw.js"))(self, { keys: async () => [], open: async () => ({}), delete: async () => true, match: async () => undefined }, async () => ({}), URL);
  const fire = async (type: string, e: any) => { let p: any; handlers[type]({ ...e, waitUntil: (x: any) => { p = x; } }); if (p) await p; };
  return { handlers, shown, opened, focused, setWindows: (w: any[]) => { windows = w; }, push: (data: any) => fire("push", { data: data === undefined ? null : { json: () => { if (data instanceof Error) throw data; return data; } } }), click: (url: any) => fire("notificationclick", { notification: { close() {}, data: { url } } }) };
}

test("the console's worker answers a push by showing a notification, with a safe fallback text when the message is empty or broken", async () => {
  const w = worker();
  expect(typeof w.handlers.push).toBe("function");
  await w.push({ title: "Your game is starting", body: "Tap to join now.", url: "https://housie.corporatetambola.com/g/abc", tag: "game:abc" });
  expect(w.shown[0].t).toBe("Your game is starting");
  expect(w.shown[0].o.body).toBe("Tap to join now.");
  expect(w.shown[0].o.tag).toBe("game:abc");
  await w.push(undefined);
  expect(w.shown[1].t).toBe("Corporate Tambola"); // a browser needs every push to show something
  await w.push(new Error("not json"));
  expect(w.shown.length).toBe(3);
});

test("a tap on a notification opens a page of this site or of the company's own hosts only; anything else opens the console's front page", async () => {
  const w = worker();
  expect(typeof w.handlers.notificationclick).toBe("function");
  await w.click("https://housie.corporatetambola.com/g/abc");
  await w.click("https://evil.example.com/steal");
  await w.click("/games/");
  await w.click("https://housie.corporatetambola.com:8443/x");
  expect(w.opened).toEqual(["https://housie.corporatetambola.com/g/abc", "https://console.corporatetambola.com/", "https://console.corporatetambola.com/games/", "https://console.corporatetambola.com/"]);
});

test("adding the handlers did not touch the caching code: the worker still has its own install, activate, fetch and message handlers, and the cache rules are the ones of 0.3.2", () => {
  const w = worker();
  for (const t of ["install", "activate", "fetch", "message", "push", "notificationclick"]) expect([t, typeof w.handlers[t]]).toEqual([t, "function"]);
  const s = src("public/sw.js");
  expect(s).toContain('const CACHE = "console-shell-v1", GRANT = "console-shell-grant";');
  expect(s).toContain("url.pathname !== \"/signin.html\"");
});

// ---------------------------------------------------------------- the console never sends
test("the console never sends a notification: no /send address and no admin key anywhere in the console's own code or in the notify client", () => {
  const files = ["public/core/push-block.js", "public/core/push-end.js", "public/core/boot.js", "public/screens/home.js", "public/push-optin.js", "public/sw.js", "public/core/offline.js"];
  for (const f of files) { const s = src(f); expect([f, /[/]send\b/.test(s)]).toEqual([f, false]); expect([f, /PUSH_ADMIN_KEY|Bearer /.test(s)]).toEqual([f, false]); }
  const fn: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(join(root, d))) { const rel = d + "/" + f; if (statSync(join(root, rel)).isDirectory()) walk(rel); else fn.push(rel); } };
  walk("functions");
  for (const f of fn) expect([f, /corporate-push|PUSH_API|push[.]corporate/i.test(src(f))]).toEqual([f, false]);
  expect(src("docs/KNOWLEDGE.md")).toMatch(/open question for BOSS/i);
});

// ---------------------------------------------------------------- a decline leaves no push worker, no subscription, no notes
/** a worker registration that holds a browser subscription, with a log of what happened to it, in order */
function subscribed(log: string[], endpoint = "https://fcm.googleapis.com/fcm/send/abc") {
  const sub = { endpoint, unsubscribe: async () => { log.push("browser-unsubscribe"); return true; } };
  return { pushManager: { getSubscription: async () => sub }, unregister: async () => { log.push("unregister"); return true; } };
}

test("ending the opt-in: the address is deleted at the service FIRST (the address and nothing else is sent), then the browser's subscription goes, the notes are erased, the block is taken away; other things on the device stay", async () => {
  const p = page({ cookie: PREFS });
  const slot = withSlot(p)!;
  p.win.localStorage.setItem("corporatePush.v1.console", "1");
  p.win.localStorage.setItem("corporatePush.v1pending", JSON.stringify(["https://x.example/ep"]));
  p.win.localStorage.setItem("cg-design", "laptop");
  const log: string[] = [], sent: any[] = [];
  const fetchFake = async (u: string, init: any) => { log.push("server-delete"); sent.push({ u, init }); return { ok: true }; };
  const r = await E.endPush({ regs: [subscribed(log)], o: { api: API, fetch: fetchFake, storage: p.win.localStorage, doc: p.doc } });
  expect(log).toEqual(["server-delete", "browser-unsubscribe"]);
  expect(sent[0].u).toBe(API + "/unsubscribe");
  expect(sent[0].init.method).toBe("POST");
  expect(sent[0].init.credentials).toBe("omit");
  expect(Object.keys(JSON.parse(sent[0].init.body))).toEqual(["endpoint"]);
  expect(r.subscriptions).toBe(1);
  expect(r.notes).toBe(2);
  expect(p.win.localStorage.getItem("corporatePush.v1.console")).toBeNull();
  expect(p.win.localStorage.getItem("corporatePush.v1pending")).toBeNull();
  expect(p.win.localStorage.getItem("cg-design")).toBe("laptop"); // not ours: left to the console's own clean-up
  expect(slot.querySelector("[data-push-optin]")).toBeNull();
});

test("ending the opt-in still ends it when the service cannot be reached or no address is configured: the browser subscription and the notes go, nothing is sent", async () => {
  const p = page();
  p.win.localStorage.setItem("corporatePush.v1.console", "1");
  const log: string[] = [];
  await E.endPush({ regs: [subscribed(log)], o: { api: API, fetch: async () => { throw new Error("offline"); }, storage: p.win.localStorage, doc: p.doc } });
  expect(log).toEqual(["browser-unsubscribe"]);
  expect(p.win.localStorage.length).toBe(0);
  p.win.localStorage.setItem("corporatePush.v1.console", "1");
  const sent: string[] = [];
  const log2: string[] = [];
  await E.endPush({ regs: [subscribed(log2)], o: { api: "", fetch: async (u: string) => { sent.push(u); return { ok: true }; }, storage: p.win.localStorage, doc: p.doc } });
  expect(sent).toEqual([]);
  expect(log2).toEqual(["browser-unsubscribe"]);
  expect(p.win.localStorage.length).toBe(0);
});

test("with no subscription and no notes, ending the opt-in does nothing at all (no request, nothing written)", async () => {
  const p = page();
  const sent: string[] = [];
  const r = await E.endPush({ regs: [{ unregister: async () => true }, { pushManager: { getSubscription: async () => null } }], o: { api: API, fetch: async (u: string) => { sent.push(u); return { ok: true }; }, storage: p.win.localStorage, doc: p.doc } });
  expect(r).toEqual({ subscriptions: 0, notes: 0 });
  expect(sent).toEqual([]);
  expect(p.win.localStorage.length).toBe(0);
});

test("a decline through the real clean-up: the subscription is ended BEFORE the worker registration is removed (a removed registration cannot be asked), and the console cache goes as before", async () => {
  const p = page({ cookie: PREFS });
  const log: string[] = [];
  const reg = subscribed(log);
  p.win.localStorage.setItem("corporatePush.v1.console", "1");
  const sw: any = { controller: null, getRegistrations: async () => [reg] };
  const cacheNames = ["console-shell-v1", "other"];
  const store = { keys: async () => [...cacheNames], delete: async (k: string) => { log.push("delete " + k); cacheNames.splice(cacheNames.indexOf(k), 1); return true; } };
  p.doc.cookie = C.answerCookie("needed", true);
  await O.syncOffline({ nav: { serviceWorker: sw }, caches: store, state: C.currentState(p.opts) });
  expect(log.indexOf("browser-unsubscribe")).toBeGreaterThan(-1);
  expect(log.indexOf("browser-unsubscribe")).toBeLessThan(log.indexOf("unregister"));
  expect(log).toContain("delete console-shell-v1");
  expect(cacheNames).toEqual(["other"]);
  expect(p.win.localStorage.getItem("corporatePush.v1.console")).toBeNull();
});

test("after the banner's 'Only what is needed' the whole chain holds: block gone, subscription gone, notes gone, worker gone; and nothing was registered on the way", async () => {
  const p = page({ cookie: PREFS });
  C.startConsent(p.opts);
  const slot = withSlot(p)!;
  const log: string[] = [];
  const reg = subscribed(log);
  p.win.localStorage.setItem("corporatePush.v1.console", "1");
  const sw: any = { controller: null, getRegistrations: async () => [reg], register: async () => { log.push("register"); return { addEventListener() {}, waiting: null }; } };
  const store = { keys: async () => ["console-shell-v1"], delete: async (k: string) => { log.push("delete " + k); return true; } };
  p.win.addEventListener("cg-consent-changed", () => O.syncOffline({ nav: { serviceWorker: sw }, caches: store, state: C.currentState(p.opts) }));
  expect(slot.querySelector("[data-push-optin]")).toBeTruthy();
  C.openChoices(p.win); await tick();
  p.doc.getElementById("cookie-needed").click(); await tick(60);
  expect(slot.querySelector("[data-push-optin]")).toBeNull();
  expect(log.filter((l) => l === "register")).toEqual([]);
  expect(log).toContain("browser-unsubscribe");
  expect(log).toContain("unregister");
  expect(p.win.localStorage.length).toBe(0);
});

// ---------------------------------------------------------------- the privacy page
test("the privacy page exists, is kept out of search like the other utility pages, links back to the console, and keeps the owner's wording rules", () => {
  const h = src("public/privacy.html");
  expect(h).toContain("<!--seo-->");
  expect(h).toContain("/core/page-consent.js"); // it follows the cookie answer like every page
  expect(h).toContain('href="/"');
  expect(h).toMatch(/not a name, an e-mail address or a phone number/);
  expect(/<input|type="checkbox"|I agree|[^a-z](my|mine|your|yours)[^a-z]/i.test(h.replace(/<[^>]*>/g, " "))).toBe(false);
  expect(/We do not|We don't/.test(h)).toBe(false);
  expect(headersFile(JSON.parse(src("config/games.json")), "live")).toMatch(/[/]privacy\n {2}X-Robots-Tag: noindex/);
});
