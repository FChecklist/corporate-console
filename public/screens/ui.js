// Small building blocks shared by every screen in both designs. No inline styles (the page's policy forbids them): colours are set through custom properties.
import { el } from "../core/dom.js";

export const STATUS_TEXT = { draft: "Draft", waiting_payment: "Waiting for payment", ready: "Ready", playing: "Playing now", finished: "Finished", cancelled: "Cancelled", not_started: "Did not start" };
export const STATUS_CLASS = { draft: "draft", waiting_payment: "pay", ready: "ready", playing: "live", finished: "done", cancelled: "cancel", not_started: "nostart" };
export const ROLE_TEXT = { organizer: "Organizer", host: "Host", cohost: "Co-host", participant: "Participant" };

export const withColor = (node, color) => { node.style.setProperty("--c", color); return node; };
export const chip = (status) => el("span", { class: "chip " + STATUS_CLASS[status], text: STATUS_TEXT[status] });
export const roleChip = (role) => el("span", { class: "role", text: ROLE_TEXT[role] || role });
export const button = (text, o = {}) => el("button", { type: "button", class: "btn" + (o.main ? " main" : "") + (o.gold ? " gold" : "") + (o.sm ? " sm" : "") + (o.danger ? " danger" : ""), title: o.title, "aria-label": o.label, onclick: o.onclick, disabled: o.disabled }, text);
export const link = (text, href, cls = "btn sm") => el("a", { class: cls, href }, text);
export const emptyNote = (title, text) => el("div", { class: "calmempty" }, el("b", { text: title }), el("br"), text);

const IST = { timeZone: "Asia/Kolkata" };
/** "Fri 31 Oct, 4:00 pm IST" - one place so every screen writes a time the same way */
export function whenText(ms) {
  if (ms == null) return "Not scheduled yet";
  const d = new Date(ms), day = d.toLocaleDateString("en-GB", { ...IST, weekday: "short", day: "numeric", month: "short" });
  const t = d.toLocaleTimeString("en-US", { ...IST, hour: "numeric", minute: "2-digit" }).replace(" AM", " am").replace(" PM", " pm");
  return `${day}, ${t} IST`;
}
export const paidText = (g) => (g.payment.state === "paid" ? (g.payment.amountMinor != null ? "Paid" : "Paid") : g.payment.state === "free" ? "Free game" : g.payment.state === "waiting" ? "Waiting for payment" : g.payment.state === "credit" ? "Paid from credit" : "Not paid yet");

/** a calm message at the bottom of the screen for a few seconds (not an alert box) */
export function toast(text) {
  const t = el("div", { class: "toast", role: "status", text });
  document.body.append(t);
  setTimeout(() => t.remove(), 4500);
}
