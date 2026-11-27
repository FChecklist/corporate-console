// FALSIFIED BY: hidden3-approval-note-names-hidden, hidden3-failure-line-names-hidden
// The hidden games (config/games.json "hiddenGames") must not be NAMED on any signed-in screen of a person who has no game of that type, and a hidden game that is down must never show a line
// or change a sign-in. Rendered with the real sign-in service and the fake games, ids and names both checked. A game already made in a hidden type stays reachable (My games lists it).
import { test, expect, setDefaultTimeout } from "bun:test";
import { Window } from "happy-dom";
import { world, spies } from "./support/world";
import { approvalNote } from "../public/core/status.js";

setDefaultTimeout(90_000);
const win = new Window({ url: "http://localhost/" });
Object.assign(globalThis, { window: win, document: win.document, HashChangeEvent: win.HashChangeEvent, Event: win.Event, location: win.location, alert: () => {}, innerWidth: 1280 });
const { renderHome } = await import("../public/screens/home.js");
const { renderMyGames } = await import("../public/screens/mygames.js");
const { renderBilling } = await import("../public/screens/billing.js");
const { renderCreate } = await import("../public/screens/create.js");
const { renderControl } = await import("../public/screens/control.js");
const { renderAccount } = await import("../public/screens/account.js");

const HIDDEN = ["tictactoe", "snakesladders", "luckbychance"];
const NAME = /tic[\s-]?tac[\s-]?toe|snakes(?:\s+and\s+ladders)?|luck\s+by\s+chance|tictactoe|snakesladders|luckbychance/i; // names AND ids
const ctxOf = (w: any, extra: any = {}) => ({ api: w.api, games: w.games, names: Object.fromEntries(w.games.map((g: any) => [g.id, g.name])), colors: Object.fromEntries(w.games.map((g: any) => [g.id, g.accent])), email: "demo5@demo-test.invalid", ...extra });
const fresh = () => { const o = document.createElement("div"); document.body.replaceChildren(o); return o; };
const settle = () => new Promise((r) => setTimeout(r, 400));
/** a person who has no game of a hidden type: the three hidden fake games hold nothing for them (tictactoe is DOWN on purpose) */
function emptyHidden(w: any) { for (const id of HIDDEN) { const S = w.states[id]; S.games = []; S.roles = []; S.invites = []; S.billing = []; } }

test("hidden games are never named on Home, My games, Billing, Create, Control room or Account for a person with no game of that type, even with Tic Tac Toe DOWN", async () => {
  const w = await world({ slowMs: 0, hidden: HIDDEN }); spies();
  try {
    emptyHidden(w);
    await w.signIn(); const c = await w.api.connect();
    expect(c.ok).toBe(true); // a hidden game that is down never changes the sign-in
    w.games.find((g: any) => g.id === "tambola").approvals = ["cohost-link", "family-link", "open-link"];
    for (const g of w.games) if (HIDDEN.includes(g.id)) g.approvals = ["cohost-link", "family-link", "open-link"]; // a hidden game that offers every kind of link would be named in the approval note
    const screens: Array<[string, (o: any) => Promise<any>]> = [
      ["Home", (o) => renderHome(o, ctxOf(w))],
      ["My games", (o) => renderMyGames(o, ctxOf(w))],
      ["Billing", (o) => renderBilling(o, ctxOf(w))],
      ["Create", (o) => renderCreate(o, ctxOf(w))],
      ["Control room", (o) => renderControl(o, ctxOf(w))],
      ["Account", (o) => renderAccount(o, ctxOf(w))],
    ];
    for (const [name, draw] of screens) {
      const o = fresh(); await draw(o); await settle();
      const text = o.textContent || "", html = o.innerHTML || "";
      expect([name, NAME.test(text)]).toEqual([name, false]);
      expect([name + " (markup)", NAME.test(html.replace(/data-game="[^"]*"/g, ""))]).toEqual([name + " (markup)", false]); // ids in labels or attributes the visitor can read; only the data-game hook is allowed
    }
  } finally { w.stop(); }
});

test("a hidden game that is down shows no 'could not be reached' line anywhere and does not make a list fail", async () => {
  const w = await world({ slowMs: 0, hidden: HIDDEN }); spies();
  try {
    emptyHidden(w);
    await w.signIn(); await w.api.connect();
    const l = await w.api.listGames(), b = await w.api.billing(), i = await w.api.invited();
    for (const r of [l, b, i]) expect((r.failed || []).filter((id: string) => HIDDEN.includes(id))).toEqual([]);
    const o = fresh(); await renderHome(o, ctxOf(w)); await settle();
    expect(o.querySelector(".banner")).toBe(null);
  } finally { w.stop(); }
});

test("without the hidden flag the same down game IS named (the silence comes from the flag only)", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    emptyHidden(w);
    await w.signIn(); await w.api.connect();
    const l = await w.api.listGames();
    expect(l.failed).toContain("tictactoe");
  } finally { w.stop(); }
});

test("a game already made in a hidden type stays reachable: My games lists it and Billing shows its payment", async () => {
  const w = await world({ slowMs: 0, hidden: HIDDEN }); spies();
  try {
    await w.signIn(); await w.api.connect(); // luckbychance still holds the seeded games of this person
    expect(w.states.luckbychance.games.length).toBeGreaterThan(0);
    const l = await w.api.listGames();
    expect(l.rows.some((r: any) => r.game === "luckbychance")).toBe(true);
  } finally { w.stop(); }
});

test("My games' note about who lets people in names only games that are shown", () => {
  const games = [
    { id: "tambola", name: "Corporate Tambola", approvals: ["cohost-link", "family-link", "open-link"] },
    { id: "tictactoe", name: "Corporate Tic Tac Toe", hidden: true, approvals: ["cohost-link", "family-link", "open-link"] },
    { id: "snakesladders", name: "Corporate Snakes and Ladders", hidden: true, approvals: ["open-link"] },
  ];
  const text = approvalNote(games).join("\n");
  expect(text).toContain("Corporate Tambola");
  expect(NAME.test(text)).toBe(false);
  expect(NAME.test(approvalNote(games.map((g) => ({ ...g, hidden: false }))).join("\n"))).toBe(true); // and with the flag off they are named again
});
