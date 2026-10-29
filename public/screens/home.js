// Home: exactly three doors (Create a new game, My games, Billing) and no input anywhere. Under them two thin strips that appear only when they have something:
// "Needs your attention" (waiting for payment, an invitation, starting today) and "Playing now". Nothing else: no prices, no news, no tips.
import { el, clear } from "../core/dom.js";
import { withColor, button, whenText, openGame } from "./ui.js";
import { needsAttention, startsToday } from "../core/merge.js";
import { gamesFailedLine } from "../core/errors.js";

const ICON = {
  create: "M12 4v16M4 12h16",
  mine: "M4 5h16v14H4zM4 10h16M10 5v14",
  bill: "M3 7h18v10H3zM3 11h18M7 15h3",
};
const svg = (d) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.8"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("aria-hidden", "true"); const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); s.append(p); return s; };
const door = (href, icon, title, text, main) => el("a", { class: "door" + (main ? " main" : ""), href }, svg(icon), el("b", { text: title }), el("span", { text }));

/** the line a strip row shows under the game's name */
export const rowNote = (g, names) => `${names[g.game] || g.game} · ${whenText(g.startMs)}`;

export async function renderHome(outlet, ctx) {
  const { api, names, colors } = ctx;
  clear(outlet);
  const strips = el("div", { id: "home-strips" });
  outlet.append(el("div", { class: "wrap" }, el("div", { class: "page" },
    el("h1", { text: "What would you like to do?" }),
    el("div", { class: "doors" },
      door("#/create", ICON.create, "Create a new game", "Pick the game. It opens in its own screen.", true),
      door("#/mygames", ICON.mine, "My games", "Every game you organize, host or help with."),
      door("#/billing", ICON.bill, "Billing", "What to pay, what you paid, your credit.")),
    strips)));

  const l = await api.listGames();
  const attn = l.rows.filter((g) => needsAttention(g) || startsToday(g));
  const live = l.rows.filter((g) => g.status === "playing" && !attn.includes(g));
  clear(strips);
  if (l.failed.length) strips.append(el("p", { class: "banner", role: "status", text: gamesFailedLine(l.failed.map((id) => names[id] || id)) }));
  const row = (g, label, buttons) => withColor(el("div", { class: "row", dataset: { game: g.game, eid: g.eid } }, el("div", { class: "what" }, el("b", { text: g.name }), el("span", { text: `${label} · ${rowNote(g, names)}` })), el("div", { class: "btns" }, buttons)), colors[g.game] || "#0B3D91");
  async function answer(g, op, rowEl) {
    const r = await api.answerInvitation(g.game, g.eid, g.roleId, op);
    if (r.ok) rowEl.remove();
  }
  if (attn.length) {
    const sec = el("section", { class: "strip", "aria-labelledby": "h-attn" }, el("h2", { id: "h-attn", text: "Needs your attention" }));
    for (const g of attn) {
      const accept = g.nextAction === "accept";
      let rowEl;
      const btns = accept
        ? (g.roleId ? [button("Accept", { main: true, sm: true, onclick: () => answer(g, "accept", rowEl) }), button("Decline", { sm: true, onclick: () => answer(g, "decline", rowEl) })] : [])
        : [button(g.status === "waiting_payment" && g.role !== "cohost" ? "Pay" : "Open", { main: true, sm: true, onclick: () => openGame(ctx, g) })];
      rowEl = row(g, accept ? "Invitation" : g.status === "waiting_payment" ? "Waiting for payment" : "Starts today", btns);
      sec.append(rowEl);
    }
    strips.append(sec);
  }
  if (live.length) {
    const sec = el("section", { class: "strip", "aria-labelledby": "h-live" }, el("h2", { id: "h-live", text: "Playing now" }));
    for (const g of live) sec.append(row(g, "Playing now", [button("Open", { main: true, sm: true, onclick: () => openGame(ctx, g) })]));
    strips.append(sec);
  }
}
