// FALSIFIED BY: screens-resend-open, screens-helper-asked-to-pay, screens-all-failed-no-games, core-404-called-slow
// Gap-plan package WP-07 (sign-in, errors, empty states): MC-02 .. MC-09, MC-17, MC-18, MC-26, MC-27. Small stub games, no servers, so these run fast.
import { test, expect, setDefaultTimeout } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { world, spies } from "./support/world";

setDefaultTimeout(90_000);
const win = new Window({ url: "http://localhost/" });
Object.assign(globalThis, { window: win, document: win.document, HashChangeEvent: win.HashChangeEvent, Event: win.Event, location: win.location, alert: () => {}, innerWidth: 1280 });
const { renderSignIn } = await import("../public/screens/signin.js");
const { renderHome } = await import("../public/screens/home.js");
const { renderMyGames } = await import("../public/screens/mygames.js");
const { renderBilling } = await import("../public/screens/billing.js");

const fresh = () => { const o = document.createElement("div"); document.body.replaceChildren(o); return o; };
const until = async (f: () => boolean, ms = 60000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error("timed out waiting"); await new Promise((r) => setTimeout(r, 20)); } };
const click = (n: Element | null | undefined) => (n as any).click();
const byText = (root: ParentNode, sel: string, text: string) => [...root.querySelectorAll(sel)].find((n: any) => n.textContent.trim() === text) as any;
const submit = (f: Element) => f.dispatchEvent(new win.Event("submit", { cancelable: true, bubbles: true }));
const row = (eid: string, o: any = {}) => ({ game: "bingo", eid, name: eid + " party", role: "organizer", status: "ready", startMs: Date.now() + 5 * 86400_000, cap: 10, nextAction: "none", payment: { state: "free" }, ...o });

test("MC-02/03/04 sign-in: Send is locked while it works, 'Send a new code' opens only after the wait, the newest e-mail is the one to use, there is a way back, and a right code goes Home at once", async () => {
  let release: (v: any) => void = () => {};
  let asked = 0, signed = 0;
  const api: any = { auth: { request: () => { asked++; return new Promise((r) => { release = r; }); }, verify: async () => ({ ok: true }) } };
  const o = fresh();
  renderSignIn(o, { api, onSignedIn: async () => { signed++; }, resendAfterMs: 60_000 });
  const [form, codeForm] = [...o.querySelectorAll("form")] as any[];
  (o.querySelector("#si-email") as any).value = "demo5@demo-test.invalid"; (o.querySelector("#si-consent") as any).checked = true;
  submit(form); submit(form); submit(form); // three quick taps
  expect(asked).toBe(1);
  expect(byText(form, "button", "Send me a code").disabled).toBe(true);
  release({ ok: true, json: {} });
  await until(() => !codeForm.classList.contains("hide"));
  const resend = [...codeForm.querySelectorAll("button")].find((b: any) => /^Send a new code/.test(b.textContent)) as any;
  expect(resend.disabled).toBe(true);
  expect(resend.textContent).toMatch(/in \d+ s/);
  expect(o.querySelector("#si-sent")!.textContent).toMatch(/works for 10 minutes \(until \d{1,2}:\d{2} (am|pm)\)/);
  expect(o.querySelector("#si-newest")!.textContent).toContain("use the newest e-mail");
  expect(codeForm.textContent).toContain("Use a different e-mail");
  (o.querySelector("#si-code") as any).value = "123456"; submit(codeForm);
  await until(() => signed === 1);
  expect(o.querySelector(".signmsg")!.textContent).toBe("Signing you in…");
  click(byText(codeForm, "button", "Use a different e-mail")); // and the timer is stopped, nothing is left running
  expect(form.classList.contains("hide")).toBe(false);
});

test("MC-03 the one-tap link page has a way back to sign in", () => {
  expect(readFileSync(join(import.meta.dir, "../public/signin.html"), "utf8")).toContain('href="/">Back to sign in</a>');
});

test("MC-18 a helper (Host or Co-host) is never asked to pay: not on Home, not under To pay in Billing", async () => {
  const helper = row("WAIT001", { name: "Helper game", role: "host", status: "waiting_payment", nextAction: "none", payment: { state: "waiting" } });
  const mine = row("WAIT002", { name: "My game", status: "waiting_payment", nextAction: "pay", payment: { state: "waiting" } });
  const api: any = { listGames: async () => ({ rows: [helper, mine], failed: [], off: [] }), billing: async () => ({ rows: [], credits: [], failed: [], off: [] }), byId: {} };
  const o = fresh();
  await renderHome(o, { api, names: { bingo: "Bingo" }, colors: {}, email: "demo6@demo-test.invalid" });
  expect([...o.querySelectorAll(".row")].map((r: any) => r.dataset.eid)).toEqual(["WAIT002"]);
  expect(byText(o.querySelector(".row")!, "button", "Pay")).toBeTruthy();
  const o2 = fresh();
  await renderBilling(o2, { api, names: { bingo: "Bingo" }, colors: {}, email: "demo6@demo-test.invalid" });
  expect([...o2.querySelectorAll("#bill-topay li")].map((r: any) => r.dataset.eid)).toEqual(["WAIT002"]);
});

test("MC-06/07/17 My games: games that did not answer never read as 'No games yet' (Try again), an empty list explains invitations and names the e-mail, a game is drawn the moment it answers", async () => {
  const slow = { game: "bingo", ok: false, error: "unreachable" };
  let calls = 0;
  const api: any = { capabilities: async () => [], byId: {}, listGames: async ({ onGame }: any = {}) => { calls++; if (onGame) onGame(slow); return { rows: [], failed: ["bingo"], off: [], results: [slow] }; } };
  const o = fresh();
  await renderMyGames(o, { api, names: { bingo: "Bingo" }, colors: {}, email: "demo10@demo-test.invalid" });
  expect(o.textContent).toContain("The system could not reach your games just now.");
  expect(o.textContent).not.toContain("No games yet");
  click(byText(o, "button", "Try again"));
  await until(() => calls >= 2);
  const api2: any = { capabilities: async () => [], byId: {}, listGames: async () => ({ rows: [], failed: [], off: [] }) };
  const o2 = fresh();
  await renderMyGames(o2, { api: api2, names: {}, colors: {}, email: "demo10@demo-test.invalid" });
  expect(o2.textContent).toContain("No games yet.");
  expect(o2.textContent).toContain("You are signed in as demo10@demo-test.invalid");
  let finish: (v: any) => void = () => {};
  const api3: any = { capabilities: async () => [], byId: {}, listGames: ({ onGame }: any) => new Promise((r) => { onGame({ game: "bingo", ok: true, rows: [row("FAST0001")] }); finish = r; }) };
  const o3 = fresh();
  const pending = renderMyGames(o3, { api: api3, names: { bingo: "Bingo" }, colors: {}, email: "demo6@demo-test.invalid" });
  await until(() => !!o3.querySelector('[data-eid="FAST0001"]'));
  expect(o3.querySelector('[data-eid="FAST0001"]')).toBeTruthy(); // on screen while the slow game is still being waited for
  finish({ rows: [row("FAST0001")], failed: [], off: [] }); await pending;
});

test("MC-05 a hand-over that fails says why in plain words", async () => {
  const { openError } = await import("../public/core/errors.js");
  expect(openError({ error: "no-key" }, "Bingo")).toBe("Please sign in again.");
  expect(openError({ error: "unreachable" }, "Bingo")).toBe("Bingo is slow, try again.");
  expect(openError({ error: "not-on-console" }, "Bingo")).toBe("Bingo is not open on the console yet.");
  expect(openError({ error: "refused" }, "Bingo")).toBe("The system could not open that game just now. Please try again.");
});

test("MC-08 a game whose console is not switched on yet (404) is 'not on the console yet', not slow: it stays out of the slow banner, and a hand-over to it says so", async () => {
  const { createApi } = await import("../public/core/api.js");
  const games = [{ id: "a", ready: true, origin: "http://a.test" }, { id: "b", ready: true, origin: "http://b.test" }];
  const fetchFn = async (url: string) => {
    const u = String(url);
    if (u.endsWith("/auth/assert")) return new Response(JSON.stringify({ ok: true, assertions: games.map((g) => ({ game: g.id, assertion: "v1.x.y" })) }), { status: 200 });
    if (u.startsWith("http://a.test")) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({ ok: true, games: [], next: null }), { status: 200 });
  };
  const api = createApi({ games, consoleOrigin: "http://console.test", fetchFn, timeoutMs: 500 });
  const l = await api.listGames();
  expect(l.failed).toEqual([]);
  expect(l.off).toEqual(["a"]);
  api.vault.put("a", "master", null, "cbk_x", Date.now() + 1e6);
  expect(await api.handoff("a", { eid: "ABCD1", target: "organizer" })).toMatchObject({ ok: false, error: "not-on-console" });
});

test("MC-04 onGame fires once per game as each answers (the screens use it to draw early)", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect();
    const seen: string[] = [];
    await w.api.listGames({ onGame: (r: any) => seen.push(r.game) });
    expect(seen.sort()).toEqual(["bingo", "luckbychance", "snakesladders", "tambola", "tictactoe"]);
  } finally { w.stop(); }
});
