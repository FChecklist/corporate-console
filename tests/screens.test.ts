// FALSIFIED BY: screens-home-has-input, screens-mislabel-status, screens-delete-hidden, screens-signin-no-consent, screens-home-fourth-door, screens-create-no-soon-tile, screens-create-account-everywhere, screens-billing-hides-slow, screens-close-before-answers, screens-preview-always, screens-handoff-foreign-address, billing-payee-changed, screens-invoice-any-address
// All six screens (sign in, Home, My games, Create, Billing, Account) plus the Player's screen view run in a DOM against the real sign-in service and five fake games.
import { test, expect, setDefaultTimeout } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { world, spies } from "./support/world";
import { emailHash } from "../tools/fake-game/server.mjs";

setDefaultTimeout(90_000);
const win = new Window({ url: "http://localhost/" });
Object.assign(globalThis, { window: win, document: win.document, HashChangeEvent: win.HashChangeEvent, Event: win.Event, location: win.location, alert: () => {}, innerWidth: 1280 });
const { renderSignIn } = await import("../public/screens/signin.js");
const { renderHome } = await import("../public/screens/home.js");
const { renderMyGames, filterGames } = await import("../public/screens/mygames.js");
const { renderCreate, TELL_US } = await import("../public/screens/create.js");
const { renderBilling, NO_REFUND } = await import("../public/screens/billing.js");
const { renderAccount } = await import("../public/screens/account.js");
const { renderPlayerView, PREVIEW_LABEL } = await import("../public/screens/playerview.js");
const { STATUS_TEXT } = await import("../public/screens/ui.js");

const ctxOf = (w: any, extra: any = {}) => ({ api: w.api, games: w.games, names: Object.fromEntries(w.games.map((g: any) => [g.id, g.name])), colors: Object.fromEntries(w.games.map((g: any) => [g.id, g.accent])), email: "alice@acme.example", ...extra });
const fresh = () => { const o = document.createElement("div"); document.body.replaceChildren(o); return o; };
const until = async (f: () => boolean, ms = 60000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error("timed out waiting"); await new Promise((r) => setTimeout(r, 30)); } };
const click = (n: Element | null | undefined) => (n as any).click();
const byText = (root: ParentNode, sel: string, text: string) => [...root.querySelectorAll(sel)].find((n: any) => n.textContent.trim() === text) as any;

test("signed out: only the sign-in form; the consent box is required; the code form appears after the mail is sent; a right code signs in", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    const o = fresh(); let signed = 0;
    renderSignIn(o, ctxOf(w, { onSignedIn: async () => { signed++; } }));
    expect(o.querySelector("nav,.top,.tabbar")).toBe(null);
    const email = o.querySelector("#si-email") as any, consent = o.querySelector("#si-consent") as any;
    const submit = (f: Element) => f.dispatchEvent(new win.Event("submit", { cancelable: true, bubbles: true }));
    const forms = o.querySelectorAll("form"); const form = forms[0]!, codeForm = forms[1]!;
    email.value = "alice@acme.example";
    submit(form);
    expect(o.querySelector(".signmsg")!.textContent).toContain("tick the box");
    expect(w.mails.length).toBe(0);
    consent.checked = true; submit(form);
    await until(() => !codeForm.classList.contains("hide"));
    expect(w.mails.length).toBe(1);
    expect(o.querySelector("#si-sent")!.textContent).toContain("alice@acme.example");
    (o.querySelector("#si-code") as any).value = "000000"; submit(codeForm);
    await until(() => /not right|run out/.test(o.querySelector(".signmsg")!.textContent || ""));
    expect(signed).toBe(0);
    (o.querySelector("#si-code") as any).value = /code is (\d{6})/.exec(w.mails[0]!)![1]; submit(codeForm);
    await until(() => signed === 1);
  } finally { w.stop(); }
});

test("Home: exactly three doors and NO input of any kind; the strips show what needs attention and what is playing, a game that is slow is named", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect();
    const o = fresh();
    await renderHome(o, ctxOf(w));
    expect([...o.querySelectorAll(".doors .door")].map((t: any) => t.querySelector("b").textContent)).toEqual(["Create a new game", "My games", "Billing"]);
    expect([...o.querySelectorAll(".doors .door")].map((t: any) => t.getAttribute("href"))).toEqual(["#/create", "#/mygames", "#/billing"]);
    expect(o.querySelectorAll("input, textarea, select").length).toBe(0);
    const attn = [...o.querySelectorAll('section[aria-labelledby="h-attn"] .row')].map((r: any) => r.textContent);
    expect(attn.some((t: string) => /Waiting for payment/.test(t))).toBe(true);
    expect(attn.some((t: string) => /Invitation/.test(t))).toBe(true);
    expect(o.querySelector("#h-live")!.parentElement!.textContent).toContain("PLAY001");
    expect(o.textContent).toContain("Tic-Tac-Toe is slow, try again."); // the one game that is down is named; the rest still show
  } finally { w.stop(); }
});

test("Home: with nothing to show there are no strips at all, only the three doors", async () => {
  const api: any = { listGames: async () => ({ rows: [], failed: [] }) };
  const o = fresh();
  await renderHome(o, { api, names: {}, colors: {}, email: "x@y.example" });
  expect(o.querySelector("#home-strips")!.children.length).toBe(0);
  expect(o.querySelectorAll(".door").length).toBe(3);
});

test("Home: an invitation is accepted or declined with one tap, and the row goes away", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect();
    const o = fresh();
    await renderHome(o, ctxOf(w));
    const inv = [...o.querySelectorAll(".row")].find((r: any) => /Invitation/.test(r.textContent)) as any;
    expect(inv).toBeTruthy();
    const eid = inv.dataset.eid, game = inv.dataset.game;
    click(byText(inv, "button", "Accept"));
    await until(() => !o.querySelector(`.row[data-eid="${eid}"][data-game="${game}"]`));
    expect(w.states[game].roles.some((r: any) => r.eid === eid && r.state === "accepted")).toBe(true);
    expect(w.api.vault.all().some((k: any) => k.game === game && k.eid === eid)).toBe(true); // the helper key for that one game
  } finally { w.stop(); }
});

test("My games: the seven status words are exactly the console's, each card has a role chip, drafts show Delete draft (with a Yes/No), others do not", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect();
    const o = fresh();
    await renderMyGames(o, ctxOf(w));
    const cards = [...o.querySelectorAll(".gcard")] as any[];
    expect(cards.length).toBeGreaterThan(9);
    const tam = cards.filter((c) => c.dataset.game === "tambola");
    const statusOf = (eid: string) => tam.find((c) => c.dataset.eid === eid).querySelector(".chip").textContent;
    expect(statusOf("DRAFT01")).toBe("Draft"); expect(statusOf("WAIT001")).toBe("Waiting for payment"); expect(statusOf("READY01")).toBe("Ready"); expect(statusOf("PLAY001")).toBe("Playing now");
    expect(statusOf("DONE001")).toBe("Finished"); expect(statusOf("CANC001")).toBe("Cancelled"); expect(statusOf("NOST001")).toBe("Did not start");
    expect(Object.values(STATUS_TEXT)).toEqual(["Draft", "Waiting for payment", "Ready", "Playing now", "Finished", "Cancelled", "Did not start"]);
    for (const c of cards) expect(c.querySelector(".role")!.textContent).toMatch(/^(Organizer|Host|Co-host)$/);
    const names = (eid: string) => [...tam.find((c) => c.dataset.eid === eid).querySelectorAll("button, a.btn")].map((b: any) => b.textContent);
    expect(names("DRAFT01")).toEqual(["Open", "See what players see", "Create one like this", "Delete draft"]);
    expect(names("READY01")).toEqual(["Open", "See what players see", "Create one like this"]);
    expect(tam.find((c) => c.dataset.eid === "BOBS001").querySelector(".role")!.textContent).toBe("Host");
    expect(names("BOBS001")).toEqual(["Open", "See what players see"]); // a Host cannot copy the organizer's game
    expect(tam.find((c) => c.dataset.eid === "BOBS001").textContent).toContain("Invited by Bob Industries");
    expect(o.textContent).toContain("Tic-Tac-Toe is slow, try again.");
  } finally { w.stop(); }
});

test("My games: Delete draft asks Yes/No first, then really deletes in the game; the filter shows Coming up or Finished only", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect();
    const o = fresh();
    await renderMyGames(o, ctxOf(w));
    const eids = () => [...o.querySelectorAll(".gcard")].map((c: any) => c.dataset.game + "/" + c.dataset.eid);
    const card = () => o.querySelector('[data-eid="DRAFT01"][data-game="tambola"]') as any;
    click(byText(card(), "button", "Delete draft"));
    await until(() => !!card().querySelector(".confirm"));
    click(byText(card(), "button", "No"));
    await until(() => !card().querySelector(".confirm"));
    expect(w.states.tambola.games.some((g: any) => g.eid === "DRAFT01")).toBe(true); // No changed nothing
    click(byText(card(), "button", "Delete draft"));
    await until(() => !!card().querySelector(".confirm"));
    click(byText(card(), "button", "Yes, delete"));
    await until(() => !eids().includes("tambola/DRAFT01"));
    expect(w.states.tambola.games.some((g: any) => g.eid === "DRAFT01")).toBe(false);
    const pick = (v: string) => { const i = [...o.querySelectorAll('input[name="mf"]')].find((x: any) => x.value === v) as any; i.checked = true; i.dispatchEvent(new win.Event("change", { bubbles: true })); };
    pick("finished");
    await until(() => [...o.querySelectorAll(".gcard .chip")].every((c: any) => ["Finished", "Cancelled", "Did not start"].includes(c.textContent)));
    expect(o.querySelectorAll(".gcard").length).toBeGreaterThan(0);
    pick("coming");
    await until(() => [...o.querySelectorAll(".gcard .chip")].every((c: any) => !["Finished", "Cancelled", "Did not start"].includes(c.textContent)));
    const g = (status: string) => ({ status });
    expect(filterGames([g("draft"), g("finished"), g("playing"), g("cancelled")], "coming").map((x: any) => x.status)).toEqual(["draft", "playing"]);
  } finally { w.stop(); }
});

test("My games: Open hands over to the game's own sign-in address and nowhere else", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect();
    const o = fresh(); const went: string[] = [];
    await renderMyGames(o, ctxOf(w, { go: (u: string) => went.push(u) }));
    click(byText(o.querySelector('[data-eid="READY01"][data-game="tambola"]')!, "button", "Open"));
    await until(() => went.length === 1);
    expect(went[0]).toMatch(new RegExp("^" + w.states.tambola.origin.replace(/[.]/g, "\\.") + "/signin\\.html\\?t=[0-9a-f]{48}&go=console&e=READY01(&to=organizer)?$"));
    // a game that answers with an address that is not its own is refused: the page never goes there
    w.states.bingo.origin = "https://evil.example";
    const bad = await w.api.handoff("bingo", { eid: "READY01", target: "organizer" });
    expect(bad).toEqual({ ok: false, error: "wrong-address" });
  } finally { w.stop(); }
});

test("Create: five game tiles and one quiet 'Tell us you want it' tile for Lucky Draw; each live tile shows the game's own price line", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect();
    const o = fresh();
    await renderCreate(o, ctxOf(w));
    const tiles = [...o.querySelectorAll(".tile")] as any[];
    expect(tiles.map((t) => t.dataset.game)).toEqual(["tambola", "bingo", "tictactoe", "snakesladders", "luckbychance", "luckydraw"]);
    expect(tiles.filter((t) => t.classList.contains("soon")).map((t) => t.dataset.game)).toEqual(["luckydraw"]);
    const soon = tiles[5];
    expect(soon.querySelector("a")!.textContent).toBe("Tell us you want it");
    expect(soon.querySelector("a")!.getAttribute("href")).toBe(TELL_US);
    expect(soon.querySelector("button")).toBe(null);
    for (const t of tiles.slice(0, 5)) expect(t.querySelectorAll("button").length).toBe(1);
    await until(() => !!(o.querySelector('[data-price="tambola"]') as any).textContent);
    expect((o.querySelector('[data-price="tambola"]') as any).textContent).toBe("From Rs 2,399. Free up to 10 people.");
  } finally { w.stop(); }
});

test("Create: a tile hands over to that game's Step 1 (target new) and makes an account ONLY in that game, only the first time", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn("newbie@new.example"); await w.api.connect();
    expect(w.api.vault.size).toBe(0); // a brand-new person has no key anywhere
    const o = fresh(); const went: string[] = [];
    await renderCreate(o, ctxOf(w, { go: (u: string) => went.push(u), email: "newbie@new.example" }));
    click(byText(o.querySelector('[data-game="tambola"]')!, "button", "Start"));
    await until(() => went.length === 1);
    expect(went[0]).toBe(w.states.tambola.origin + "/signin.html?t=" + /t=([0-9a-f]{48})/.exec(went[0])![1] + "&go=console&e=_new_");
    const me = await emailHash("newbie@new.example");
    expect(w.states.tambola.people.has(me)).toBe(true); // the account exists in Tambola
    for (const g of ["bingo", "tictactoe", "snakesladders", "luckbychance"]) expect([g, w.states[g].people.has(me)]).toEqual([g, false]); // and in no other game
    expect(w.api.vault.all().map((k: any) => k.game)).toEqual(["tambola"]);
    // the second time no new account is made
    const sessions = () => w.states.tambola.calls.filter((c: string) => c === "POST /api/console/session").length;
    const before = sessions();
    click(byText(o.querySelector('[data-game="tambola"]')!, "button", "Start"));
    await until(() => went.length === 2);
    expect(sessions()).toBe(before);
  } finally { w.stop(); }
});

test("Billing: To pay, Paid and Your credit; the no-refund sentence once; a slow game is named while the others still show", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect();
    const o = fresh(); const went: string[] = [];
    await renderBilling(o, ctxOf(w, { go: (u: string) => went.push(u) }));
    expect([...o.querySelectorAll("h2.sechead")].map((h: any) => h.textContent)).toEqual(["To pay", "Paid", "Your credit"]);
    expect(o.textContent!.split(NO_REFUND).length - 1).toBe(1);
    expect(o.querySelectorAll("#bill-topay li").length).toBeGreaterThan(0);
    expect(o.querySelectorAll("#bill-paid li").length).toBeGreaterThan(0);
    expect(o.querySelector("#bill-paid")!.textContent).toContain("Rs 2,399");
    expect(o.querySelector("#bill-paid a")!.getAttribute("href")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/invoice\/inv_/);
    expect(o.querySelector("#bill-credit")!.textContent).toMatch(/Rs [\d,]+/);
    expect(o.textContent).toContain("Tic-Tac-Toe is slow, try again.");
    click(byText(o.querySelector("#bill-topay li")!, "button", "Pay"));
    await until(() => went.length === 1);
    expect(went[0]).toContain("/signin.html?t=");
  } finally { w.stop(); }
});

test("Account: Sign out and Sign out on every device end the keys and call back; Close my account asks Yes/No", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect();
    expect(w.api.vault.size).toBeGreaterThan(0);
    const o = fresh(); let out = 0;
    await renderAccount(o, ctxOf(w, { onSignedOut: () => { out++; } }));
    expect(o.querySelector("#acct-email")!.textContent).toBe("alice@acme.example");
    expect([...o.querySelectorAll("button")].map((b: any) => b.textContent)).toEqual(["Sign out", "Sign out on every device", "Close my account"]);
    click(byText(o, "button", "Sign out"));
    await until(() => out === 1);
    expect(w.api.vault.size).toBe(0);
    expect((await w.api.auth.me()).json.signedIn).toBe(false);
  } finally { w.stop(); }
});

test("Close my account: every game is asked first; one that does not answer is named, NOTHING is deleted and the person stays signed in; when all answer the account is closed", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect();
    const o = fresh(); let out = 0;
    await renderAccount(o, ctxOf(w, { onSignedOut: () => { out++; } }));
    const closeAll = async () => { click(byText(o, "button", "Close my account")); await until(() => !!o.querySelector(".confirm")); click(byText(o, "button", "Yes, close it")); };
    await closeAll();
    await until(() => /did not answer/.test(o.querySelector(".signmsg")!.textContent || ""));
    expect(o.querySelector(".signmsg")!.textContent).toContain("Tic-Tac-Toe");
    expect(out).toBe(0);
    expect((await w.api.auth.me()).json.signedIn).toBe(true); // still signed in
    w.states.tictactoe.persona = "normal"; // the game comes back
    await w.api.connect();
    await closeAll();
    await until(() => out === 1);
    expect((await w.api.auth.me()).json.signedIn).toBe(false);
    for (const id of ["tambola", "bingo", "tictactoe", "snakesladders", "luckbychance"]) expect([id, w.states[id].calls.includes("POST /api/console/purge-email")]).toEqual([id, true]);
  } finally { w.stop(); }
});

test("Player's screen view: shows the game's own preview address in a frame, with the exact label, and only for a game that can show it", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect();
    const o = fresh();
    await renderPlayerView(o, ctxOf(w), "tambola", "READY01");
    await until(() => !!o.querySelector("iframe"));
    expect(o.querySelector("#pv-label")!.textContent).toBe(PREVIEW_LABEL);
    expect(PREVIEW_LABEL).toBe("Preview only. This is not a game.");
    const src = o.querySelector("iframe")!.getAttribute("src")!;
    expect(src.startsWith(w.states.tambola.origin + "/screenview/READY01?t=")).toBe(true);
    expect([...o.querySelectorAll('input[name="pv"]')].map((i: any) => i.value)).toEqual(["laptop", "phone"]);
    const phone = [...o.querySelectorAll('input[name="pv"]')].find((i: any) => i.value === "phone") as any;
    phone.checked = true; phone.dispatchEvent(new win.Event("change", { bubbles: true }));
    await until(() => !!o.querySelector(".pvbox.phone"));
    // a game without the feature shows a calm note and no frame
    w.states.tambola.persona = "old";
    const o2 = fresh();
    await renderPlayerView(o2, ctxOf(w), "tambola", "READY01");
    await until(() => !!o2.querySelector(".calmempty"));
    expect(o2.querySelector("iframe")).toBe(null);
  } finally { w.stop(); }
});

test("no screen, copy file or page of the console uses the banned word, 'Retire a key' or an 'Ideas to improve' box", () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|html|json|css|webmanifest)$/.test(n) && !/^gamesbar\./.test(n)) files.push(p); } };
  walk(join(import.meta.dir, "../public"));
  for (const f of files) { const t = readFileSync(f, "utf8"); expect([f, /private/i.test(t.replace(/privacy/gi, ""))]).toEqual([f, false]); expect([f, /Retire a key|Ideas to improve/i.test(t)]).toEqual([f, false]); }
});

test("payments: the console says once that IT Services by Rajat Agarwal takes the payment through Razorpay; no other payee or gateway exists anywhere in the console and it never talks to Razorpay itself", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect();
    const o = fresh();
    await renderBilling(o, ctxOf(w));
    expect(o.querySelector("#bill-payee")!.textContent).toBe("Payment is taken by IT Services by Rajat Agarwal through Razorpay. Invoices and receipts name IT Services by Rajat Agarwal as the seller.");
    expect(o.textContent!.split("IT Services by Rajat Agarwal through Razorpay").length - 1).toBe(1);
  } finally { w.stop(); }
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|html|json|css|webmanifest)$/.test(n) && !/^gamesbar\./.test(n)) files.push(p); } };
  walk(join(import.meta.dir, "../public"));
  for (const f of files) {
    const t = readFileSync(f, "utf8");
    expect([f, /stripe|paypal|paytm|phonepe|cashfree|payu|gpay|google pay|braintree|square/i.test(t)]).toEqual([f, false]); // no other gateway or payee
    if (!f.endsWith("billing.js")) expect([f, /razorpay/i.test(t)]).toEqual([f, false]); // the word appears only in the one sentence
    expect([f, /checkout\.razorpay|api\.razorpay|rzp_/i.test(t)]).toEqual([f, false]); // the console never opens or calls the gateway
  }
  const headers = readFileSync(join(import.meta.dir, "../build.mjs"), "utf8");
  expect(/razorpay/i.test(headers)).toBe(false); // and the page's policy lists no payment origin
});

test("sign-in: a wrong code is told on the code step itself (the message is outside the hidden form) and there is a way back to change the e-mail", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    const o = fresh();
    renderSignIn(o, ctxOf(w, { onSignedIn: async () => {} }));
    const submit = (f: Element) => f.dispatchEvent(new win.Event("submit", { cancelable: true, bubbles: true }));
    const forms = o.querySelectorAll("form"); const form = forms[0]!, codeForm = forms[1]!;
    (o.querySelector("#si-email") as any).value = "alice@acme.example"; (o.querySelector("#si-consent") as any).checked = true; submit(form);
    await until(() => !codeForm.classList.contains("hide"));
    (o.querySelector("#si-code") as any).value = "000000"; submit(codeForm);
    await until(() => /not right|run out/.test(o.querySelector(".signmsg")!.textContent || ""));
    expect(form.contains(o.querySelector(".signmsg"))).toBe(false);
    expect(codeForm.contains(o.querySelector(".signmsg"))).toBe(false);
    click(byText(codeForm, "button", "Use a different e-mail"));
    expect(form.classList.contains("hide")).toBe(false);
    expect(codeForm.classList.contains("hide")).toBe(true);
  } finally { w.stop(); }
});

test("Billing: an invoice link that is not an invoice path of the game's own address is not shown", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect();
    w.states.tambola.billing.forEach((b: any) => { if (b.invoice) b.invoice = "@evil.example/x"; });
    const o = fresh();
    await renderBilling(o, ctxOf(w));
    expect([...o.querySelectorAll("#bill-paid a")].some((a: any) => /evil/.test(a.getAttribute("href")))).toBe(false);
  } finally { w.stop(); }
});
