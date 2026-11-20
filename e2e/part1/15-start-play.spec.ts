// Steps 15 and 16: start, and play in all four start formats. The console's part is the Control room: it offers Start / Pause / Resume only where the game's start format and the person's role allow it,
// and the game decides (docs/CONTROL_CONTRACT.md). The actual play (calling numbers, tickets, claims) is in the game repositories and is blocked here.
import { expect } from "bun:test";
import { scenario, blocked, withOrg, START_FORMATS } from "./lib/harness";

const PAID = { status: "ready", nextAction: "share", pack: 100, payment: { state: "paid", amountMinor: 239900, currency: "INR" } };
const cr = (eid: string) => `#cr-body article.gcard[data-eid="${eid}"]`;
const manual = (f: string) => f.startsWith("manual");

// ---- step 15: start ----
scenario(15, "returning+desktop", "manual start: 'Start now' -> 'Started.' -> the game moves to 'Running now' as Live, with Pause", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { ...PAID, startMs: Date.now() + 60_000, ext: { startMode: "manual-start-auto-play" } });
    await o.go("control"); await o.page.waitForSelector(cr(eid));
    await o.page.click(`${cr(eid)} button:has-text("Start now")`);
    await o.page.waitForSelector(".toast:has-text('Started.')");
    await o.page.waitForSelector(`#cr-body section:has(h2:has-text("Running now")) article[data-eid="${eid}"] button:has-text("Pause")`);
    expect((await o.stack.getGame("tambola", eid)).game.status).toBe("playing");
    expect(await o.page.locator(`${cr(eid)} button:has-text("Start now")`).count()).toBe(0);
  });
});

scenario(15, "returning+mobile", "manual start on a phone", async () => {
  await withOrg({ device: "mobile" }, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { ...PAID, ext: { startMode: "manual-start-manual-play" } });
    await o.go("control"); await o.page.waitForSelector(cr(eid)); await o.page.click(`${cr(eid)} button:has-text("Start now")`); await o.page.waitForSelector(".toast:has-text('Started.')");
  });
});

scenario(15, "dblclick", "double-clicking 'Start now' starts once (one control call)", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { ...PAID, ext: { startMode: "manual-start-auto-play" } });
    await o.go("control"); await o.page.waitForSelector(cr(eid)); await o.stack.clearHits("tambola");
    await o.page.dblclick(`${cr(eid)} button:has-text("Start now")`); await o.page.waitForSelector(".toast:has-text('Started.')");
    expect((await o.stack.hits("tambola")).hits.filter((h) => h === "POST /api/console/control").length).toBe(1);
  });
});

scenario(15, "refresh", "refreshing after Start shows the game under 'Running now' (not 'Start now' again)", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { ...PAID, ext: { startMode: "manual-start-auto-play" } });
    await o.go("control"); await o.page.waitForSelector(cr(eid)); await o.page.click(`${cr(eid)} button:has-text("Start now")`); await o.page.waitForSelector(".toast:has-text('Started.')");
    await o.page.reload(); await o.page.waitForSelector(`${cr(eid)} button:has-text("Pause")`); expect(await o.page.locator(`${cr(eid)} button:has-text("Start now")`).count()).toBe(0);
  });
});

scenario(15, "wrong", "the game was already started elsewhere: the game says 'state', the person is told to look again, nothing breaks", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { ...PAID, ext: { startMode: "manual-start-auto-play" } });
    await o.go("control"); await o.page.waitForSelector(cr(eid));
    await o.stack.patchGame("tambola", eid, { status: "playing" });
    await o.page.click(`${cr(eid)} button:has-text("Start now")`);
    await o.page.waitForSelector(".toast:has-text('not in a state for that')");
  });
});

scenario(15, "wrong", "the game is down at the moment of Start: 'slow, try again', the button comes back, the game is NOT shown as started", async () => {
  await withOrg({}, async (o) => {
    try {
      await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { ...PAID, ext: { startMode: "manual-start-auto-play" } });
      await o.go("control"); await o.page.waitForSelector(cr(eid)); await o.stack.persona("tambola", "down");
      await o.page.click(`${cr(eid)} button:has-text("Start now")`); await o.page.waitForSelector(".toast:has-text('slow, try again')");
      expect(await o.page.locator(`${cr(eid)} button:has-text("Start now")`).isEnabled()).toBe(true);
      expect(await o.page.locator(`#cr-body section:has(h2:has-text("Running now")) article[data-eid="${eid}"]`).count()).toBe(0);
    } finally { await o.stack.persona("tambola", "normal"); }
  });
});

scenario(15, "expired", "session ended before Start: the Control room does not start anything and sends the person to Sign in", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { ...PAID, ext: { startMode: "manual-start-auto-play" } });
    await o.go("control"); await o.page.waitForSelector(cr(eid)); await o.stack.expireSession(o.email);
    await o.page.click(`${cr(eid)} button:has-text("Start now")`);
    await o.page.waitForFunction(() => document.querySelector("#outlet h1")?.textContent === "Sign in" || !!document.querySelector(".toast"), null, { timeout: 12_000 });
    expect((await o.stack.getGame("tambola", eid)).game.status).toBe("ready");
  });
});

scenario(15, "returning+desktop", "a Host may start; a Co-host cannot even see the game in the Control room", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const boss = "e2e-boss-" + Date.now() + "@demo-test.invalid";
    const h = await o.stack.createGame("tambola", boss, { ...PAID, ext: { startMode: "manual-start-auto-play" } }); const c = await o.stack.createGame("tambola", boss, { ...PAID, ext: { startMode: "manual-start-auto-play" } });
    await o.stack.role("tambola", h.eid, o.email, "host"); await o.stack.role("tambola", c.eid, o.email, "cohost");
    await o.go("control"); await o.page.waitForSelector(cr(h.eid)); await o.page.click(`${cr(h.eid)} button:has-text("Start now")`); await o.page.waitForSelector(".toast:has-text('Started.')");
    expect(await o.page.locator(cr(c.eid)).count()).toBe(0);
  });
});

scenario(15, "back", "Back from the Control room's Open returns to the Control room", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { ...PAID, ext: { startMode: "manual-start-auto-play" } });
    await o.go("control"); await o.page.waitForSelector(cr(eid)); await o.page.click(`${cr(eid)} button:has-text("Open")`); await o.page.waitForURL(/signin\.html\?t=/); await o.page.goBack(); await o.page.waitForSelector(cr(eid));
  });
});

// ---- step 16: all four start formats ----
for (const f of START_FORMATS) {
  const perm = "fmt:" + f;
  scenario(16, perm, `${f}: Start button only for manual start; auto start shows the game as Live when the game moves it`, async () => {
    await withOrg({}, async (o) => {
      await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { ...PAID, startMs: Date.now() + 120_000, ext: { startMode: f } });
      await o.go("control"); await o.page.waitForSelector(cr(eid));
      const hasStart = (await o.page.locator(`${cr(eid)} button:has-text("Start now")`).count()) === 1;
      expect(hasStart).toBe(manual(f));
      if (manual(f)) { await o.page.click(`${cr(eid)} button:has-text("Start now")`); await o.page.waitForSelector(".toast:has-text('Started.')"); }
      else { await o.stack.patchGame("tambola", eid, { status: "playing", nextAction: "run" }); await o.page.reload(); }   // the game's own timer started it
      await o.page.waitForSelector(`#cr-body section:has(h2:has-text("Running now")) article[data-eid="${eid}"] .chip[data-status="live"]`);
      expect(await o.page.textContent(`${cr(eid)} .chip[data-status="live"]`)).toBe("Live now");
    });
  });
  scenario(16, perm, `${f}: Pause then Resume while playing; Players' pause is the game's job, the pill says Paused`, async () => {
    await withOrg({}, async (o) => {
      await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { status: "playing", nextAction: "run", pack: 100, startMs: Date.now() - 60_000, payment: { state: "paid", amountMinor: 239900, currency: "INR" }, ext: { startMode: f } });
      await o.go("control"); await o.page.waitForSelector(`${cr(eid)} button:has-text("Pause")`);
      await o.page.click(`${cr(eid)} button:has-text("Pause")`); await o.page.waitForSelector(".toast:has-text('Paused.')");
      await o.page.waitForSelector(`${cr(eid)} .pausedpill`); expect(await o.page.textContent(`${cr(eid)} .pausedpill`)).toBe("Paused");
      await o.page.click(`${cr(eid)} button:has-text("Resume")`); await o.page.waitForSelector(".toast:has-text('Resumed.')");
      await o.page.waitForSelector(`${cr(eid)} .chip[data-status="live"]`);
      const log = (await o.stack.get("/game/get?game=tambola&eid=" + eid)).ext; expect(log.paused).toBe(false);
    });
  });
  scenario(16, perm, `${f}: Pause pressed twice quickly pauses once (second is refused by the game, no error shown)`, async () => {
    await withOrg({}, async (o) => {
      await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { status: "playing", nextAction: "run", pack: 100, startMs: Date.now() - 60_000, payment: { state: "paid", amountMinor: 239900, currency: "INR" }, ext: { startMode: f } });
      await o.go("control"); await o.page.waitForSelector(`${cr(eid)} button:has-text("Pause")`); await o.stack.clearHits("tambola");
      await o.page.dblclick(`${cr(eid)} button:has-text("Pause")`); await o.page.waitForSelector(`${cr(eid)} .pausedpill`);
      expect((await o.stack.hits("tambola")).hits.filter((h) => h === "POST /api/console/control").length).toBe(1);
      expect(o.errors).toEqual([]);
    });
  });
}

scenario(16, "returning+mobile", "a live game on a phone shows Pause and the Live pill without sideways scroll", async () => {
  await withOrg({ device: "mobile" }, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { status: "playing", nextAction: "run", pack: 100, startMs: Date.now() - 60_000, payment: { state: "paid", amountMinor: 239900, currency: "INR" }, ext: { startMode: "auto-start-auto-play" } });
    await o.go("control"); await o.page.waitForSelector(`${cr(eid)} button:has-text("Pause")`); expect(await o.page.locator("body").evaluate((b) => b.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});

scenario(16, "returning+desktop", "a live game appears on Home under 'Playing now' with an Open button", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { name: "Now party", status: "playing", nextAction: "run", pack: 100, startMs: Date.now() - 3 * 3600_000, payment: { state: "paid", amountMinor: 239900, currency: "INR" } });
    await o.page.reload(); await o.page.waitForSelector("#h-live"); expect(await o.page.textContent(`.row[data-eid="${eid}"]`)).toContain("Playing now");
  });
});

blocked(16, "fmt:auto-start-auto-play", "playing the game itself (numbers called, tickets marked, claims, prizes, ties)", "Gameplay is in the game repositories (corporate-tambola etc.) with their own engine tests; this repo's stack has no game engine.");
blocked(16, "fmt:auto-start-manual-play", "Host calling numbers by hand", "Gameplay is in the game repository.");
blocked(16, "fmt:manual-start-auto-play", "auto number calling after a manual start", "Gameplay is in the game repository.");
blocked(16, "fmt:manual-start-manual-play", "manual calling after a manual start", "Gameplay is in the game repository.");
blocked(15, "new+desktop", "auto-start at the scheduled second (the game's own timer)", "The timer is the game's; the console shows the result (tested in step 16 by moving the game state).");
