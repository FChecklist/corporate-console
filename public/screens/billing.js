// Billing: three blocks across all games. "To pay" (a published game that is not paid yet, with a Pay button that opens the game's own payment step),
// "Paid" (what, how much, when, and the invoice), "Your credit". Money is shown per currency and never added across currencies. One sentence on refunds, once.
import { el, clear } from "../core/dom.js";
import { withColor, button, whenText, openGame, emptyNote } from "./ui.js";
import { gamesFailedLine } from "../core/errors.js";

export const NO_REFUND = "No refunds. A cancelled paid game becomes credit for 365 days.";
const SYMBOL = { INR: "Rs ", USD: "US$ " };
export const money = (minor, currency) => (SYMBOL[currency] || currency + " ") + Math.round(minor / 100).toLocaleString("en-IN");
const dayText = (ms) => new Date(ms).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

export async function renderBilling(outlet, ctx) {
  const { api, names, colors } = ctx;
  clear(outlet);
  const body = el("div", { id: "bill-body" }, el("p", { class: "hintline", text: "One moment." }));
  outlet.append(el("div", { class: "wrap" }, el("div", { class: "page" }, el("h1", { text: "Billing" }), el("p", { class: "lead", text: NO_REFUND }), body)));
  const [games, bill] = await Promise.all([api.listGames(), api.billing()]);
  clear(body);
  const failed = [...new Set([...games.failed, ...bill.failed])];
  if (failed.length) body.append(el("p", { class: "banner", role: "status", text: gamesFailedLine(failed.map((id) => names[id] || id)) }));

  const toPay = games.rows.filter((g) => g.status === "waiting_payment" && g.role !== "cohost");
  body.append(el("h2", { class: "sechead", text: "To pay" }));
  if (!toPay.length) body.append(emptyNote("Nothing to pay.", "A game that waits for payment shows here."));
  else body.append(el("ul", { class: "list", id: "bill-topay" }, toPay.map((g) => withColor(el("li", { dataset: { game: g.game, eid: g.eid } }, el("div", { class: "what" }, el("b", { text: g.name }), el("span", { text: `${names[g.game] || g.game} · ${whenText(g.startMs)}` })), button("Pay", { main: true, sm: true, onclick: () => openGame(ctx, g, g.role === "organizer" ? "organizer" : "host") })), colors[g.game] || "#0B3D91"))));

  const paid = bill.rows.filter((r) => r.status === "paid");
  body.append(el("h2", { class: "sechead", text: "Paid" }));
  if (!paid.length) body.append(emptyNote("No payments yet.", "Your receipts and invoices will show here."));
  else body.append(el("ul", { class: "list", id: "bill-paid" }, paid.map((r) => {
    const origin = api.byId[r.game]?.origin;
    return el("li", { dataset: { game: r.game, eid: r.eid } },
      el("div", { class: "what" }, el("b", { text: r.gameName }), el("span", { text: `${names[r.game] || r.game} · ${dayText(r.tsMs)}` })),
      el("span", { class: "amt", text: money(r.amountMinor, r.currency) }),
      r.invoice && origin ? el("a", { class: "btn sm", href: origin + r.invoice, target: "_blank", rel: "noopener", text: "Download invoice" }) : null);
  })));

  body.append(el("h2", { class: "sechead", text: "Your credit" }));
  if (!bill.credits.length) body.append(emptyNote("No credit.", "Credit appears here when a paid game is cancelled."));
  else body.append(el("ul", { class: "list", id: "bill-credit" }, bill.credits.map((c) => el("li", { dataset: { game: c.game } },
    el("div", { class: "what" }, el("b", { text: names[c.game] || c.game }), el("span", { text: `Valid until ${dayText(c.expiresMs)}` })),
    el("span", { class: "amt", text: money(c.balanceMinor, c.currency) })))));
}
