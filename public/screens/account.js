// Account: your e-mail, Sign out, Sign out on every device, and Close my account (one tap and a Yes). No keys list, no ideas box, no AI boxes.
// Close my account asks EVERY game to forget the person first. If a game does not answer, it is named and nothing is deleted and the person stays signed in until it does.
import { el, clear } from "../core/dom.js";
import { button, confirmPanel, toast } from "./ui.js";

export const CLOSE_WORDS = "Close my account removes your e-mail from the console and from every game's helper lists. Invoices and legal records are kept for the time the law requires.";

export async function renderAccount(outlet, ctx) {
  const { api, names } = ctx;
  clear(outlet);
  const msg = el("p", { class: "signmsg", role: "status", "aria-live": "polite" });
  const box = el("div", { class: "box", id: "acct-close" });
  const signOut = async (everywhere) => {
    const r = await api.signOut({ everywhere });
    if (!r.ok) { msg.classList.add("bad"); msg.textContent = "We could not sign you out just now. Please try again."; return; } // never pretend
    ctx.onSignedOut && ctx.onSignedOut();
  };
  const close = async () => {
    if (!(await confirmPanel(box, "Close your account now? This cannot be undone.", "Yes, close it", "No"))) return;
    msg.textContent = "One moment."; msg.classList.remove("bad");
    const r = await api.closeAccount();
    if (!r.ok && r.error === "console") { msg.classList.add("bad"); msg.textContent = "We could not close the account just now. Nothing was changed. Please try again."; return; }
    if (r.ok) { ctx.onSignedOut && ctx.onSignedOut(); return; }
    msg.classList.add("bad");
    msg.textContent = r.failed && r.failed.length ? `${r.failed.map((id) => names[id] || id).join(", ")} did not answer. You are still signed in; please try again. (Games that did answer have already forgotten your e-mail.)` : "We could not close the account just now. Please try again.";
    toast("Your account is still open.");
  };
  box.append(el("h2", { text: "Close my account" }), el("p", { text: CLOSE_WORDS }), button("Close my account", { danger: true, onclick: close }));
  outlet.append(el("div", { class: "wrap" }, el("div", { class: "page" }, el("h1", { text: "Account" }), el("p", { class: "lead", id: "acct-email", text: ctx.email || "" }),
    el("div", { class: "account" },
      el("div", { class: "box" }, el("h2", { text: "Sign out" }), el("div", { class: "btns" }, button("Sign out", { main: true, onclick: () => signOut(false) }), button("Sign out on every device", { onclick: () => signOut(true) }))),
      box, msg))));
}
