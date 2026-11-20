// Steps 6 and 7: manage (My games) and edit (what the console can do to a game: open at a step, copy, delete a draft).
import { expect } from "bun:test";
import { scenario, blocked, withOrg, type Organizer } from "./lib/harness";

const card = (eid: string) => `article.gcard[data-eid="${eid}"]`;
const NOW = () => Date.now();
async function seed(o: Organizer) {
  const mk = (name: string, o2: any) => o.stack.createGame("tambola", o.email, { name, ...o2 }).then((r) => r.eid);
  return {
    draft: await mk("Draft party", {}),
    wait: await mk("Waiting party", { status: "waiting_payment", nextAction: "pay", payment: { state: "waiting" }, cap: 250 }),
    ready: await mk("Ready party", { status: "ready", nextAction: "share", pack: 100, payment: { state: "paid", amountMinor: 239900, currency: "INR" } }),
    live: await mk("Live party", { status: "playing", nextAction: "run", startMs: NOW() - 600_000, pack: 100, payment: { state: "paid", amountMinor: 239900, currency: "INR" } }),
    done: await mk("Done party", { status: "finished", nextAction: "none", startMs: NOW() - 2 * 86400_000, pack: 100, payment: { state: "paid", amountMinor: 239900, currency: "INR" } }),
    cancelled: await mk("Cancelled party", { status: "cancelled", nextAction: "none", pack: 100, payment: { state: "credit" } }),
  };
}

for (const device of ["desktop", "mobile"] as const) {
  scenario(6, device === "desktop" ? "returning+desktop" : "returning+mobile", "My games: one card per game with the right status word and banner for draft, waiting, ready, live, done, cancelled", async () => {
    await withOrg({ device }, async (o) => {
      await o.signIn(); const g = await seed(o);
      await o.go("mygames"); await o.page.waitForSelector(card(g.draft));
      const want: Record<string, string> = { draft: "Draft", wait: "Published, payment pending", ready: "Published and paid", live: "Live now", done: "Completed", cancelled: "Cancelled" };
      for (const [k, label] of Object.entries(want)) expect(await o.page.textContent(`${card((g as any)[k])} .chip[data-status]`)).toBe(label);
      expect(await o.page.textContent(`${card(g.ready)} [data-banner]`)).toContain("your game is on");
      expect(await o.page.textContent(`${card(g.done)} [data-banner]`)).toContain("report");
      expect(await o.page.textContent(`${card(g.draft)} .who`)).toContain("You let in");
      expect(await o.page.locator("body").evaluate((b) => b.scrollWidth <= window.innerWidth + 1)).toBe(true);
      expect(o.errors).toEqual([]);
    });
  });
}

scenario(6, "returning+desktop", "filters: 'Coming up' hides finished and cancelled; 'Finished' shows only those", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const g = await seed(o); await o.go("mygames"); await o.page.waitForSelector(card(g.draft));
    await o.page.check("input[name=mf][value=coming]");
    expect(await o.page.locator(card(g.done)).count() + (await o.page.locator(card(g.cancelled)).count())).toBe(0);
    expect(await o.page.locator(card(g.ready)).count()).toBe(1);
    await o.page.check("input[name=mf][value=finished]");
    expect(await o.page.locator(card(g.done)).count()).toBe(1); expect(await o.page.locator(card(g.ready)).count()).toBe(0);
  });
});

scenario(6, "new+desktop", "a new organizer with no games sees a calm 'No games yet' and where to go next", async () => {
  await withOrg({}, async (o) => { await o.signIn(); await o.go("mygames"); await o.page.waitForSelector(".calmempty"); expect(await o.page.textContent(".calmempty")).toContain("No games yet."); expect(await o.page.textContent(".calmempty")).toContain(o.email); });
});

scenario(6, "wrong", "one game down: the others still show, and a plain 'slow, try again' line names the one that did not answer (never 'No games yet')", async () => {
  await withOrg({}, async (o) => {
    try {
      await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { name: "Still here" });
      await o.stack.persona("bingo", "down");
      await o.go("mygames"); await o.page.waitForSelector(card(eid));
      expect(await o.page.textContent(".banner")).toMatch(/slow, try again/);
    } finally { await o.stack.persona("bingo", "normal"); }
  });
});

scenario(6, "wrong", "every game down: 'could not reach your games' with a Try again button, never 'No games yet'", async () => {
  await withOrg({}, async (o) => {
    const ids = ["tambola", "bingo", "tictactoe", "snakesladders", "luckbychance", "luckydraw"];
    try {
      await o.signIn(); for (const g of ids) await o.stack.persona(g, "down");
      await o.go("mygames"); await o.page.waitForSelector(".calmempty");
      expect(await o.page.textContent("#mg-body")).toContain("could not reach your games"); expect(await o.page.textContent("#mg-body")).not.toContain("No games yet");
      for (const g of ids) await o.stack.persona(g, "normal");
      await o.page.click("button:has-text('Try again')"); await o.page.waitForSelector(".calmempty:has-text('No games yet')");
    } finally { for (const g of ids) await o.stack.persona(g, "normal"); }
  });
});

scenario(6, "returning+desktop", "a long list (120 games, fetched 50 at a time) is shown completely", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); for (let i = 0; i < 120; i++) await o.stack.createGame("tambola", o.email, { eid: "BULK" + String(i).padStart(3, "0"), name: "Bulk " + i, status: "finished", nextAction: "none" });
    await o.go("mygames"); await o.page.waitForSelector("article.gcard");
    await o.page.waitForFunction(() => document.querySelectorAll("article.gcard").length === 120, null, { timeout: 20_000 });
  });
}, { timeout: 120_000 });

scenario(6, "returning+desktop", "an invitation as Co-host appears as 'Invitation'; Accept makes the role real; the other person's game never shows money", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const boss = "e2e-boss-" + Date.now() + "@demo-test.invalid";
    const { eid } = await o.stack.createGame("tambola", boss, { name: "Boss party", status: "ready", pack: 100, nextAction: "share", payment: { state: "paid", amountMinor: 239900, currency: "INR" } });
    await o.stack.role("tambola", eid, o.email, "cohost", "invited");
    await o.go("mygames"); await o.page.waitForSelector(card(eid));
    expect(await o.page.textContent(`${card(eid)} .chip.ready`)).toBe("Invitation");
    expect(await o.page.textContent(card(eid))).not.toContain("2,399");
    await o.page.click(`${card(eid)} button:has-text("Accept")`);
    await o.page.waitForFunction((s) => !document.querySelector(s + " .chip.ready"), card(eid));
  });
});

scenario(6, "refresh", "refreshing My games twice in a row shows the same list (no duplicates)", async () => {
  await withOrg({}, async (o) => { await o.signIn(); const g = await seed(o); await o.go("mygames"); await o.page.waitForSelector(card(g.draft)); await o.page.reload(); await o.page.reload(); await o.page.waitForSelector(card(g.draft)); await o.page.waitForTimeout(400); expect(await o.page.locator("article.gcard").count()).toBe(6); });
});

scenario(6, "back", "Back from the game hand-over returns to My games with the list intact", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const g = await seed(o); await o.go("mygames"); await o.page.waitForSelector(card(g.ready));
    await o.page.click(`${card(g.ready)} button:has-text("Open")`); await o.page.waitForURL(/signin\.html\?t=/);
    await o.page.goBack(); await o.page.waitForSelector(card(g.ready));
  });
});

// ---- step 7: edit ----
scenario(7, "returning+desktop", "'Publish' on a draft hands over to the game at the publish step (e=<id>, to=publish), one-time link", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const g = await seed(o); await o.go("mygames"); await o.page.waitForSelector(card(g.draft));
    await o.page.click(`${card(g.draft)} button:has-text("Publish")`); await o.page.waitForURL(/signin\.html\?t=/);
    expect(o.page.url()).toContain(`e=${g.draft}`); expect(o.page.url()).toContain("to=publish");
  });
});

scenario(7, "returning+desktop", "'Make a copy' makes a NEW draft and opens that one, never the original", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const g = await seed(o); await o.go("mygames"); await o.page.waitForSelector(card(g.done));
    await o.page.click(`${card(g.done)} button:has-text("Make a copy")`); await o.page.waitForURL(/signin\.html\?t=/);
    const e = new URL(o.page.url()).searchParams.get("e")!; expect(e).toMatch(/^CLONE/); expect(e).not.toBe(g.done);
  });
});

scenario(7, "returning+desktop", "Delete draft asks first: No keeps it, Yes removes it from the list and from the game", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const g = await seed(o); await o.go("mygames"); await o.page.waitForSelector(card(g.draft));
    await o.page.click(`${card(g.draft)} button:has-text("Delete draft")`); await o.page.waitForSelector(".confirm");
    await o.page.click(".confirm button:has-text('No')"); expect(await o.page.locator(card(g.draft)).count()).toBe(1);
    await o.page.click(`${card(g.draft)} button:has-text("Delete draft")`); await o.page.click(".confirm button:has-text('Yes, delete')");
    await o.page.waitForFunction((s) => !document.querySelector(s), card(g.draft));
    expect((await o.stack.getGame("tambola", g.draft)).game).toBeNull();
    expect(await o.page.locator(`${card(g.ready)} button:has-text("Delete draft")`).count()).toBe(0); // only drafts can be deleted
  });
});

scenario(7, "dblclick", "double-clicking 'Yes, delete' sends one delete", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const g = await seed(o); await o.go("mygames"); await o.page.waitForSelector(card(g.draft)); await o.stack.clearHits("tambola");
    await o.page.click(`${card(g.draft)} button:has-text("Delete draft")`); await o.page.dblclick(".confirm button:has-text('Yes, delete')");
    await o.page.waitForFunction((s) => !document.querySelector(s), card(g.draft)); await o.page.waitForTimeout(300);
    expect((await o.stack.hits("tambola")).hits.filter((h) => h.startsWith("POST") && h.includes("/discard")).length).toBe(1);
  });
});

scenario(7, "wrong", "a draft that was published in another tab before 'Yes, delete': the game refuses, the card stays, a plain message appears", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const g = await seed(o); await o.go("mygames"); await o.page.waitForSelector(card(g.draft));
    await o.page.click(`${card(g.draft)} button:has-text("Delete draft")`);
    await o.stack.patchGame("tambola", g.draft, { status: "waiting_payment" });
    await o.page.click(".confirm button:has-text('Yes, delete')");
    await o.page.waitForSelector(".toast"); expect(await o.page.textContent(".toast")).toContain("could not be deleted");
    expect(await o.page.locator(card(g.draft)).count()).toBe(1);
  });
});

scenario(7, "wrong", "Escape closes the delete question without deleting", async () => {
  await withOrg({}, async (o) => { await o.signIn(); const g = await seed(o); await o.go("mygames"); await o.page.waitForSelector(card(g.draft)); await o.page.click(`${card(g.draft)} button:has-text("Delete draft")`); await o.page.keyboard.press("Escape"); await o.page.waitForFunction(() => !document.querySelector(".confirm")); expect(await o.page.locator(card(g.draft)).count()).toBe(1); });
});

scenario(7, "refresh", "refresh right after Delete draft shows the draft really gone", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const g = await seed(o); await o.go("mygames"); await o.page.waitForSelector(card(g.draft));
    await o.page.click(`${card(g.draft)} button:has-text("Delete draft")`); await o.page.click(".confirm button:has-text('Yes, delete')"); await o.page.waitForFunction((s) => !document.querySelector(s), card(g.draft));
    await o.page.reload(); await o.page.waitForSelector(card(g.ready)); expect(await o.page.locator(card(g.draft)).count()).toBe(0);
  });
});

blocked(7, "returning+desktop", "editing name, size, people, prizes, brand inside the game", "Editing happens on the game's own pages (corporate-tambola etc.), not in the console; the console's only part is the hand-over, tested above.");
