// My games: one merged list from all six games. Needs-attention and Playing-now first, a card per game with role, status, time (IST), size, payment; Clone and Delete draft always visible.
import { el, clear } from "../core/dom.js";
import { withColor, chip, roleChip, button, whenText, paidText, emptyNote, toast } from "./ui.js";
import { needsAttention } from "../core/merge.js";
import { gamesFailedLine } from "../core/errors.js";

const FILTERS = [["all", "All"], ["organizer", "Organizer"], ["host", "Host"], ["cohost", "Co-host"]];

export function sectionsOf(rows, filter) {
  const L = rows.filter((g) => filter === "all" || g.role === filter);
  const attn = L.filter(needsAttention), live = L.filter((g) => g.status === "playing" && !needsAttention(g));
  const rest = L.filter((g) => !attn.includes(g) && !live.includes(g));
  const rank = { ready: 0, draft: 1, finished: 2, cancelled: 3, not_started: 4 };
  rest.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (a.startMs ?? Infinity) - (b.startMs ?? Infinity));
  return { attn, live, rest };
}

export async function renderMyGames(outlet, ctx) {
  const { api, names, colors } = ctx;
  let filter = "all", data = null;
  clear(outlet);
  const body = el("div", { id: "mg-body" }, el("p", { class: "hintline", text: "One moment." }));
  const seg = el("div", { class: "seg", role: "radiogroup", "aria-label": "Show" }, FILTERS.map(([v, t]) => el("label", {}, el("input", { type: "radio", name: "mf", value: v, checked: v === filter, onchange: () => { filter = v; draw(); } }), t)));
  outlet.append(el("div", { class: "wrap" }, el("div", { class: "page" }, el("h1", { text: "My games" }), el("p", { class: "lead", text: "Every game you organize, host or help with, across all six games." }), el("p", { class: "hintline", text: "Clone means: create a new game like this one." }), seg), body));

  async function act(g, what) {
    const h = await api.headersFor(g.game, null);
    if (!h) return;
    const origin = api.byId[g.game].origin;
    if (what === "delete") { const r = await api.call(`${origin}/api/z/${g.eid}/discard`, { method: "POST", headers: h, body: "{}" }); if (r.ok) { data.rows = data.rows.filter((x) => !(x.game === g.game && x.eid === g.eid)); draw(); } else toast(r.json?.error || "That draft could not be deleted."); }
    if (what === "clone") { const r = await api.call(`${origin}/api/z/${g.eid}/clone`, { method: "POST", headers: h, body: "{}" }); if (r.ok) location.hash = `#/game/${g.game}/${r.json?.id || g.eid}`; else toast(r.json?.error || "That game could not be copied."); }
  }
  function card(g) {
    const open = el("a", { class: "btn main sm", href: `#/game/${g.game}/${g.eid}`, text: g.nextAction === "accept" ? "Open invitation" : "Open" });
    const btns = [open];
    if (g.role === "organizer") btns.push(button("Clone", { sm: true, title: "Create a new game like this one", label: "Clone: create a new game like this one", onclick: () => act(g, "clone") }));
    if (g.status === "draft" && g.role === "organizer") btns.push(button("Delete draft", { sm: true, danger: true, onclick: () => act(g, "delete") }));
    return withColor(el("article", { class: "gcard" + (needsAttention(g) ? " attn" : ""), dataset: { game: g.game, eid: g.eid } },
      el("div", { class: "gname", text: names[g.game] || g.game }), el("h3", { text: g.name }),
      el("div", { class: "chips" }, roleChip(g.role), chip(g.status)),
      el("ul", { class: "facts" }, el("li", { text: whenText(g.startMs) }), el("li", { text: `up to ${g.cap} people` }), el("li", { text: paidText(g) })),
      g.role !== "organizer" && g.invitedBy ? el("p", { class: "by", text: `Invited by ${g.invitedBy}` }) : null,
      el("div", { class: "btns" }, btns)), colors[g.game] || "#0B3D91");
  }
  function section(h, s, list) { return list.length ? [el("h2", { class: "sechead", text: h }), el("p", { class: "secsub", text: s }), el("div", { class: "gcards" }, list.map(card))] : []; }
  function draw() {
    clear(body);
    const { attn, live, rest } = sectionsOf(data.rows, filter);
    if (data.failed.length) body.append(el("p", { class: "banner", role: "status", text: gamesFailedLine(data.failed.map((id) => names[id] || id)) }));
    const parts = [...section("Needs your attention", "Games waiting for your payment, and invitations to accept.", attn), ...section("Playing now", "These games are running at this moment.", live), ...section(attn.length || live.length ? "Your other games" : "Your games", "Coming up first, then drafts and finished games.", rest)];
    if (!parts.length) body.append(emptyNote("Nothing here yet.", `You are not ${filter === "organizer" ? "organizing" : filter === "host" ? "hosting" : filter === "cohost" ? "co-hosting" : "part of"} any game right now.`));
    else body.append(...parts);
  }
  data = await api.listGames();
  draw();
}
