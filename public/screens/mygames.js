// My games: ONE merged list of every game the person has, from all games. A card shows the game, the name, the Game ID, the time (India time), the people, ONE status pill with its plain banner, the person's role and who lets people in.
// One main button (Open). "Create one like this" on the person's own games, "Delete draft" on drafts (two taps), "See what players see" where the game can show it.
import { el, clear } from "../core/dom.js";
import { withColor, roleChip, button, whenText, emptyNote, toast, confirmPanel, openGame } from "./ui.js";
import { STATUSES, rowStatus, bannerFor, roleLine, rowActions, approvalNote } from "../core/status.js";
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
  outlet.append(el("div", { class: "wrap" }, el("div", { class: "page" }, el("h1", { text: "My games" }), el("p", { class: "lead", text: "Every game you organize, host or help with, in one list." }), el("p", { class: "hintline", id: "approval-note", text: approvalNote(ctx.games || []).join(" ") }), seg, body)));

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
    const id = r.ok && typeof r.json?.id === "string" && EID.test(r.json.id) && r.json.id !== g.eid ? r.json.id : null;
    if (id) await openGame(ctx, { game: g.game, eid: id, role: "organizer" }); else toast("The copy could not be made, so nothing was opened. Please try again."); // never open the original by mistake
  }
  async function answer(g, op) {
    const r = await api.answerInvitation(g.game, g.eid, g.roleId, op);
    if (!r.ok) return toast("That did not work. Please try again.");
    data = await api.listGames(); draw();
  }
  function card(g) {
    const btns = [], st = rowStatus(g);
    for (const a of rowActions(g, caps[g.game], st)) {
      if (a.id === "accept") btns.push(button("Accept", { main: true, sm: true, label: `Accept the invitation to ${g.name}`, onclick: () => answer(g, "accept") }));
      else if (a.id === "decline") btns.push(button("Decline", { sm: true, label: `Decline the invitation to ${g.name}`, onclick: () => answer(g, "decline") }));
      else if (a.id === "open-in-game") btns.push(el("span", { class: "hintline", text: "Open the game itself to answer this invitation." }));
      else if (a.id === "open") btns.push(button(a.label, { main: true, sm: true, label: `Open ${g.name}`, onclick: () => openGame(ctx, g) }));
      else if (a.id === "publish" || a.id === "pay") btns.push(button(a.label, { sm: true, label: `${a.label}: ${g.name}`, onclick: () => openGame(ctx, g, a.target) }));
      else if (a.id === "preview") btns.push(el("a", { class: "btn sm", href: `#/view/${g.game}/${g.eid}`, text: a.label }));
      else if (a.id === "copy") btns.push(button(a.label, { sm: true, label: `Make a copy of ${g.name}`, onclick: () => copyOf(g) }));
      else if (a.id === "delete-draft") btns.push(button(a.label, { sm: true, danger: true, label: `Delete the draft ${g.name}`, onclick: () => removeDraft(g, c) }));
    }
    const c = withColor(el("article", { class: "gcard", dataset: { game: g.game, eid: g.eid } },
      el("div", { class: "gname", text: names[g.game] || g.game }), el("h3", { text: g.name }),
      el("div", { class: "chips" }, roleChip(g.role), g.nextAction === "accept" ? el("span", { class: "chip ready", text: "Invitation" }) : el("span", { class: "chip " + STATUSES[st].cls, dataset: { status: st }, text: STATUSES[st].label })),
      el("p", { class: "gid", text: "Game ID " + g.eid }),
      g.nextAction === "accept" ? null : el("p", { class: "banner2", dataset: { banner: st }, text: bannerFor(st, g, whenText(g.startMs)) }),
      el("ul", { class: "facts" }, el("li", { text: whenText(g.startMs) }), el("li", { text: `up to ${g.cap} people${Number.isInteger(g.joined) ? `, ${g.joined} joined` : ""}${Number.isInteger(g.yourLimit) ? `, you can add up to ${g.yourLimit}` : ""}` })),
      g.role !== "organizer" && g.invitedBy ? el("p", { class: "by", text: `Invited by ${g.invitedBy}` }) : null,
      el("p", { class: "who", dataset: { who: g.role }, text: roleLine(g.role, (ctx.games || []).find((x) => x.id === g.game)) }),
      el("div", { class: "btns" }, btns)), colors[g.game] || "#0B3D91");
    return c;
  }
  function draw() {
    clear(body);
    if (data.failed.length) body.append(el("p", { class: "banner", role: "status", text: gamesFailedLine(data.failed.map((id) => names[id] || id)) }));
    const rows = filterGames(data.rows, filter);
    if (!data.rows.length && data.failed.length) body.append(emptyNote("The system could not reach your games just now.", "Nothing is lost. Please try again."), button("Try again", { main: true, onclick: () => load() })); // never "No games yet" when the games simply did not answer
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
