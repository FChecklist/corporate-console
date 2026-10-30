// Create: one screen, one tile per game. A tile hands over to that game's own first step (the game makes the draft with its own defaults); there is no second wizard here.
// A game still in test mode shows "Opening soon"; a game that is not built shows "Coming soon". Neither has a button or a link (boss ruling 29 Oct 2026).
import { el, clear } from "../core/dom.js";
import { withColor, button, toast } from "./ui.js";
import { priceLine } from "../core/prices.js";
import { openError } from "../core/errors.js";

const WORDS = {
  tambola: "Numbers are called, players mark their tickets.",
  bingo: "Numbers are called, players mark their cards.",
  tictactoe: "A knock-out tournament of quick matches.",
  snakesladders: "A board race: everyone throws and climbs.",
  luckbychance: "Quick rounds where luck picks the winner.",
  luckydraw: "A draw for gifts among your people.",
};

export async function renderCreate(outlet, ctx) {
  const { api, names, colors } = ctx;
  clear(outlet);
  const prices = {};
  const tiles = el("div", { class: "tiles" });
  outlet.append(el("div", { class: "wrap" }, el("div", { class: "page" }, el("h1", { text: "Create a new game" }), el("p", { class: "lead", text: "Choose a game. It opens in its own screen, with the date, size and prizes ready to fill in." }), tiles)));

  async function start(game, btn, o = {}) {
    btn.disabled = true;
    let r;
    try { r = await api.startNew(game, o); } catch { r = { ok: false }; } finally { btn.disabled = false; }
    if (!r.ok) return toast(openError(r, (names[game] || "That game")));
    (ctx.go || ((u) => location.assign(u)))(r.url);
  }
  for (const g of ctx.games) {
    const title = names[g.id] || g.name;
    const status = g.status || (g.ready ? "live" : "planned");
    if (status !== "live") {
      tiles.append(withColor(el("article", { class: "tile soon", dataset: { game: g.id, status } }, el("h3", { text: title }), el("p", { text: WORDS[g.id] || "" }), el("p", { class: "soonword", text: status === "opening" ? "Opening soon" : "Coming soon" })), colors[g.id] || "#0B3D91"));
      continue;
    }
    const price = el("p", { class: "hintline", dataset: { price: g.id } });
    const b = button("Start", { main: true, sm: true, label: `Start a new ${title} game` });
    b.addEventListener("click", () => start(g.id, b));
    const free = button("Try a free game", { sm: true, label: `Try a free ${title} game for up to 10 people`, onclick: () => start(g.id, free, { free: true }) });
    prices[g.id] = price;
    tiles.append(withColor(el("article", { class: "tile", dataset: { game: g.id } }, el("h3", { text: title }), el("p", { text: WORDS[g.id] || "" }), price, el("div", { class: "btns" }, b, free)), colors[g.id] || "#0B3D91"));
  }
  const caps = await api.capabilities().catch(() => []);
  for (const c of caps) if (c.ok && prices[c.game]) prices[c.game].textContent = priceLine(c.caps);
}
