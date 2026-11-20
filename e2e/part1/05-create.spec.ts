// Step 5: create a game. The console's part is: the Create screen, the account in the game, and the one-time hand-over to the game's own first step.
// The game's own wizard (name, people, time, prizes) lives in each game's repository: it is a stand-in page here (see blocked rows).
import { expect } from "bun:test";
import { scenario, blocked, withOrg, type Organizer } from "./lib/harness";

const GAMES = ["tambola", "bingo", "tictactoe", "snakesladders", "luckbychance", "luckydraw"];
const tile = (g: string) => `article.tile[data-game="${g}"]`;
async function redeem(o: Organizer, game: string, url: string) {
  const t = new URL(url).searchParams.get("t")!;
  const r = await fetch(o.w.games[game] + "/api/console/handoff/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t }) });
  return { status: r.status, json: (await r.json()) as any };
}

for (const device of ["desktop", "mobile"] as const) {
  scenario(5, device === "desktop" ? "new+desktop" : "new+mobile", "new organizer: Create -> Start on Tambola -> one-time link into the game's own first step; the account is made in that game only", async () => {
    await withOrg({ device }, async (o) => {
      await o.signIn(); await o.stack.clearHits("tambola"); await o.stack.clearHits("bingo");
      await o.go("create"); await o.page.waitForSelector(tile("tambola"));
      await o.page.click(`${tile("tambola")} button:has-text("Start")`);
      await o.page.waitForURL(/signin\.html\?t=/);
      const url = o.page.url();
      expect(url.startsWith(o.w.games.tambola)).toBe(true);
      expect(url).toMatch(/go=console&e=_new_/);
      const first = await redeem(o, "tambola", url);
      expect(first.status).toBe(200); expect(first.json.eid).toBe("_new_"); expect(first.json.kind).toBe("master");
      expect((await redeem(o, "tambola", url)).status).toBe(401); // the link works once
      const hits = (await o.stack.hits("tambola")).hits.join("\n");
      expect(hits).toMatch(/POST \/api\/console\/session/);
      expect((await o.stack.hits("bingo")).hits.filter((h) => h.includes("handoff")).length).toBe(0); // no other game was touched
      expect(o.errors).toEqual([]);
    });
  });
}

scenario(5, "new+desktop", "every live game's Start button hands over to THAT game's address", async () => {
  await withOrg({}, async (o) => {
    await o.signIn();
    for (const g of GAMES) {
      await o.page.goto(o.w.origin + "/#/create"); await o.page.waitForSelector(tile(g));
      if (!(await o.page.locator(`${tile(g)} button:has-text("Start")`).count())) continue; // a game that is not live has no button
      await o.page.click(`${tile(g)} button:has-text("Start")`);
      await o.page.waitForURL(/signin\.html\?t=/);
      expect(o.page.url().startsWith(o.w.games[g])).toBe(true);
    }
  });
});

scenario(5, "new+desktop", "'Try a free game' hands over with the free flag", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); await o.go("create"); await o.page.waitForSelector(tile("tambola"));
    await o.page.click(`${tile("tambola")} button:has-text("Try a free game")`); await o.page.waitForURL(/signin\.html\?t=/);
    expect(o.page.url()).toContain("free=1");
  });
});

scenario(5, "dblclick", "double-clicking Start makes one hand-over, not two accounts or two links", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); await o.stack.clearHits("tambola");
    await o.go("create"); await o.page.waitForSelector(tile("tambola"));
    await o.page.dblclick(`${tile("tambola")} button:has-text("Start")`);
    await o.page.waitForURL(/signin\.html\?t=/);
    const h = (await o.stack.hits("tambola")).hits;
    expect(h.filter((x) => x === "POST /api/console/handoff").length).toBe(1);
  });
});

scenario(5, "wrong", "the game is down: a plain 'try again' message, the page stays, the button works again", async () => {
  await withOrg({}, async (o) => {
    try {
      await o.signIn(); await o.go("create"); await o.page.waitForSelector(tile("tambola"));
      await o.stack.persona("tambola", "down");
      await o.page.click(`${tile("tambola")} button:has-text("Start")`);
      await o.page.waitForSelector(".toast"); expect(await o.page.textContent(".toast")).toMatch(/slow, try again|could not open|not open/);
      expect(o.page.url()).not.toContain("signin.html");
      await o.page.waitForFunction((sel) => !(document.querySelector(sel) as HTMLButtonElement).disabled, `${tile("tambola")} button.main`);
    } finally { await o.stack.persona("tambola", "normal"); }
  });
});

scenario(5, "slow", "a slow game (3 s) still ends in one hand-over", async () => {
  await withOrg({}, async (o) => {
    try {
      await o.signIn(); await o.go("create"); await o.page.waitForSelector(tile("tambola"));
      await o.stack.persona("tambola", "slow", 3000);
      await o.page.click(`${tile("tambola")} button:has-text("Start")`);
      await o.page.waitForURL(/signin\.html\?t=/, { timeout: 30_000 });
    } finally { await o.stack.persona("tambola", "normal"); }
  });
}, { timeout: 120_000 });

scenario(5, "refresh", "refreshing the Create screen keeps the six tiles", async () => {
  await withOrg({}, async (o) => { await o.signIn(); await o.go("create"); await o.page.waitForSelector(tile("tambola")); await o.page.reload(); await o.page.waitForSelector(tile("tambola")); expect(await o.page.locator("article.tile").count()).toBe(6); });
});

scenario(5, "back", "after the hand-over, Back returns to the console Create screen, signed in", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); await o.go("create"); await o.page.waitForSelector(tile("tambola"));
    await o.page.click(`${tile("tambola")} button:has-text("Start")`); await o.page.waitForURL(/signin\.html\?t=/);
    await o.page.goBack(); await o.page.waitForSelector(tile("tambola"));
    expect(await o.page.locator("h1:has-text('Create a new game')").count()).toBe(1);
  });
});

scenario(5, "expired", "session ended before pressing Start: the person is sent to Sign in, nothing is handed over", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); await o.go("create"); await o.page.waitForSelector(tile("tambola"));
    await o.stack.expireSession(o.email); await o.stack.clearHits("tambola");
    await o.page.click(`${tile("tambola")} button:has-text("Start")`);
    await o.page.waitForFunction(() => document.querySelector("#outlet h1")?.textContent === "Sign in" || !!document.querySelector(".toast"), null, { timeout: 12_000 });
    expect(o.page.url()).not.toContain("signin.html?t=");
    expect((await o.stack.hits("tambola")).hits.filter((h) => h.includes("handoff"))).toEqual([]);
  });
});

blocked(5, "new+desktop", "the game's own Step 1 (name, company, size) after the hand-over", "Lives in corporate-tambola (and the other game repos). Here the hand-over page is a stand-in; the hand-over itself is tested above.");
