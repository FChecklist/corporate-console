// Player's screen view: the game's real participant page, shown read-only inside a laptop frame or a phone frame, from the game's SAVED settings.
// The console only frames the address the game itself returns (the game checks the key); nothing here can change a game.
import { el, clear } from "../core/dom.js";
import { button, emptyNote } from "./ui.js";

export const PREVIEW_LABEL = "Preview only. This is not a game.";
export const SIZES = { laptop: { w: 1280, h: 800 }, phone: { w: 390, h: 780 } };

/** how much to shrink a frame so it fits the room (never bigger than life) */
export const scaleFor = (frameW, room) => Math.max(0.2, Math.min(1, room / frameW));

export async function renderPlayerView(outlet, ctx, game, eid) {
  const { api, names } = ctx;
  clear(outlet);
  let mode = ctx.designIsPhone ? "phone" : "laptop";
  const stage = el("div", { class: "pvstage" });
  const seg = el("div", { class: "seg", role: "radiogroup", "aria-label": "View" }, [["laptop", "Laptop view"], ["phone", "Mobile view"]].map(([v, t]) => el("label", {}, el("input", { type: "radio", name: "pv", value: v, checked: v === mode, onchange: () => { mode = v; draw(); } }), el("span", { text: t }))));
  outlet.append(el("div", { class: "wrap" }, el("div", { class: "page" }, el("h1", { text: "What players see" }), el("p", { class: "lead", text: names[game] || "" }),
    el("div", { class: "pvbar" }, seg, el("span", { class: "pvlabel", id: "pv-label", text: PREVIEW_LABEL }), el("a", { class: "btn sm", href: "#/mygames", text: "Back to My games" })), stage)));
  const caps = (await api.capabilities().catch(() => [])).find((c) => c.game === game);
  if (!game || !eid || !caps || !caps.ok || !caps.caps.features?.preview) { stage.append(emptyNote("This game cannot show that yet.", "Everything else works as usual.")); return; }
  const r = await api.preview(game, eid);
  if (!r.ok) { stage.append(emptyNote("We could not open the preview.", "Please go back and try again.")); return; }
  function draw() {
    clear(stage);
    const sz = SIZES[mode], room = Math.max(280, Math.min(typeof innerWidth === "number" ? innerWidth - 80 : sz.w, 1000));
    const box = el("div", { class: "pvbox " + mode }, el("iframe", { src: r.url, title: "What players see", sandbox: "allow-scripts allow-same-origin", referrerpolicy: "no-referrer", loading: "lazy" }));
    box.style.setProperty("--w", sz.w + "px"); box.style.setProperty("--h", sz.h + "px"); box.style.setProperty("--k", String(scaleFor(sz.w, room)));
    stage.append(box);
  }
  draw();
  void button;
}
