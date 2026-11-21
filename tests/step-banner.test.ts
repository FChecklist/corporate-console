// FALSIFIED BY: steps-name-drift, steps-two-current, steps-draft-claims-done, steps-banner-not-on-create, steps-line-missing-on-cards, steps-colour-only
// The step banner (0.2.2): six steps in plain English, the current one highlighted, the same names as the game's own setup screen.
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const win: any = new Window({ url: "https://console.corporatetambola.com/" });
Object.assign(globalThis, { window: win, document: win.document, innerWidth: 1280 });
const { STEPS, stepsFor, stepLine, stepBanner } = await import("../public/core/steps.js");
const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

test("the console's six steps are exactly the game setup screen's steps (same numbers, same names, Brand & Breaks optional) so the two never disagree", () => {
  const src = read("packages/game-pack/zc-flow.js");
  const block = /const STEPS = \[([\s\S]*?)\n  \];/.exec(src)![1];
  const game = [...block.matchAll(/\{ n: (\d), id: "(\w+)", name: "([^"]+)"(, optional: true)? \}/g)].map((m) => ({ n: Number(m[1]), id: m[2], name: m[3], optional: !!m[4] }));
  expect(game.length).toBe(6);
  expect(STEPS.map((s: any) => ({ n: s.n, id: s.id, name: s.name, optional: !!s.optional }))).toEqual(game);
});

test("each step has one plain sentence: short words, no jargon, no 'I' or 'we', and the optional one says it can be skipped", () => {
  for (const s of STEPS) {
    expect([s.n, s.plain.split(/\s+/).length <= 14]).toEqual([s.n, true]);
    expect([s.n, /\b(I|we|our|my|payload|token|endpoint|hash|bridge|API|config)\b/.test(s.plain)]).toEqual([s.n, false]);
    expect([s.n, /[.]$/.test(s.plain)]).toEqual([s.n, true]);
  }
  expect(STEPS.find((s: any) => s.optional).plain).toContain("skip");
});

test("exactly ONE step is the current one (or none for a cancelled or deleted game), for every status the console knows", () => {
  for (const st of ["create", "draft", "pending", "overdue", "paid", "free", "live", "completed", "cancelled", "deleted", "something-new"]) {
    const { states, now } = stepsFor(st);
    const nows = Object.entries(states).filter(([, v]) => v === "now").map(([k]) => Number(k));
    expect([st, nows.length <= 1, nows[0] || 0]).toEqual([st, true, now]);
  }
});

test("where a game stands: create -> step 1 next; draft -> step 5 and NOTHING is claimed done; published unpaid -> steps 1-5 done, step 6 now; paid or playing -> all done; cancelled or deleted -> nothing claimed", () => {
  expect(stepsFor("create").now).toBe(1);
  const d = stepsFor("draft");
  expect(d.now).toBe(5);
  expect(Object.values(d.states).includes("done")).toBe(false); // the console cannot see inside the game's setup, so it does not tick anything
  for (const st of ["pending", "overdue"]) { const s = stepsFor(st); expect([st, s.now, [1, 2, 3, 4, 5].every((n) => s.states[n] === "done")]).toEqual([st, 6, true]); }
  for (const st of ["paid", "free", "live", "completed"]) { const s = stepsFor(st); expect([st, s.now, Object.values(s.states).every((v) => v === "done")]).toEqual([st, 0, true]); }
  for (const st of ["cancelled", "deleted"]) expect([st, Object.values(stepsFor(st).states).filter(Boolean).length]).toEqual([st, 0]);
});

test("the banner lists the six steps in order, marks the current one with aria-current AND the words 'You are here', so colour is never the only sign", () => {
  const b = stepBanner(document, "pending");
  expect(b.getAttribute("aria-label")).toBe("The six steps to run a game");
  const items = [...b.querySelectorAll("li.step")] as any[];
  expect(items.length).toBe(6);
  expect(items.map((li) => li.dataset.step)).toEqual(["1", "2", "3", "4", "5", "6"]);
  expect(items.map((li) => li.querySelector("b").textContent)).toEqual(STEPS.map((s: any) => `Step ${s.n}: ${s.name}`));
  const cur = items.filter((li) => li.getAttribute("aria-current") === "step");
  expect(cur.length).toBe(1);
  expect(cur[0].dataset.step).toBe("6");
  expect(cur[0].textContent).toContain("You are here");
  expect(items[0].textContent).toContain("Done"); // a done step says Done in words too
  expect(items[3].textContent).toContain("(optional)");
  expect(b.querySelector(".stepcap")!.textContent).toContain("The game starts only after you pay");
  const c = stepBanner(document, "create");
  expect(c.querySelector("li[aria-current]")!.textContent).toContain("Comes next"); // before the game exists nobody is "here" yet
});

test("the banner is plain DOM: no inline style, no script, no image; it is a nav with a name and an ordered list", () => {
  const b: any = stepBanner(document, "draft");
  expect(b.tagName).toBe("NAV");
  expect(b.querySelector("ol")).toBeTruthy();
  expect(b.outerHTML).not.toMatch(/\sstyle=|<script|<img|onclick/i);
  const css = read("public/core/app.css");
  expect(css).toMatch(/\.steplist \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 230px\), 1fr\)\)/); // one column at 360 px, more when there is room
  expect(css).toMatch(/\.step\.now \{[^}]*border-color: var\(--accent\)/);
  expect(css).toMatch(/forced-colors: active/);
  expect(css).toMatch(/@media \(max-width: 599px\) \{ \.step:not\(\.now\) \.stepplain \{ display: none; \}/); // on a phone only the current step shows its sentence, so the banner stays short
});

test("stepLine says it in one sentence for a game row", () => {
  expect(stepLine("pending")).toBe("You are at step 6 of 6: Pay. Next: nothing more to do here.");
  expect(stepLine("draft")).toBe("You are at step 5 of 6: Check and publish. Next: step 6, Pay.");
  expect(stepLine("paid")).toBe("All six steps are done.");
  expect(stepLine("cancelled")).toBe("");
  expect(stepLine("create")).toBe("You are at step 1 of 6: Date and time. Next: step 2, Who is this game for.");
});

test("the Create screen shows the banner above the game tiles, and My games shows the step line on an organizer's own game only", async () => {
  const { renderCreate } = await import("../public/screens/create.js");
  const { renderMyGames } = await import("../public/screens/mygames.js");
  const games = [{ id: "bingo", name: "Bingo", accent: "#2D3FE0", status: "live", ready: true }];
  const o: any = document.createElement("div"); document.body.replaceChildren(o);
  await renderCreate(o, { api: { capabilities: async () => [], startNew: async () => ({ ok: false }) }, names: { bingo: "Bingo" }, colors: {}, games });
  const nav = o.querySelector(".stepbanner");
  expect(nav).toBeTruthy();
  expect(nav.compareDocumentPosition(o.querySelector(".tiles")) & 4).toBeTruthy(); // the banner comes before the tiles
  expect(nav.querySelectorAll("li.step").length).toBe(6);

  const row = (eid: string, role: string, status: string) => ({ game: "bingo", eid, name: "G " + eid, role, roleId: "r", status, nextAction: "none", startMs: Date.now() + 86_400_000, cap: 100, payment: { state: status === "ready" ? "paid" : "waiting" } });
  const rows = [row("ORG0001", "organizer", "waiting_payment"), row("HOST001", "host", "waiting_payment"), row("DRAFT001", "organizer", "draft")];
  const api: any = { listGames: async () => ({ rows, failed: [], off: [] }), capabilities: async () => [], byId: {} };
  const o2: any = document.createElement("div"); document.body.replaceChildren(o2);
  await renderMyGames(o2, { api, names: { bingo: "Bingo" }, colors: {}, games, email: "demo2@demo-test.invalid" });
  const line = (eid: string) => o2.querySelector(`.gcard[data-eid="${eid}"] .stepline`);
  expect(line("ORG0001")!.textContent).toBe("You are at step 6 of 6: Pay. Next: nothing more to do here.");
  expect(line("DRAFT001")!.textContent).toBe("You are at step 5 of 6: Check and publish. Next: step 6, Pay.");
  expect(line("HOST001")).toBeNull(); // a host does not run the six steps: the organizer does
});
