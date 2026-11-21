// The cookie banner (0.2.2). Rules, in plain words:
// 1. Before the visitor answers, this page stores NOTHING of its own. The one cookie the console needs (the sign-in cookie) is set by the server only after a sign-in, and is "strictly needed".
// 2. Two answers, same size, same place: "Only what is needed" (decline all, one tap) and "Also remember your choices". Neither is pre-picked. No countdown, no guilt words, no blocking of the page.
// 3. A browser that sends Global Privacy Control or Do Not Track gets "only what is needed" at once: no banner, nothing optional is stored, and the answer cannot be switched on here.
// 4. The answer is remembered in one small cookie (cg_consent, 180 days, this site only). It is written only AFTER a click, and "Cookie choices" in the footer changes it at any time.
// 5. The optional part is real: with "Also remember ..." the sign-in screen can fill in your e-mail next time (cg-email), a layout you chose (cg-design) is used, and the offline worker may keep a copy of the console's pages (public/core/offline.js). Saying "Only what is needed" erases all three.
// 6. (0.3.0) No worker and no cached file exist before the answer, after "Only what is needed", or with a privacy signal. An older worker or cache is removed at once.
// No inline style, no inline script, nothing is loaded from outside (the page's policy forbids all three).
import { el } from "./dom.js";

export const CONSENT_COOKIE = "cg_consent";
export const CONSENT_MAX_AGE_S = 180 * 24 * 3600;
export const OPTIONAL_KEYS = ["cg-email", "cg-design"]; // the only things this site ever keeps in the browser besides the answer itself
export const CHOICES = ["needed", "prefs"];

export const WORDS = {
  title: "Cookies on this site",
  intro: "You decide what this site may keep on your device. Until you answer, nothing is stored. The one cookie the console needs, to keep you signed in, is set only after you sign in.",
  needed: "Only what is needed",
  prefs: "Also remember your choices",
  more: "What each answer means",
  moreNeeded: "Only what is needed: the sign-in cookie (after you sign in) and one small note of your answer, so the question is not asked again. Nothing else is kept, and anything saved earlier is removed from this device.",
  morePrefs: "Also remember your choices: the sign-in screen fills in your e-mail next time, a screen layout you picked is kept, and a saved copy of the console's pages lets it open faster and keep working on a weak connection. All of it stays on this device only.",
  moreChange: "You can change your answer at any time with Cookie choices at the bottom of every page. No advertising or tracking cookies are used.",
  signalOn: "Your browser asks sites not to track you (Global Privacy Control or Do Not Track), so only what is needed is used. Nothing else is stored. To change this, change the setting in your browser.",
  signalOk: "OK, close",
  current: (c) => (c === "prefs" ? "Your answer now: also remember your choices." : "Your answer now: only what is needed."),
  footer: "Cookie choices",
  saved: (c) => (c === "prefs" ? "Saved. Your choices will be remembered on this device." : "Saved. Only what is needed is used. Anything else was erased from this device."),
};

/** Global Privacy Control and Do Not Track, read from the browser. Either one means "do not use anything optional". */
export function signalsOf(nav, win) {
  nav = nav || (typeof navigator !== "undefined" ? navigator : {});
  win = win || (typeof window !== "undefined" ? window : {});
  const gpc = nav.globalPrivacyControl === true;
  const dnt = [nav.doNotTrack, win.doNotTrack, nav.msDoNotTrack].some((v) => v === "1" || v === "yes");
  return { gpc, dnt, any: gpc || dnt };
}

/** the remembered answer from a cookie text ("a=1; cg_consent=v1.prefs"), or null when there is none or it is not ours */
export function readAnswer(cookieText) {
  const m = new RegExp("(?:^|;\\s*)" + CONSENT_COOKIE + "=v1\\.(needed|prefs)(?:;|$)").exec(String(cookieText || ""));
  return m ? m[1] : null;
}

/** the cookie to write after a click (never before one) */
export const answerCookie = (choice, secure) => `${CONSENT_COOKIE}=v1.${choice}; Max-Age=${CONSENT_MAX_AGE_S}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;

/** what is allowed right now. `ask` is true only when the banner must be shown. */
export function stateOf({ cookie, signal }) {
  if (signal && signal.any) return { choice: "needed", ask: false, signal: true, answered: false };
  const a = readAnswer(cookie);
  return { choice: a || "needed", ask: !a, signal: false, answered: !!a };
}

const here = (o = {}) => ({ doc: o.doc || (typeof document !== "undefined" ? document : null), nav: o.nav || (typeof navigator !== "undefined" ? navigator : {}), win: o.win || (typeof window !== "undefined" ? window : {}), store: o.store });
const storeOf = (c) => { try { return c.store || c.win.localStorage || null; } catch { return null; } };
export const currentState = (o) => { const c = here(o); return stateOf({ cookie: c.doc ? c.doc.cookie : "", signal: signalsOf(c.nav, c.win) }); };

/** may this site keep the optional things (e-mail, layout) on this device? Only after a click on the second answer, and never with a privacy signal. */
export const allowed = (o) => currentState(o).choice === "prefs";

/** erase the optional things from this device (used when the answer is "only what is needed") */
export function clearOptional(o) { const c = here(o), s = storeOf(c); if (s) for (const k of OPTIONAL_KEYS) { try { s.removeItem(k); } catch { /* nothing to erase */ } } }

/** keep a small optional thing, but only when allowed. Returns true when it was kept. */
export function keepOptional(key, value, o) {
  if (!OPTIONAL_KEYS.includes(key) || !allowed(o)) return false;
  const s = storeOf(here(o)); if (!s) return false;
  try { s.setItem(key, String(value)); return true; } catch { return false; }
}
/** read an optional thing; it is only read when allowed (a withdrawn answer hides it at once) */
export function readOptional(key, o) {
  if (!OPTIONAL_KEYS.includes(key) || !allowed(o)) return null;
  const s = storeOf(here(o)); if (!s) return null;
  try { return s.getItem(key); } catch { return null; }
}

function ensureStyles(doc) {
  if (doc.querySelector('link[data-consent-css]')) return;
  const l = doc.createElement("link");
  l.rel = "stylesheet"; l.setAttribute("data-consent-css", "1");
  try { l.href = new URL("./consent.css", import.meta.url).pathname; } catch { l.href = "/core/consent.css"; }
  doc.head.append(l);
}

const started = new WeakMap();
/**
 * Starts the banner on a page. Returns { open, close, answer, state } for tests and for the footer button.
 * It writes NOTHING until a visitor clicks an answer.
 */
export function startConsent(o = {}) {
  const c = here(o), doc = c.doc;
  if (!doc || !doc.body) return null;
  if (started.has(doc)) return started.get(doc); // one banner per page, however many scripts ask for it
  ensureStyles(doc);
  let box = null;
  const state = () => stateOf({ cookie: doc.cookie, signal: signalsOf(c.nav, c.win) });
  const secure = () => { try { return c.win.location.protocol === "https:"; } catch { return true; } };
  const close = () => { if (box) { box.remove(); box = null; } doc.body.classList.remove("consent-open"); try { doc.body.style.removeProperty("--consent-h"); } catch { /* optional */ } };

  function answer(choice) {
    if (!CHOICES.includes(choice) || signalsOf(c.nav, c.win).any) choice = "needed"; // a privacy signal always wins
    doc.cookie = answerCookie(choice, secure());
    if (choice !== "prefs") clearOptional(o);
    close();
    try { c.win.dispatchEvent && c.win.dispatchEvent(new (c.win.CustomEvent || CustomEvent)("cg-consent-changed", { detail: { choice } })); } catch { /* the page still has its answer */ } // the offline worker follows the answer
    say(WORDS.saved(choice));
    return choice;
  }
  function say(text) { // a quiet line for screen readers and sighted people alike; it leaves by itself
    const t = el("div", { class: "cookienote", role: "status", text });
    doc.body.append(t); c.win.setTimeout && c.win.setTimeout(() => t.remove(), 4500);
  }
  function open() {
    close();
    const s = state();
    const btnNeeded = el("button", { type: "button", class: "btn cookiebtn", id: "cookie-needed", onclick: () => answer("needed") }, WORDS.needed);
    const btnPrefs = el("button", { type: "button", class: "btn cookiebtn", id: "cookie-prefs", onclick: () => answer("prefs") }, WORDS.prefs);
    const body = [];
    if (s.signal) {
      body.push(el("p", { class: "cookietext", id: "cookie-signal", text: WORDS.signalOn }), el("div", { class: "cookiebtns" }, el("button", { type: "button", class: "btn cookiebtn", id: "cookie-ok", onclick: close }, WORDS.signalOk)));
    } else {
      body.push(el("p", { class: "cookietext", text: s.answered ? WORDS.current(s.choice) + " " + WORDS.moreChange : WORDS.intro }),
        el("details", { class: "cookiemore" }, el("summary", { text: WORDS.more }), el("ul", {}, el("li", { text: WORDS.moreNeeded }), el("li", { text: WORDS.morePrefs }), el("li", { text: WORDS.moreChange }))),
        el("div", { class: "cookiebtns" }, btnNeeded, btnPrefs));
    }
    box = el("section", { class: "cookiebar", id: "cookie-banner", role: "region", "aria-labelledby": "cookie-title" }, el("h2", { id: "cookie-title", text: WORDS.title }), ...body);
    doc.body.append(box);
    doc.body.classList.add("consent-open");
    try { const h = box.offsetHeight || 0; if (h) doc.body.style.setProperty("--consent-h", h + "px"); } catch { /* optional */ }
    return box;
  }
  const api = { open, close, answer, state, isOpen: () => !!box };
  c.win.addEventListener && c.win.addEventListener("cg-cookie-choices", () => open());
  started.set(doc, api);
  const s0 = state();
  if (s0.signal) clearOptional(o); // a privacy signal: nothing optional may stay on this device
  if (s0.ask) open(); // answered or signalled: no banner; the footer's Cookie choices opens it on demand
  return api;
}

/** the footer's "Cookie choices" button asks the page's banner to open (the footer does not need to know how) */
export const openChoices = (win) => { const w = win || (typeof window !== "undefined" ? window : null); if (w && w.dispatchEvent) w.dispatchEvent(new (w.CustomEvent || CustomEvent)("cg-cookie-choices")); };
