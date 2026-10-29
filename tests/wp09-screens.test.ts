// FALSIFIED BY: screens-copy-opens-original, screens-csv-not-escaped, screens-close-warning-missing, screens-fonts-outside
// Gap-plan package WP-09 (money, privacy, polish): MC-10, 12, 13, 14, 15, 19, 20, 23, 24, 28, 30, 31, 32, 35. Stub games, no servers.
import { test, expect, setDefaultTimeout } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";

setDefaultTimeout(60_000);
const win = new Window({ url: "http://localhost/" });
Object.assign(globalThis, { window: win, document: win.document, HashChangeEvent: win.HashChangeEvent, Event: win.Event, location: win.location, alert: () => {}, innerWidth: 1280 });
const { renderBilling, billingCsv, invoiceNo, CREDIT_WORDS } = await import("../public/screens/billing.js");
const { renderAccount, warningsFor, KEPT, LEGAL, CLOSE_WORDS } = await import("../public/screens/account.js");
const { renderMyGames } = await import("../public/screens/mygames.js");
const { renderHome } = await import("../public/screens/home.js");
const { whenText } = await import("../public/screens/ui.js");
const { priceLine } = await import("../public/core/prices.js");

const fresh = () => { const o = document.createElement("div"); document.body.replaceChildren(o); return o; };
const until = async (f: () => boolean, ms = 30000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error("timed out waiting"); await new Promise((r) => setTimeout(r, 20)); } };
const click = (n: Element | null | undefined) => (n as any).click();
const byText = (root: ParentNode, sel: string, text: string) => [...root.querySelectorAll(sel)].find((n: any) => n.textContent.trim() === text) as any;
const INV = "/api/invoice/inv_" + "a".repeat(24) + "12345678";
const paidRow = (o: any = {}) => ({ tsMs: Date.UTC(2026, 9, 20), game: "bingo", eid: "PAID0001", gameName: 'Diwali "party", 2026', what: "pack", amountMinor: 239900, currency: "INR", status: "paid", paidBy: "link", invoice: INV, ...o });
const gameRow = (eid: string, o: any = {}) => ({ game: "bingo", eid, name: eid + " party", role: "organizer", status: "ready", startMs: Date.now() + 5 * 86400_000, cap: 100, nextAction: "none", payment: { state: "paid" }, ...o });

test("MC-13 the price line says what the price is for: 'From Rs 2,399 for up to 100 people, one game.'", () => {
  expect(priceLine({ sizes: [{ pack: 10, inrMinor: 0, usdMinor: 0, free: true }, { pack: 100, inrMinor: 239900, usdMinor: 3400, free: false }, { pack: 250, inrMinor: 349900, usdMinor: 5100, free: false }], freeDemoCap: 10 })).toBe("From Rs 2,399 for up to 100 people, one game. Free up to 10 people.");
});

test("MC-12/14/15 Billing: a finance link for a game to pay, 'paid by' and the invoice number on paid rows, one credit sentence with a Use it button, and a CSV that escapes quotes and commas", async () => {
  let made = 0, copied = "";
  (globalThis as any).navigator = { clipboard: { writeText: async (t: string) => { copied = t; } } };
  const api: any = {
    byId: { bingo: { origin: "https://bingo.test" } },
    listGames: async () => ({ rows: [gameRow("WAIT0001", { status: "waiting_payment", nextAction: "pay", payment: { state: "waiting" } })], failed: [], off: [] }),
    billing: async () => ({ rows: [paidRow()], credits: [{ game: "bingo", balanceMinor: 100000, currency: "INR", expiresMs: Date.UTC(2027, 0, 1) }], failed: [], off: [] }),
    payLink: async () => { made++; return { ok: true, url: "https://bingo.test/paylink.html?t=" + "0".repeat(48) }; },
  };
  const o = fresh();
  await renderBilling(o, { api, names: { bingo: "Bingo" }, colors: {}, email: "x@y.example" });
  click(byText(o, "button", "Copy link for finance"));
  await until(() => made === 1 && copied.length > 0);
  expect(copied).toBe("https://bingo.test/paylink.html?t=" + "0".repeat(48));
  const paid = o.querySelector("#bill-paid li")!.textContent!;
  expect(paid).toContain("paid by a finance link");
  expect(paid).toContain(invoiceNo(INV));
  expect(invoiceNo(INV)).toBe("inv_12345678");
  expect(o.querySelector("#bill-credit-words")!.textContent).toBe(CREDIT_WORDS);
  expect(byText(o.querySelector("#bill-credit")!, "a", "Use it for a new game").getAttribute("href")).toBe("#/create");
  const csv = billingCsv([paidRow()], { bingo: "Bingo" });
  expect(csv.split("\r\n")[0]).toBe("Game,Game name,Date,What,Amount,Currency,Status,Paid by,Invoice");
  expect(csv.split("\r\n")[1]).toBe('Bingo,"Diwali ""party"", 2026",2026-10-20,pack,2399.00,INR,paid,a finance link,inv_12345678');
});

test("MC-10/23/24 Account: says what closing leaves behind and warns about paid games to come and credit, offers the payments first, shows one table of what is kept and the legal links", async () => {
  expect(CLOSE_WORDS).toContain("does not cancel or delete the games you made");
  expect(KEPT.map((r: string[]) => r[0])).toEqual(["Your sign-in e-mail (console)", "Players' personal data in a game", "Winners and the game log (seat numbers only)", "Invoices and legal records"]);
  const w = warningsFor([gameRow("A0000001"), gameRow("A0000002"), gameRow("DRAFT001", { status: "draft", payment: { state: "none" } })], { credits: [{ game: "bingo", balanceMinor: 100000, currency: "INR" }] }, { bingo: "Bingo" });
  expect(w).toEqual(["You have 2 paid games still to come. Closing the account does not cancel them.", "You have credit: Rs 1,000 in Bingo. It stays with the game's own account; this screen cannot use it afterwards."]);
  const api: any = { listGames: async () => ({ rows: [gameRow("A0000001")], failed: [], off: [] }), billing: async () => ({ rows: [paidRow()], credits: [], failed: [], off: [] }), signOut: async () => ({ ok: true }), closeAccount: async () => ({ ok: true }) };
  const o = fresh();
  await renderAccount(o, { api, names: { bingo: "Bingo" }, email: "x@y.example", games: [{ origin: "https://housie.test" }] });
  await until(() => !!o.querySelector("#acct-warn .banner"));
  expect(o.querySelector("#acct-warn")!.textContent).toContain("1 paid game still to come");
  expect(byText(o, "button", "Download my payments first (CSV)")).toBeTruthy();
  expect(o.querySelector("#acct-kept")!.textContent).toContain("365 days");
  expect([...o.querySelectorAll("#acct-legal a")].map((a: any) => a.getAttribute("href"))).toEqual(LEGAL.map(([, p]: string[]) => "https://housie.test" + p));
});

test("MC-31 Make a copy: when the game does not hand back a NEW id nothing is opened (never the original by mistake)", async () => {
  const went: string[] = [];
  const mk = (reply: any) => ({
    byId: { bingo: { origin: "https://bingo.test" } }, capabilities: async () => [],
    listGames: async () => ({ rows: [gameRow("ORIG0001")], failed: [], off: [] }),
    headersFor: async () => ({ "x-organizer": "k" }),
    call: async () => reply,
    handoff: async (_g: string, o: any) => { went.push(o.eid); return { ok: true, url: "https://bingo.test/signin.html?t=" + "0".repeat(48) + "&go=console&e=" + o.eid }; },
  });
  for (const [reply, expected] of [[{ ok: true, json: {} }, []], [{ ok: true, json: { id: "ORIG0001" } }, []], [{ ok: true, json: { id: "COPY0002" } }, ["COPY0002"]]] as any[]) {
    went.length = 0;
    const o = fresh();
    await renderMyGames(o, { api: mk(reply), names: { bingo: "Bingo" }, colors: {}, email: "x@y.example", go: () => {} });
    expect(byText(o, "button", "Create one like this")).toBeUndefined();
    click(byText(o, "button", "Make a copy"));
    await new Promise((r) => setTimeout(r, 150));
    expect(went).toEqual(expected);
  }
});

test("MC-19/20 My games shows how many joined and the person's limit when the game says so; a finished game opens to 'Results and game log'", async () => {
  const api: any = { byId: {}, capabilities: async () => [], listGames: async () => ({ rows: [gameRow("LIVE0001", { joined: 37, yourLimit: 100, role: "cohost" }), gameRow("DONE0001", { status: "finished" })], failed: [], off: [] }) };
  const o = fresh();
  await renderMyGames(o, { api, names: { bingo: "Bingo" }, colors: {}, email: "x@y.example" });
  expect(o.querySelector('[data-eid="LIVE0001"]')!.textContent).toContain("up to 100 people, 37 joined, you can add up to 100");
  expect(byText(o.querySelector('[data-eid="DONE0001"]')!, "button", "Results and game log")).toBeTruthy();
  expect(byText(o.querySelector('[data-eid="LIVE0001"]')!, "button", "Open")).toBeTruthy();
});

test("MC-30 a person with no games and no failures sees one calm first-game line", async () => {
  const api: any = { listGames: async () => ({ rows: [], failed: [], off: [] }) };
  const o = fresh();
  await renderHome(o, { api, names: {}, colors: {}, email: "x@y.example" });
  expect(o.querySelector("#first-game")!.textContent).toContain("Keep ready: the date and time, how many people will play, the prizes, and your company name.");
  const o2 = fresh();
  await renderHome(o2, { api: { listGames: async () => ({ rows: [], failed: ["bingo"], off: [] }) }, names: { bingo: "Bingo" }, colors: {}, email: "x@y.example" });
  expect(o2.querySelector("#first-game")).toBe(null); // not when the games simply did not answer
});

test("MC-32 times also show the viewer's own time when it is not India time", () => {
  const real = Intl.DateTimeFormat;
  const ms = Date.UTC(2026, 9, 31, 10, 30);
  expect(whenText(ms)).toMatch(/IST/);
  (Intl as any).DateTimeFormat = function () { return { resolvedOptions: () => ({ timeZone: "America/New_York" }) }; };
  try { expect(whenText(ms)).toMatch(/ IST \(.* your time\)$/); } finally { (Intl as any).DateTimeFormat = real; }
});

test("MC-24/28 no outside font or style address in the page or its policy, and the help link carries a subject and the EVENT DAY hint", () => {
  const html = readFileSync(join(import.meta.dir, "../public/index.html"), "utf8");
  expect(html).not.toMatch(/googleapis|gstatic/);
  expect(readFileSync(join(import.meta.dir, "../build.mjs"), "utf8")).not.toMatch(/googleapis|gstatic/);
  const copy = JSON.parse(readFileSync(join(import.meta.dir, "../public/copy/en.json"), "utf8"));
  expect(copy.help.eventDay).toBe("On the day of your event, write EVENT DAY in the subject.");
});
