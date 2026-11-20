// Step 2: console login by e-mail code or one-tap link. The mail is read from the TEST mailbox (addresses ending .invalid are only recorded, never sent).
import { expect } from "bun:test";
import { scenario, withOrg, newEmail, noSideways } from "./lib/harness";

for (const device of ["desktop", "mobile"] as const) {
  scenario(2, device === "desktop" ? "new+desktop" : "new+mobile", "new organizer: e-mail, tick box, code from the mailbox, lands on Home with the three doors and 'Your first game'", async () => {
    await withOrg({ device }, async (o) => {
      await o.signIn();
      const mail = (await o.stack.mail()).recorded.filter((m) => m.to === o.email);
      expect(mail.length).toBe(1);
      expect(mail[0].subject).toMatch(/^Your sign-in code is \d{6}$/);
      expect(mail[0].text).toContain("30 minutes");
      expect(mail[0].text).toMatch(/signin\.html\?t=[0-9a-f]{48}/);
      expect(await o.page.locator("a.door").count()).toBe(3);
      expect(await o.page.locator("#first-game").count()).toBe(1);
      expect(await noSideways(o.page)).toBe(true);
      if (device === "mobile") expect(await o.page.locator(".tabbar a").count()).toBeGreaterThanOrEqual(3);
      else expect(await o.page.locator("header.top nav a").count()).toBeGreaterThanOrEqual(3);
      if (device === "desktop") expect(await o.page.textContent("#me")).toContain(o.email);
      else { await o.go("account"); await o.page.waitForSelector("#acct-email"); expect(await o.page.textContent("#acct-email")).toContain(o.email); }
      expect(o.errors).toEqual([]);
    });
  });
}

scenario(2, "new+desktop", "one-tap link in the mail: opening does nothing, the button signs in, the token leaves the address bar", async () => {
  await withOrg({}, async (o) => {
    await o.page.goto(o.w.origin + "/"); await o.page.fill("#si-email", o.email); await o.page.check("#si-consent"); await o.page.click("text=Send me a code"); await o.page.waitForSelector("#si-code");
    const link = (await o.stack.mail()).recorded.find((m) => m.to === o.email)!.text.match(/https?:\/\/\S+signin\.html\?t=[0-9a-f]{48}/)![0];
    await o.page.goto(link);
    await o.page.waitForSelector("#go");
    expect(o.page.url()).not.toContain("t="); // token gone from the address bar
    expect((await (await o.page.request.get(o.w.origin + "/auth/me")).json()).signedIn).toBe(false); // opening consumed nothing
    await o.page.click("#go");
    await o.page.waitForURL(o.w.origin + "/");
    await o.page.waitForSelector("h1:has-text('What would you like to do?')");
  });
});

scenario(2, "wrong", "wrong code: clear message, stays on the code box; the right code still works after one miss", async () => {
  await withOrg({}, async (o) => {
    await o.page.goto(o.w.origin + "/"); await o.page.fill("#si-email", o.email); await o.page.check("#si-consent"); await o.page.click("text=Send me a code"); await o.page.waitForSelector("#si-code");
    const good = await o.codeFromMail(), bad = good === "000000" ? "111111" : "000000";
    await o.page.fill("#si-code", bad); await o.page.click("text=Sign me in");
    await o.page.waitForSelector(".signmsg.bad");
    expect(await o.page.textContent(".signmsg")).toContain("not right");
    await o.page.fill("#si-code", good); await o.page.click("text=Sign me in");
    await o.page.waitForSelector("h1:has-text('What would you like to do?')");
  });
});

scenario(2, "wrong", "five wrong codes lock the code: even the right one is then refused and a new one is needed", async () => {
  await withOrg({}, async (o) => {
    await o.page.goto(o.w.origin + "/"); await o.page.fill("#si-email", o.email); await o.page.check("#si-consent"); await o.page.click("text=Send me a code"); await o.page.waitForSelector("#si-code");
    const good = await o.codeFromMail(), bad = good === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) { await o.page.fill("#si-code", bad); await o.page.click("text=Sign me in"); await o.page.waitForSelector(".signmsg.bad"); await o.page.waitForFunction(() => !(document.querySelector("form:not(.hide) button[type=submit]") as HTMLButtonElement)?.disabled); }
    await o.page.fill("#si-code", good); await o.page.click("text=Sign me in");
    await o.page.waitForSelector(".signmsg.bad");
    expect(await o.page.locator("h1:has-text('What would you like to do?')").count()).toBe(0);
  });
});

scenario(2, "wrong", "bad e-mail and unticked box are refused on the page and nothing is mailed", async () => {
  await withOrg({}, async (o) => {
    await o.page.goto(o.w.origin + "/");
    await o.page.fill("#si-email", "nonsense"); await o.page.check("#si-consent"); await o.page.click("text=Send me a code");
    expect(await o.page.textContent(".signmsg")).toContain("valid e-mail");
    await o.page.fill("#si-email", o.email); await o.page.uncheck("#si-consent"); await o.page.click("text=Send me a code");
    expect(await o.page.textContent(".signmsg")).toContain("tick the box");
    expect((await o.stack.mail()).recorded.filter((m) => m.to === o.email).length).toBe(0);
  });
});

scenario(2, "wrong", "address typed with capitals and spaces is read the same way (one account)", async () => {
  const base = newEmail("case");
  await withOrg({ email: base }, async (o) => {
    await o.page.goto(o.w.origin + "/");
    await o.page.fill("#si-email", "  " + base.toUpperCase().replace("DEMO-TEST", "demo-TEST") + " "); await o.page.check("#si-consent"); await o.page.click("text=Send me a code"); await o.page.waitForSelector("#si-code");
    await o.page.fill("#si-code", await o.codeFromMail()); await o.page.click("text=Sign me in");
    await o.page.waitForSelector("h1:has-text('What would you like to do?')");
    expect(await o.page.textContent("#me")).toContain(base);
  });
});

scenario(2, "dblclick", "double-clicking 'Send me a code' sends exactly one mail", async () => {
  await withOrg({}, async (o) => {
    await o.page.goto(o.w.origin + "/"); await o.page.fill("#si-email", o.email); await o.page.check("#si-consent");
    await o.page.dblclick("text=Send me a code"); await o.page.waitForSelector("#si-code");
    await new Promise((r) => setTimeout(r, 500));
    expect((await o.stack.mail()).recorded.filter((m) => m.to === o.email).length).toBe(1);
  });
});

scenario(2, "dblclick", "double-clicking 'Sign me in' signs in once, without an error", async () => {
  await withOrg({}, async (o) => {
    await o.page.goto(o.w.origin + "/"); await o.page.fill("#si-email", o.email); await o.page.check("#si-consent"); await o.page.click("text=Send me a code"); await o.page.waitForSelector("#si-code");
    await o.page.fill("#si-code", await o.codeFromMail()); await o.page.dblclick("text=Sign me in");
    await o.page.waitForSelector("h1:has-text('What would you like to do?')");
    expect(o.errors).toEqual([]);
  });
});

scenario(2, "expired", "a code older than 30 minutes is refused; a new code works", async () => {
  await withOrg({}, async (o) => {
    try {
      await o.page.goto(o.w.origin + "/"); await o.page.fill("#si-email", o.email); await o.page.check("#si-consent"); await o.page.click("text=Send me a code"); await o.page.waitForSelector("#si-code");
      const old = await o.codeFromMail();
      await o.stack.advance(31 * 60_000);
      await o.page.fill("#si-code", old); await o.page.click("text=Sign me in"); await o.page.waitForSelector(".signmsg.bad");
      expect(await o.page.textContent(".signmsg")).toMatch(/not right or has run out/);
      await o.page.click("text=Use a different e-mail");
      await o.page.fill("#si-email", o.email); await o.page.click("text=Send me a code"); await o.page.waitForSelector("#si-code");
      await o.page.fill("#si-code", await o.codeFromMail()); await o.page.click("text=Sign me in");
      await o.page.waitForSelector("h1:has-text('What would you like to do?')");
    } finally { await o.stack.resetClock(); }
  });
});

scenario(2, "wrong", "the 9th code request for one address in an hour is turned away with a plain message", async () => {
  await withOrg({}, async (o) => {
    let last: any;
    for (let i = 0; i < 9; i++) last = await o.page.request.post(o.w.origin + "/auth/request", { headers: { "x-console": "1", origin: o.w.origin }, data: { email: o.email, consent: true } });
    expect(last.status()).toBe(429);
    expect((await last.json()).message).toMatch(/Too many tries/);
  });
});

scenario(2, "wrong", "a sign-in request from another website (no x-console header / wrong origin) is refused", async () => {
  await withOrg({}, async (o) => {
    expect((await o.page.request.post(o.w.origin + "/auth/request", { data: { email: o.email, consent: true } })).status()).toBe(403);
    expect((await o.page.request.post(o.w.origin + "/auth/request", { headers: { "x-console": "1", origin: "https://evil.example" }, data: { email: o.email, consent: true } })).status()).toBe(403);
  });
});

scenario(2, "slow", "sign-in works on a slow connection and the Send button cannot be pressed twice meanwhile", async () => {
  await withOrg({ slow: true }, async (o) => {
    await o.page.goto(o.w.origin + "/", { timeout: 60_000 }); await o.page.waitForSelector("#si-email", { timeout: 60_000 });
    await o.page.fill("#si-email", o.email); await o.page.check("#si-consent");
    await o.page.click("text=Send me a code"); await o.page.click("text=Send me a code", { force: true, timeout: 1000 }).catch(() => {});
    await o.page.waitForSelector("#si-code", { timeout: 60_000 });
    await o.page.fill("#si-code", await o.codeFromMail()); await o.page.click("text=Sign me in");
    await o.page.waitForSelector("h1:has-text('What would you like to do?')", { timeout: 60_000 });
    expect((await o.stack.mail()).recorded.filter((m) => m.to === o.email).length).toBe(1);
  });
}, { timeout: 180_000 });
