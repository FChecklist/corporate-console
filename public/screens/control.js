// Control room: ONE place for an Organizer or Host to see every game of theirs that is running or about to run, in all six games, and press Start, Pause or Resume.
// What a card offers comes from what the game declares (public/core/features.js, from its manifest). A Co-host or participant is never shown here and never gets a button.
// The console keeps no log: the game does the move, checks the role and logs it by role (docs/CONTROL_CONTRACT.md).
import { el, clear } from "../core/dom.js";
import { withColor, roleChip, button, whenText, emptyNote, toast, openGame, copyText } from "./ui.js";
import { STATUSES, rowStatus as baseStatus } from "../core/status.js";
import { has, canPause, canStart } from "../core/features.js";
import { gamesFailedLine } from "../core/errors.js";
import { mergeGames } from "../core/merge.js";

/** a playing game that the game says is paused: the console keeps its seven status words and shows Paused as its own pill */
const isPaused = (g, now = Date.now()) => g.paused === true && baseStatus(g, now) === "live";
const rowStatus = (g, now = Date.now()) => (isPaused(g, now) ? "paused" : baseStatus(g, now));
const MINE = new Set(["organizer", "host"]);
const SHOWN = new Set(["live", "paused", "paid", "free", "pending", "overdue", "completed"]);
export const REPORT_WORDS = { waiting: "The report is being prepared and goes to every Organizer and Host.", sent: "The report was e-mailed to every Organizer and Host.", held: "The report e-mail did not reach somebody. The system will try again by itself." };
const ERROR_WORDS = { role: "Only an Organizer or a Host can do that.", state: "The game is not in a state for that just now. Please look again.", unreachable: "The game is slow, try again.", "no-key": "Please sign in again.", "not-on-console": "That game is not open on the console yet." };

/** the games a person controls, in three groups: running now, starting soon, finished (for the report line) */
export function controlGroups(rows, now = Date.now()) {
  const mine = rows.filter((g) => MINE.has(g.role) && g.nextAction !== "accept" && g.erased !== true && SHOWN.has(rowStatus(g, now)));
  const running = mine.filter((g) => ["live", "paused"].includes(rowStatus(g, now)));
  const soon = mine.filter((g) => ["paid", "free", "pending", "overdue"].includes(rowStatus(g, now))).sort((a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity));
  const done = mine.filter((g) => rowStatus(g, now) === "completed");
  return { running, soon, done };
}

export async function renderControl(outlet, ctx) {
  const { api, names, colors } = ctx;
  let data = null;
  clear(outlet);
  const body = el("div", { id: "cr-body" }, el("p", { class: "hintline", text: "One moment." }));
  outlet.append(el("div", { class: "wrap" }, el("div", { class: "page" }, el("h1", { text: "Control room" }), el("p", { class: "lead", text: "Every game of yours that is playing or about to play, in one place. Only an Organizer or a Host can start, pause or resume a game." }), body)));
  const desc = (id) => (ctx.games || []).find((x) => x.id === id);

  async function press(g, op, btn) {
    btn.disabled = true;
    let r; try { r = await api.control(g.game, g.eid, op); } catch { r = { ok: false, error: "unreachable" }; } finally { btn.disabled = false; }
    if (!r.ok) return toast(ERROR_WORDS[r.error] || "That did not work. Please try again.");
    if (op === "pause") g.paused = true; else if (op === "resume") g.paused = false; else { g.status = "playing"; g.paused = false; }
    draw();
    toast(op === "pause" ? "Paused. Players see Paused." : op === "resume" ? "Resumed." : "Started.");
  }
  function card(g) {
    const st = rowStatus(g), d = desc(g.game), btns = [];
    if (canPause(d, g.role) && st === "live") btns.push(button("Pause", { main: true, label: `Pause ${g.name}`, onclick: (e) => press(g, "pause", e.currentTarget) }));
    if (canPause(d, g.role) && st === "paused") btns.push(button("Resume", { main: true, label: `Resume ${g.name}`, onclick: (e) => press(g, "resume", e.currentTarget) }));
    if (canStart(d, g.role) && (st === "paid" || st === "free") && String(g.startMode || "").startsWith("manual")) btns.push(button("Start now", { gold: true, label: `Start ${g.name} now`, onclick: (e) => press(g, "start", e.currentTarget) }));
    btns.push(button("Open", { label: `Open ${g.name}`, onclick: () => openGame(ctx, g) }));
    if (typeof g.joinUrl === "string" && /^https:\/\//.test(g.joinUrl)) btns.push(button("Copy link", { label: `Copy the join link of ${g.name}`, onclick: async () => toast((await copyText(g.joinUrl, ctx)) ? "Link copied." : "Copy the link from the box.") }));
    const report = st === "completed" && has(d, "report") ? el("p", { class: "banner2", dataset: { report: g.reportStatus || "waiting" }, text: REPORT_WORDS[g.reportStatus] || REPORT_WORDS.waiting }) : null;
    return withColor(el("article", { class: "gcard", dataset: { game: g.game, eid: g.eid, status: st } },
      el("div", { class: "gname", text: names[g.game] || g.game }), el("h3", { text: g.name }),
      el("div", { class: "chips" }, roleChip(g.role), st === "paused" ? el("span", { class: "pausedpill", dataset: { status: st }, text: "Paused" }) : el("span", { class: "chip " + STATUSES[st].cls, dataset: { status: st }, text: STATUSES[st].label })),
      el("p", { class: "gid", text: "Game ID " + g.eid }),
      el("ul", { class: "facts" }, el("li", { text: whenText(g.startMs) }), el("li", { text: `up to ${g.cap} people${Number.isInteger(g.joined) ? `, ${g.joined} joined` : ""}` })),
      report, el("div", { class: "btns" }, btns)), colors[g.game] || "#0B3D91");
  }
  const group = (title, rows) => (rows.length ? el("section", { class: "strip" }, el("h2", { text: title }), el("div", { class: "gcards" }, rows.map(card))) : null);
  function draw() {
    clear(body);
    if (data.failed.length) body.append(el("p", { class: "banner", role: "status", text: gamesFailedLine(data.failed.map((id) => names[id] || id)) }));
    const { running, soon, done } = controlGroups(data.rows);
    if (!running.length && !soon.length && !done.length) body.append(emptyNote("Nothing to control right now.", "A game appears here once you are its Organizer or a Host and it is published."));
    for (const s of [group("Running now", running), group("Starting soon", soon), group("Finished", done)]) if (s) body.append(s);
  }
  const parts = [];
  data = await api.listGames({ onGame: (r) => { parts.push(r); data = mergeGames(parts); draw(); } });
  draw();
}
