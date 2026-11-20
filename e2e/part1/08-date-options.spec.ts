// Step 8: date (how the console shows a game's date and time; the date itself is set in the game). Step 9: options (what the console shows of size, price, rules).
import { expect } from "bun:test";
import { scenario, blocked, withOrg } from "./lib/harness";

const card = (eid: string) => `article.gcard[data-eid="${eid}"]`;
const facts = (eid: string) => `${card(eid)} .facts li`;

scenario(8, "returning+desktop", "a game at 10:30 UTC is shown as 'Wed 25 Nov, 4:00 pm IST'", async () => {
  await withOrg({ tz: "Asia/Kolkata" }, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { startMs: Date.UTC(2026, 10, 25, 10, 30) });
    await o.go("mygames"); await o.page.waitForSelector(card(eid));
    expect(await o.page.textContent(`${facts(eid)} >> nth=0`)).toBe("Wed 25 Nov, 4:00 pm IST");
  });
});

scenario(8, "returning+desktop", "a viewer in New York sees IST plus their own time", async () => {
  await withOrg({ tz: "America/New_York" }, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { startMs: Date.UTC(2026, 10, 25, 10, 30) });
    await o.go("mygames"); await o.page.waitForSelector(card(eid));
    expect(await o.page.textContent(`${facts(eid)} >> nth=0`)).toBe("Wed 25 Nov, 4:00 pm IST (5:30 am your time)");
  });
});

scenario(8, "returning+mobile", "the date is not cut off on a phone", async () => {
  await withOrg({ device: "mobile" }, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { startMs: Date.UTC(2026, 10, 25, 10, 30) });
    await o.go("mygames"); await o.page.waitForSelector(card(eid));
    const box = await o.page.locator(`${facts(eid)} >> nth=0`).boundingBox(); expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(await o.page.locator("body").evaluate((b) => b.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});

scenario(8, "wrong", "just after midnight in India (19:00 UTC the day before) is the NEXT calendar day, not the UTC day", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { startMs: Date.UTC(2026, 10, 24, 19, 0) });
    await o.go("mygames"); await o.page.waitForSelector(card(eid));
    expect(await o.page.textContent(`${facts(eid)} >> nth=0`)).toBe("Tue 25 Nov, 12:30 am IST".replace("Tue", "Wed"));
  });
});

scenario(8, "wrong", "a game with no date says 'Not scheduled yet' (not 'Invalid Date' or 1970)", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { startMs: null });
    await o.go("mygames"); await o.page.waitForSelector(card(eid));
    expect(await o.page.textContent(`${facts(eid)} >> nth=0`)).toBe("Not scheduled yet"); expect(await o.page.textContent("body")).not.toMatch(/Invalid Date|1970|NaN/);
  });
});

scenario(8, "returning+desktop", "a paid game starting today appears on Home under 'Needs your attention' as 'Starts today'", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { name: "Today party", status: "ready", nextAction: "share", startMs: Date.now() + 5_000, pack: 100, payment: { state: "paid", amountMinor: 239900, currency: "INR" } });
    await o.page.reload(); await o.page.waitForSelector("#h-attn");
    expect(await o.page.textContent(`.row[data-eid="${eid}"]`)).toContain("Starts today");
  });
});

scenario(8, "returning+desktop", "a draft that starts within a day and is not published is flagged on Home ('Not published yet')", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { name: "Soon draft", startMs: Date.now() + 3 * 3600_000 });
    await o.page.reload(); await o.page.waitForSelector(`.row[data-eid="${eid}"]`);
    expect(await o.page.textContent(`.row[data-eid="${eid}"]`)).toContain("Not published yet");
  });
});

scenario(8, "returning+desktop", "a date moved in the game shows on the next visit without logging in again", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { startMs: Date.UTC(2026, 10, 25, 10, 30) });
    await o.go("mygames"); await o.page.waitForSelector(card(eid));
    await o.stack.patchGame("tambola", eid, { startMs: Date.UTC(2026, 10, 27, 14, 0) });
    await o.page.reload(); await o.page.waitForSelector(card(eid));
    expect(await o.page.textContent(`${facts(eid)} >> nth=0`)).toBe("Fri 27 Nov, 7:30 pm IST");
  });
});

blocked(8, "new+desktop", "picking the date and time in the game's wizard (calendar, past dates refused)", "The date picker is in the game repository. Here only the display of a date is tested.");

// ---- step 9 ----
scenario(9, "new+desktop", "Create tiles show what each game declares: sizes, 'Try it first', price line from the game's own answer", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); await o.go("create"); await o.page.waitForSelector("article.tile[data-game=tambola]");
    await o.page.waitForFunction(() => /From Rs/.test(document.querySelector("[data-price=tambola]")?.textContent || ""));
    const t = await o.page.textContent("article.tile[data-game=tambola]");
    expect(t).toContain("Up to 100,000 people, or 1,000 when a Host calls the numbers.");
    expect(t).toContain("Try it first: up to 20 people, no prizes, no payment.");
    expect(t).toMatch(/From Rs 2,399 for up to 100 people/); expect(t).toContain("Free up to 10 people.");
  });
});

scenario(9, "new+mobile", "the same tiles fit a phone: no sideways scroll, buttons at least 44 px high", async () => {
  await withOrg({ device: "mobile" }, async (o) => {
    await o.signIn(); await o.go("create"); await o.page.waitForSelector("article.tile[data-game=tambola]");
    expect(await o.page.locator("body").evaluate((b) => b.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const h = await o.page.locator("article.tile[data-game=tambola] button").evaluateAll((bs) => bs.map((b) => (b as HTMLElement).getBoundingClientRect().height));
    for (const x of h) expect(x).toBeGreaterThanOrEqual(43.5);
  });
});

scenario(9, "returning+desktop", "a card shows the size ('up to 250 people') of the game as the game reports it", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { cap: 250 });
    await o.go("mygames"); await o.page.waitForSelector(card(eid)); expect(await o.page.textContent(`${facts(eid)} >> nth=1`)).toContain("up to 250 people");
  });
});

scenario(9, "wrong", "game price answer missing (game down): tile still works, no 'undefined' or 'NaN' text", async () => {
  await withOrg({}, async (o) => {
    try {
      await o.signIn(); await o.stack.persona("tambola", "down"); await o.go("create"); await o.page.waitForSelector("article.tile[data-game=tambola]"); await o.page.waitForTimeout(800);
      expect(await o.page.textContent("article.tile[data-game=tambola]")).not.toMatch(/undefined|NaN|null/);
    } finally { await o.stack.persona("tambola", "normal"); }
  });
});

blocked(9, "new+desktop", "setting options in the game (prizes, tickets per person, auto-claim, brand)", "Options are chosen on the game's own pages; the console only shows what the game declares (tested above and in the start-format file).");
