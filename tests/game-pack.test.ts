// FALSIFIED BY: pack-runbar-dead-button, pack-dirty-flag-missing, pack-log-shows-name, pack-end-without-yes, pack-timeout-words
// The game pack (packages/game-pack): the live control bar, the Yes/No panel, the safety nets and the printable game log, run in a DOM.
import { test, expect, setDefaultTimeout } from "bun:test";
import { Window } from "happy-dom";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { vendorPack, packDrift, packFiles, PACK_DEST_REL } from "../tools/vendor-pack.mjs";

setDefaultTimeout(30_000);
const win = new Window({ url: "http://localhost/" });
Object.assign(globalThis, { window: win, document: win.document, Event: win.Event });
const require_ = createRequire(import.meta.url);
const confirmMod = require_("../packages/game-pack/confirm.js");
(globalThis as any).CTPack = { ...confirmMod };
const { mountRunBar, MESSAGES, MAX_LINE } = require_("../packages/game-pack/runbar.js");
const polish = require_("../packages/game-pack/polish.js");
const { renderLog } = require_("../packages/game-pack/gamelog.js");

const fresh = () => { const o = document.createElement("div"); document.body.replaceChildren(o); return o; };
const until = async (f: () => boolean, ms = 5000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error("timed out waiting"); await new Promise((r) => setTimeout(r, 10)); } };
const labels = (o: Element) => [...o.querySelectorAll("button, a.ctp-btn")].map((b: any) => b.textContent.trim());
const ALL = { start: true, pause: true, resume: true, extend: true, end: true, announce: true, bigScreen: true, board: true, results: true, log: true, changes: true };
const mk = (can: any, calls: string[] = []) => ({ can, links: { bigScreen: "/big", board: "/board", results: "/r.csv", log: "/pack/gamelog.html", changes: "/changes" }, do: { start: async () => { calls.push("start"); }, pause: async () => { calls.push("pause"); }, resume: async () => { calls.push("resume"); }, extend: async () => { calls.push("extend"); }, end: async () => { calls.push("end"); }, announce: async (t: string) => { calls.push("announce:" + t); } } });

test("the bar shows every button whose capability is true, and NONE whose capability is false", () => {
  const o = fresh();
  const bar = mountRunBar(o, mk(ALL));
  bar.update({ phase: "running", story: "Running. 30 of 75 called.", joined: 212, waiting: 3 });
  expect(labels(o)).toEqual(["Pause", "Add 30 more minutes", "End the game", "Message to everyone", "Big screen", "Board page", "Download results (CSV)", "What changed", "Game log"]);
  const none = fresh();
  const bar2 = mountRunBar(none, mk({}));
  bar2.update({ phase: "running", story: "Running." });
  expect(labels(none)).toEqual([]);
  const few = fresh();
  mountRunBar(few, mk({ end: true, log: true })).update({ phase: "running", story: "Running." });
  expect(labels(few)).toEqual(["End the game", "Game log"]);
});

test("exactly ONE primary button, and it follows the state: Start, then Pause, then Resume, none when finished", () => {
  const o = fresh(); const bar = mountRunBar(o, mk(ALL));
  const primary = () => [...o.querySelectorAll(".ctp-primary")].map((b: any) => b.textContent);
  bar.update({ phase: "waiting", story: "Starts in 12 minutes" }); expect(primary()).toEqual(["Start"]);
  bar.update({ phase: "running", story: "Running." }); expect(primary()).toEqual(["Pause"]);
  bar.update({ phase: "paused", story: "Paused.", paused: { who: "the host", when: "7:42 pm" } }); expect(primary()).toEqual(["Resume"]);
  bar.update({ phase: "finished", story: "Finished" }); expect(primary()).toEqual([]);
  expect(labels(o)).not.toContain("End the game"); // nothing to end any more
  const noStart = fresh(); mountRunBar(noStart, mk({ ...ALL, start: false })).update({ phase: "waiting", story: "Starts by itself" });
  expect([...noStart.querySelectorAll(".ctp-primary")].length).toBe(0); // a game with no manual start shows no Start
});

test("the PAUSED banner says who, when and when it restarts, and has the big Resume button", () => {
  const o = fresh(); const bar = mountRunBar(o, mk(ALL));
  bar.update({ phase: "paused", story: "Paused.", paused: { who: "the host", when: "7:42 pm" } });
  const ban = o.querySelector(".ctp-paused")!;
  expect(ban.textContent).toContain("PAUSED");
  expect(ban.textContent).toContain("Game paused by the host at 7:42 pm. It restarts soon.");
  bar.update({ phase: "paused", story: "Paused.", paused: { who: "Asha", when: "8:00 pm", restarts: "at 8:10 pm" } });
  expect(o.querySelector(".ctp-paused")!.textContent).toContain("It restarts at 8:10 pm.");
});

test("End the game asks Yes/No first: No ends nothing, Yes ends it once; the buttons call the game", async () => {
  const calls: string[] = [];
  const o = fresh(); const bar = mountRunBar(o, mk(ALL, calls));
  bar.update({ phase: "running", story: "Running." });
  const click = (text: string) => ([...o.querySelectorAll("button")].find((b: any) => b.textContent.trim() === text) as any).click();
  click("End the game"); await until(() => !!o.querySelector(".ctp-confirm"));
  click("No"); await until(() => !o.querySelector(".ctp-confirm")); await new Promise((r) => setTimeout(r, 30)); // let the bar finish its turn
  expect(calls).toEqual([]);
  click("End the game"); await until(() => !!o.querySelector(".ctp-confirm"));
  click("Yes, end it"); await until(() => calls.includes("end"));
  expect(calls).toEqual(["end"]);
  click("Pause"); await until(() => calls.includes("pause"));
  click("Add 30 more minutes"); await until(() => calls.includes("extend"));
});

test("Message to everyone: six ready messages or one line of at most 160 letters", async () => {
  const calls: string[] = [];
  const o = fresh(); const bar = mountRunBar(o, mk(ALL, calls));
  bar.update({ phase: "running", story: "Running." });
  ([...o.querySelectorAll("button")].find((b: any) => b.textContent === "Message to everyone") as any).click();
  expect(MESSAGES.length).toBe(6);
  const box = o.querySelector(".ctp-message")!;
  expect([...box.querySelectorAll(".ctp-small button")].map((b: any) => b.textContent)).toEqual(MESSAGES);
  const line = box.querySelector("input") as any;
  expect(Number(line.getAttribute("maxlength"))).toBe(MAX_LINE);
  line.value = "x".repeat(300);
  ([...box.querySelectorAll("button")].find((b: any) => b.textContent === "Send") as any).click();
  await until(() => calls.length === 1);
  expect(calls[0]).toBe("announce:" + "x".repeat(160));
});

test("prizes won show the seat number and a 'Prize given' tick only where the game can record it", async () => {
  const given: Array<[string, boolean]> = [];
  const g: any = mk(ALL); g.givePrize = async (id: string, v: boolean) => { given.push([id, v]); };
  const o = fresh(); const bar = mountRunBar(o, g);
  bar.update({ phase: "running", story: "Running.", prizes: [{ id: "p1", name: "Early five", seat: 17, given: false }, { id: "p2", name: "Full house", seat: null }] });
  const lis = [...o.querySelectorAll(".ctp-prizes li")] as any[];
  expect(lis[0].textContent).toContain("Early five - seat 17");
  expect(lis[1].textContent).toContain("Full house - not won yet");
  expect(lis[1].querySelector("input")).toBe(null);
  const cb = lis[0].querySelector("input"); cb.checked = true; cb.dispatchEvent(new win.Event("change", { bubbles: true }));
  await until(() => given.length === 1);
  expect(given).toEqual([["p1", true]]);
});

test("polish: typing marks the page as unsaved (__ctDirty), saving clears it, and the 40 second sentence is exact", async () => {
  const w = polish.watchUnsaved(window as any);
  expect((window as any).__ctDirty).toBe(false);
  const input = document.createElement("input"); document.body.append(input);
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  expect((window as any).__ctDirty).toBe(true);
  w.saved(); expect((window as any).__ctDirty).toBe(false);
  const skip = document.createElement("input"); skip.setAttribute("data-ct-skip", "1"); document.body.append(skip);
  skip.dispatchEvent(new win.Event("input", { bubbles: true })); expect((window as any).__ctDirty).toBe(false);
  expect(polish.TIMEOUT_SENTENCE).toBe("We could not reach the service. Please check your internet and try again.");
  expect(polish.TIMEOUT_MS).toBe(40000);
  const silent = polish.withTimeout(() => new Promise(() => {}), 30);
  await expect(silent("/x")).rejects.toThrow(polish.TIMEOUT_SENTENCE);
  const fast = polish.withTimeout(async () => "fine", 1000);
  expect(await fast("/x")).toBe("fine");
  const host = document.createElement("div"); polish.showEmail(host, "<b>x</b>@y.example");
  expect(host.querySelector(".ctp-email")!.textContent).toBe("<b>x</b>@y.example"); expect(host.querySelector("b")).toBe(null);
});

test("the game log shows time + sentence + seat number only, escapes markup, and never reads a name, e-mail or mobile field", () => {
  const o = fresh();
  const rows = [
    { ts: Date.UTC(2026, 9, 29, 13, 30), text: "Early five won", seat: 17, name: "Asha Verma", email: "asha@x.example", mobile: "9876512345" },
    { ts: Date.UTC(2026, 9, 29, 13, 0), text: "<img src=x onerror=alert(1)> Game started" },
    { ts: "bad", text: "ignored" },
  ];
  const n = renderLog(o, rows, { title: "Game log" });
  expect(n).toBe(2);
  const lines = [...o.querySelectorAll("li")] as any[];
  expect(lines[0].textContent).toContain("Game started"); // oldest first
  expect(lines[1].textContent).toContain("Early five won (seat 17)");
  expect(o.querySelector("img")).toBe(null);
  expect(o.textContent).not.toMatch(/Asha|asha@|9876512345/);
  expect(lines[0].querySelector("time")!.textContent).toMatch(/IST$/);
  expect(renderLog(fresh(), [], {})).toBe(0);
});

test("the vendored copy is the pack byte for byte, and ONE changed byte, a missing or an extra file is drift", () => {
  const g = mkdtempSync(join(tmpdir(), "vp-"));
  expect(packDrift(g)[0]).toContain("does not exist");
  const m = vendorPack(g);
  expect(Object.keys(m.files)).toEqual(packFiles());
  expect(Object.keys(m.files)).toEqual(["confirm.js", "gamelog.html", "gamelog.js", "pack.css", "polish.js", "runbar.js", "zc-flow.css", "zc-flow.js"]);
  expect(packDrift(g)).toEqual([]);
  const f = join(g, PACK_DEST_REL, "runbar.js");
  writeFileSync(f, readFileSync(f, "utf8").replace("Add 30 more minutes", "Add 31 more minutes"));
  expect(packDrift(g)).toEqual(["runbar.js differs from the console source"]);
  vendorPack(g);
  writeFileSync(join(g, PACK_DEST_REL, "extra.js"), "x");
  expect(packDrift(g)).toEqual(["extra.js is not part of the game pack"]);
  const lineEnds = mkdtempSync(join(tmpdir(), "vp-")); vendorPack(lineEnds);
  for (const x of packFiles()) { const p = join(lineEnds, PACK_DEST_REL, x); writeFileSync(p, readFileSync(p, "utf8").replace(/\n/g, "\r\n")); }
  expect(packDrift(lineEnds)).toEqual([]); // Windows line ends are not drift
});

test("the pack holds no game rules and no outside address (no number, prize or game name logic, no fetch of its own)", () => {
  for (const f of packFiles()) {
    const t = readFileSync(join(import.meta.dir, "../packages/game-pack", f), "utf8");
    expect([f, /https?:\/\/(?!localhost)/.test(t.replace(/\/\/ .*$/gm, ""))]).toEqual([f, false]);
    expect([f, /tambola|bingo|snakes|luck|housie/i.test(t)]).toEqual([f, false]);
    expect([f, /private/i.test(t)]).toEqual([f, false]);
  }
});
