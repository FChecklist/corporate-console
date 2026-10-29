// Create: one screen, one tile per game. A tile hands over to that game's own first step (the game makes the draft with its own defaults); there is no second wizard here.
// A game that is not built yet shows a quiet tile that sends the person to tell us they want it.
import { el, clear } from "../core/dom.js";
import { withColor, button, toast } from "./ui.js";
import { priceLine } from "../core/prices.js";
import { OPEN_FAILED } from "../core/errors.js";

const WORDS = {
  tambola: "Numbers are called, players mark their tickets.",
  bingo: "Numbers are called, players mark their cards.",
  tictactoe: "A knock-out tournament of quick matches.",
  snakesladders: "A board race: everyone throws and climbs.",
  luckbychance: "Quick rounds where luck picks the winner.",
  luckydraw: "A draw for gifts among your people.",
};
export const TELL_US = "https://home.corporatetambola.com/contact";

export async function renderCreate(outlet, ctx) {
  const { api, names, colors } = ctx;
  clear(outlet);
  const prices = {};
  const tiles = el("div", { class: "tiles" });
  outlet.append(el("div", { class: "wrap" }, el("div", { class: "page" }, el("h1", { text: "Create a new game" }), el("p", { class: "lead", text: "Choose a game. It opens in its own screen, with the date, size and prizes ready to fill in." }), tiles)));

  async function start(game, btn) {
    btn.disabled = true;
    const r = await api.startNew(game);
    btn.disabled = false;
    if (!r.ok) return toast(OPEN_FAILED);
    (ctx.go || ((u) => location.assign(u)))(r.url);
  }
  for (const g of ctx.games) {
    const title = names[g.id] || g.name;
    if (!g.ready) {
      tiles.append(withColor(el("article", { class: "tile soon", dataset: { game: g.id } }, el("div", { class: "gname", text: "Corporate" }), el("h3", { text: title }), el("p", { text: WORDS[g.id] || "" }), el("p", { class: "hintline", text: "Not ready yet." }), el("div", { class: "btns" }, el("a", { class: "btn sm", href: TELL_US, target: "_blank", rel: "noopener", text: "Tell us you want it" }))), colors[g.id] || "#0B3D91"));
      continue;
    }
    const price = el("p", { class: "hintline", dataset: { price: g.id } });
    const b = button("Start", { main: true, sm: true, label: `Start a new ${title} game` });
    b.addEventListener("click", () => start(g.id, b));
    prices[g.id] = price;
    tiles.append(withColor(el("article", { class: "tile", dataset: { game: g.id } }, el("div", { class: "gname", text: "Corporate" }), el("h3", { text: title }), el("p", { text: WORDS[g.id] || "" }), price, el("div", { class: "btns" }, b)), colors[g.id] || "#0B3D91"));
  }
  const caps = await api.capabilities().catch(() => []);
  for (const c of caps) if (c.ok && prices[c.game]) prices[c.game].textContent = priceLine(c.caps);
}
