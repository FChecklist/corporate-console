// Steps 17 (complete), 18 (e-mails after every step), 19 (data to organizer), 20 (deletion within 24 hours).
import { expect } from "bun:test";
import { scenario, blocked, withOrg, newEmail, sampleReport, LIVE } from "./lib/harness";
import { RETENTION, participantDataDueMs, HOUR_MS } from "../../functions/_lib/retention";

const DONE = (extra: any = {}) => ({ status: "finished", nextAction: "none", pack: 100, startMs: Date.now() - 2 * 3600_000, payment: { state: "paid", amountMinor: 239900, currency: "INR" }, ...extra });
const cr = (eid: string) => `#cr-body article.gcard[data-eid="${eid}"]`;

// ---- step 17 ----
scenario(17, "returning+desktop", "a finished game: My games says Completed with the report promise; the Control room lists it under 'Finished' with the report line", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const w = await o.stack.createGame("tambola", o.email, DONE({ ext: { reportStatus: "waiting" } })), s = await o.stack.createGame("tambola", o.email, DONE({ ext: { reportStatus: "sent" } })), h = await o.stack.createGame("tambola", o.email, DONE({ ext: { reportStatus: "held" } }));
    await o.go("mygames"); await o.page.waitForSelector(`article.gcard[data-eid="${w.eid}"] .chip[data-status="completed"]`);
    expect(await o.page.textContent(`article.gcard[data-eid="${w.eid}"] [data-banner]`)).toContain("Thank you for playing!");
    await o.go("control"); await o.page.waitForSelector(cr(w.eid));
    expect(await o.page.textContent(`${cr(w.eid)} [data-report]`)).toContain("being prepared"); expect(await o.page.textContent(`${cr(s.eid)} [data-report]`)).toContain("was e-mailed to every Organizer and Host"); expect(await o.page.textContent(`${cr(h.eid)} [data-report]`)).toContain("will try again by itself");
    expect(await o.page.locator(`#cr-body section:has(h2:has-text("Finished")) article[data-eid="${w.eid}"]`).count()).toBe(1);
  });
});

scenario(17, "returning+mobile", "finished game on a phone", async () => {
  await withOrg({ device: "mobile" }, async (o) => { await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, DONE({ ext: { reportStatus: "sent" } })); await o.go("control"); await o.page.waitForSelector(cr(eid)); expect(await o.page.locator("body").evaluate((b) => b.scrollWidth <= window.innerWidth + 1)).toBe(true); });
});

scenario(17, "returning+desktop", "report submit: signed report -> ONE mail to every Organizer and Host (never a Co-host), PDF made, nothing kept", async () => {
  const org = newEmail("rep-org"), host = newEmail("rep-host"), co = newEmail("rep-co");
  await withOrg({}, async (o) => {
    await o.stack.clearMail();
    const r = await o.stack.submitReport("tambola", sampleReport({ gameId: "REP001", organizers: [org], hosts: [host] }));
    expect(r.status).toBe(200); expect(r.json).toMatchObject({ ok: true, sent: 2, recipients: 2, held: 0 }); expect(r.json.bytes).toBeGreaterThan(800);
    const mail = (await o.stack.mail()).recorded.filter((m) => m.subject.startsWith("Your game report"));
    expect(mail.map((m) => m.to).sort()).toEqual([host, org].sort()); expect(mail.map((m) => m.to)).not.toContain(co);
    expect(mail[0].subject).toBe("Your game report: Corporate Tambola, Game ID REP001"); expect(mail[0].text).toContain("It has no list of participants");
  });
});

scenario(17, "wrong", "a report with a wrong signature, an unknown game, a Co-host list, a participant list, a future end time or a too-late end time is refused with a plain error", async () => {
  await withOrg({}, async (o) => {
    const base = () => sampleReport({ gameId: "REP002", organizers: [newEmail("r")] });
    expect((await o.stack.submitReport("tambola", base(), { tamper: true })).status).toBe(401);
    expect((await o.stack.submitReport("tambola", base(), { secret: "wrong" })).status).toBe(401);
    expect((await o.stack.submitReport("tambola", { ...base(), game: { id: "nogame", name: "x" } })).status).toBe(401);
    expect((await o.stack.submitReport("tambola", { ...base(), cohosts: [{ email: newEmail("c") }] })).json.message).toContain("Co-hosts do not receive the report");
    expect((await o.stack.submitReport("tambola", { ...base(), participants: [{ name: "A" }] })).status).toBe(400);
    expect((await o.stack.submitReport("tambola", { ...base(), organizers: [] })).status).toBe(400);
    expect((await o.stack.submitReport("tambola", { ...base(), organizers: [{ email: "not-an-address" }] })).status).toBe(400);
    const early = base(); early.gameOverMs = Date.now() + 3600_000; early.endMs = early.gameOverMs; expect((await o.stack.submitReport("tambola", early)).status).toBe(409);
    const late = base(); late.gameOverMs = Date.now() - 21 * 3600_000; late.endMs = late.gameOverMs; const l = await o.stack.submitReport("tambola", late); expect(l.status).toBe(409); expect(l.json.error).toBe("too_late");
  });
});

scenario(17, "wrong", "a report that is 4 hours late (past the 3-hour target) still goes out (a late report is better than a lost one)", async () => {
  await withOrg({}, async (o) => {
    const r = sampleReport({ gameId: "REP003", organizers: [newEmail("late")] }); r.gameOverMs = Date.now() - 4 * 3600_000; r.endMs = r.gameOverMs;
    const x = await o.stack.submitReport("tambola", r); expect(x.status).toBe(200); expect(x.json.late).toBe(true);
  });
});

blocked(17, "returning+desktop", "the game ending itself (last prize, 'Game over' screen for players)", "Game repository.");

// ---- step 18: e-mails ----
scenario(18, "new+desktop", "sign-in is the ONLY mail the console sends while an organizer moves through create, manage, pay and start (one mail in the test mailbox)", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { status: "waiting_payment", nextAction: "pay", payment: { state: "waiting" } });
    await o.go("create"); await o.go("mygames"); await o.go("billing"); await o.page.waitForSelector("h1:has-text('Billing')");
    await o.stack.pay("tambola", eid, "ok"); await o.go("control"); await o.page.waitForSelector("h1:has-text('Control room')"); await o.page.waitForTimeout(400);
    const all = await o.stack.mail(); expect(all.recorded.filter((m) => m.to === o.email).length).toBe(1);
    expect(all.recorded.filter((m) => m.to === o.email)[0].subject).toMatch(/^Your sign-in code is/);
  });
});

scenario(18, "returning+desktop", "a test address (.invalid) is recorded in the test mailbox; a real-looking address is handed to the mailer once, and only that one", async () => {
  await withOrg({}, async (o) => {
    await o.stack.clearMail(); await o.page.goto(o.w.origin + "/");
    const real = "someone-" + Date.now() + "@example.org";
    for (const e of [o.email, real]) { const r = await o.page.request.post(o.w.origin + "/auth/request", { headers: { "x-console": "1", origin: o.w.origin }, data: { email: e, consent: true } }); expect(r.status()).toBe(200); }
    const m = await o.stack.mail(); expect(m.wouldDeliver.filter((x) => x.to === real).length).toBe(1); expect(m.recorded.map((x) => x.to)).toContain(o.email); expect(m.recorded.map((x) => x.to)).not.toContain(real); // the rule 'a .invalid address is never given to the REAL mail service' is covered by tests/mail-test-mode.test.ts
  });
});

scenario(18, "wrong", "the sign-in mail says the same thing to a new and a returning person and never reveals whether the address is known", async () => {
  await withOrg({}, async (o) => {
    await o.page.goto(o.w.origin + "/");
    const ask = (email: string) => o.page.request.post(o.w.origin + "/auth/request", { headers: { "x-console": "1", origin: o.w.origin }, data: { email, consent: true } }).then((r) => r.json());
    const a = await ask(newEmail("never-seen")); await o.signIn(); const b = await ask(o.email);
    expect(a.message).toBe(b.message);
  });
});

blocked(18, "new+desktop", "mails after create, publish, payment, start, finish (invitation, 'game is on', payment received, report)", "Sent by the games and the payment service, not by the console. Only sign-in and the end-of-game report are console mails (both tested). The stand-in records the 'payment received' mail but it is not the real one.");

// ---- step 19: data to organizer ----
scenario(19, "returning+desktop", "'Download the list as CSV': header + one line per paid game, amounts in rupees, nothing but money columns", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { status: "waiting_payment", nextAction: "pay", payment: { state: "waiting" }, name: "Csv party" });
    await o.stack.pay("tambola", eid, "ok"); await o.go("billing"); await o.page.waitForSelector(`#bill-paid li[data-eid="${eid}"]`);
    const [d] = await Promise.all([o.page.waitForEvent("download"), o.page.click("button:has-text('Download the list as CSV')")]);
    expect(d.suggestedFilename()).toBe("payments.csv");
    const txt = await (await import("node:fs")).promises.readFile((await d.path())!, "utf8");
    const lines = txt.trim().split("\r\n"); expect(lines.length).toBe(2); expect(lines[0]).toBe("Game,Game name,Date,What,Amount,Currency,Status,Paid by,Invoice"); expect(lines[1]).toMatch(/^[^,]+,Csv party,\d{4}-\d{2}-\d{2},pack,2399\.00,INR,paid,you,inv_[0-9a-f]{8}$/);
  });
});

scenario(19, "wrong", "a game name with commas, quotes or a line break stays in ONE cell of the CSV", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const nm = 'Acme, "Big" party\nsecond line';
    const { eid } = await o.stack.createGame("tambola", o.email, { status: "ready", pack: 100, name: nm, payment: { state: "paid", amountMinor: 100, currency: "INR" } });
    await o.stack.post("/game/billing", { game: "tambola", email: o.email, eid, gameName: nm }); await o.go("billing"); await o.page.waitForSelector(`#bill-paid li[data-eid="${eid}"]`);
    const [d] = await Promise.all([o.page.waitForEvent("download"), o.page.click("button:has-text('Download the list as CSV')")]);
    const txt = await (await import("node:fs")).promises.readFile((await d.path())!, "utf8"); expect(txt).toContain('"Acme, ""Big"" party\nsecond line"');
  });
});

scenario(19, "wrong", "a game name that starts with = + - or @ cannot become a spreadsheet formula when finance opens the CSV", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const nm = '=HYPERLINK("http://evil.example","click")';
    const { eid } = await o.stack.createGame("tambola", o.email, { status: "ready", pack: 100, name: nm, payment: { state: "paid", amountMinor: 100, currency: "INR" } });
    await o.stack.post("/game/billing", { game: "tambola", email: o.email, eid, gameName: nm }); await o.go("billing"); await o.page.waitForSelector(`#bill-paid li[data-eid="${eid}"]`);
    const [d] = await Promise.all([o.page.waitForEvent("download"), o.page.click("button:has-text('Download the list as CSV')")]);
    const txt = await (await import("node:fs")).promises.readFile((await d.path())!, "utf8");
    for (const line of txt.trim().split("\r\n").slice(1)) for (const cell of line.match(/("([^"]|"")*"|[^,]*)/g) || []) expect(cell.replace(/^"/, "")).not.toMatch(/^[=+\-@]/);
  });
});

scenario(19, "returning+desktop", "Account: 'Download my payments first (CSV)' gives the same list before the account is closed", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { status: "waiting_payment", nextAction: "pay", payment: { state: "waiting" } }); await o.stack.pay("tambola", eid, "ok");
    await o.go("account"); await o.page.waitForSelector("#acct-close"); await o.page.waitForTimeout(500);
    const [d] = await Promise.all([o.page.waitForEvent("download"), o.page.click("button:has-text('Download my payments first (CSV)')")]);
    expect((await (await import("node:fs")).promises.readFile((await d.path())!, "utf8")).trim().split("\r\n").length).toBe(2);
  });
});

scenario(19, "wrong", "the report carries no participant list (the console refuses any per-person rows)", async () => {
  await withOrg({}, async (o) => {
    const rep = sampleReport({ gameId: "REP004", organizers: [newEmail("o")] }) as any; rep.stats.rows = Array.from({ length: 501 }, (_, i) => i);
    const r = await o.stack.submitReport("tambola", rep); expect(r.status).toBe(400); expect(r.json.message).toContain("keeps counts, not rows");
  });
});

blocked(19, "returning+desktop", "downloading the report PDF from the game within 24 hours, winners list, ID/e-mail export", "The download page is in the game repository; the e-mail PDF is built by the console (size checked above) but the stand-in mailbox keeps no attachment for .invalid addresses.");

// ---- step 20: deletion ----
scenario(20, "returning+desktop", "the retention rule in code: participant data due at 20 h (inside the 24 h promise), report window closes long before, report refused after 20 h", async () => {
  expect(RETENTION.participantDataCodeHours).toBeLessThanOrEqual(RETENTION.participantDataHours); expect(RETENTION.participantDataHours).toBe(24);
  expect(participantDataDueMs(0)).toBe(20 * HOUR_MS); expect(RETENTION.reportMailWithinHoursOfGameOver).toBeLessThan(RETENTION.participantDataCodeHours);
}, { live: "safe" });

scenario(20, "returning+desktop", "Account page states what is kept and for how long, and the privacy strip says players' data is deleted after the game", async () => {
  await withOrg({}, async (o) => { await o.signIn(); await o.go("account"); await o.page.waitForSelector("#acct-kept"); const t = await o.page.textContent("#acct-kept"); expect(t).toContain("Auto-deleted after the game"); expect(t).toContain("365 days"); expect(await o.page.textContent(".priv")).toContain("deleted after the game"); });
});

scenario(20, "returning+desktop", "Close my account: No keeps it; Yes asks EVERY game to forget the e-mail, ends the session and shows Sign in", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); await o.stack.createGame("tambola", o.email, {}); const games = Object.keys(o.w.games); for (const g of games) await o.stack.clearHits(g);
    await o.go("account"); await o.page.waitForSelector("#acct-close button:has-text('Close my account')");
    await o.page.click("#acct-close button:has-text('Close my account')"); await o.page.waitForSelector(".confirm"); await o.page.click(".confirm button:has-text('No')");
    expect((await (await o.page.request.get(o.w.origin + "/auth/me")).json()).signedIn).toBe(true);
    await o.page.click("#acct-close button:has-text('Close my account')"); await o.page.click(".confirm button:has-text('Yes, close it')");
    await o.page.waitForSelector("#outlet h1:has-text('Sign in')");
    for (const g of games) expect((await o.stack.hits(g)).hits.filter((h) => h === "POST /api/console/purge-email").length).toBe(1);
    expect((await (await o.page.request.get(o.w.origin + "/auth/me")).json()).signedIn).toBe(false);
  });
});

scenario(20, "dblclick", "double-clicking 'Yes, close it' closes once without an error", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); await o.go("account"); await o.page.waitForSelector("#acct-close button:has-text('Close my account')");
    await o.page.click("#acct-close button:has-text('Close my account')"); await o.page.dblclick(".confirm button:has-text('Yes, close it')");
    await o.page.waitForSelector("#outlet h1:has-text('Sign in')"); expect(o.errors).toEqual([]);
  });
});

scenario(20, "wrong", "a game that does not answer during Close: it is named, the person stays signed in, nothing is pretended", async () => {
  await withOrg({}, async (o) => {
    try {
      await o.signIn(); await o.go("account"); await o.page.waitForSelector("#acct-close button:has-text('Close my account')"); await o.stack.persona("bingo", "down");
      await o.page.click("#acct-close button:has-text('Close my account')"); await o.page.click(".confirm button:has-text('Yes, close it')");
      await o.page.waitForSelector(".signmsg.bad"); expect(await o.page.textContent(".signmsg")).toMatch(/did not answer\. You are still signed in/);
      expect((await (await o.page.request.get(o.w.origin + "/auth/me")).json()).signedIn).toBe(true);
    } finally { await o.stack.persona("bingo", "normal"); }
  });
});

scenario(20, "returning+desktop", "after Close my account the same e-mail can sign in again as a fresh person", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); await o.go("account"); await o.page.waitForSelector("#acct-close button:has-text('Close my account')"); await o.page.click("#acct-close button:has-text('Close my account')"); await o.page.click(".confirm button:has-text('Yes, close it')"); await o.page.waitForSelector("#outlet h1:has-text('Sign in')");
    await o.page.fill("#si-email", o.email); await o.page.check("#si-consent"); await o.page.click("text=Send me a code"); await o.page.waitForSelector("#si-code"); await o.page.fill("#si-code", await o.codeFromMail()); await o.page.click("text=Sign me in"); await o.page.waitForSelector("#first-game");
  });
});

scenario(20, "expired", "365 days after the last sign-in the console's own copy of the e-mail is deleted (and every game is asked to forget it)", async () => {
  await withOrg({}, async (o) => {
    try {
      await o.signIn(); for (const g of Object.keys(o.w.games)) await o.stack.clearHits(g);
      await o.stack.advance(367 * 86400_000);
      let purged = 0; // each tick forgets at most 20 e-mails and the many test people made earlier in this run are due too: tick until nothing is left (a visit by the person themselves would count as activity and keep them, so none is made before)
      for (let i = 0; i < 60; i++) { const j: any = await (await fetch(o.w.origin + "/report/tick", { method: "POST", headers: { "x-tick-token": o.w.tickSecret } })).json(); purged += j.purged.emails; if (!j.purged.emails && !j.purged.deferred) break; }
      expect(purged).toBeGreaterThanOrEqual(1);
      expect((await o.stack.hits("tambola")).hits.some((h) => h === "POST /api/console/purge-email")).toBe(true);
      expect((await (await o.page.request.get(o.w.origin + "/auth/me")).json()).signedIn).toBe(false);
    } finally { await o.stack.resetClock(); }
  });
});

scenario(20, "refresh", "refresh on the Account page keeps it, and Close still asks before doing anything", async () => {
  await withOrg({}, async (o) => { await o.signIn(); await o.go("account"); await o.page.waitForSelector("#acct-close"); await o.page.reload(); await o.page.click("#acct-close button:has-text('Close my account')"); await o.page.waitForSelector(".confirm"); });
});

blocked(20, "returning+desktop", "participant names, e-mails, IDs and mobiles really gone from the game within 24 hours (20 h in code), seen from the organizer's side", "Done by each game's own clean-up job against its own database. The console holds no participant data; the due-time rule is checked above.");
