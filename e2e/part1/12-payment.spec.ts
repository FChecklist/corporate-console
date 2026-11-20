// Steps 12, 13, 14: credit, payment, payment confirmation. NOTHING here takes money. The payment provider (Moneypenny) is a stand-in in the test stack with three modes:
//   ok = confirms,  busy = the safe 'off/busy' state (PAY_VIA_MONEYPENNY off): nothing changes,  fail = the provider refuses.
import { expect } from "bun:test";
import { scenario, blocked, withOrg, type Organizer } from "./lib/harness";

const WAIT = { status: "waiting_payment", nextAction: "pay", payment: { state: "waiting" }, cap: 250, startMs: Date.now() + 5 * 86400_000 };
const billRow = (eid: string) => `#bill-topay li[data-eid="${eid}"]`;
const paidRow = (eid: string) => `#bill-paid li[data-eid="${eid}"]`;
const waitingGame = (o: Organizer, name = "Pay party") => o.stack.createGame("tambola", o.email, { name, ...WAIT });

// ---- step 12: credit ----
scenario(12, "returning+desktop", "credit from a cancelled paid game shows under 'Your credit' with amount, expiry and the explaining sentence", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); await o.stack.createGame("tambola", o.email, {}); await o.stack.credit("tambola", o.email, 239900);
    await o.go("billing"); await o.page.waitForSelector("#bill-credit");
    expect(await o.page.textContent("#bill-credit li .amt")).toBe("Rs 2,399"); expect(await o.page.textContent("#bill-credit li")).toContain("Valid until");
    expect(await o.page.textContent("#bill-credit-words")).toContain("Credit is used automatically");
    expect(await o.page.textContent("body")).toContain("No refunds. A cancelled paid game becomes credit for 365 days.");
    await o.page.click("#bill-credit a:has-text('Use it for a new game')"); await o.page.waitForSelector("h1:has-text('Create a new game')");
  });
});

scenario(12, "new+desktop", "no credit: 'No credit.' (never a zero or an empty box)", async () => {
  await withOrg({}, async (o) => { await o.signIn(); await o.go("billing"); await o.page.waitForSelector("h1:has-text('Billing')"); await o.page.waitForSelector(".calmempty:has-text('No credit.')"); });
});

scenario(12, "returning+mobile", "credit on a phone", async () => {
  await withOrg({ device: "mobile" }, async (o) => {
    await o.signIn(); await o.stack.createGame("tambola", o.email, {}); await o.stack.credit("tambola", o.email, 349900);
    await o.go("billing"); await o.page.waitForSelector("#bill-credit"); expect(await o.page.textContent("#bill-credit li .amt")).toBe("Rs 3,499"); expect(await o.page.locator("body").evaluate((b) => b.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});

scenario(12, "wrong", "one person's credit is never shown to another signed-in person", async () => {
  await withOrg({}, async (a) => {
    await a.signIn(); await a.stack.createGame("tambola", a.email, {}); await a.stack.credit("tambola", a.email, 239900);
    await withOrg({}, async (b) => { await b.signIn(); await b.stack.createGame("tambola", b.email, {}); await b.go("billing"); await b.page.waitForSelector(".calmempty:has-text('No credit.')"); });
  });
});

blocked(12, "new+desktop", "Moneypenny credit being applied to a price at checkout (credit minus price = amount to pay)", "Checkout, the credit maths and Moneypenny live in the game / payment repositories and need the provider; this repo has no Moneypenny code. Only the display of credit is tested here.");

// ---- step 13: payment ----
for (const device of ["desktop", "mobile"] as const) {
  scenario(13, device === "desktop" ? "returning+desktop" : "returning+mobile", "a game waiting for payment is under 'To pay' with Pay and 'Copy link for finance'; Pay hands over to the game's pay step", async () => {
    await withOrg({ device }, async (o) => {
      await o.signIn(); const { eid } = await waitingGame(o);
      await o.go("billing"); await o.page.waitForSelector(billRow(eid));
      expect(await o.page.textContent("#bill-payee")).toContain("IT Services by Rajat Agarwal through Razorpay");
      await o.page.click(`${billRow(eid)} button:has-text("Pay")`); await o.page.waitForURL(/signin\.html\?t=.*to=pay/);
      expect(o.page.url()).toContain(`e=${eid}`);
    });
  });
}

scenario(13, "returning+desktop", "'Copy link for finance' puts a pay link on the clipboard and says it works for 7 days", async () => {
  await withOrg({ clipboard: true }, async (o) => {
    await o.signIn(); const { eid } = await waitingGame(o);
    await o.go("billing"); await o.page.waitForSelector(billRow(eid)); await o.page.click(`${billRow(eid)} button:has-text("Copy link for finance")`);
    await o.page.waitForSelector(".toast:has-text('7 days')");
    expect(await o.page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/paylink\.html\?t=[0-9a-f]{48}$/);
  });
});

scenario(13, "dblclick", "double-clicking Pay opens the game once", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await waitingGame(o); await o.go("billing"); await o.page.waitForSelector(billRow(eid)); await o.stack.clearHits("tambola");
    await o.page.dblclick(`${billRow(eid)} button:has-text("Pay")`); await o.page.waitForURL(/signin\.html\?t=/);
    expect((await o.stack.hits("tambola")).hits.filter((h) => h === "POST /api/console/handoff").length).toBe(1);
  });
});

scenario(13, "wrong", "payment provider BUSY / switched off: the game stays 'waiting for payment' and still shows under 'To pay' (nothing marked paid)", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await waitingGame(o);
    const r = await o.stack.pay("tambola", eid, "busy"); expect(r).toMatchObject({ ok: false, state: "busy" });
    await o.go("billing"); await o.page.waitForSelector(billRow(eid)); expect(await o.page.locator(paidRow(eid)).count()).toBe(0);
    await o.go("mygames"); await o.page.waitForSelector(`article.gcard[data-eid="${eid}"] .chip[data-status="pending"]`);
  });
});

scenario(13, "wrong", "payment provider REFUSES: same safe state", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await waitingGame(o);
    expect(await o.stack.pay("tambola", eid, "fail")).toMatchObject({ ok: false, state: "failed" });
    await o.go("billing"); await o.page.waitForSelector(billRow(eid));
  });
});

scenario(13, "returning+desktop", "a Host is never asked to pay: another person's waiting game is not under 'To pay'", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const boss = "e2e-boss-" + Date.now() + "@demo-test.invalid";
    const { eid } = await o.stack.createGame("tambola", boss, { ...WAIT }); await o.stack.role("tambola", eid, o.email, "host");
    await o.go("billing"); await o.page.waitForSelector(".sechead:has-text('To pay')"); await o.page.waitForSelector(".calmempty:has-text('Nothing to pay.')"); expect(await o.page.locator(billRow(eid)).count()).toBe(0);
  });
});

scenario(13, "wrong", "game down while on Billing: a plain 'slow, try again' line, no broken page", async () => {
  await withOrg({}, async (o) => {
    try { await o.signIn(); await o.stack.persona("tambola", "down"); await o.go("billing"); await o.page.waitForSelector(".banner"); expect(await o.page.textContent(".banner")).toMatch(/slow, try again/); } finally { await o.stack.persona("tambola", "normal"); }
  });
});

scenario(13, "refresh", "refresh on Billing during payment-pending keeps the 'To pay' row", async () => {
  await withOrg({}, async (o) => { await o.signIn(); const { eid } = await waitingGame(o); await o.go("billing"); await o.page.waitForSelector(billRow(eid)); await o.page.reload(); await o.page.waitForSelector(billRow(eid)); });
});

scenario(13, "back", "Back from the pay step returns to Billing, row still there", async () => {
  await withOrg({}, async (o) => { await o.signIn(); const { eid } = await waitingGame(o); await o.go("billing"); await o.page.waitForSelector(billRow(eid)); await o.page.click(`${billRow(eid)} button:has-text("Pay")`); await o.page.waitForURL(/signin\.html/); await o.page.goBack(); await o.page.waitForSelector(billRow(eid)); });
});

scenario(13, "expired", "Pay pressed after the session ended: Sign in appears, nothing is handed over", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await waitingGame(o); await o.go("billing"); await o.page.waitForSelector(billRow(eid));
    await o.stack.expireSession(o.email); await o.stack.clearHits("tambola");
    await o.page.click(`${billRow(eid)} button:has-text("Pay")`);
    await o.page.waitForFunction(() => document.querySelector("#outlet h1")?.textContent === "Sign in" || !!document.querySelector(".toast"), null, { timeout: 12_000 });
    expect(o.page.url()).not.toContain("signin.html?t=");
  });
});

blocked(13, "returning+desktop", "the real payment page (Razorpay via IT Services), card/UPI, failed and retried payments", "Never run from here: no real payments. The page is in the game repo; PAY_VIA_MONEYPENNY on/off lives there. Stand-in modes ok / busy / fail are tested above.");

// ---- step 14: payment confirmation ----
scenario(14, "returning+desktop", "after the provider confirms: the game moves from 'To pay' to 'Paid' with amount, payer, an invoice link; My games says it is on", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await waitingGame(o, "Confirm party");
    expect(await o.stack.pay("tambola", eid, "ok")).toMatchObject({ ok: true, state: "paid" });
    await o.go("billing"); await o.page.waitForSelector(paidRow(eid));
    expect(await o.page.locator(billRow(eid)).count()).toBe(0);
    expect(await o.page.textContent(`${paidRow(eid)} .amt`)).toBe("Rs 2,399"); expect(await o.page.textContent(paidRow(eid))).toContain("paid by you");
    const a = o.page.locator(`${paidRow(eid)} a:has-text("Download invoice")`); expect(await a.getAttribute("href")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/invoice\/inv_[0-9a-f]{32}$/);
    expect(await a.getAttribute("rel")).toContain("noopener");
    await o.go("mygames"); await o.page.waitForSelector(`article.gcard[data-eid="${eid}"] .chip[data-status="paid"]`);
    expect(await o.page.textContent(`article.gcard[data-eid="${eid}"] [data-banner]`)).toContain("your game is on");
  });
});

scenario(14, "returning+mobile", "confirmation on a phone", async () => {
  await withOrg({ device: "mobile" }, async (o) => { await o.signIn(); const { eid } = await waitingGame(o); await o.stack.pay("tambola", eid, "ok"); await o.go("billing"); await o.page.waitForSelector(paidRow(eid)); expect(await o.page.locator("body").evaluate((b) => b.scrollWidth <= window.innerWidth + 1)).toBe(true); });
});

scenario(14, "refresh", "payment confirmed while Billing was open: a refresh shows it paid, the old 'To pay' row is gone", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await waitingGame(o); await o.go("billing"); await o.page.waitForSelector(billRow(eid));
    await o.stack.pay("tambola", eid, "ok"); await o.page.reload(); await o.page.waitForSelector(paidRow(eid)); expect(await o.page.locator(billRow(eid)).count()).toBe(0);
  });
});

scenario(14, "wrong", "an invoice address that is not the game's own invoice path is never made into a link (no javascript: links)", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { status: "ready", pack: 100, payment: { state: "paid", amountMinor: 100, currency: "INR" } });
    await o.stack.post("/game/billing", { game: "tambola", email: o.email, eid, gameName: "Bad invoice", invoice: "javascript:alert(1)" });
    await o.go("billing"); await o.page.waitForSelector(paidRow(eid)); expect(await o.page.locator(`${paidRow(eid)} a`).count()).toBe(0);
  });
});

scenario(14, "dblclick", "the CSV button pressed twice downloads two identical files (no crash, no half file)", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await waitingGame(o); await o.stack.pay("tambola", eid, "ok"); await o.go("billing"); await o.page.waitForSelector(paidRow(eid));
    const dl: string[] = [];
    for (let i = 0; i < 2; i++) { const [d] = await Promise.all([o.page.waitForEvent("download"), o.page.click("button:has-text('Download the list as CSV')")]); dl.push(await (await import("node:fs")).promises.readFile((await d.path())!, "utf8")); }
    expect(dl[0]).toBe(dl[1]); expect(dl[0].startsWith("Game,Game name,Date,What,Amount,Currency,Status,Paid by,Invoice\r\n")).toBe(true); expect(dl[0]).toContain("2399.00,INR,paid,you");
  });
});

blocked(14, "returning+desktop", "the 'payment received' e-mail and the invoice PDF content", "Sent by the game / payment service, not by the console. The stand-in only records that a mail would be sent; the real mail is for the game repo's own run.");
