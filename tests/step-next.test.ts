// FALSIFIED BY: step3-no-summary, step3-next-missing, step3-last-step-next, step3-claims-on-cancelled, step3-createfrom-no-banner, step3-total-hardcoded
// The step banner (0.3.0) says "Step N of M" and what is next, in plain words, on the Create screen and on "Start from an earlier game", and never claims a step for a game that is not on one.
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const win: any = new Window({ url: "https://console.corporatetambola.com/" });
Object.assign(globalThis, { window: win, document: win.document });
const S = await import("../public/core/steps.js");
const root = join(import.meta.dir, "..");

test("the summary says 'Step N of M' for where you are, and 'Next:' for what comes after, for every stage", () => {
  const say = (st: string) => S.stepSummary(st);
  expect(say("create")).toEqual({ now: "Step 1 of 6: Date and time. It starts when you choose a game below.", next: "Next: Step 2 of 6: Who is this game for." });
  expect(say("draft")).toEqual({ now: "Step 5 of 6: Check and publish.", next: "Next: Step 6 of 6: Pay." });
  expect(say("pending")).toEqual({ now: "Step 6 of 6: Pay.", next: "Next: nothing more to do here. The game starts after you pay." });
  expect(say("overdue").now).toBe("Step 6 of 6: Pay.");
  expect(say("paid")).toEqual({ now: "All 6 steps are done.", next: "Next: your game runs at its time. Open My games to see it." });
  for (const st of ["cancelled", "deleted", "whatever"]) expect([st, say(st)]).toEqual([st, { now: "", next: "" }]); // nothing is claimed for a game that is not on a step
});

test("M is the real number of steps, and every 'Step N of M' names the step the game's own setup screen names", () => {
  expect(S.TOTAL).toBe(S.STEPS.length);
  expect(S.TOTAL).toBe(6);
  for (const s of S.STEPS) {
    const saw = [...S.stepSummary("create").next.matchAll(/Step (\d) of (\d)/g)];
    for (const m of saw) expect(Number(m[2])).toBe(S.STEPS.length);
    expect(S.STEPS[s.n - 1]).toBe(s);
  }
  const pack = readFileSync(join(root, "packages/game-pack/zc-flow.js"), "utf8");
  for (const s of S.STEPS) expect([s.name, pack.includes(s.name)]).toEqual([s.name, true]);
});

test("the banner shows the two lines above the list of six steps, as one named group, and the current step is still marked in words and by aria-current", () => {
  const nav: any = S.stepBanner(document, "draft");
  const sum = nav.querySelector(".stepsum");
  expect(sum.getAttribute("role")).toBe("group");
  expect(sum.getAttribute("aria-label")).toMatch(/place in the six steps/i);
  expect(sum.querySelector(".stepnow").textContent).toBe("Step 5 of 6: Check and publish.");
  expect(sum.querySelector(".stepnext").textContent).toBe("Next: Step 6 of 6: Pay.");
  expect(nav.compareDocumentPosition(sum) & 16).toBeTruthy();
  expect(sum.compareDocumentPosition(nav.querySelector("ol")) & 4).toBeTruthy(); // the summary comes first
  expect(nav.querySelector('[aria-current="step"]').textContent).toContain("You are here");
  const none: any = S.stepBanner(document, "cancelled");
  expect(none.querySelector(".stepsum")).toBeNull(); // a cancelled game: no summary, no claim
  expect(/\sstyle=|<script|<img|onclick/i.test(nav.outerHTML)).toBe(false);
});

test("Create shows 'Step 1 of 6' with what is next above the game tiles; 'Start from an earlier game' shows the same banner", async () => {
  const { renderCreate } = await import("../public/screens/create.js");
  const { renderCreateFrom } = await import("../public/screens/createfrom.js");
  const games = [{ id: "bingo", name: "Bingo", accent: "#2D3FE0", status: "live", ready: true }];
  const o: any = document.createElement("div"); document.body.replaceChildren(o);
  await renderCreate(o, { api: { capabilities: async () => [], startNew: async () => ({ ok: false }) }, names: { bingo: "Bingo" }, colors: {}, games });
  expect(o.querySelector(".stepnow").textContent).toMatch(/^Step 1 of 6: Date and time/);
  expect(o.querySelector(".stepnext").textContent).toBe("Next: Step 2 of 6: Who is this game for.");
  expect(o.querySelector(".stepbanner").compareDocumentPosition(o.querySelector(".tiles")) & 4).toBeTruthy();
  const o2: any = document.createElement("div"); document.body.replaceChildren(o2);
  const p = renderCreateFrom(o2, { api: { listGames: async () => ({ rows: [], failed: [], off: [] }) }, names: {}, colors: {}, games });
  expect(o2.querySelector(".stepbanner .stepnow").textContent).toMatch(/^Step 1 of 6/);
  await p;
  const hs = [...o.querySelectorAll("h1,h2,h3")].map((h: any) => Number(h.tagName[1]));
  expect(hs[0]).toBe(1); for (let i = 1; i < hs.length; i++) expect(hs[i]).toBeLessThanOrEqual(hs[i - 1] + 1); // headings stay in order
});

test("a game row says where the game is and what is next, in one sentence; the banner styles fit 360 px (one column, wraps, no fixed width)", () => {
  expect(S.stepLine("draft")).toBe("You are at step 5 of 6: Check and publish. Next: step 6, Pay.");
  expect(S.stepLine("cancelled")).toBe("");
  const css = readFileSync(join(root, "public/core/app.css"), "utf8");
  const sum = /\.stepsum \{[^}]*\}/.exec(css)![0];
  expect(sum).not.toMatch(/(?<!min-|max-)width:\s*\d+px/);
  expect(css).toMatch(/\.stepnow \{[^}]*font-size: 18px/);
});
