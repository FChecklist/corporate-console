import { showVersion } from "/core/version.js";
// The page behind the one-tap link in the sign-in mail. Opening it does nothing; the button finishes the sign-in (a mail scanner that only opens links changes nothing).
// 0.3.2: the one-time token STAYS in the address until the sign-in is proven (the server's own answer says you are signed in). So if the page is loaded again before that
// (a refresh, a restored tab, any automatic reload), the token is still there and is used once. Only then the token leaves the address bar, and the page moves on.
const t = new URLSearchParams(location.search).get("t") || "";
const msg = document.getElementById("msg"), go = document.getElementById("go");

/**
 * Is the person signed in now? Asked of the server (`/auth/me`), not of the browser: the sign-in cookie is HttpOnly, so no script can read it (neither `document.cookie`
 * nor `cookieStore`, and `cookieStore` is missing in Firefox and older Safari anyway). This works in every browser and also catches one that refuses the cookie.
 */
export async function sessionConfirmed(doFetch = fetch) {
  try { const r = await doFetch("/auth/me", { credentials: "include", cache: "no-store" }); const j = await r.json(); return !!(j && j.signedIn === true); } catch { return false; }
}
/** the token leaves the address bar (only after sign-in is confirmed) */
const stripToken = () => { try { history.replaceState(null, "", location.pathname); } catch { /* the page moves on anyway */ } };

let busy = false; // one press, one job
go.addEventListener("click", async () => {
  if (busy) return;
  busy = true; go.disabled = true;
  try {
    const r = await fetch("/auth/link", { method: "POST", headers: { "content-type": "application/json", "x-console": "1" }, body: JSON.stringify({ t }) });
    if (r.ok) {
      if (await sessionConfirmed()) { stripToken(); location.replace("/"); return; }
      msg.textContent = "You are signed in, but your browser did not keep it. Please allow cookies for this site, then go back and ask for a new code.";
    } else {
      const j = await r.json().catch(() => ({}));
      msg.textContent = j.message || "That link has run out. Press Back to sign in, then press Get your code for a new one.";
    }
  } catch { msg.textContent = "The system could not reach the server. Please check your internet connection and press Sign in again."; }
  busy = false; go.disabled = false;
});

showVersion(); // the version and release time on this page too
