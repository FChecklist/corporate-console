// Screens that are built in later steps of the plan show an honest, calm placeholder (never a fake screen).
import { el, clear } from "../core/dom.js";

const TITLES = { create: "Create a new game", play: "Play as a participant", billing: "Billing", more: "More", account: "Account", versions: "Versions", game: "Game" };
export function renderSoon(outlet, ctx, route) {
  const first = route.split("/")[0];
  clear(outlet);
  outlet.append(el("div", { class: "wrap" }, el("div", { class: "page" }, el("h1", { text: TITLES[first] || ctx.names[first] || "This screen" }), el("p", { class: "lead", text: "This screen is being built and is not open yet." }), el("a", { class: "btn main", href: "#/home", text: "Back to Home" }))));
}
