// Step 3: repeat visit. Step 4: automatic sign-in (cookie), sign-out, expired session.
import { expect } from "bun:test";
import { scenario, withOrg, organizer, newEmail } from "./lib/harness";

const home = "h1:has-text('What would you like to do?')";
const DAY = 86400_000;

for (const device of ["desktop", "mobile"] as const) {
  scenario(3, device === "desktop" ? "returning+desktop" : "returning+mobile", "returning organizer: a new tab goes straight to Home, no code asked, own games listed", async () => {
    await withOrg({ device }, async (o) => {
      await o.signIn();
      const { eid } = await o.stack.createGame("tambola", o.email, { name: "Friday party" });
      await o.stack.clearMail();
      const tab2 = await o.ctx.newPage();
      await tab2.goto(o.w.origin + "/#/mygames");
      await tab2.waitForSelector(`article.gcard[data-eid="${eid}"]`);
      expect((await o.stack.mail()).recorded.length).toBe(0); // no second code
    });
  });
}

scenario(3, "returning+desktop", "repeat visit with no games yet shows the three doors, not an error", async () => {
  await withOrg({}, async (o) => { await o.signIn(); await o.page.reload(); await o.page.waitForSelector(home); expect(await o.page.locator("a.door").count()).toBe(3); });
});

scenario(3, "refresh", "refreshing in the middle of My games keeps the person on My games, signed in, with the list", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email);
    await o.go("mygames"); await o.page.waitForSelector(`article.gcard[data-eid="${eid}"]`);
    await o.page.reload(); await o.page.waitForSelector(`article.gcard[data-eid="${eid}"]`);
    expect(o.page.url()).toContain("#/mygames");
  });
});

scenario(3, "back", "browser Back and Forward move between Home, My games and Billing without losing the session", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); await o.go("mygames"); await o.page.waitForSelector("h1:has-text('My games')");
    await o.go("billing"); await o.page.waitForSelector("h1:has-text('Billing')");
    await o.page.goBack(); await o.page.waitForSelector("h1:has-text('My games')");
    await o.page.goBack(); await o.page.waitForSelector(home);
    await o.page.goForward(); await o.page.waitForSelector("h1:has-text('My games')");
    expect(o.errors).toEqual([]);
  });
});

scenario(3, "returning+desktop", "the session slides: a visit two hours later renews the cookie and stays signed in", async () => {
  await withOrg({}, async (o) => {
    try {
      await o.signIn(); await o.stack.advance(2 * 3600_000);
      const r = await o.page.request.get(o.w.origin + "/auth/me");
      expect((await r.json()).signedIn).toBe(true);
      expect(r.headers()["set-cookie"] || "").toContain("Max-Age=");
    } finally { await o.stack.resetClock(); }
  });
});

// ---- step 4 ----
scenario(4, "returning+desktop", "auto login: a brand-new browser window that carries the saved session lands on Home with no code and no mail", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); await o.stack.clearMail();
    const state = await o.ctx.storageState();
    const o2 = await organizer({ storageState: state, email: o.email });
    try { await o2.page.goto(o.w.origin + "/"); await o2.page.waitForSelector(home); expect((await o.stack.mail()).recorded.length).toBe(0); } finally { await o2.close(); }
  });
});

scenario(4, "returning+mobile", "auto login on a phone-size window", async () => {
  await withOrg({ device: "mobile" }, async (o) => {
    await o.signIn(); const state = await o.ctx.storageState();
    const o2 = await organizer({ device: "mobile", storageState: state, email: o.email });
    try { await o2.page.goto(o.w.origin + "/"); await o2.page.waitForSelector(home); } finally { await o2.close(); }
  });
});

scenario(4, "returning+desktop", "the session cookie is HttpOnly, SameSite=Lax and lasts at least 390 days in the browser and 5 years on the server", async () => {
  await withOrg({}, async (o) => {
    await o.signIn();
    const c = (await o.ctx.cookies()).find((x) => x.name === "cbsess")!;
    expect(c.httpOnly).toBe(true); expect(c.sameSite).toBe("Lax");
    expect(c.expires - Date.now() / 1000).toBeGreaterThan(390 * 86400); // Chrome itself caps a cookie at 400 days; the server therefore re-sends it on every visit
    const me = await o.page.request.get(o.w.origin + "/auth/me"); expect(me.headers()["set-cookie"]).toMatch(/Max-Age=157680000/); // what the server asks for: 5 years, renewed each visit
    expect(await o.page.evaluate(() => document.cookie)).not.toContain("cbsess"); // scripts cannot read it
    expect(await o.page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toMatch(/cbk_|cbh_|cbc_/); // game keys are never stored in the browser
  });
});

scenario(4, "expired", "session the server no longer knows (opened fresh): the Sign in screen shows, not a blank page, and no games are shown", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); await o.stack.createGame("tambola", o.email, { name: "SECRETNAME" });
    await o.stack.expireSession(o.email);
    await o.page.goto(o.w.origin + "/#/mygames"); await o.page.waitForSelector("#outlet h1");
    expect(await o.page.textContent("#outlet h1")).toBe("Sign in");
    expect(await o.page.textContent("body")).not.toContain("SECRETNAME");
  });
});

scenario(4, "expired", "session ends while the page is open: the next click returns to Sign in with no data left on screen", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); await o.stack.createGame("tambola", o.email, { name: "SECRETNAME" });
    await o.go("mygames"); await o.page.waitForSelector("article.gcard");
    await o.stack.expireSession(o.email);
    await o.page.reload(); await o.page.waitForSelector("#outlet h1");
    expect(await o.page.textContent("#outlet h1")).toBe("Sign in");
    expect(await o.page.textContent("body")).not.toContain("SECRETNAME");
  });
});

scenario(4, "expired", "session that ended while the page stayed open: Billing then shows Sign in (not an endless 'One moment')", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); await o.go("mygames"); await o.page.waitForSelector("h1:has-text('My games')"); await o.page.waitForTimeout(500);
    await o.stack.expireSession(o.email);
    await o.page.evaluate(() => { location.hash = "#/billing"; });
    await o.page.waitForFunction(() => document.querySelector("#outlet h1")?.textContent === "Sign in" || /Please sign in|sign in again/i.test(document.body.textContent || ""), null, { timeout: 12_000 });
  });
});

scenario(4, "expired", "a made-up or tampered cookie is treated as signed out", async () => {
  await withOrg({}, async (o) => {
    await o.page.goto(o.w.origin + "/");
    await o.ctx.addCookies([{ name: "cbsess", value: "a".repeat(64), url: o.w.origin }]);
    await o.page.goto(o.w.origin + "/"); await o.page.waitForSelector("#outlet h1");
    expect(await o.page.textContent("#outlet h1")).toBe("Sign in");
    const r = await fetch(o.w.origin + "/auth/me", { headers: { cookie: "cbsess=zz'; DROP TABLE session;--" } });
    expect((await r.json()).signedIn).toBe(false);
  });
});

scenario(4, "expired", "five years and a day without a visit: the session is gone", async () => {
  await withOrg({}, async (o) => {
    try { await o.signIn(); await o.stack.advance(5 * 365 * DAY + DAY); expect((await (await o.page.request.get(o.w.origin + "/auth/me")).json()).signedIn).toBe(false); } finally { await o.stack.resetClock(); }
  });
});

scenario(4, "back", "after Sign out, the Back button does not bring the old screens or games back", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); await o.stack.createGame("tambola", o.email, { name: "SECRETNAME" });
    await o.go("mygames"); await o.page.waitForSelector("article.gcard");
    await o.go("account"); await o.page.waitForSelector("text=Sign out >> nth=0");
    await o.page.click("button:has-text('Sign out') >> nth=0");
    await o.page.waitForSelector("#outlet h1:has-text('Sign in')");
    await o.page.goBack(); await o.page.waitForTimeout(600);
    expect(await o.page.textContent("body")).not.toContain("SECRETNAME");
    expect(await o.page.locator("#outlet h1:has-text('Sign in')").count()).toBe(1);
  });
});

scenario(4, "returning+desktop", "'Sign out on every device' ends a second browser's session too", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const o2 = await organizer({ storageState: await o.ctx.storageState(), email: o.email });
    try {
      await o2.page.goto(o.w.origin + "/"); await o2.page.waitForSelector(home);
      await o.go("account"); await o.page.waitForSelector("button:has-text('Sign out on every device')"); await o.page.click("button:has-text('Sign out on every device')");
      await o.page.waitForSelector("#outlet h1:has-text('Sign in')");
      await o2.page.reload(); await o2.page.waitForSelector("#outlet h1"); expect(await o2.page.textContent("#outlet h1")).toBe("Sign in");
    } finally { await o2.close(); }
  });
});

scenario(4, "returning+desktop", "one-tap link works once only; the second use says it has run out", async () => {
  await withOrg({}, async (o) => {
    await o.page.goto(o.w.origin + "/"); await o.page.fill("#si-email", o.email); await o.page.check("#si-consent"); await o.page.click("text=Send me a code"); await o.page.waitForSelector("#si-code");
    const link = (await o.stack.mail()).recorded.find((m) => m.to === o.email)!.text.match(/https?:\/\/\S+signin\.html\?t=[0-9a-f]{48}/)![0];
    const o2 = await organizer({ email: o.email, fresh: false });
    try {
      await o.page.goto(link); await o.page.click("#go"); await o.page.waitForURL(o.w.origin + "/");
      await o2.page.goto(link); await o2.page.click("#go"); await o2.page.waitForFunction(() => /run out|not right|ask for a new/i.test(document.getElementById("msg")!.textContent || ""));
    } finally { await o2.close(); }
  });
});

scenario(4, "expired", "a one-tap link older than 30 minutes is refused", async () => {
  await withOrg({}, async (o) => {
    try {
      await o.page.goto(o.w.origin + "/"); await o.page.fill("#si-email", o.email); await o.page.check("#si-consent"); await o.page.click("text=Send me a code"); await o.page.waitForSelector("#si-code");
      const link = (await o.stack.mail()).recorded.find((m) => m.to === o.email)!.text.match(/https?:\/\/\S+signin\.html\?t=[0-9a-f]{48}/)![0];
      await o.stack.advance(31 * 60_000);
      await o.page.goto(link); await o.page.click("#go");
      await o.page.waitForFunction(() => /run out|not right|ask for a new/i.test(document.getElementById("msg")!.textContent || ""));
    } finally { await o.stack.resetClock(); }
  });
});
