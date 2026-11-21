// The offline worker, only with the visitor's say-so (0.3.0). The worker keeps a copy of the console's own pages on the device, which is a "not needed" thing under the cookie rules,
// so: before an answer, and after "Only what is needed", and with a privacy signal (Global Privacy Control or Do Not Track), NO worker is registered and NO cached file exists.
// A worker or cache left from an earlier visit is removed. Only the answer "Also remember your choices" switches it on.
import { currentState } from "./consent.js";

export const CACHE_PREFIX = "console-shell-";
export const WORKER_URL = "/sw.js";

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
  if (!offlineAllowed(state)) {
    try { if (sw && sw.getRegistrations) for (const r of await sw.getRegistrations()) await r.unregister(); } catch { /* nothing to remove */ }
    try { if (store && store.keys) for (const k of await store.keys()) if (String(k).startsWith(CACHE_PREFIX)) await store.delete(k); } catch { /* nothing to remove */ }
    return { registered: false };
  }
  if (!sw || !sw.register) return { registered: false };
  try {
    const reg = await sw.register(WORKER_URL);
    if (o.onUpdate) {
      if (reg.waiting) o.onUpdate(reg);
      reg.addEventListener && reg.addEventListener("updatefound", () => { const w = reg.installing; w && w.addEventListener("statechange", () => { if (w.state === "installed" && sw.controller) o.onUpdate(reg); }); });
    }
    return { registered: true, reg };
  } catch { return { registered: false }; } // the console works without the offline worker
}
