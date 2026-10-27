// Home: exactly three doors (Create a new game, My games, Play as a participant) - no input anywhere - then what needs attention and what is playing now.
import { el, clear } from "../core/dom.js";
import { withColor, button, chip, whenText, emptyNote } from "./ui.js";
import { needsAttention } from "../core/merge.js";
import { gamesFailedLine } from "../core/errors.js";

const ICON = {
  create: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8 12h8",
  mine: "M5 6h14M5 12h14M5 18h14",
  play: "M8 5l11 7-11 7z",
};
const svg = (d) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.8"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true"); const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); s.append(p); return s; };
const tile = (href, icon, title, text, main) => el("a", { class: "tile" + (main ? " main" : ""), href }, svg(icon), el("b", { text: title }), el("span", { text }));

export async function renderHome(outlet, ctx) {
  const { api, names } = ctx;
  clear(outlet);
  const attn = el("div", { id: "home-attn" }, el("p", { class: "sec-s", text: "One moment." }));
  const side = el("aside", { class: "nowside" }, el("h2", { text: "Playing now" }), el("p", { class: "none", text: "One moment." }));
  outlet.append(
    el("section", { class: "hero" }, el("div", { class: "wrap" },
      el("div", {}, el("span", { class: "eyebrow", text: ctx.email ? `Welcome back, ${ctx.email}` : "Welcome" }), el("h1", {}, "Online games for your close corporate group, ", el("em", { text: "built around your company." })), el("p", { class: "sub", text: "Your employees, their families, customers, vendors and partners can all play together. You decide who joins." })),
      el("div", { class: "tiles3" }, tile("#/create", ICON.create, "Create a new game", "Pick the game, then six short steps.", true), tile("#/mygames", ICON.mine, "My games", "Every game you organize, host or help with."), tile("#/play", ICON.play, "Play as a participant", "Games an organizer invited you to.")))),
    el("div", { class: "after" }, el("section", {}, el("h2", { class: "sec-h", text: "Needs your attention" }), attn), side));

  const l = await api.listGames();
  const rows = l.rows, a = rows.filter(needsAttention), live = rows.filter((g) => g.status === "playing" && !needsAttention(g));
  clear(attn);
  if (l.failed.length) attn.append(el("p", { class: "banner", role: "status", text: gamesFailedLine(l.failed.map((id) => names[id] || id)) }));
  if (!a.length) attn.append(el("div", { class: "empty" }, el("b", { text: "Nothing needs you right now" }), "When a game waits for payment or an invitation arrives, it shows here."));
  for (const g of a) {
    const accept = g.nextAction === "accept";
    attn.append(withColor(el("div", { class: "arow" }, el("div", { class: "mk" }), el("div", {}, el("span", { class: "st", text: accept ? "Invitation" : "Waiting for payment" }), el("h3", { text: g.name }), el("p", { text: `${names[g.game] || g.game} · ${whenText(g.startMs)} · up to ${g.cap} people` })), el("div", { class: "btns" }, el("a", { class: "btn main sm", href: `#/game/${g.game}/${g.eid}`, text: accept ? "Open invitation" : "Open and pay" }))), accept ? "#0B3D91" : "#8A5A00"));
  }
  clear(side); side.append(el("h2", { text: "Playing now" }));
  if (!live.length) side.append(el("p", { class: "none", text: "No game is playing at this moment." }));
  for (const g of live) side.append(chip("playing"), el("h3", { text: g.name }), el("p", { text: `${names[g.game] || g.game} · ${whenText(g.startMs)} · up to ${g.cap} people` }), el("a", { class: "btn gold", href: `#/game/${g.game}/${g.eid}`, text: "Open" }));
  void emptyNote; void button;
}
