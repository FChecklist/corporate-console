// Extra permutations on the money and control screens: slow network, and phone size for the later steps.
import { expect } from "bun:test";
import { scenario, withOrg } from "./lib/harness";

const PAID = { status: "ready", nextAction: "share", pack: 100, payment: { state: "paid", amountMinor: 239900, currency: "INR" } };
const slow = { slow: true } as const;

scenario(6, "slow", "My games on a slow connection: the list arrives, no duplicate cards", async () => {
  await withOrg(slow, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, {}); await o.go("mygames");
    await o.page.waitForSelector(`article.gcard[data-eid="${eid}"]`, { timeout: 60_000 }); await o.page.waitForTimeout(1000); expect(await o.page.locator("article.gcard").count()).toBe(1);
  });
}, { timeout: 180_000 });

scenario(13, "slow", "Billing on a slow connection: 'To pay' arrives and Pay still works once", async () => {
  await withOrg(slow, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { status: "waiting_payment", nextAction: "pay", payment: { state: "waiting" } }); await o.go("billing");
    await o.page.waitForSelector(`#bill-topay li[data-eid="${eid}"]`, { timeout: 60_000 }); await o.stack.clearHits("tambola");
    await o.page.dblclick(`#bill-topay li[data-eid="${eid}"] button:has-text("Pay")`); await o.page.waitForURL(/signin\.html\?t=/, { timeout: 60_000 });
    expect((await o.stack.hits("tambola")).hits.filter((h) => h === "POST /api/console/handoff").length).toBe(1);
  });
}, { timeout: 180_000 });

scenario(15, "slow", "Start now on a slow connection: pressed twice quickly, started once", async () => {
  await withOrg(slow, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { ...PAID, ext: { startMode: "manual-start-auto-play" } }); await o.go("control");
    await o.page.waitForSelector(`#cr-body article[data-eid="${eid}"]`, { timeout: 60_000 }); await o.stack.clearHits("tambola");
    await o.page.dblclick(`#cr-body article[data-eid="${eid}"] button:has-text("Start now")`); await o.page.waitForSelector(".toast:has-text('Started.')", { timeout: 60_000 });
    expect((await o.stack.hits("tambola")).hits.filter((h) => h === "POST /api/console/control").length).toBe(1);
  });
}, { timeout: 180_000 });

scenario(19, "mobile", "Billing CSV download on a phone-size window", async () => {
  await withOrg({ device: "mobile" }, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { status: "waiting_payment", nextAction: "pay", payment: { state: "waiting" } }); await o.stack.pay("tambola", eid, "ok");
    await o.go("billing"); await o.page.waitForSelector(`#bill-paid li[data-eid="${eid}"]`);
    const [d] = await Promise.all([o.page.waitForEvent("download"), o.page.click("button:has-text('Download the list as CSV')")]); expect(d.suggestedFilename()).toBe("payments.csv");
  });
});

scenario(20, "mobile", "Close my account on a phone-size window: asked first, then signed out", async () => {
  await withOrg({ device: "mobile" }, async (o) => {
    await o.signIn(); await o.go("account"); await o.page.waitForSelector("#acct-close button:has-text('Close my account')");
    await o.page.click("#acct-close button:has-text('Close my account')"); await o.page.waitForSelector(".confirm"); expect(await o.page.locator("body").evaluate((b) => b.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await o.page.click(".confirm button:has-text('Yes, close it')"); await o.page.waitForSelector("#outlet h1:has-text('Sign in')");
  });
});

scenario(18, "mobile", "sign-in mail wording and the code box fit a phone-size window", async () => {
  await withOrg({ device: "mobile" }, async (o) => {
    await o.page.goto(o.w.origin + "/"); await o.page.fill("#si-email", o.email); await o.page.check("#si-consent"); await o.page.click("text=Send me a code"); await o.page.waitForSelector("#si-code");
    expect(await o.page.locator("body").evaluate((b) => b.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect((await o.stack.mail()).recorded.filter((m) => m.to === o.email)[0].text).toContain("30 minutes");
  });
});
