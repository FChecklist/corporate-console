// Ending the "notify me" opt-in (0.5.0). The opt-in lives in the console's one worker (public/sw.js), and that worker exists only after "Also remember your choices".
// So when the answer becomes "Only what is needed" (or a privacy signal says so), the opt-in ends with it, and the page's promise "anything saved earlier was erased from this device" stays true:
//  1. every saved browser address of ours is deleted at the notify service (one best-effort call, two and a half seconds at most; nothing else is sent: only the address),
//  2. the browser's own subscription is removed,
//  3. the little yes/no notes this device kept (corporatePush.v1.*, and corporatePush.v1pending) are erased, and any notify block still on the page is taken away.
// It runs from removeWorker (public/core/offline.js) BEFORE the registrations are removed, because a removed registration can no longer be asked for its subscription.
// With no notify address configured, or no subscription, steps 1 and 2 do nothing and nothing is sent. This file never sends a notification and has no "send" call of any kind.
export const NOTE_PREFIX = "corporatePush.v1"; // matches corporatePush.v1.<scope> and corporatePush.v1pending
const SERVER_WAIT_MS = 2500;

/** the notify service address from the generated config, or "" (the file does not exist in a source checkout, and holds "" until the owner sets the one value) */
async function configuredApi() {
  try { const m = await import("./games.config.js"); return /^https:\/\//.test(String(m.PUSH_API || "")) ? String(m.PUSH_API) : ""; } catch { return ""; }
}

/** erase this device's notes of the opt-in (and nothing else) */
export function clearPushNotes(storage) {
  let n = 0;
  try {
    const s = storage || (typeof window !== "undefined" ? window.localStorage : null);
    if (!s) return 0;
    const keys = [];
    for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(NOTE_PREFIX)) keys.push(k); }
    for (const k of keys) { try { s.removeItem(k); n++; } catch { /* nothing to erase */ } }
  } catch { /* no storage */ }
  return n;
}

/**
 * End the opt-in. `regs`: the worker registrations about to be removed. `o`: api (test), fetch (test), storage (test), doc (test).
 * Returns { subscriptions, notes } (how many browser subscriptions and notes were removed).
 */
export async function endPush({ regs = [], o = {} } = {}) {
  const api = o.api !== undefined ? o.api : (regs.some((r) => r && r.pushManager) ? await configuredApi() : "");
  const doFetch = o.fetch || (typeof fetch === "function" ? fetch : null);
  let subscriptions = 0;
  for (const r of regs) {
    try {
      const sub = r && r.pushManager && r.pushManager.getSubscription ? await r.pushManager.getSubscription() : null;
      if (!sub) continue;
      if (api && doFetch) {
        const ctrl = typeof AbortController === "function" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), SERVER_WAIT_MS) : null;
        try { await doFetch(api + "/unsubscribe", { method: "POST", credentials: "omit", referrerPolicy: "no-referrer", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }), signal: ctrl ? ctrl.signal : undefined }); } catch { /* the browser's copy still goes below; the service also drops an address its push provider refuses */ }
        if (timer) clearTimeout(timer);
      }
      try { await sub.unsubscribe(); subscriptions++; } catch { /* already gone */ }
    } catch { /* this registration has nothing to end */ }
  }
  const notes = clearPushNotes(o.storage);
  try { const doc = o.doc || (typeof document !== "undefined" ? document : null); if (doc) for (const n of doc.querySelectorAll("[data-push-optin]")) n.remove(); } catch { /* no page */ }
  return { subscriptions, notes };
}
