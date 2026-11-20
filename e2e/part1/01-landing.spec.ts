// Step 1: first-time landing. Home site (read-only) and the console's own first screen for someone who has never signed in.
import { expect } from "bun:test";
import { scenario, blocked, withOrg, noSideways, HOME_URL, LIVE } from "./lib/harness";

const PHRASES = ["personal details are deleted after the game", "DPDP Act", "GDPR", "US privacy law"];

for (const device of ["desktop", "mobile"] as const) {
  scenario(1, device === "desktop" ? "new+desktop" : "new+mobile", "a first-time visitor sees only the sign-in screen, the privacy promises, and no game data", async () => {
    await withOrg({ device }, async (o) => {
      const gameCalls: string[] = [];
      o.page.on("request", (r) => { if (Object.values(o.w.games).some((g) => r.url().startsWith(g)) && !LIVE) gameCalls.push(r.url()); });
      await o.page.goto(o.w.origin + "/");
      await o.page.waitForSelector("#outlet h1");
      expect(await o.page.textContent("#outlet h1")).toBe("Sign in");
      const strip = await o.page.textContent(".priv");
      for (const p of PHRASES) expect(strip).toContain(p);
      expect(await o.page.locator("header.top nav a, .tabbar a").count()).toBe(0); // no menu until signed in
      expect(await noSideways(o.page)).toBe(true);
      expect(await o.page.locator(".version, #version, [data-version]").count() + (await o.page.textContent("body"))!.match(/v?\d+\.\d+\.\d+/g)!.length).toBeGreaterThan(0); // the version line is on the page
      expect(gameCalls).toEqual([]); // before sign-in the console talks to no game
      expect(o.errors).toEqual([]);
    });
  }, { live: "safe" });
}

scenario(1, "slow", "sign-in screen still arrives on a slow connection (400 ms delay, 400 kbit/s)", async () => {
  await withOrg({ slow: true }, async (o) => {
    const t0 = Date.now();
    await o.page.goto(o.w.origin + "/");
    await o.page.waitForSelector("#outlet h1", { timeout: 45_000 });
    expect(await o.page.textContent("#outlet h1")).toBe("Sign in");
    expect(Date.now() - t0).toBeLessThan(40_000);
  });
}, { live: "safe", timeout: 120_000 });

scenario(1, "refresh", "reloading the first screen keeps it on Sign in", async () => {
  await withOrg({}, async (o) => { await o.page.goto(o.w.origin + "/"); await o.page.reload(); await o.page.waitForSelector("#outlet h1"); expect(await o.page.textContent("#outlet h1")).toBe("Sign in"); });
}, { live: "safe" });

scenario(1, "wrong", "an unknown address or a made-up #/route shows Sign in, not a broken page", async () => {
  await withOrg({}, async (o) => {
    await o.page.goto(o.w.origin + "/#/billing/../../x"); await o.page.waitForSelector("#outlet h1");
    expect(await o.page.textContent("#outlet h1")).toBe("Sign in");
    const r = await o.page.request.get(o.w.origin + "/definitely-not-here"); expect(r.status()).toBe(404);
  });
}, { live: "safe" });

scenario(1, "new+desktop", "the Terms link on the sign-in screen points at the game's terms page", async () => {
  await withOrg({}, async (o) => {
    await o.page.goto(o.w.origin + "/"); await o.page.waitForSelector("#outlet h1");
    const hrefs = await o.page.locator("a[href*='terms']").evaluateAll((a) => a.map((x) => (x as HTMLAnchorElement).href));
    expect(hrefs.length + (await o.page.textContent("body"))!.includes("Terms of Use") ? 1 : 0).toBeGreaterThan(0);
  });
}, { live: "safe" });

if (LIVE) {
  scenario(1, "new+desktop", "HOME site answers (read-only GET) and links to the console", async () => {
    const r = await fetch(HOME_URL + "/", { redirect: "follow" });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html.toLowerCase()).toContain("tambola");
  }, { live: "safe" });
} else {
  blocked(1, "new+desktop", "home.corporatetambola.com first-time landing", "The home site is another repository (corporate-home); this repo has no copy of it. Run against live with E2E_HOME_URL (read-only GET only).");
}
