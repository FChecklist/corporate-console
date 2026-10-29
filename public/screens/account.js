// Account: your e-mail, Sign out, Sign out on every device, what we keep and for how long, the legal pages, and Close my account (one tap and a Yes). No keys list, no ideas box, no AI boxes.
// Close my account asks EVERY game to forget the person first. If a game does not answer, it is named, the person stays signed in, and the screen says that games which did answer have already forgotten the e-mail.
import { el, clear } from "../core/dom.js";
import { button, confirmPanel, toast } from "./ui.js";
import { billingCsv, downloadCsv, money } from "./billing.js";

export const CLOSE_WORDS = "Close my account removes your e-mail from the console and from the Host and Co-host lists of every game. It does not cancel or delete the games you made, and it does not touch invoices: those stay for the time the law requires.";

/** one plain table: what is kept, and for how long (only the periods the owner has decided; each game states its exact player-data timing on its own pages) */
export const KEPT = [
  ["Your sign-in e-mail (console)", "Until 365 days after you last signed in or took part in a game, then deleted."],
  ["Players' personal data in a game", "Erased after the game. Each game states the exact time on its own pages."],
  ["Winners and the game log (seat numbers only)", "365 days."],
  ["Invoices and legal records", "For the time the law requires. They are not deleted when you close the account."],
];
/** the legal pages the console links to (they live on the Tambola site until the console has its own) */
export const LEGAL = [["Terms of Use", "/terms.html"], ["Privacy Policy", "/privacy.html"], ["Data Processing Agreement", "/dpa.html"]];

/** what Close my account would leave behind, from the person's own games and billing: paid games still to come, and credit */
export function warningsFor(games, billing, names = {}) {
  const out = [];
  const paidSoon = games.filter((g) => g.role === "organizer" && g.payment && ["paid", "credit"].includes(g.payment.state) && ["ready", "playing"].includes(g.status));
  if (paidSoon.length) out.push(`You have ${paidSoon.length} paid game${paidSoon.length === 1 ? "" : "s"} still to come. Closing the account does not cancel ${paidSoon.length === 1 ? "it" : "them"}.`);
  const credit = (billing.credits || []).map((c) => `${money(c.balanceMinor, c.currency)} in ${names[c.game] || c.game}`);
  if (credit.length) out.push(`You have credit: ${credit.join(", ")}. It stays with the game's own account; this screen cannot use it afterwards.`);
  return out;
}

export async function renderAccount(outlet, ctx) {
  const { api, names } = ctx;
  clear(outlet);
  const msg = el("p", { class: "signmsg", role: "status", "aria-live": "polite" });
  const box = el("div", { class: "box", id: "acct-close" });
  const signOut = async (everywhere) => {
    const r = await api.signOut({ everywhere });
    if (!r.ok) { msg.classList.add("bad"); msg.textContent = "The system could not sign you out just now. Please try again."; return; } // never pretend
    ctx.onSignedOut && ctx.onSignedOut();
  };
  const warn = el("div", { id: "acct-warn" });
  let paidRows = [];
  const close = async () => {
    if (!(await confirmPanel(box, "Close your account now? This cannot be undone.", "Yes, close it", "No"))) return;
    msg.textContent = "One moment."; msg.classList.remove("bad");
    const r = await api.closeAccount();
    if (!r.ok && r.error === "console") { msg.classList.add("bad"); msg.textContent = "The system could not close the account just now. Nothing was changed. Please try again."; return; }
    if (r.ok) { ctx.onSignedOut && ctx.onSignedOut(); return; }
    msg.classList.add("bad");
    msg.textContent = r.failed && r.failed.length ? `${r.failed.map((id) => names[id] || id).join(", ")} did not answer. You are still signed in; please try again. (Games that did answer have already forgotten your e-mail.)` : "The system could not close the account just now. Please try again.";
    toast("Your account is still open.");
  };
  box.append(el("h2", { text: "Close my account" }), el("p", { text: CLOSE_WORDS }), warn,
    el("div", { class: "btns" }, button("Download my payments first (CSV)", { sm: true, onclick: () => downloadCsv("payments.csv", billingCsv(paidRows, names)) }), button("Close my account", { danger: true, onclick: close })));
  outlet.append(el("div", { class: "wrap" }, el("div", { class: "page" }, el("h1", { text: "Account" }), el("p", { class: "lead", id: "acct-email", text: ctx.email || "" }),
    el("div", { class: "account" },
      el("div", { class: "box" }, el("h2", { text: "Sign out" }), el("div", { class: "btns" }, button("Sign out", { main: true, onclick: () => signOut(false) }), button("Sign out on every device", { onclick: () => signOut(true) }))),
      el("div", { class: "box", id: "acct-kept" }, el("h2", { text: "What the system keeps, and for how long" }), el("dl", { class: "kept" }, KEPT.flatMap(([k, v]) => [el("dt", { text: k }), el("dd", { text: v })]))),
      el("div", { class: "box", id: "acct-legal" }, el("h2", { text: "Legal" }), el("div", { class: "btns" }, LEGAL.map(([t, path]) => el("a", { class: "btn sm", href: (ctx.games?.[0]?.origin || "") + path, target: "_blank", rel: "noopener", text: t })))),
      box, msg))));
  // what closing would leave behind: filled in as soon as the games answer
  try {
    const [g, b] = await Promise.all([api.listGames(), api.billing()]);
    paidRows = b.rows.filter((r) => r.status === "paid");
    for (const w of warningsFor(g.rows, b, names)) warn.append(el("p", { class: "banner", text: w }));
  } catch { /* the warnings are a help, never a gate */ }
}
