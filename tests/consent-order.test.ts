// FALSIFIED BY: consent3-boot-registers-worker, consent3-worker-before-answer, consent3-worker-after-decline, consent3-old-cache-kept, consent3-signal-ignored, consent3-answer-silent, consent3-page-without-banner
// Cookie consent ORDER (0.3.0): nothing that is not needed exists on the device before the visitor answers. That includes the offline worker and its cached files.
// Decline is one tap and removes what an earlier visit left; the worker comes only after "Also remember your choices"; Global Privacy Control and Do Not Track always mean decline.
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { build } from "../build.mjs";

const root = join(import.meta.dir, "..");
const src = (p: string) => readFileSync(join(root, p), "utf8");
const C = await import("../public/core/consent.js");
const O = await import("../public/core/offline.js");

/** a page with a fake browser around it: a worker registry and a cache store that remember every call, in order */
function browser(over: { cookie?: string; nav?: any; regs?: number; caches?: string[] } = {}) {
  const win: any = new Window({ url: "https://console.corporatetambola.com/" });
  Object.assign(globalThis, { window: win, document: win.document, CustomEvent: win.CustomEvent });
  if (over.cookie) win.document.cookie = over.cookie;
  const log: string[] = [], regs = Array.from({ length: over.regs ?? 0 }, (_, i) => ({ unregister: async () => { log.push("unregister#" + i); return true; } }));
  const cacheNames = [...(over.caches || [])];
  const nav: any = { ...(over.nav || {}), serviceWorker: { controller: null, getRegistrations: async () => regs, register: async (u: string) => { log.push("register " + u + " | cookie=" + win.document.cookie); return { addEventListener() {}, waiting: null }; } } };
  const store = { keys: async () => [...cacheNames], delete: async (k: string) => { log.push("delete " + k); cacheNames.splice(cacheNames.indexOf(k), 1); return true; } };
  const opts = { doc: win.document, win, nav, store: win.localStorage };
  /** the same wiring as boot.js: the worker follows the answer */
  const wire = () => { const run = () => O.syncOffline({ nav, caches: store, state: C.currentState(opts) }); win.addEventListener("cg-consent-changed", run); return run; };
  return { win, doc: win.document, nav, store, log, regs, cacheNames, opts, wire };
}
const tick = () => new Promise((r) => setTimeout(r, 15));

test("before any answer: no worker is registered, nothing is stored, and a worker or cache left by an earlier visit is removed", async () => {
  const b = browser({ regs: 2, caches: ["console-shell-v1", "something-else"] });
  C.startConsent(b.opts);
  const run = b.wire();
  const r = await run();
  expect(r.registered).toBe(false);
  expect(b.log.filter((l) => l.startsWith("register"))).toEqual([]);
  expect(b.log.filter((l) => l.startsWith("unregister")).length).toBe(2);
  expect(b.cacheNames).toEqual(["something-else"]); // only the console's own cache is touched
  expect(b.doc.cookie).toBe("");
  expect(b.win.localStorage.length).toBe(0);
  expect(b.doc.getElementById("cookie-banner")).toBeTruthy();
});

test("the banner's decline-all is one tap and no worker follows; the choice is written first", async () => {
  const b = browser({ regs: 1, caches: ["console-shell-v1"] }); const api: any = C.startConsent(b.opts); b.wire();
  b.doc.getElementById("cookie-needed").click(); await tick();
  expect(b.log.some((l) => l.startsWith("register"))).toBe(false);
  expect(b.log).toContain("unregister#0");
  expect(b.cacheNames).toEqual([]);
  expect(C.readAnswer(b.doc.cookie)).toBe("needed");
  expect(b.win.localStorage.length).toBe(0);
  expect(api.isOpen()).toBe(false);
});

test("the worker is registered only after 'Also remember your choices', and only after the answer is on the device", async () => {
  const b = browser(); C.startConsent(b.opts); b.wire();
  expect(b.log).toEqual([]); // the page is up, the banner is showing: still nothing
  b.doc.getElementById("cookie-prefs").click(); await tick();
  const reg = b.log.filter((l) => l.startsWith("register"));
  expect(reg.length).toBe(1);
  expect(reg[0]).toContain("register /sw.js");
  expect(reg[0]).toContain("cg_consent=v1.prefs"); // the answer was written before the worker was asked for
});

test("changing the answer later with the footer's Cookie choices: 'Only what is needed' removes the worker and its cache again", async () => {
  const b = browser({ cookie: C.answerCookie("prefs", true), regs: 1, caches: ["console-shell-v1"] }); C.startConsent(b.opts); b.wire();
  await O.syncOffline({ nav: b.nav, caches: b.store, state: C.currentState(b.opts) });
  expect(b.log.filter((l) => l.startsWith("register")).length).toBe(1); // answered "prefs" earlier: the worker is allowed
  b.log.length = 0;
  C.openChoices(b.win); await tick();
  expect(b.doc.getElementById("cookie-banner")).toBeTruthy();
  b.doc.getElementById("cookie-needed").click(); await tick();
  expect(b.log).toContain("unregister#0");
  expect(b.log).toContain("delete console-shell-v1");
});

test("Global Privacy Control and Do Not Track always mean decline: even with an old 'prefs' cookie no worker is registered and old ones are removed", async () => {
  for (const nav of [{ globalPrivacyControl: true }, { doNotTrack: "1" }]) {
    const b = browser({ cookie: C.answerCookie("prefs", true), nav, regs: 1, caches: ["console-shell-v1"] });
    C.startConsent(b.opts);
    const r = await O.syncOffline({ nav: b.nav, caches: b.store, state: C.currentState(b.opts) });
    expect([JSON.stringify(nav), r.registered]).toEqual([JSON.stringify(nav), false]);
    expect(b.log.some((l) => l.startsWith("register"))).toBe(false);
    expect(b.cacheNames).toEqual([]);
    expect(b.doc.getElementById("cookie-banner")).toBeNull(); // no banner is needed: the browser has already said no
  }
});

test("the console app (boot.js) never registers a worker by itself: it only follows the answer, and only after the banner is started", () => {
  const boot = src("public/core/boot.js");
  expect(boot).not.toMatch(/serviceWorker\.register|\.register\(/); // the one place that registers is offline.js, behind the answer
  expect(boot).toContain('addEventListener("cg-consent-changed"');
  expect(boot.indexOf("startConsent();")).toBeLessThan(boot.indexOf("syncOffline("));
  const off = src("public/core/offline.js");
  expect(off).toMatch(/offlineAllowed/);
  expect(src("public/core/consent.js")).toContain('"cg-consent-changed"'); // a click announces itself
  expect(src("public/sw.js")).toContain(`const CACHE = "${O.CACHE_PREFIX}`); // the clean-up looks for the very cache the worker makes
});

test("every built page starts the cookie banner (or the app that starts it): no page has a footer 'Cookie choices' that opens nothing", () => {
  const out = mkdtempSync(join(tmpdir(), "consent-"));
  build({ env: "live", out, version: "0.0.1", commit: "0123456789ab", releasedAt: "2026-11-21T00:00:00.000Z" });
  const pages: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!/^(core|screens|icons|view-)/.test(f)) walk(p); } else if (f.endsWith(".html")) pages.push(p); } };
  walk(out);
  expect(pages.length).toBeGreaterThanOrEqual(7);
  for (const p of pages) { const h = readFileSync(p, "utf8"); expect([p.slice(out.length), /core\/page-consent\.js|core\/boot\.js/.test(h)]).toEqual([p.slice(out.length), true]); }
});

test("the words are plain and warm: 'you', no 'we/our/us', no blunt 'do not', both answers named, and what each one means", () => {
  const all = Object.values(C.WORDS).filter((v: any) => typeof v === "string") as string[];
  for (const t of all) { expect([t, /\b(we|our|us)\b/i.test(t)]).toEqual([t, false]); expect([t, /\bdo not\b|\bdon't\b|\bdoes not\b/i.test(t) && /^We do not/.test(t)]).toEqual([t, false]); }
  expect(C.WORDS.intro).toMatch(/\byou\b/i);
  expect(C.WORDS.needed).toBe("Only what is needed");
  expect(C.WORDS.morePrefs).toMatch(/saved copy of the console's pages/); // the worker is named, so the second answer is honest about it
  expect(C.WORDS.moreNeeded).toMatch(/removed from this device/);
});
