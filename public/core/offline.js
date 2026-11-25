// The offline worker, only with the visitor's say-so (0.3.0). The worker keeps a copy of the console's own pages on the device, which is a "not needed" thing under the cookie rules,
// so: before an answer, and after "Only what is needed", and with a privacy signal (Global Privacy Control or Do Not Track), NO worker is registered and NO cached file exists.
// A worker or cache left from an earlier visit is removed. Only the answer "Also remember your choices" switches it on.
import { currentState } from "./consent.js";
import { endPush } from "./push-end.js";

export const CACHE_PREFIX = "console-shell-";
export const WORKER_URL = "/sw.js";
const ACK_MS = 400; // how long the page waits for the worker to say "stopped"

/**
 * Pages that hold something that cannot be asked for again: the e-mailed sign-in link (its one-time code is in the address), the payee page (its link code), the owner page (a key being typed).
 * The clean-up NEVER reloads such a page (0.3.2): a reload would throw the one-time code away. The worker is still removed and its cache deleted; the page is freed on its next load.
 */
export const holdsOneTimeInput = (loc) => {
  const path = String((loc && loc.pathname) || ""), query = String((loc && loc.search) || "");
  return /^\/(signin|pay-link|paylink|owner-funnel)(\.html|\/|\/index\.html)?$/.test(path) || /^\/pay\//.test(path) || /[?&]t=/.test(query);
};

/** may the offline worker exist right now? Only after the second answer, and never with a privacy signal. */
export const offlineAllowed = (state) => !!state && state.answered === true && state.choice === "prefs" && !state.signal;

/**
 * Brings the worker in line with the answer. Returns { registered, reg? }.
 * `o`: nav (navigator), caches (CacheStorage), state (from consent.js), onUpdate(reg) when a newer version waits.
 */
export async function syncOffline(o = {}) {
  const nav = o.nav || (typeof navigator !== "undefined" ? navigator : {});
  const store = o.caches !== undefined ? o.caches : (typeof caches !== "undefined" ? caches : null);
  const state = o.state || currentState();
  const sw = nav.serviceWorker;
  if (!offlineAllowed(state)) return removeWorker({ sw, store, reload: o.reload, ackMs: o.ackMs });
  if (!sw || !sw.register) return { registered: false };
  try {
    const reg = await sw.register(WORKER_URL);
    if (o.onUpdate) {
      if (reg.waiting) o.onUpdate(reg);
      reg.addEventListener && reg.addEventListener("updatefound", () => { const w = reg.installing; w && w.addEventListener("statechange", () => { if (w.state === "installed" && sw.controller) o.onUpdate(reg); }); });
    }
    try { const go = (w) => w && w.postMessage && w.postMessage("go"); go(reg.active || sw.controller); if (sw.ready && sw.ready.then) sw.ready.then((r) => go(r.active)).catch(() => {}); } catch { /* the worker reads the cookie itself where it can */ } // browsers that cannot show a worker the cookie need this
    return { registered: true, reg };
  } catch { return { registered: false }; } // the console works without the offline worker
}

/**
 * Declining (or a privacy signal, or no answer yet): the worker and every console cache go, and no worker that is still running may write them again.
 * 1. Every worker we can reach is told "stop" (a 0.3.1 worker then stops writing at once, clears its cache and answers "stopped").
 * 2. The registrations are removed and the console caches deleted.
 * 3. A page that is still controlled by a worker that did NOT answer is held by an older worker that cannot be told (0.2.2 and 0.3.0 workers): that page is loaded once more,
 *    which frees it, because a removed worker does not control a new load. (Once only: the reload leaves a mark in the page's history state, nothing is stored.)
 *    Not on a page that holds a one-time code or typed input (`holdsOneTimeInput`): there the page keeps running, and is free on its next load.
 */
export async function removeWorker({ sw, store, reload, ackMs } = {}) {
  let controlledByOld = false;
  try {
    const regs = sw && sw.getRegistrations ? await sw.getRegistrations() : [];
    try { await endPush({ regs }); } catch { /* nothing to end */ } // 0.5.0: the notify opt-in ends with the worker (address deleted at the service, browser subscription removed, notes erased); it must run before the registrations are removed
    const targets = new Set([sw && sw.controller, ...regs.flatMap((r) => [r.active, r.waiting, r.installing])].filter(Boolean));
    let acked = !sw || !sw.controller; // nothing controls this page: nothing to wait for
    let onMsg;
    const answer = new Promise((done) => { onMsg = (ev) => { if (ev && ev.data === "stopped") { acked = true; done(); } }; });
    if (sw && sw.addEventListener) { sw.addEventListener("message", onMsg); if (sw.startMessages) sw.startMessages(); }
    for (const t of targets) { try { t.postMessage && t.postMessage("stop"); } catch { /* it is already gone */ } }
    if (!acked && sw.addEventListener) await Promise.race([answer, new Promise((r) => setTimeout(r, ackMs ?? ACK_MS))]);
    if (sw && sw.removeEventListener) sw.removeEventListener("message", onMsg);
    controlledByOld = !acked;
    for (const r of regs) { try { await r.unregister(); } catch { /* nothing to remove */ } }
  } catch { /* nothing to remove */ }
  try { if (store && store.keys) for (const k of await store.keys()) if (String(k).startsWith(CACHE_PREFIX)) await store.delete(k); } catch { /* nothing to remove */ }
  let reloaded = false;
  if (controlledByOld) {
    try {
      const w = typeof window !== "undefined" ? window : null;
      const mark = w && w.history && w.history.state && w.history.state.cgFreed;
      if (!mark && !(w && holdsOneTimeInput(w.location))) { // once only, and never on a page that holds a one-time code
        if (w && w.history && w.history.replaceState) w.history.replaceState({ ...(w.history.state || {}), cgFreed: true }, "");
        (reload || (() => w && w.location && w.location.reload()))();
        reloaded = true;
      }
    } catch { /* the next page load is free of it anyway */ }
  }
  return { registered: false, reloaded };
}
