// Signed out: the sign-in screen is all there is. E-mail + consent box -> a code by e-mail (or its one-tap link) -> signed in. No password.
// Kind to slow mail: the Send button is locked while it works, "Send a new code" opens after 30 seconds, the newest e-mail is the one to use, and there is always a way back.
import { el, clear } from "../core/dom.js";
import { button } from "./ui.js";
import { keepOptional, readOptional } from "../core/consent.js";
import { HELP_EMAIL } from "../core/errors.js";

/* e-mail ID: the same function as packages/bridge/src/email.ts (a test keeps the two identical). The system reads an address in lower case, so it shows it that way. */
const normEmail = (e) => String(e == null ? "" : e).normalize("NFKC").replace(/\s+/g, "").toLowerCase(); // inner spaces go too (checklist A3)
export const RESEND_AFTER_MS = 30_000;
const clock = (ms) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" AM", " am").replace(" PM", " pm");

export function renderSignIn(outlet, ctx) {
  const { api, onSignedIn } = ctx;
  const waitMs = ctx.resendAfterMs ?? RESEND_AFTER_MS;
  const msg = el("p", { class: "signmsg", role: "status", "aria-live": "polite" });
  const say = (text, bad) => { msg.textContent = text; msg.classList.toggle("bad", !!bad); };
  const email = el("input", { id: "si-email", type: "email", autocomplete: "email", inputmode: "email", required: true, placeholder: "you@yourcompany.com", "aria-label": "Your work e-mail" });
  const kept = readOptional("cg-email"); if (kept && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(kept)) email.value = kept; // only after you allowed "remember your e-mail" in the cookie banner
  const consent = el("input", { id: "si-consent", type: "checkbox" });
  const terms = ctx.termsUrl || "#";
  const sendBtn = button("Get your code", { main: true });
  sendBtn.type = "submit";
  const form = el("form", { class: "zform", novalidate: true },
    el("div", { class: "field" }, el("label", { for: "si-email", text: "Your work e-mail" }), email),
    el("label", { class: "opt" }, consent, el("span", { class: "t" }, el("b", { text: "Tick this box to agree to the Terms of Use and the Privacy Policy." }), el("span", { text: "The system sends one code to this address. No password." }))),
    el("p", { class: "hintline" }, el("a", { href: terms, target: "_blank", rel: "noopener" }, "Read the Terms and the Privacy Policy")),
    sendBtn);
  const codeBox = el("input", { id: "si-code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6", pattern: "[0-9]{6}", "aria-label": "The 6-digit code" });
  const signBtn = button("Sign in", { main: true });
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
    if (!consent.checked) return say("Please tick the box to agree, then press Get your code.", true);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) return say("Please type your work e-mail address, for example you@yourcompany.com, then press Get your code.", true);
    sendBtn.disabled = true; resendBtn.disabled = true; say("Sending…"); // locked while it works: a second tap would make the first code useless
    const r = await api.auth.request(email.value.trim(), true);
    sendBtn.disabled = false;
    if (!r.ok && r.json?.error === "mail_slow") { // the mail service may still deliver this mail and its code works: keep the code box open and make the person wait before asking again (a second mail would replace this code)
      say(""); form.classList.add("hide"); codeForm.classList.remove("hide"); codeBox.focus();
      outlet.querySelector("#si-sent").textContent = `The e-mail to ${normEmail(email.value)} is taking longer than usual and may still arrive. If it does, type its code here. Please wait a minute before asking for another one.`;
      lockResend(); return;
    }
    if (!r.ok) { resendBtn.disabled = false; return say(r.json?.message || "The system could not send the code. Please press Get your code again. If it keeps failing, write to " + HELP_EMAIL + ".", true); }
    if (r.json?.testAddress) { resendBtn.disabled = false; return say("This looks like a test address, so no e-mail can be sent to it. Please type your own work e-mail address and press Get your code.", true); } // a code that can never arrive must not be waited for
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
    if (!r.ok) return say(r.json?.message || "That code is not right. Check the newest e-mail and type its 6 digits again, or press Send a new code.", true);
    stopTimer(); keepOptional("cg-email", normEmail(email.value)); say("Signing you in…");
    await onSignedIn();
  });

  clear(outlet);
  outlet.append(el("div", { class: "wrap" }, el("div", { class: "page signin" }, el("h1", { text: "Sign in" }), el("p", { class: "lead", text: "Use your work e-mail. The system sends you a code. There is no password to remember." }), el("p", { id: "si-sent", class: "hintline", role: "status" }), msg, form, codeForm)));
}
