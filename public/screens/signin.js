// Signed out: the sign-in screen is all there is. E-mail -> a code by e-mail (or its one-tap link) -> signed in. No password.
// Kind to slow mail: the Send button is locked while it works, "Send a new code" opens after 30 seconds, the newest e-mail is the one to use, and there is always a way back.
import { el, clear } from "../core/dom.js";
import { button } from "./ui.js";

/* e-mail ID: the same function as packages/bridge/src/email.ts (a test keeps the two identical). The system reads an address in lower case, so it shows it that way. */
const normEmail = (e) => String(e == null ? "" : e).normalize("NFKC").replace(/\s+/g, "").toLowerCase(); // inner spaces go too (checklist A3)
export const RESEND_AFTER_MS = 30_000;
const clock = (ms) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" AM", " am").replace(" PM", " pm");

const SOFT = "No problem - please use your e-mail below.";
export const OAUTH_WORDS = { declined: SOFT, unverified: SOFT, retry: SOFT, wait: SOFT, off: SOFT }; // a provider's own error text is never shown
const PROVIDER_NAMES = { google: "Google", microsoft: "Microsoft" };

/** the standard four-colour Google "G" mark, drawn from its four official shapes (no image file, no inline style: the page's policy forbids both) */
const G_SHAPES = [
  ["#EA4335", "M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"],
  ["#4285F4", "M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"],
  ["#FBBC05", "M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"],
  ["#34A853", "M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"],
];
export function googleMark() {
  const ns = "http://www.w3.org/2000/svg", set = (n, o) => { for (const [k, v] of Object.entries(o)) n.setAttribute(k, v); return n; };
  const svg = set(document.createElementNS(ns, "svg"), { viewBox: "0 0 48 48", width: "24", height: "24", class: "gmark", "aria-hidden": "true", focusable: "false" });
  for (const [fill, d] of G_SHAPES) svg.append(set(document.createElementNS(ns, "path"), { fill, d }));
  return svg;
}

export function renderSignIn(outlet, ctx) {
  const { api, onSignedIn } = ctx;
  const waitMs = ctx.resendAfterMs ?? RESEND_AFTER_MS;
  const msg = el("p", { class: "signmsg", role: "status", "aria-live": "polite" });
  const say = (text, bad) => { msg.textContent = text; msg.classList.toggle("bad", !!bad); };
  const email = el("input", { id: "si-email", type: "email", autocomplete: "email", inputmode: "email", required: true, placeholder: "Type your e-mail", "aria-label": "Your e-mail" });
    const terms = ctx.termsUrl || "#";
  const sendBtn = button("Send me a code", { main: true });
  sendBtn.type = "submit";
  const form = el("form", { class: "zform", novalidate: true });
  // Google (and Microsoft, if the console ever switches it on) is the FIRST and biggest action on the card; they appear only when the console has them switched on. The code step is skipped for them.
  // A calm line "or use your e-mail" separates them from the e-mail option below.
  const providers = el("div", { class: "provs hide", id: "si-providers" });
  const goTo = ctx.assign || ((u) => location.assign(u));
  for (const id of ["google", "microsoft"]) {
    const go = () => { try { sessionStorage.setItem("si-hint", email.value.trim()); } catch { /* optional */ } const h = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim()) ? "&h=" + encodeURIComponent(email.value.trim()) : ""; goTo(`/auth/oauth/start?p=${id}${h}`); };
    const b = id === "google"
      ? el("button", { type: "button", class: "gbtn", onclick: go }, googleMark(), el("span", { text: `Continue with ${PROVIDER_NAMES[id]}` }))
      : button(`Continue with ${PROVIDER_NAMES[id]}`, { onclick: go });
    b.dataset.provider = id; b.classList.add("hide"); providers.append(b);
  }
  providers.append(el("p", { class: "orline", id: "si-or", text: "or use your e-mail" }));
  form.append(providers,
    el("div", { class: "field" }, el("label", { for: "si-email", text: "Your e-mail" }), email),
    el("p", { class: "hintline", text: "The system sends one code to this address. No password." }),
    sendBtn);
  // one small line BELOW the buttons; the three names open the one document at their sections (no tick box, owner rule 1 Nov)
  const doc = ctx.legalUrl || "https://home.corporatetambola.com/terms";
  const link = (t, a) => el("a", { href: `${doc}#${a}`, target: "_blank", rel: "noopener", text: t });
  form.append(el("p", { class: "hintline legalline", id: "si-notice" }, "By continuing, you agree to the ", link("Terms and Conditions", "terms"), ", ", link("Privacy and Data", "privacy"), " and ", link("Game rules", "game-rules"), "."));
  Promise.resolve(api.auth.providers ? api.auth.providers() : null).then((r) => {
    const on = r && r.ok && r.json ? r.json : {};
    for (const b of providers.querySelectorAll("[data-provider]")) if (on[b.dataset.provider] === true) { b.classList.remove("hide"); providers.classList.remove("hide"); }
  }).catch(() => undefined);
  const back = new URLSearchParams(ctx.search ?? (typeof location !== "undefined" ? location.search : "")).get("oauth");
  if (back && OAUTH_WORDS[back]) {
    say(OAUTH_WORDS[back], true);
    try { const h = sessionStorage.getItem("si-hint"); if (h && !email.value) email.value = h; } catch { /* optional */ }
    setTimeout(() => email.focus && email.focus(), 0); // the e-mail field is ready, with the address already typed
  }
  const codeBox = el("input", { id: "si-code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6", pattern: "[0-9]{6}", "aria-label": "The 6-digit code" });
  const signBtn = button("Sign me in", { main: true });
  signBtn.type = "submit";
  const resendBtn = button("Send a new code", { sm: true, onclick: () => send(true) });
  const backBtn = button("Use a different e-mail", { sm: true, onclick: () => { stopTimer(); codeForm.classList.add("hide"); form.classList.remove("hide"); say(""); email.focus(); } });
  const codeForm = el("form", { class: "zform hide", novalidate: true },
    el("div", { class: "field" }, el("label", { for: "si-code", text: "The 6-digit code from your e-mail" }), codeBox),
    signBtn,
    el("p", { class: "hintline", id: "si-newest", text: "Mail can take a minute. If you ask for more than one, use the newest e-mail: older codes stop working. You can also open the link in the e-mail and press the button there." }),
    el("div", { class: "btns" }, resendBtn, backBtn));

  let timer = null;
  const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };
  /** "Send a new code" opens after the wait; until then it says how long is left */
  function lockResend() {
    stopTimer();
    const until = Date.now() + waitMs;
    const tick = () => {
      const left = Math.ceil((until - Date.now()) / 1000);
      if (left <= 0) { resendBtn.disabled = false; resendBtn.textContent = "Send a new code"; stopTimer(); return; }
      resendBtn.disabled = true; resendBtn.textContent = `Send a new code (in ${left} s)`;
    };
    tick(); if (waitMs > 0) timer = setInterval(tick, 1000);
  }

  async function send(again) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) return say("Please type a valid e-mail address.", true);
    sendBtn.disabled = true; resendBtn.disabled = true; say("Sending…"); // locked while it works: a second tap would make the first code useless
    const r = await api.auth.request(email.value.trim(), true);
    sendBtn.disabled = false;
    if (!r.ok) { resendBtn.disabled = false; return say(r.json?.message || "The system could not send the code. Please try again.", true); }
    say(""); form.classList.add("hide"); codeForm.classList.remove("hide"); codeBox.focus();
    outlet.querySelector("#si-sent").textContent = `${again ? "A new code" : "A code"} is on its way to ${normEmail(email.value)}. It works for ${r.json?.codeMinutes || 30} minutes (until ${clock(r.json?.expiresMs || Date.now() + 30 * 60_000)}).`;
    lockResend();
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); if (!sendBtn.disabled) send(false); });
  codeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (signBtn.disabled) return;
    signBtn.disabled = true;
    const r = await api.auth.verify(email.value.trim(), codeBox.value.trim());
    signBtn.disabled = false;
    if (!r.ok) return say(r.json?.message || "Please check the code and try once more.", true);
    stopTimer(); say("Signing you in…");
    await onSignedIn();
  });

  clear(outlet);
  outlet.append(el("div", { class: "wrap" }, el("div", { class: "page signin" }, el("h1", { text: "Sign in" }), el("p", { class: "lead", text: "Use your e-mail. The system sends you a code. There is no password to remember." }), el("p", { id: "si-sent", class: "hintline", role: "status" }), msg, form, codeForm)));
}
