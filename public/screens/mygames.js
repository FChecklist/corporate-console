// My games: ONE merged list of every game the person has, from all games. A card shows the game, the name, the time (India time), the people, ONE status word and the person's role.
// One main button (Open). "Create one like this" on the person's own games, "Delete draft" on drafts (two taps), "See what players see" where the game can show it.
import { el, clear } from "../core/dom.js";
import { withColor, chip, roleChip, button, whenText, emptyNote, toast, confirmPanel, openGame } from "./ui.js";
import { gamesFailedLine } from "../core/errors.js";
import { mergeGames } from "../core/merge.js";

export const FILTERS = [["all", "All"], ["coming", "Coming up"], ["finished", "Finished"]];
const OVER = new Set(["finished", "cancelled", "not_started"]);
/** the filter the person chose -> the games to show, in the order the console keeps (attention, playing, soonest first) */
export const filterGames = (rows, filter) => rows.filter((g) => (filter === "coming" ? !OVER.has(g.status) : filter === "finished" ? OVER.has(g.status) : true));

export async function renderMyGames(outlet, ctx) {
  const { api, names, colors } = ctx;
  let filter = "all", data = null, caps = {};
  clear(outlet);
  const body = el("div", { id: "mg-body" }, el("p", { class: "hintline", text: "One moment." }));
  const seg = el("div", { class: "seg", role: "radiogroup", "aria-label": "Show" }, FILTERS.map(([v, t]) => el("label", {}, el("input", { type: "radio", name: "mf", value: v, checked: v === filter, onchange: () => { filter = v; draw(); } }), el("span", { text: t }))));
  outlet.append(el("div", { class: "wrap" }, el("div", { class: "page" }, el("h1", { text: "My games" }), el("p", { class: "lead", text: "Every game you organize, host or help with, in one list." }), seg, body)));

  const EID = /^[A-Za-z0-9_-]{4,40}$/;
  async function removeDraft(g, card) {
    if (!EID.test(g.eid)) return;
    if (!(await confirmPanel(card, "Delete this draft? This cannot be undone.", "Yes, delete", "No"))) return;
    const h = await api.headersFor(g.game, g.eid, "draft-delete");
    if (!h) return toast("Please sign in again.");
    const r = await api.call(`${api.byId[g.game].origin}/api/z/${g.eid}/discard`, { method: "POST", headers: h, body: "{}" });
    if (r.ok) { data.rows = data.rows.filter((x) => !(x.game === g.game && x.eid === g.eid)); draw(); } else toast("That draft could not be deleted. Please try again.");
  }
  async function copyOf(g) {
    if (!EID.test(g.eid)) return;
    const h = await api.headersFor(g.game, g.eid);
    if (!h) return toast("Please sign in again.");
    const r = await api.call(`${api.byId[g.game].origin}/api/z/${g.eid}/clone`, { method: "POST", headers: h, body: "{}" });
    if (r.ok) await openGame(ctx, { game: g.game, eid: r.json?.id || g.eid, role: "organizer" }); else toast("That game could not be copied. Please try again.");
  }
  async function answer(g, op) {
    const r = await api.answerInvitation(g.game, g.eid, g.roleId, op);
    if (!r.ok) return toast("That did not work. Please try again.");
    data = await api.listGames(); draw();
  }
  function card(g) {
    const btns = [];
    if (g.nextAction === "accept") {
      if (g.roleId) btns.push(button("Accept", { main: true, sm: true, label: `Accept the invitation to ${g.name}`, onclick: () => answer(g, "accept") }), button("Decline", { sm: true, label: `Decline the invitation to ${g.name}`, onclick: () => answer(g, "decline") }));
      else btns.push(el("span", { class: "hintline", text: "Open the game itself to answer this invitation." }));
    } else btns.push(button("Open", { main: true, sm: true, label: `Open ${g.name}`, onclick: () => openGame(ctx, g) }));
    if (caps[g.game]?.features?.preview && g.nextAction !== "accept") btns.push(el("a", { class: "btn sm", href: `#/view/${g.game}/${g.eid}`, text: "See what players see" }));
    if (g.role === "organizer") btns.push(button("Create one like this", { sm: true, label: `Create one like ${g.name}`, onclick: () => copyOf(g) }));
    if (g.status === "draft" && g.role === "organizer") btns.push(button("Delete draft", { sm: true, danger: true, label: `Delete the draft ${g.name}`, onclick: () => removeDraft(g, c) }));
    const c = withColor(el("article", { class: "gcard", dataset: { game: g.game, eid: g.eid } },
      el("div", { class: "gname", text: names[g.game] || g.game }), el("h3", { text: g.name }),
      el("div", { class: "chips" }, roleChip(g.role), g.nextAction === "accept" ? el("span", { class: "chip ready", text: "Invitation" }) : chip(g.status)),
      el("ul", { class: "facts" }, el("li", { text: whenText(g.startMs) }), el("li", { text: `up to ${g.cap} people` })),
      g.role !== "organizer" && g.invitedBy ? el("p", { class: "by", text: `Invited by ${g.invitedBy}` }) : null,
      el("div", { class: "btns" }, btns)), colors[g.game] || "#0B3D91");
    return c;
  }
  function draw() {
    clear(body);
    if (data.failed.length) body.append(el("p", { class: "banner", role: "status", text: gamesFailedLine(data.failed.map((id) => names[id] || id)) }));
    const rows = filterGames(data.rows, filter);
    if (!data.rows.length && data.failed.length) body.append(emptyNote("We could not reach your games just now.", "Nothing is lost. Please try again."), button("Try again", { main: true, onclick: () => load() })); // never "No games yet" when the games simply did not answer
    else if (!rows.length) body.append(emptyNote(data.rows.length ? "Nothing here." : "No games yet.", data.rows.length ? "Try another choice above." : `Press Create to start your first game. Waiting for an invitation? You are signed in as ${ctx.email || "this e-mail"}. A game shows here once its organizer has added exactly this e-mail address.`));
    else body.append(el("div", { class: "gcards" }, rows.map(card)));
  }
  async function load() {
    const parts = [];
    clear(body); body.append(el("p", { class: "hintline", text: "One moment." }));
    api.capabilities().then((c) => { caps = Object.fromEntries(c.filter((x) => x.ok).map((x) => [x.game, x.caps])); if (data) draw(); }).catch(() => {});
    // each game is drawn the moment it answers: a slow one never holds the others back
    data = await api.listGames({ onGame: (r) => { parts.push(r); data = mergeGames(parts); draw(); } });
    draw();
  }
  await load();
}
