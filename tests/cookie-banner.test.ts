// FALSIFIED BY: cookie-stores-before-answer, cookie-gpc-ignored, cookie-dnt-ignored, cookie-answer-not-kept, cookie-prefs-pre-picked, cookie-needed-not-erasing
// The cookie banner (0.2.2): nothing stored before an answer, equal answers, GPC and DNT honoured, the answer remembered, a withdrawn answer erases what was kept, phone width.
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pub = (p: string) => readFileSync(join(import.meta.dir, "../public", p), "utf8");
const C = await import("../public/core/consent.js");

/** a fresh page: its own document, cookie jar and storage; globals point at it because the page helpers build elements with the global document */
function page(over: { cookie?: string; nav?: any; store?: Record<string, string> } = {}) {
  const win: any = new Window({ url: "https://console.corporatetambola.com/" });
  Object.assign(globalThis, { window: win, document: win.document, CustomEvent: win.CustomEvent });
  if (over.cookie) win.document.cookie = over.cookie;
  for (const [k, v] of Object.entries(over.store || {})) win.localStorage.setItem(k, v);
  const nav = over.nav || {};
  return { win, doc: win.document, nav, store: win.localStorage, opts: { doc: win.document, win, nav, store: win.localStorage } };
}
const said = (c: string) => C.answerCookie(c, true); // a cookie exactly as the page writes it, so a later answer replaces it the way a real browser does
const keys = (s: any) => { const k: string[] = []; for (let i = 0; i < s.length; i++) k.push(s.key(i)); return k.sort(); };
const btn = (doc: any, id: string) => doc.getElementById(id);

test("before an answer: the banner shows, and NOTHING is stored (no cookie, nothing in the browser's storage)", () => {
  const p = page();
  const api: any = C.startConsent(p.opts);
  expect(p.doc.getElementById("cookie-banner")).toBeTruthy();
  expect(api.isOpen()).toBe(true);
  expect(p.doc.cookie).toBe("");
  expect(keys(p.store)).toEqual([]);
  expect(p.doc.querySelector("#cookie-banner").textContent).toContain("only after you sign in"); // says what the one needed cookie is and when it is set
});

test("the two answers have the same size and look: same classes, neither is the 'main' button, neither is pre-picked, no countdown", () => {
  const p = page(); C.startConsent(p.opts);
  const a = btn(p.doc, "cookie-needed"), b = btn(p.doc, "cookie-prefs");
  expect(a.className).toBe(b.className);
  expect(/\bmain\b|\bgold\b/.test(a.className + b.className)).toBe(false);
  expect(p.doc.querySelectorAll("#cookie-banner button").length).toBe(2); // only two buttons: no third "maybe later" trick and no hidden close that counts as yes
  expect(p.doc.querySelector("#cookie-banner input[type=checkbox]")).toBeNull(); // nothing is pre-ticked
  const text = p.doc.querySelector("#cookie-banner").textContent;
  expect(/hurry|last chance|only today|seconds? left|are you sure|miss out|don't want/i.test(text)).toBe(false);
});

test("'Only what is needed' writes the answer cookie (after the click), keeps nothing optional and closes the banner", () => {
  const p = page({ store: { "cg-email": "demo2@demo-test.invalid", "cg-design": "phone" } });
  C.startConsent(p.opts);
  btn(p.doc, "cookie-needed").click();
  expect(p.doc.cookie).toContain("cg_consent=v1.needed");
  expect(keys(p.store)).toEqual([]); // anything optional kept earlier is erased
  expect(p.doc.getElementById("cookie-banner")).toBeNull();
  expect(C.allowed(p.opts)).toBe(false);
  expect(C.keepOptional("cg-email", "demo3@demo-test.invalid", p.opts)).toBe(false);
  expect(keys(p.store)).toEqual([]);
});

test("'Also remember your e-mail and layout' is remembered: the optional things can be kept, read, and are read back; a new visit shows no banner", () => {
  const p = page(); C.startConsent(p.opts);
  btn(p.doc, "cookie-prefs").click();
  expect(p.doc.cookie).toContain("cg_consent=v1.prefs");
  expect(C.keepOptional("cg-email", "demo1@demo-test.invalid", p.opts)).toBe(true);
  expect(C.readOptional("cg-email", p.opts)).toBe("demo1@demo-test.invalid");
  expect(C.keepOptional("cg-other", "x", p.opts)).toBe(false); // only the two named things can ever be kept
  const again = page({ cookie: said("prefs"), store: { "cg-email": "demo1@demo-test.invalid" } });
  C.startConsent(again.opts);
  expect(again.doc.getElementById("cookie-banner")).toBeNull(); // remembered
  expect(C.readOptional("cg-email", again.opts)).toBe("demo1@demo-test.invalid");
});

test("changing the answer later (footer 'Cookie choices') to 'Only what is needed' erases what was kept", () => {
  const p = page({ cookie: said("prefs"), store: { "cg-email": "demo1@demo-test.invalid", "cg-design": "laptop" } });
  const api: any = C.startConsent(p.opts);
  expect(p.doc.getElementById("cookie-banner")).toBeNull();
  p.win.dispatchEvent(new p.win.CustomEvent("cg-cookie-choices")); // what the footer button does
  expect(p.doc.getElementById("cookie-banner")).toBeTruthy();
  expect(p.doc.querySelector("#cookie-banner").textContent).toContain("Your answer now: also remember");
  btn(p.doc, "cookie-needed").click();
  expect(keys(p.store)).toEqual([]);
  expect(C.readOptional("cg-email", p.opts)).toBeNull();
  expect(api.state().choice).toBe("needed");
});

test("Global Privacy Control: no banner, nothing is written, the optional things cannot be switched on, even by an old 'yes' cookie, and what was kept is erased", () => {
  const p = page({ cookie: said("prefs"), nav: { globalPrivacyControl: true }, store: { "cg-email": "demo1@demo-test.invalid" } });
  const api: any = C.startConsent(p.opts);
  expect(p.doc.getElementById("cookie-banner")).toBeNull();
  expect(api.state()).toMatchObject({ choice: "needed", ask: false, signal: true });
  expect(C.allowed(p.opts)).toBe(false);
  expect(C.keepOptional("cg-email", "demo3@demo-test.invalid", p.opts)).toBe(false);
  expect(keys(p.store)).toEqual([]);
  expect(api.answer("prefs")).toBe("needed"); // a click cannot override the browser's signal
  expect(p.doc.cookie).not.toContain("v1.prefs");
  const q = page({ nav: { globalPrivacyControl: true } }); const a2: any = C.startConsent(q.opts);
  expect(q.doc.cookie).toBe(""); // nothing written at all
  a2.open(); expect(q.doc.getElementById("cookie-signal")!.textContent).toContain("Global Privacy Control");
  expect(q.doc.getElementById("cookie-prefs")).toBeNull(); // no way to say yes against the signal
});

test("Do Not Track ('1' and 'yes', on the navigator or the window) is honoured the same way", () => {
  for (const nav of [{ doNotTrack: "1" }, { doNotTrack: "yes" }, { msDoNotTrack: "1" }]) {
    const p = page({ nav }); C.startConsent(p.opts);
    expect([JSON.stringify(nav), p.doc.getElementById("cookie-banner")]).toEqual([JSON.stringify(nav), null]);
    expect(C.allowed(p.opts)).toBe(false);
  }
  expect(C.signalsOf({ doNotTrack: "0" }, {}).any).toBe(false);
  expect(C.signalsOf({}, { doNotTrack: "1" }).dnt).toBe(true);
  expect(C.signalsOf({ globalPrivacyControl: false }, {}).any).toBe(false);
});

test("an answer cookie that is not ours, or from another version, counts as no answer (the banner asks again)", () => {
  expect(C.readAnswer("cg_consent=v0.prefs")).toBeNull();
  expect(C.readAnswer("xcg_consent=v1.prefs")).toBeNull();
  expect(C.readAnswer("a=1; cg_consent=v1.prefs; b=2")).toBe("prefs");
  expect(C.readAnswer("cg_consent=v1.everything")).toBeNull();
  const p = page({ cookie: "cg_consent=v9.prefs" }); C.startConsent(p.opts);
  expect(p.doc.getElementById("cookie-banner")).toBeTruthy();
});

test("the answer cookie is small, lasts 180 days, is for this site only and is Secure on https", () => {
  expect(C.answerCookie("prefs", true)).toBe("cg_consent=v1.prefs; Max-Age=15552000; Path=/; SameSite=Lax; Secure");
  expect(C.answerCookie("needed", false)).not.toContain("Secure");
  expect(C.CONSENT_MAX_AGE_S).toBe(180 * 24 * 3600);
});

test("simple English: no 'we' or 'our', no jargon words, short sentences, and it names the one cookie and when it is set", () => {
  const all = Object.values(C.WORDS).map((v: any) => (typeof v === "function" ? v("prefs") + " " + v("needed") : v)).join(" ");
  expect(/\b(we|our|us)\b/i.test(all)).toBe(false);
  expect(/\b(gdpr|ccpa|ePrivacy|tracker|pixel|third[- ]party|local storage|localStorage|token|identifier)\b/i.test(all)).toBe(false);
  for (const s of all.split(/(?<=\.)\s+/)) expect([s, s.split(/\s+/).length <= 40]).toEqual([s, true]);
});

test("works at 360 px: the banner is limited in height and scrolls, buttons are at least 44 px tall and go full width under 480 px, no inline style, no outside file", () => {
  const css = pub("core/consent.css");
  expect(css).toMatch(/\.cookiebar \{[^}]*max-height: 85vh[^}]*overflow-y: auto/);
  expect(css).toMatch(/\.cookiebtn \{[^}]*min-height: (4[4-9]|[5-9]\d)px/);
  expect(css).toMatch(/@media \(max-width: 480px\) \{[^}]*\.cookiebtn \{ flex-basis: 100%/);
  expect(css).toMatch(/env\(safe-area-inset-bottom\)/);
  expect(/url\(|@import|https?:\/\//.test(css)).toBe(false);
  const js = pub("core/consent.js");
  expect(/["'`]\s*style\s*=|innerHTML|insertAdjacentHTML|document\.write|eval\(/.test(js)).toBe(false);
  expect(/fetch\(|XMLHttpRequest|sendBeacon|new Image/.test(js)).toBe(false); // the banner never talks to anyone
});

test("every page the public can open starts the banner; the console app starts it from boot.js, before anything else is stored", () => {
  for (const f of ["signin.html", "pay-link.html"]) expect([f, pub(f).includes('/core/page-consent.js')]).toEqual([f, true]);
  expect(pub("core/boot.js")).toContain('import { startConsent, readOptional, currentState } from "./consent.js"');
  const boot = pub("core/boot.js");
  expect(boot.indexOf("startConsent();")).toBeLessThan(boot.indexOf("await loadCopy()")); // the banner is up before the first thing the app does
  expect(boot).not.toMatch(/localStorage\.setItem|sessionStorage\.setItem/); // the console app itself keeps nothing in the browser
});

test("the sign-in screen fills in your e-mail ONLY after you allowed it, and remembers it ONLY after a successful sign-in with that allowance", async () => {
  const { renderSignIn } = await import("../public/screens/signin.js");
  const make = async (p: any, onSigned: () => void = () => {}) => {
    const o = p.doc.createElement("div"); p.doc.body.replaceChildren(o);
    const api: any = { auth: { request: async () => ({ ok: true, json: {} }), verify: async () => ({ ok: true }) } };
    // the screen reads consent from the global page, so these tests point the globals at this page
    renderSignIn(o, { api, onSignedIn: async () => onSigned(), resendAfterMs: 0 });
    return o;
  };
  const yes = page({ cookie: said("prefs"), store: { "cg-email": "demo1@demo-test.invalid" } });
  Object.assign(globalThis, { localStorage: yes.store, navigator: yes.nav });
  const o1 = await make(yes);
  expect((o1.querySelector("#si-email") as any).value).toBe("demo1@demo-test.invalid");
  const no = page({ store: { "cg-email": "demo1@demo-test.invalid" } }); // an old value but no allowance: it is not shown
  Object.assign(globalThis, { localStorage: no.store, navigator: no.nav });
  const o2 = await make(no);
  expect((o2.querySelector("#si-email") as any).value).toBe("");
  const none = page({ cookie: "cg_consent=v1.needed" });
  Object.assign(globalThis, { localStorage: none.store, navigator: none.nav });
  let signed = 0; const o3 = await make(none, () => signed++);
  (o3.querySelector("#si-email") as any).value = "demo4@demo-test.invalid"; (o3.querySelector("#si-consent") as any).checked = true;
  (o3.querySelectorAll("form")[0] as any).dispatchEvent(new none.win.Event("submit", { cancelable: true }));
  await new Promise((r) => setTimeout(r, 30));
  (o3.querySelector("#si-code") as any).value = "123456"; (o3.querySelectorAll("form")[1] as any).dispatchEvent(new none.win.Event("submit", { cancelable: true }));
  await new Promise((r) => setTimeout(r, 30));
  expect(signed).toBe(1);
  expect(keys(none.store)).toEqual([]); // signed in, and still nothing kept: no allowance
});

test("a layout a person picked is used only with the allowance (boot.js reads it through readOptional)", () => {
  const allowed = page({ cookie: said("prefs"), store: { "cg-design": "laptop" } });
  expect(C.readOptional("cg-design", allowed.opts)).toBe("laptop");
  const denied = page({ store: { "cg-design": "laptop" } });
  expect(C.readOptional("cg-design", denied.opts)).toBeNull();
});
