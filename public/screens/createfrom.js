// "Start from an earlier game?": lists the person's earlier games (any of the six), copies settings, start mode, prize plan, roles and look into a new draft (public/core/clone.js),
// and shows every step as "Copied from <game>" with Change, then Publish. People, time and results are never copied, and the console keeps no people list anywhere:
// the Organizer uploads or pastes the people again for each game (spec 410 section 2).
import { el, clear } from "../core/dom.js";
import { withColor, button, whenText, emptyNote, toast } from "./ui.js";
import { rowStatus, STATUSES } from "../core/status.js";
import { has } from "../core/features.js";
import { cloneFrom, COPY_PARTS } from "../core/clone.js";
import { openError, gamesFailedLine } from "../core/errors.js";
import { mergeGames } from "../core/merge.js";

/** the step number inside a game's own flow (1 Game, 2 People, 3 Time, 4 Prizes, 5 Brand and Breaks, 6 Check and publish) for each step name clone.js uses */
export const STEP_NUMBER = { "Who is this game for": 2, "Date and time": 3, "Tickets and prizes": 4, "Brand & Breaks": 5 };
export const NO_PEOPLE_LINE = "People are not copied. Upload or paste your people again for this game.";
export const NO_TIME_LINE = "The date and time are not copied. Choose them in the new game.";

/** earlier games that can be copied: the person's own (Organizer), from a game that declares copying, with their data not erased */
export function earlierGames(rows, games) {
  return rows.filter((g) => g.role === "organizer" && g.nextAction !== "accept" && g.erased !== true && g.status !== "cancelled" && has((games || []).find((x) => x.id === g.game), "clone"));
}
/** the review lines: one per step that can be copied, in the order of COPY_PARTS, each "Copied from <game>" or skipped */
export function reviewLines(result) {
  const seen = new Set(), out = [];
  for (const p of COPY_PARTS) {
    if (seen.has(p.step)) continue; seen.add(p.step);
    out.push(result.sources[p.step] ? { step: p.step, text: result.sources[p.step], copied: true } : { step: p.step, text: "Nothing copied. Fill it in the new game.", copied: false });
  }
  return out;
}

export async function renderCreateFrom(outlet, ctx) {
  const { api, names, colors } = ctx;
  let data = null, chosen = null;
  clear(outlet);
  const body = el("div", { id: "cf-body" }, el("p", { class: "hintline", text: "One moment." }));
  outlet.append(el("div", { class: "wrap" }, el("div", { class: "page" }, el("h1", { text: "Start from an earlier game" }), el("p", { class: "lead", text: "Pick an earlier game. Its settings, start mode, prizes, roles and look are copied into a new draft. " + NO_PEOPLE_LINE }), body)));
  const makeable = (ctx.games || []).filter((g) => (g.status || (g.ready ? "live" : "planned")) === "live" && has(g, "clone"));

  function pickList() {
    clear(body); chosen = null;
    if (data.failed.length) body.append(el("p", { class: "banner", role: "status", text: gamesFailedLine(data.failed.map((id) => names[id] || id)) }));
    const rows = earlierGames(data.rows, ctx.games);
    if (!rows.length) return body.append(emptyNote("No earlier game to copy.", "Your games appear here once you have organized one. You can always start a new game from Create."), el("a", { class: "btn main", href: "#/create", text: "Create a new game" }));
    body.append(el("div", { class: "gcards" }, rows.map((g) => {
      const st = rowStatus(g);
      return withColor(el("article", { class: "gcard", dataset: { game: g.game, eid: g.eid } }, el("div", { class: "gname", text: names[g.game] || g.game }), el("h3", { text: g.name }),
        el("div", { class: "chips" }, el("span", { class: "chip " + STATUSES[st].cls, text: STATUSES[st].label })), el("p", { class: "gid", text: "Game ID " + g.eid }),
        el("div", { class: "btns" }, button("Use this game", { main: true, label: `Start from ${g.name}`, onclick: () => choose(g) }))), colors[g.game] || "#0B3D91");
    })));
  }
  async function choose(g) {
    clear(body); body.append(el("p", { class: "hintline", text: "Reading the earlier game." }));
    const r = await api.earlier(g.game, g.eid);
    if (!r.ok) { toast(openError(r, names[g.game] || "That game")); return pickList(); }
    chosen = { g, old: { ...r.old, gameType: r.old?.gameType || g.game, gameName: r.old?.gameName || g.name } };
    pickTarget();
  }
  function pickTarget() {
    clear(body);
    const { g } = chosen;
    body.append(el("p", { class: "lead", text: `Copying from ${g.name}. Which game is the new one?` }));
    const list = el("div", { class: "gcards" }, makeable.map((t) => withColor(el("article", { class: "gcard", dataset: { target: t.id } }, el("div", { class: "gname", text: t.name }),
      el("div", { class: "btns" }, button(t.id === g.game ? "Same game" : "Make it in " + t.name, { main: t.id === g.game, label: `Make the new game in ${t.name}`, onclick: (e) => make(t, e.currentTarget) }))), colors[t.id] || "#0B3D91")));
    body.append(list, button("Back", { onclick: pickList }));
  }
  async function make(target, btn) {
    btn.disabled = true;
    const res = cloneFrom(chosen.old, { id: target.id, startModes: target.startModes });
    let r; try { r = await api.startFrom(target.id, res.copy, chosen.old.gameName); } catch { r = { ok: false }; } finally { btn.disabled = false; }
    if (!r.ok) return toast(openError(r, target.name));
    review(target, res, r.eid);
  }
  function review(target, res, eid) {
    clear(body);
    const go = async (to) => { const r = await api.handoff(target.id, { eid, target: to }); if (!r.ok) return toast(openError(r, target.name)); (ctx.go || ((u) => location.assign(u)))(r.url); };
    body.append(el("p", { class: "lead", text: `Your new ${target.name} draft is ready. Check each step.` }));
    body.append(el("ul", { class: "reviewlist" }, reviewLines(res).map((l) => el("li", { class: "reviewrow", dataset: { step: l.step, copied: String(l.copied) } },
      el("b", { text: l.step }), el("span", { text: l.text }),
      button("Change", { sm: true, label: `Change ${l.step}`, onclick: () => go("step-" + STEP_NUMBER[l.step]) })))));
    body.append(el("p", { class: "hintline", text: NO_PEOPLE_LINE + " " + NO_TIME_LINE }));
    body.append(el("div", { class: "btns" }, button("Publish", { gold: true, label: `Publish the new ${target.name} game`, onclick: () => go("publish") })));
  }
  const parts = [];
  data = await api.listGames({ onGame: (r) => { parts.push(r); data = mergeGames(parts); if (!chosen) pickList(); } });
  if (!chosen) pickList();
}
