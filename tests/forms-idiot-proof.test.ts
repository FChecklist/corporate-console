// FALSIFIED BY: forms3-mygames-double-decline, forms3-create-double-start, forms3-signin-double-send, forms3-decline-no-confirm, forms3-pay-mail-no-inline, forms3-funnel-no-inline, forms3-once-not-once, forms3-signin-code-shape, forms3-phone-fields
// Idiot-proofing (0.3.0): examples and plain inline errors on every field, one press does one job, a confirm before what cannot be undone, and a phone at 360 px can use every field.
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const win: any = new Window({ url: "https://console.corporatetambola.com/" });
Object.assign(globalThis, { window: win, document: win.document, CustomEvent: win.CustomEvent, Event: win.Event, location: win.location, innerWidth: 360 });
const root = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const submit = (f: any) => f.dispatchEvent(new win.Event("submit", { cancelable: true }));

test("forms.js: describeField gives an example and an error line, show() marks the field wrong and moves to it, typing clears it", async () => {
  const { describeField } = await import("../public/core/forms.js");
  const i: any = document.createElement("input"); i.id = "f1"; document.body.replaceChildren(i);
  const f = describeField(i, "For example: 12 Dec 2026");
  expect(f.hint.textContent).toBe("For example: 12 Dec 2026");
  expect(f.err.getAttribute("role")).toBe("alert");
  expect(i.getAttribute("aria-describedby")).toBe("f1-hint f1-err");
  expect(f.show("Please pick a day.")).toBe(false);
  expect([i.getAttribute("aria-invalid"), f.err.textContent, f.err.classList.contains("hide")]).toEqual(["true", "Please pick a day.", false]);
  i.dispatchEvent(new win.Event("input", { bubbles: true }));
  expect([i.getAttribute("aria-invalid"), f.err.textContent, f.err.classList.contains("hide")]).toEqual([null, "", true]);
});

test("once(): a second press while the first still works does nothing, the pressed button is locked, and it is free again afterwards", async () => {
  const { once, lockAll } = await import("../public/core/forms.js");
  let n = 0; let release: any; const gate = new Promise((r) => (release = r));
  const b: any = document.createElement("button"); document.body.replaceChildren(b);
  const run = once(async () => { n++; await gate; });
  b.addEventListener("click", run);
  b.click(); b.click(); b.click(); await wait(5);
  expect(n).toBe(1); expect(b.disabled).toBe(true);
  release(); await wait(10);
  expect(b.disabled).toBe(false);
  let m = 0; let go2: any; const g2 = new Promise((r) => (go2 = r)); const prog = once(async () => { m++; await g2; });
  prog(); prog(); prog(); await wait(5); expect(m).toBe(1); // called by code, not by a button: still once
  go2(); await wait(5);
  b.click(); await wait(5); expect(n).toBe(2);
  const x: any = document.createElement("button"), y: any = document.createElement("button"); document.body.append(x, y);
  let seen: boolean[] = []; await lockAll([x, y], async () => { seen = [x.disabled, y.disabled]; });
  expect(seen).toEqual([true, true]); expect([x.disabled, y.disabled]).toEqual([false, false]);
});

test("sign-in: pressing 'Get your code' twice sends ONE e-mail; a code that is not 6 digits is told under the code box without asking the server; a wrong code is told there too", async () => {
  const { renderSignIn } = await import("../public/screens/signin.js");
  let sent = 0, tried = 0; let release: any; const gate = new Promise((r) => (release = r));
  const api: any = { auth: { request: async () => { sent++; await gate; return { ok: true, json: { codeMinutes: 30 } }; }, verify: async () => { tried++; return { ok: false, json: {} }; } } };
  const o: any = document.createElement("div"); document.body.replaceChildren(o);
  renderSignIn(o, { api, onSignedIn: async () => {}, resendAfterMs: 0 });
  const [f1, f2] = o.querySelectorAll("form");
  o.querySelector("#si-email").value = "demo1@demo-test.invalid"; o.querySelector("#si-consent").checked = true;
  submit(f1); submit(f1); submit(f1); await wait(5);
  expect(sent).toBe(1);
  release(); await wait(20);
  o.querySelector("#si-code").value = "12ab";
  submit(f2); await wait(5);
  expect(tried).toBe(0);
  expect(o.querySelector("#si-code-err").textContent).toMatch(/6 digits, for example 482913/);
  o.querySelector("#si-code").value = "000000"; submit(f2); await wait(10);
  expect(tried).toBe(1);
  expect(o.querySelector("#si-code-err").textContent).toMatch(/not right/i);
  expect(o.querySelector("#si-code").getAttribute("aria-invalid")).toBe("true");
});

test("Create: one tap on Start, or Start then 'Try a free game', makes ONE draft; every button is locked meanwhile and free again if it failed", async () => {
  const { renderCreate } = await import("../public/screens/create.js");
  let made = 0; let release: any; const gate = new Promise((r) => (release = r)); let result: any = { ok: false, error: "unreachable" };
  const games = [{ id: "bingo", name: "Bingo", accent: "#2D3FE0", status: "live", ready: true }, { id: "tambola", name: "Tambola", accent: "#B3261E", status: "live", ready: true }];
  const o: any = document.createElement("div"); document.body.replaceChildren(o);
  await renderCreate(o, { api: { capabilities: async () => [], startNew: async () => { made++; await gate; return result; } }, names: { bingo: "Bingo", tambola: "Tambola" }, colors: {}, games, go: () => {} });
  const btns = [...o.querySelectorAll(".tile button")] as any[];
  expect(btns.length).toBe(4);
  btns[0].click(); btns[0].click(); btns[1].click(); btns[2].click(); await wait(5);
  expect(made).toBe(1);
  expect(btns.every((b) => b.disabled)).toBe(true);
  release(); await wait(20);
  expect(btns.every((b) => !b.disabled)).toBe(true); // it failed: the person can press again, nothing is stuck
  expect(document.querySelector(".toast")!.textContent).toMatch(/slow, try again/i);
});

test("Home: saying no to an invitation asks first (Yes / No), says nothing to the game until Yes, and a failed answer is told instead of ignored", async () => {
  const { renderHome } = await import("../public/screens/home.js");
  const calls: string[] = []; let ok = false;
  const row = { game: "bingo", eid: "INV0001", name: "Friday quiz", role: "host", roleId: "r1", status: "ready", nextAction: "accept", startMs: Date.now() + 86_400_000, cap: 50, payment: { state: "paid" } };
  const api: any = { listGames: async (o: any) => { const r = { rows: [row], failed: [], off: [] }; o && o.onGame && o.onGame({ game: "bingo", ok: true, rows: [row] }); return r; }, capabilities: async () => [], byId: {}, answerInvitation: async (_g: string, _e: string, _r: string, op: string) => { calls.push(op); return { ok }; }, billing: async () => ({ rows: [], credits: [] }) };
  const o: any = document.createElement("div"); document.body.replaceChildren(o);
  await renderHome(o, { api, names: { bingo: "Bingo" }, colors: {}, games: [{ id: "bingo", name: "Bingo", status: "live", ready: true }], email: "demo1@demo-test.invalid" });
  const inv = o.querySelector(".row") as any;
  const byText = (root: any, t: string) => [...root.querySelectorAll("button")].find((b: any) => b.textContent.trim() === t);
  byText(inv, "Decline").click(); await wait(10);
  expect(calls).toEqual([]); // nothing sent yet
  expect(inv.querySelector(".confirm")).toBeTruthy();
  byText(inv, "No, go back").click(); await wait(10);
  expect(calls).toEqual([]); expect(inv.querySelector(".confirm")).toBeNull();
  byText(inv, "Decline").click(); await wait(10);
  byText(inv, "Yes, say no").click(); await wait(20);
  expect(calls).toEqual(["decline"]);
  expect(document.querySelector(".toast")!.textContent).toMatch(/did not work.*try again/i); // the answer failed: the person is told, not left guessing
  expect(document.body.contains(inv)).toBe(true);
});

test("My games: two quick taps on Decline open ONE Yes / No question, and nothing is sent before Yes", async () => {
  const { renderMyGames } = await import("../public/screens/mygames.js");
  const calls: string[] = [];
  const row = { game: "bingo", eid: "INV0002", name: "Friday quiz", role: "host", roleId: "r1", status: "ready", nextAction: "accept", startMs: Date.now() + 86_400_000, cap: 50, payment: { state: "paid" } };
  const api: any = { listGames: async (o: any) => { o && o.onGame && o.onGame({ game: "bingo", ok: true, rows: [row] }); return { rows: [row], failed: [], off: [] }; }, capabilities: async () => [], byId: {}, answerInvitation: async (_g: string, _e: string, _r: string, op: string) => { calls.push(op); return { ok: true }; }, billing: async () => ({ rows: [], credits: [] }) };
  const o: any = document.createElement("div"); document.body.replaceChildren(o);
  await renderMyGames(o, { api, names: { bingo: "Bingo" }, colors: {}, games: [{ id: "bingo", name: "Bingo", status: "live", ready: true }], email: "demo1@demo-test.invalid" });
  await wait(20);
  const card = o.querySelector(".gcard") as any;
  const decline = [...card.querySelectorAll("button")].find((b: any) => b.textContent.trim() === "Decline");
  decline.click(); decline.click(); await wait(10);
  expect(card.querySelectorAll(".confirm").length).toBe(1);
  expect(calls).toEqual([]);
});

test("the payee page and the owner page: example under the field, error under the field, one press at a time", () => {
  const pay = read("public/pay-link.html"), payJs = read("public/pay-link.js");
  expect(pay).toMatch(/id="mail-hint"[^>]*>For example: you@yourcompany\.com/);
  expect(pay).toMatch(/id="mail-err"[^>]*role="alert"/);
  expect(payJs).toMatch(/\$\("mail-err"\)/);
  expect(payJs).toMatch(/setAttribute\("aria-invalid", "true"\)/);
  expect(payJs).toMatch(/if \(go\.disabled\) return;/);
  const fun = read("public/owner-funnel/index.html"), funJs = read("public/owner-funnel/funnel.js");
  for (const id of ["key-hint", "key-err", "range-hint", "range-err"]) expect([id, fun.includes(`id="${id}"`)]).toEqual([id, true]);
  expect(funJs).toContain("Please paste the owner key first");
  expect(funJs).toMatch(/must not be after the/);
  expect(funJs).toMatch(/if \(busy \|\| !valid\(\)\) return;/); // checked first, and one press at a time
});

test("a phone at 360 px: fields and buttons fill the width, are at least 44 px tall, text is 16 px or more in fields, and nothing has a fixed width wider than the screen", () => {
  const css = read("public/core/app.css") + read("public/core/consent.css") + read("public/pay-link.css") + read("public/owner-funnel/funnel.css") + read("public/core/chooser.css");
  expect(css).toMatch(/\.field input, \.field select \{[^}]*width: 100%/);
  expect(css).toMatch(/\.field input \{[^}]*min-height: 52px/);
  expect(css).toMatch(/\.field input \{[^}]*font: 18px/); // at 16 px or more a phone does not zoom in on the field
  expect(css).toMatch(/#mail \{[^}]*width: 100%/);
  expect(css).toMatch(/\.btn \{[^}]*min-height: 48px/);
  expect(css).toMatch(/\.cookiebtn \{[^}]*min-height: 48px/);
  expect(css).toMatch(/@media \(max-width: 480px\) \{ \.cookiebtn \{ flex-basis: 100%;/);
  const wide = [...css.replace(/min\([^)]*\)/g, "").matchAll(/(?<![-a-z])(?:min-)?width:\s*(\d{3,4})px/g)].map((m) => Number(m[1])).filter((n) => n >= 360);
  expect(wide).toEqual([]);
});
