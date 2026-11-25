// The "Yes, notify me when my game begins" block on the organizer's own pages (0.5.0). SHIPPED DARK: with no notify address in config/games.json (`pushApi`, one value) nothing here does anything.
// What it is: the notify service's one client file (public/push-optin.js + .css, copied unchanged, pinned in docs/KNOWLEDGE.md) mounted on a page of the console.
// Rules, all kept here and tested in tests/push-optin.test.ts:
//  - No address (or not a real https address): no block, no script, no stylesheet, no connection.
//  - The block (and so the script, the stylesheet and any notes) exists only while the cookie answer is "Also remember your choices" and no privacy signal is on. Before an answer, after "Only what is needed", or with Global Privacy Control / Do Not Track: nothing is loaded and nothing is stored.
//    (The notify worker IS the console's offline worker, public/sw.js, which exists only after that answer; the two cannot be separated.)
//  - Nothing opens the browser's permission prompt or calls the service on load: that happens only on the visitor's own tap on the button (inside push-optin.js).
//  - A later "Only what is needed" ends it: the block goes now, and public/core/push-end.js (called by removeWorker) deletes the address, the browser's subscription and the notes.
//  - The console never SENDS a notification (it has no call to the service's send route at all): who gets told, and when, is decided by the game, not by this page. See the open question in docs/KNOWLEDGE.md.
import { currentState } from "./consent.js";
import { offlineAllowed } from "./offline.js";

export const PUSH_SCRIPT = "/push-optin.js", PUSH_STYLE = "/push-optin.css", PRIVACY_PAGE = "/privacy", WORKER = "/sw.js";

/** the notify address if it is a bare https origin, else "" (build.mjs normalises it too; this is the second lock) */
export const validPushApi = (v) => (/^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$/i.test(String(v || "")) ? String(v) : "");

/** may the block exist right now? A real address AND the second cookie answer AND no privacy signal */
export const pushAllowed = (api, state) => validPushApi(api) !== "" && offlineAllowed(state);

const SLOT = "push-slot";

/** the (empty) place on the page where the block goes, or null when no address is configured: then the page has no trace of it */
export function pushSection(ctx, doc) {
  const d = doc || (typeof document !== "undefined" ? document : null);
  if (!d || !validPushApi(ctx && ctx.pushApi)) return null;
  const slot = d.createElement("section");
  slot.id = SLOT; slot.className = "strip push-slot"; slot.setAttribute("data-push-api", validPushApi(ctx.pushApi));
  slot.setAttribute("aria-label", "Game start notifications");
  followAnswer(d); // the block comes and goes with the cookie answer
  syncPush({ doc: d, slot });
  return slot;
}

/** brings the block on the page in line with the answer. `o`: state (test), win (test). Returns { shown }. */
export function syncPush({ doc, slot, state, api } = {}) {
  const d = doc || (typeof document !== "undefined" ? document : null);
  const place = slot || (d && d.getElementById(SLOT));
  if (!place) return { shown: false };
  const address = validPushApi(api || place.getAttribute("data-push-api"));
  const st = state || currentState();
  const have = place.querySelector("[data-push-optin]");
  if (!pushAllowed(address, st)) { if (have) have.remove(); return { shown: false }; }
  if (have) return { shown: true };
  const node = d.createElement("div");
  node.setAttribute("data-push-optin", "");
  node.setAttribute("data-push-api", address);
  node.setAttribute("data-push-site", "console");
  node.setAttribute("data-push-sw", WORKER); // the console's own worker; the block never registers any other
  node.setAttribute("data-push-privacy", PRIVACY_PAGE);
  place.append(node);
  load(d, node);
  return { shown: true };
}

/** the one stylesheet and the one script, added once, and only now (after the answer); a script that is already there mounts the new block itself */
function load(d, node) {
  if (!d.querySelector("link[data-push-css]")) {
    const l = d.createElement("link"); l.rel = "stylesheet"; l.href = PUSH_STYLE; l.setAttribute("data-push-css", "1"); d.head.append(l);
  }
  const w = d.defaultView;
  if (w && w.CorporatePush && w.CorporatePush.mount) { w.CorporatePush.mount(node); return; }
  if (d.querySelector("script[data-push-js]")) return; // still loading: it mounts every block on the page when it starts
  const s = d.createElement("script"); s.src = PUSH_SCRIPT; s.async = true; s.setAttribute("data-push-js", "1"); d.head.append(s);
}

const watched = new WeakSet();
/** one listener per page: when the answer changes, the block follows it at once */
function followAnswer(d) {
  const w = d.defaultView;
  if (!w || watched.has(d)) return;
  watched.add(d);
  w.addEventListener("cg-consent-changed", () => syncPush({ doc: d }));
}
