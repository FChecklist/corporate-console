// Signed out: the sign-in screen is all there is. E-mail + consent box -> a code by e-mail (or its one-tap link) -> signed in. No password.
import { el, clear } from "../core/dom.js";
import { button } from "./ui.js";

export function renderSignIn(outlet, ctx) {
  const { api, onSignedIn } = ctx;
  const msg = el("p", { class: "signmsg", role: "status", "aria-live": "polite" });
  const say = (text, bad) => { msg.textContent = text; msg.classList.toggle("bad", !!bad); };
  const email = el("input", { id: "si-email", type: "email", autocomplete: "email", inputmode: "email", required: true, placeholder: "you@yourcompany.com", "aria-label": "Your work e-mail" });
  const consent = el("input", { id: "si-consent", type: "checkbox" });
  const terms = ctx.termsUrl || "#";
  const form = el("form", { class: "zform", novalidate: true },
    el("div", { class: "field" }, el("label", { for: "si-email", text: "Your work e-mail" }), email),
    el("label", { class: "opt" }, consent, el("span", { class: "t" }, el("b", { text: "I agree to the Terms of Use and the Privacy Policy." }), el("span", { text: "We send one code to this address. No password." }))),
    el("p", { class: "hintline" }, el("a", { href: terms, target: "_blank", rel: "noopener" }, "Read the Terms and the Privacy Policy")),
    button("Send me a code", { main: true }));
  form.lastChild.type = "submit";
  const codeBox = el("input", { id: "si-code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6", pattern: "[0-9]{6}", "aria-label": "The 6-digit code" });
  const codeForm = el("form", { class: "zform hide", novalidate: true },
    el("div", { class: "field" }, el("label", { for: "si-code", text: "The 6-digit code from your e-mail" }), codeBox),
    button("Sign me in", { main: true }),
    button("Use a different e-mail", { sm: true, onclick: () => { codeForm.classList.add("hide"); form.classList.remove("hide"); say(""); email.focus(); } }),
    el("p", { class: "hintline", text: "You can also open the link in the same e-mail and press the button there." }));
  codeForm.querySelector(".btn.main").type = "submit";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!consent.checked) return say("Please tick the box to continue.", true);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) return say("Please type a valid e-mail address.", true);
    say("Sending…");
    const r = await api.auth.request(email.value.trim(), true);
    if (!r.ok) return say(r.json?.message || "We could not send the code. Please try again.", true);
    say(""); form.classList.add("hide"); codeForm.classList.remove("hide"); codeBox.focus();
    outlet.querySelector("#si-sent").textContent = `A code is on its way to ${email.value.trim()}. It works for 10 minutes.`;
  });
  codeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await api.auth.verify(email.value.trim(), codeBox.value.trim());
    if (!r.ok) return say(r.json?.message || "That code is not right. Please try again.", true);
    await onSignedIn();
  });

  clear(outlet);
  outlet.append(el("div", { class: "wrap" }, el("div", { class: "page signin" }, el("h1", { text: "Sign in" }), el("p", { class: "lead", text: "Use your work e-mail. We send you a code. There is no password to remember." }), el("p", { id: "si-sent", class: "hintline", role: "status" }), msg, form, codeForm)));
}
