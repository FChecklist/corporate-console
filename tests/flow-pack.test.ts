// FALSIFIED BY: flow-pack-game-rule-leak, flow-pack-needs-descriptor, flow-pack-wait-column-always, flow-pack-share-no-gameid, flow-pack-board-title
// The shared new organizer flow (packages/game-pack/zc-flow.js, opened with ?flow=new in a game's console). The behaviour tests live in each game (it needs that game's own prize table and ticket maker);
// here: the pack stands on its own with no game descriptor, hands the game's descriptor words through, and keeps the language guide.
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";

const src = readFileSync(join(import.meta.dir, "../packages/game-pack/zc-flow.js"), "utf8");
function page(descriptor = "", search = "?flow=new") {
  const win: any = new Window({ url: "http://localhost/zc.html" + search });
  win.document.body.innerHTML = '<main id="app"></main>';
  new Function("window", "document", "location", "fetch", descriptor + "\n" + src)(win, win.document, win.location, async () => ({ ok: true, json: async () => ({}) }));
  return win;
}

test("with no game descriptor the flow still draws its five steps, the top strip and a locked dashboard, and says the prizes are not available", () => {
  const win = page();
  const d = win.document;
  expect(d.querySelectorAll(".zf-bar [data-step]").length).toBe(5);
  expect(d.querySelector(".zf-top").textContent).toContain("deleted within 24 hours of the game");
  expect(d.getElementById("zf-dash").hasAttribute("disabled")).toBe(true);
  expect(win.ZFLOW.housesOf(win)).toEqual([]);
});

test("the game's own descriptor is what the flow uses: its name in the tab, its tickets, its ticks, its Super Bumper switch", () => {
  const win = page('window.ZFLOW_GAME = { brand: "Game X", tickets: [1], bumper: false, popular: ["a"], recommended: ["a", "b"] };');
  expect(win.document.title).toBe("Organizer console | Game X");
  expect(win.ZFLOW.tagsOf("a")).toEqual(["(Popular)", "(Recommended)"]);
  expect(win.ZFLOW.tagsOf("b")).toEqual(["(Recommended)"]);
  const houses = [{ id: "a", label: "A", dflt: true }, { id: "b", label: "B" }];
  expect(Object.entries(win.ZFLOW.defaultPrizes(houses)).filter(([, v]: any) => v.on).map(([k]) => k)).toEqual(["a", "b"]);
  // a game with no Super Bumper never saves one, even if asked
  const sel = win.ZFLOW.defaultPrizes(houses);
  const r = win.ZFLOW.buildRewards(sel, { on: true, n: 3, gift: "Gift voucher", other: "", worth: "" }, 2, "INR");
  expect(r.some((x: any) => x.scope === "two_ticket")).toBe(false);
});

test("without a descriptor, a house flagged as a default by the game is ticked", () => {
  const win = page();
  const on = Object.entries(win.ZFLOW.defaultPrizes([{ id: "p", dflt: true }, { id: "q" }])).filter(([, v]: any) => v.on).map(([k]) => k);
  expect(on).toEqual(["p"]);
});

test("the pack holds no game name and no outside address in its code, and no banned word on its screens", () => {
  expect(/tambola|bingo|snakes|luck|housie/i.test(src)).toBe(false);
  expect(/https?:\/\/(?!localhost)/.test(src.replace(/\/\/ .*$/gm, ""))).toBe(false);
  const win = page();
  const F = win.ZFLOW;
  expect(F.badWords([...Object.values(F.COPY), ...F.STEPS.map((s: any) => s.name)].join(" | "))).toEqual([]);
  expect(src).not.toMatch(/private/i);
});

test("Dashboard v2 pure parts: the waiting table shows a column only when somebody gave that detail; the shared message carries the Game ID and link", () => {
  const F = page().ZFLOW;
  expect(F.waitColumns([{ id: "1" }]).map((c: any) => c.label)).toEqual(["Ticket number"]);
  const rows = [{ id: "1", firstName: "Asha", last4: "4321", via: "boss@acme.com" }, { id: "2", email: "x@y.com" }];
  expect(F.waitColumns(rows).map((c: any) => c.label)).toEqual(["Ticket number", "Name", "Email ID", "Mobile", "Referred by"]);
  const m = F.shareMessage("Team party", "http://x/z?e=E1", "E1");
  expect(m).toContain("Game ID: E1"); expect(m).toContain("http://x/z?e=E1");
  expect(F.PAY_PRINT).toContain("claim it back (recommended)");
  expect(F.PAY_PRINT).toContain("works for 7 days");
});

test("the retro board uses the game's own title and size from its descriptor", () => {
  const win = page('window.ZFLOW_GAME = { boardTitle: "XYZ", boardMax: 20, boardCols: 5, tickets: [1] };');
  const F = win.ZFLOW;
  F.state.eid = "E1"; F.state.raw = { startMs: Date.now() + 3600000 }; F.state.info = { published: true, paid: true, startMs: Date.now() + 3600000 }; F.state.view = "dash"; F.draw();
  expect(win.document.querySelector(".zf-retro-title").textContent).toContain("XYZ");
  expect(win.document.getElementById("zf-discs").children.length).toBe(20);
  expect(win.document.getElementById("zf-discs").getAttribute("style")).toContain("repeat(5, 1fr)");
});
