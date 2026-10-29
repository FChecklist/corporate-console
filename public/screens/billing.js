// Billing: three blocks across all games. "To pay" (a game that is published but not paid, with Pay and a link for the finance team), "Paid" (what, how much, when, who paid, the invoice),
// "Your credit". Money is shown per currency and never added across currencies. One sentence on refunds and one on who takes the payment, each once. The whole list can be downloaded as a CSV.
import { el, clear } from "../core/dom.js";
import { withColor, button, whenText, openGame, emptyNote, copyText, toast } from "./ui.js";
import { gamesFailedLine } from "../core/errors.js";

export const NO_REFUND = "No refunds. A cancelled paid game becomes credit for 365 days.";
export const PAYEE = "Payment is taken by IT Services by Rajat Agarwal through Razorpay. Invoices and receipts name IT Services by Rajat Agarwal as the seller.";
export const CREDIT_WORDS = "Credit is used automatically when you pay for a game: the payment step shows it and takes it off the price.";
const SYMBOL = { INR: "Rs ", USD: "US$ " };
const PAYER = { organizer: "you", host: "a Host", cohost: "a Co-host", link: "a finance link" };
export const money = (minor, currency) => (SYMBOL[currency] || currency + " ") + Math.round(minor / 100).toLocaleString("en-IN");
const dayText = (ms) => new Date(ms).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
/** the number printed on an invoice link: the last 8 letters of its id */
export const invoiceNo = (path) => "inv_" + String(path || "").slice(-8);

const csvCell = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
/** the paid list as a CSV text for the finance team (game, date, what, amount, currency, paid by, invoice number) */
export function billingCsv(rows, names = {}) {
  const head = ["Game", "Game name", "Date", "What", "Amount", "Currency", "Status", "Paid by", "Invoice"];
  const lines = rows.map((r) => [names[r.game] || r.game, r.gameName, new Date(r.tsMs).toISOString().slice(0, 10), r.what, (r.amountMinor / 100).toFixed(2), r.currency, r.status, PAYER[r.paidBy] || r.paidBy, r.invoice ? invoiceNo(r.invoice) : ""]);
  return [head, ...lines].map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
export function downloadCsv(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = name;
  document.body.append(a); a.click(); a.remove();
}

export async function renderBilling(outlet, ctx) {
  const { api, names, colors } = ctx;
  clear(outlet);
  const body = el("div", { id: "bill-body" }, el("p", { class: "hintline", text: "One moment." }));
  outlet.append(el("div", { class: "wrap" }, el("div", { class: "page" }, el("h1", { text: "Billing" }), el("p", { class: "lead", text: NO_REFUND }), el("p", { class: "hintline", id: "bill-payee", text: PAYEE }), body)));
  const [games, bill] = await Promise.all([api.listGames(), api.billing()]);
  clear(body);
  const failed = [...new Set([...games.failed, ...bill.failed])];
  if (failed.length) body.append(el("p", { class: "banner", role: "status", text: gamesFailedLine(failed.map((id) => names[id] || id)) }));

  const toPay = games.rows.filter((g) => g.status === "waiting_payment" && g.role === "organizer"); // only the organizer pays; a helper is never asked
  body.append(el("h2", { class: "sechead", text: "To pay" }));
  if (!toPay.length) body.append(emptyNote("Nothing to pay.", "A game that waits for payment shows here."));
  else body.append(el("ul", { class: "list", id: "bill-topay" }, toPay.map((g) => withColor(el("li", { dataset: { game: g.game, eid: g.eid } }, el("div", { class: "what" }, el("b", { text: g.name }), el("span", { text: `${names[g.game] || g.game} · ${whenText(g.startMs)}` })),
    el("div", { class: "btns" }, button("Pay", { main: true, sm: true, label: `Pay for ${g.name}`, onclick: () => openGame(ctx, g, "pay") }),
      button("Copy link for finance", { sm: true, label: `Copy a payment link for ${g.name} to send to your finance team`, onclick: async () => {
        const r = await api.payLink(g.game, g.eid);
        if (!r.ok) return toast("We could not make the link just now. Please try again.");
        await copyText(r.url, ctx); toast("Link copied. Whoever opens it can pay for this game. It works for 7 days.");
      } }))), colors[g.game] || "#0B3D91"))));

  const paid = bill.rows.filter((r) => r.status === "paid");
  body.append(el("h2", { class: "sechead", text: "Paid" }));
  if (!paid.length) body.append(emptyNote("No payments yet.", "Your receipts and invoices will show here."));
  else {
    body.append(el("ul", { class: "list", id: "bill-paid" }, paid.map((r) => {
      const origin = api.byId[r.game]?.origin;
      const good = r.invoice && origin && /^\/api\/invoice\/inv_[0-9a-f]{32}$/.test(r.invoice);
      return el("li", { dataset: { game: r.game, eid: r.eid } },
        el("div", { class: "what" }, el("b", { text: r.gameName }), el("span", { text: `${names[r.game] || r.game} · ${dayText(r.tsMs)} · paid by ${PAYER[r.paidBy] || r.paidBy}${good ? " · " + invoiceNo(r.invoice) : ""}` })),
        el("span", { class: "amt", text: money(r.amountMinor, r.currency) }),
        good ? el("a", { class: "btn sm", href: origin + r.invoice, target: "_blank", rel: "noopener", "aria-label": `Download the invoice for ${r.gameName}`, text: "Download invoice" }) : null);
    })));
    body.append(el("p", {}, button("Download the list as CSV", { sm: true, onclick: () => downloadCsv("payments.csv", billingCsv(paid, names)) })));
  }

  body.append(el("h2", { class: "sechead", text: "Your credit" }));
  if (!bill.credits.length) body.append(emptyNote("No credit.", "Credit appears here when a paid game is cancelled."));
  else body.append(el("p", { class: "hintline", id: "bill-credit-words", text: CREDIT_WORDS }), el("ul", { class: "list", id: "bill-credit" }, bill.credits.map((c) => el("li", { dataset: { game: c.game } },
    el("div", { class: "what" }, el("b", { text: names[c.game] || c.game }), el("span", { text: `Valid until ${dayText(c.expiresMs)}` })),
    el("span", { class: "amt", text: money(c.balanceMinor, c.currency) }),
    el("a", { class: "btn sm", href: "#/create", text: "Use it for a new game" })))));
}
