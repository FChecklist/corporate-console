// The cookie banner on the pages that are not the console app (sign-in link page, payee page, owner page, games chooser, what's new, the 404 page). The console app starts it from boot.js.
// 0.3.1: these pages follow the answer too. A decline here removes the offline worker and the saved page copies just as it does in the console app (the page says "erased", so it must be true).
import { startConsent, currentState } from "./consent.js";
import { syncOffline } from "./offline.js";

/** brings the worker in line with the answer on this page; `o` is for tests (nav, caches, reload) */
export const followAnswer = (o = {}) => syncOffline({ ...o, state: o.state || currentState() });

startConsent();
if (typeof window !== "undefined") {
  window.addEventListener("cg-consent-changed", () => followAnswer());
  followAnswer(); // leftovers from an earlier visit go at once, whatever page the visitor lands on
}
