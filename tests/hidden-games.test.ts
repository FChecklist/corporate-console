// FALSIFIED BY: hidden3-create-tile-shown, hidden3-switch-ignored-llms, hidden3-bar-not-trimmed, hidden3-starts-hidden-game
// Boss decision 27 Nov 2026: only Tambola, Bingo and Lucky Draw are shown. ONE switch, "hiddenGames" in config/games.json, decides it. Nothing is deleted:
// the hidden three stay in the config, the CSP and the API fan-out so a game that already exists stays reachable. "hiddenGames": [] shows all six again.
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync, readdirSync, statSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { build } from "../build.mjs";
import { hiddenIds, shownGames, hideInGamesBar, searchNamesText } from "../visible-games.mjs";
import { createApi } from "../public/core/api.js";

const root = join(import.meta.dir, "..");
const cfg = JSON.parse(readFileSync(join(root, "config/games.json"), "utf8"));
const HIDDEN = ["tictactoe", "snakesladders", "luckbychance"], SHOWN = ["tambola", "bingo", "luckydraw"];
const releases = JSON.parse(readFileSync(join(root, "releases.json"), "utf8"));
const mk = (config: any) => { const out = mkdtempSync(join(tmpdir(), "hide3-")); build({ env: "live", out, version: releases[0].version, commit: "0123456789ab", releasedAt: releases[0].releasedAt, config }); return out; };
const on = mk(cfg), off = mk({ ...cfg, hiddenGames: [] });
const files = (d: string, base = d): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? files(p, base) : [p.slice(base.length + 1).split("\\").join("/")]; });
const read = (d: string, f: string) => readFileSync(join(d, f), "utf8");
// words a visitor or a search engine would read as "this game is offered"
const NAMES = /Tic Tac Toe|Snakes and Ladders|Luck by Chance|\/\/tictactoe\.corporatetambola|\/\/snakes\.corporatetambola|\/\/luck\.corporatetambola/;
const ALLOWED_TO_KEEP = new Set(["_headers", "core/games.config.js", "games/games.css"]); // the CSP, the config the screens read (hidden: true) and the colour classes

test("the switch lists exactly the three hidden games, all of them still in the config with their addresses and status (nothing deleted)", () => {
  expect(cfg.hiddenGames).toEqual(HIDDEN);
  expect(hiddenIds(cfg)).toEqual(HIDDEN);
  expect(cfg.games.map((g: any) => g.id)).toEqual(["tambola", "bingo", "tictactoe", "snakesladders", "luckbychance", "luckydraw"]);
  for (const id of HIDDEN) { const g = cfg.games.find((x: any) => x.id === id); expect([id, g.status, g.ready, !!g.live]).toEqual([id, "live", true, true]); }
  expect(shownGames(cfg).map((g: any) => g.id)).toEqual(SHOWN);
  expect(hiddenIds({ ...cfg, hiddenGames: ["nope", "bingo"] })).toEqual(["bingo"]); // an unknown id is ignored
});

test("switch ON: no built page, file or search text offers a hidden game (only the CSP, games.config.js and the colour classes keep them)", () => {
  for (const f of files(on)) {
    if (ALLOWED_TO_KEEP.has(f) || /\.(png|ico|webmanifest)$/.test(f)) continue;
    const t = read(on, f);
    expect([f, NAMES.test(t)]).toEqual([f, false]);
  }
  const chooser = read(on, "games/index.html");
  for (const name of ["Corporate Tambola", "Corporate Bingo", "Corporate Lucky Draw"]) expect(chooser).toContain(name);
  expect((chooser.match(/class="gcard/g) || []).length).toBe(3);
  expect(chooser).not.toMatch(/#\/create\/(tictactoe|snakesladders|luckbychance)/);
  const llms = read(on, "llms.txt");
  for (const u of ["housie.", "bingo.", "luckydraw."]) expect(llms).toContain(u + "corporatetambola.com");
  expect(llms).not.toMatch(NAMES);
  expect(read(on, "index.html")).toContain("Tambola, Bingo and Lucky Draw");
  expect(read(on, "games/index.html")).toContain("Games for your team: Tambola, Bingo and Lucky Draw");
  expect(searchNamesText(cfg)).toBe("Tambola, Bingo and Lucky Draw");
});

test("switch ON: the hidden games stay in the CSP and in games.config.js (marked hidden), so an existing game is still reachable", () => {
  const h = read(on, "_headers");
  for (const g of cfg.games) expect([g.id, h.includes(g.live)]).toEqual([g.id, true]);
  const js = read(on, "core/games.config.js");
  const GAMES = JSON.parse(js.slice(js.indexOf("Object.freeze(") + 14, js.lastIndexOf(");")));
  expect(GAMES.map((g: any) => [g.id, g.hidden])).toEqual([["tambola", false], ["bingo", false], ["tictactoe", true], ["snakesladders", true], ["luckbychance", true], ["luckydraw", false]]);
  for (const g of GAMES) expect([g.id, g.ready, g.status, !!g.origin]).toEqual([g.id, true, "live", true]);
});

test("switch ON: the built games bar shows three games and is still valid; the canonical source copy is not edited", () => {
  const bar = read(on, "gamesbar.js");
  expect([...bar.matchAll(/^\s*\{ id: "(\w+)",/gm)].map((m) => m[1])).toEqual(["tambola", "bingo", "draw"]);
  expect(() => new Function(bar)).not.toThrow();
  expect(/\{ id: "draw"[^\n]*\}\s*\n\s*\];/.test(bar)).toBe(true); // no comma left before the closing bracket
  expect(read(root, "public/gamesbar.js")).toContain('id: "tictactoe"');
  expect(() => hideInGamesBar("var GAMES = [\n];", ["tictactoe"])).toThrow();
});

test("switch OFF ([]): every hidden game is back in every place, and the pages read as before the switch existed", () => {
  const chooser = read(off, "games/index.html");
  for (const name of ["Tic Tac Toe", "Snakes and Ladders", "Luck by Chance"]) expect(chooser).toContain(name);
  expect((chooser.match(/class="gcard/g) || []).length).toBe(6);
  for (const id of HIDDEN) expect(chooser).toContain("#/create/" + id);
  const llms = read(off, "llms.txt");
  for (const u of ["tictactoe.", "snakes.", "luck."]) expect(llms).toContain(u + "corporatetambola.com");
  expect(read(off, "index.html")).toContain("Tambola, Bingo, Tic Tac Toe and more");
  expect(read(off, "gamesbar.js")).toBe(read(root, "public/gamesbar.js")); // byte for byte the canonical bar
  const js = read(off, "core/games.config.js");
  expect(js).not.toContain('"hidden": true');
  expect(hideInGamesBar(read(root, "public/gamesbar.js"), [])).toBe(read(root, "public/gamesbar.js"));
});

test("Create screen: ON shows three tiles and no hidden game; OFF shows six tiles", async () => {
  const win = new Window({ url: "http://localhost/" });
  Object.assign(globalThis, { window: win, document: win.document, location: win.location, innerWidth: 1280 });
  const { renderCreate } = await import("../public/screens/create.js");
  const games = (hiddenOn: boolean) => cfg.games.map((g: any) => ({ id: g.id, name: g.name, accent: g.accent, ready: true, status: "live", features: g.features || [], caps: g.caps || {}, startModes: [], rehearsalMax: g.rehearsalMax, goldenButton: g.goldenButton, origin: g.live, hidden: hiddenOn && HIDDEN.includes(g.id) }));
  const tilesOf = async (hiddenOn: boolean) => {
    const o = document.createElement("div"); document.body.replaceChildren(o);
    const gs = games(hiddenOn);
    await renderCreate(o, { api: { capabilities: async () => [], startNew: async () => ({ ok: true, url: "#" }) }, games: gs, names: Object.fromEntries(gs.map((g: any) => [g.id, g.name])), colors: {} } as any);
    return [...o.querySelectorAll(".tile")].map((t: any) => t.dataset.game);
  };
  expect(await tilesOf(true)).toEqual(SHOWN);
  expect(await tilesOf(false)).toEqual(cfg.games.map((g: any) => g.id));
});

test("api.startNew refuses a hidden game without asking any game server", async () => {
  const calls: string[] = [];
  const fetchFn = async (url: string) => { calls.push(String(url)); return { ok: true, status: 200, json: async () => ({ ok: true }), headers: new Headers() } as any; };
  const gs = cfg.games.map((g: any) => ({ id: g.id, name: g.name, ready: true, status: "live", origin: g.live, features: [], hidden: HIDDEN.includes(g.id) }));
  const api: any = createApi({ games: gs, consoleOrigin: "https://console.corporatetambola.com", fetchFn } as any);
  for (const id of HIDDEN) expect(await api.startNew(id)).toEqual({ ok: false, error: "game-hidden" });
  expect(calls).toEqual([]);
});
