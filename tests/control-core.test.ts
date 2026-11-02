// FALSIFIED BY: control-auth-open, control-ai-key-on-owner-door, control-pii-note-copied, control-test-money-mixed, control-write-call
// Mission Control step 1 (read only): the door (owner password, AI read key, plain 404), the traffic lights, every data panel with a full game and with a game that lacks the endpoint,
// the money split (real and test), the history table (append only) and the proof that nothing but GET goes out and no password reaches the wrong place.
import { test, expect, setDefaultTimeout } from "bun:test";
import CFG from "../config/control.json";
import GAMES_CFG from "../config/games.json";
import { handleControl, scrub, scrubText, maskEmail, whoIs, judgePage, type ControlEnv } from "../functions/_lib/control-core";
import { world, PASSWORD, AI_KEY, NOW, SECRET_BITS, type Moods } from "./support/control-world";
import { makeD1 } from "./support/d1-sqlite";
import { prefixSql } from "../functions/_lib/tables";
import { readFileSync } from "node:fs";
setDefaultTimeout(30_000);

type W = ReturnType<typeof world>;
const go = async (w: W, path: string, init: any = {}) => {
  const { req } = w.ask(path, init);
  const r = await handleControl(req, w.env, NOW, w.fetchFn);
  const text = await r.text();
  let body: any = null; try { body = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, text, body, headers: r.headers };
};
const ALL_GET = ["/api/control/ping", "/api/control/schema", "/api/control/overview", "/api/control/games", "/api/control/game?id=tambola", "/api/control/websites", "/api/control/websites?site=home", "/api/control/payments", "/api/control/logs", "/api/control/releases", "/api/control/history"];

test("the door: no password, a wrong password, the AI key in the owner header and the owner password in the AI header all get the same plain 404 as an address that does not exist, and nothing goes out to any game", async () => {
  const w = world();
  const unknown = await go(w, "/api/control/nothing-here", { as: "none" });
  expect(unknown.status).toBe(404);
  for (const p of ALL_GET) {
    for (const as of ["none", "wrong"] as const) { const r = await go(w, p, { as }); expect([p, as, r.status, r.text]).toEqual([p, as, 404, unknown.text]); }
    const swapped = await go(w, p, { as: "none", headers: { "x-organizer": AI_KEY } });
    expect([p, swapped.status]).toEqual([p, 404]);
    const swapped2 = await go(w, p, { as: "none", headers: { "x-control-key": PASSWORD } });
    expect([p, swapped2.status]).toEqual([p, 404]);
    const bearer = await go(w, p, { as: "none", headers: { authorization: "Bearer " + PASSWORD } });
    expect([p, bearer.status]).toEqual([p, 404]);
  }
  expect(w.seen.length).toBe(0); // not one call to any site for someone without a key
});

test("the owner password and the AI key each open the read routes; who is asking is told; the AI key is switched off when it is short or the same as the owner password", async () => {
  const w = world();
  expect((await go(w, "/api/control/ping")).body.who).toBe("owner");
  expect((await go(w, "/api/control/ping", { as: "ai" })).body.who).toBe("ai");
  const same = { ...w.env, AI_CONTROL_KEY: PASSWORD } as ControlEnv, short = { ...w.env, AI_CONTROL_KEY: "short" } as ControlEnv;
  const rq = (h: Record<string, string>) => new Request("https://console.test/api/control/ping", { headers: h });
  expect(whoIs(rq({ "x-control-key": PASSWORD }), same)).toBeNull();
  expect(whoIs(rq({ "x-control-key": "short" }), short)).toBeNull();
  expect(whoIs(rq({ "x-organizer": "" }), { ...w.env, ORGANIZER_SECRET: "" } as ControlEnv)).toBeNull(); // no password configured = nobody gets in with an empty one
  const manifest = (await go(w, "/api/control/schema", { as: "ai" })).body;
  expect(manifest.readOnly).toBe(true);
  expect(manifest.endpoints.length).toBeGreaterThanOrEqual(8);
});

test("everything is read only: POST, PUT and DELETE on every route are 404, the organizer lookup is for the owner only, and no call to any site is anything but GET", async () => {
  const w = world({}, { cf: true });
  for (const p of ALL_GET) for (const method of ["POST", "PUT", "DELETE", "PATCH"]) expect([p, method, (await go(w, p, { method, body: "{}" })).status]).toEqual([p, method, 404]);
  const lookup = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ game: "tambola", email: "demo21@demo-test.invalid" }) };
  expect((await go(w, "/api/control/organizer", { ...lookup, as: "ai" })).status).toBe(404);
  w.seen.length = 0;
  for (const p of ALL_GET) await go(w, p);
  await go(w, "/api/control/organizer", lookup);
  expect(w.seen.length).toBeGreaterThan(50);
  expect(w.seen.filter((e) => e.method !== "GET")).toEqual([]);
});

test("the AI key is never sent to anything, and the owner password goes only to the six games, never to the home page, the payment site, the console or Cloudflare", async () => {
  const w = world({}, { cf: true });
  for (const as of ["owner", "ai"] as const) { w.seen.length = 0; for (const p of ALL_GET) await go(w, p, { as }); expect(w.seen.some((e) => e.headers.includes("x-control-key"))).toBe(false); expect(w.seen.some((e) => e.headers.includes("x-ct-link"))).toBe(false); }
  const withKey = w.seen.filter((e) => e.headers.includes("x-organizer"));
  expect(withKey.length).toBeGreaterThan(0);
  expect(withKey.every((e) => e.kind === "game")).toBe(true);
  expect(w.seen.filter((e) => e.kind === "cloudflare").every((e) => e.auth === "Bearer cf-test-token")).toBe(true);
  expect(w.seen.some((e) => e.kind === "stranger")).toBe(false);
});

test("after 40 wrong tries from one address even the right password gets the plain 404 (another address is not affected)", async () => {
  const w = world();
  for (let i = 0; i < 40; i++) await go(w, "/api/control/ping", { as: "wrong", ip: "203.0.113.9" });
  expect((await go(w, "/api/control/ping", { ip: "203.0.113.9" })).status).toBe(404);
  expect((await go(w, "/api/control/ping", { ip: "203.0.113.10" })).status).toBe(200);
});

test("the overview: one line per game plus home, console and payment site; all fine = all green with a reason in plain words", async () => {
  const w = world();
  const r = await go(w, "/api/control/overview");
  expect(r.status).toBe(200);
  expect(r.body.lines.map((l: any) => l.id)).toEqual([...CFG.games.map((g) => g.id), "home", "console", "payments"]);
  expect(r.body.readOnly).toBe(true);
  expect(r.body.counts).toEqual({ green: 9, amber: 0, red: 0 });
  expect(r.body.overall).toBe("green");
  for (const l of r.body.lines) expect(l.reason.length).toBeGreaterThan(10);
  expect(r.body.lines[0].reason).toMatch(/Live, version 1\.2\.3 \(commit abc1234def56\), 0 errors in the last hour/);
});

test("the overview lights: each trouble gives the right colour and a reason that says why", async () => {
  const cases: Array<[Moods, string, "red" | "amber", RegExp]> = [
    [{ bingo: "down" }, "bingo", "red", /did not answer/],
    [{ bingo: "erroring" }, "bingo", "red", /health check did not answer/],
    [{ tambola: "off" }, "tambola", "red", /switched off and shows 'Back soon'/],
    [{ tambola: "late-deletion" }, "tambola", "red", /2 game\(s\) are past the 20-hour deletion.*5 hours/],
    [{ luckydraw: "many-errors" }, "luckydraw", "red", /25 errors in the last hour \(the alarm is at 20\)/],
    [{ snakesladders: "lacking" }, "snakesladders", "amber", /3 errors in the last hour/],
    [{ luckbychance: "test-mode" }, "luckbychance", "amber", /In TEST mode: payments are not real/],
    [{ tictactoe: "indexable" }, "tictactoe", "red", /not hidden from search engines/],
    [{ tambola: "refusing" }, "tambola", "amber", /owner password was not accepted/],
  ];
  for (const [moods, id, light, why] of cases) {
    const r = await go(world(moods), "/api/control/overview");
    const line = r.body.lines.find((l: any) => l.id === id);
    expect([id, line.light]).toEqual([id, light]);
    expect(line.reason).toMatch(why);
    expect(r.body.overall).toBe(light === "red" ? "red" : "amber");
  }
  const homeBad = await go(world({}, { home: "noindex" }), "/api/control/overview");
  expect(homeBad.body.lines.find((l: any) => l.id === "home")).toMatchObject({ light: "red" });
  expect(homeBad.body.lines.find((l: any) => l.id === "home").reason).toMatch(/should be listed/);
  const homeDown = await go(world({}, { home: "down" }), "/api/control/overview");
  expect(homeDown.body.lines.find((l: any) => l.id === "home").light).toBe("red");
  const payDown = await go(world({}, { payments: "down" }), "/api/control/overview");
  expect(payDown.body.lines.find((l: any) => l.id === "payments").light).toBe("red");
});

test("Games: a full game fills every panel; a game that lacks funnel, releases and game records says 'not_available' for those and still fills the rest", async () => {
  const w = world({ bingo: "lacking" });
  const full = (await go(w, "/api/control/game?id=tambola")).body;
  expect(Object.values(full.panels).every((p: any) => p.state === "ok")).toBe(true);
  expect(full.ownerPassword).toBe("accepted");
  expect(full.panels.visits.data.humans.visitors).toBe(46);
  expect(full.panels.visits.data.cities).toBeUndefined(); // no cities
  expect(full.panels.visits.data.privateCounts).toBeUndefined();
  expect(full.panels.funnel.data.steps[0]).toEqual({ step: "Site viewed", count: 12 });
  expect(full.panels.dataRequests.data).toMatchObject({ total: 3, open: 2, overdue: 1, done: 1 });
  expect(full.panels.gamesKept.data.count).toBe(2);
  expect(full.panels.mail.data.latest[0].to).toBe("r***@example.com");
  const lack = (await go(w, "/api/control/game?id=bingo")).body.panels;
  for (const k of ["funnel", "releases", "gamesKept"]) expect([k, lack[k].state]).toEqual([k, "not_available"]);
  for (const k of ["version", "mode", "health", "errors", "site", "visits", "mail", "dataRequests"]) expect([k, lack[k].state]).toEqual([k, "ok"]);
  expect((await go(w, "/api/control/game?id=nothing")).status).toBe(404);
});

test("Games: a game that refuses the password, and a game that is down, show that plainly instead of failing", async () => {
  const w = world({ tictactoe: "refusing", luckydraw: "down" });
  const ref = (await go(w, "/api/control/game?id=tictactoe")).body;
  expect(ref.ownerPassword).toBe("not accepted");
  for (const k of ["errors", "site", "visits", "mail", "dataRequests", "releases"]) expect(ref.panels[k].state).toBe("refused");
  expect(ref.panels.health.state).toBe("ok");
  const down = (await go(w, "/api/control/game?id=luckydraw")).body;
  expect(Object.values(down.panels).every((p: any) => p.state === "unreachable")).toBe(true);
});

test("NO PERSONAL DETAILS: names, phone numbers, e-mail addresses, card ids and free text planted in the games' answers never appear in any output; data requests are counts only", async () => {
  const w = world({}, { cf: true });
  const seenText: string[] = [];
  for (const p of [...ALL_GET, "/api/control/game?id=bingo", "/api/control/games", ...CFG.games.map((g) => "/api/control/websites?site=" + g.id), "/api/control/payments?month=2026-11"]) for (const as of ["owner", "ai"] as const) seenText.push((await go(w, p, { as })).text);
  const lookup = await go(w, "/api/control/organizer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ game: "tambola", email: "demo21@demo-test.invalid" }) });
  seenText.push(lookup.text);
  expect(lookup.body.email).toBe("d***@demo-test.invalid"); // the address asked about comes back hidden
  const all = seenText.join("\n");
  for (const bit of SECRET_BITS) expect([bit, all.includes(bit)]).toEqual([bit, false]);
  expect(all).not.toContain("demo21@demo-test.invalid");
  expect(all).not.toMatch(/card_last4|vpa_masked|attempts/); // no card or UPI details either
});

test("NO PASSWORD IN ANY OUTPUT: neither the owner password nor the AI key nor the Cloudflare token is in any answer", async () => {
  const w = world({}, { cf: true });
  const texts: string[] = [];
  for (const p of [...ALL_GET, "/api/control/game?id=bingo", "/api/control/nothing"]) for (const as of ["owner", "ai", "none", "wrong"] as const) texts.push((await go(w, p, { as })).text);
  const all = texts.join("\n");
  for (const secret of [PASSWORD, AI_KEY, "cf-test-token", "ledger-test-key"]) expect(all.includes(secret)).toBe(false);
});

test("scrub: e-mail addresses are hidden, long numbers removed, texts shortened, numbers left alone", () => {
  expect(maskEmail("demo24@demo-test.invalid")).toBe("d***@demo-test.invalid");
  expect(scrubText("write to demo25@demo-test.invalid or call 9876543210 now")).toBe("write to d***@demo-test.invalid or call ... now");
  expect(scrub({ a: ["x@y.com", 12345678901], b: { c: "ok" } })).toEqual({ a: ["x***@y.com", 12345678901], b: { c: "ok" } });
  expect(scrubText("x".repeat(500)).length).toBe(300);
});

test("scrub: a deployment id or a commit is never cut, even when a piece of it is nine or more digits; a bare long number is still removed", () => {
  const id = "21dc251c-2182-40c9-927a-844c5c0f9f39", unlucky = "00000001-aaaa-bbbb-cccc-123456789012", commit = "1234567890ab";
  expect(scrubText(id)).toBe(id);
  expect(scrubText(unlucky)).toBe(unlucky);
  expect(scrubText(commit)).toBe(commit);
  expect(scrub({ rollbackId: unlucky, commit })).toEqual({ rollbackId: unlucky, commit });
  expect(scrubText("9876543210")).toBe("..."); // all digits, no letter or hyphen: a phone-like number
});

test("Websites: the home page has 12 pages with the rule 'listed' (two utility pages hidden), games have the rule 'hidden', a wrong rule is red, a moved page is fine only where it is allowed", async () => {
  const w = world({ tictactoe: "indexable" });
  const list = (await go(w, "/api/control/websites")).body.sites;
  expect(list.map((s: any) => s.id)).toEqual(["home", ...CFG.games.map((g) => g.id)]);
  expect(list[0].pages).toBe(12);
  const home = (await go(w, "/api/control/websites?site=home")).body;
  expect(home.pages.length).toBe(12);
  expect(home.counts).toEqual({ green: 12, amber: 0, red: 0 });
  expect(home.siteMap.urls).toBe(10);
  expect(home.pages.find((p: any) => p.path === "/offline").robots.noindex).toBe(true);
  const ttt = (await go(w, "/api/control/websites?site=tictactoe")).body;
  expect(ttt.pages.find((p: any) => p.path === "/pricing")).toMatchObject({ light: "red", note: "not hidden from search engines" });
  const good = (await go(w, "/api/control/websites?site=tambola")).body;
  expect(good.pages.filter((p: any) => p.light !== "green").map((p: any) => p.path)).toEqual([]);
  expect((await go(w, "/api/control/websites?site=nothing")).status).toBe(404);
  const site = { id: "x", name: "x", live: "", noindex: true, redirectOk: ["/terms"] };
  const r = { s: "na" as const, status: 301, ms: 50, json: null, text: "", headers: new Headers() };
  expect(judgePage(site, "/terms", r).light).toBe("green");
  expect(judgePage(site, "/privacy", r).light).toBe("red");
});

test("Payments: real money and test payments are kept apart, waiting is not paid, the totals leave tests out, the last receipts are listed, the month is checked", async () => {
  const w = world({ bingo: "lacking", luckydraw: "down" });
  const r = (await go(w, "/api/control/payments?month=2026-11")).body;
  expect(r.month).toBe("2026-11");
  const t = r.games.find((g: any) => g.id === "tambola");
  expect(t.real).toEqual({ paid: 2, waiting: 1, failed: 1, paidMinor: 500000, waitingMinor: 100000, feeMinor: 10000 });
  expect(t.test).toEqual({ paid: 1, waiting: 1, failed: 0, paidMinor: 100, waitingMinor: 100, feeMinor: 2 });
  expect(t.lastReceipts.map((x: any) => x.txn)).toEqual(["TAM-a1", "TAM-a2"]);
  expect(t.lastReceipts.every((x: any) => !x.txn.startsWith("PAYTEST"))).toBe(true);
  expect(t.waitingNow.length).toBe(1);
  expect(t.lastTests.every((x: any) => x.txn.startsWith("PAYTEST-"))).toBe(true);
  expect(t.refunds).toEqual({ count: 1, minor: 2000 });
  expect(r.games.find((g: any) => g.id === "luckydraw").state).toBe("unreachable");
  expect(r.total.paidMinor).toBe(5 * 500000); // five games answered, 5,000 rupees each
  expect(r.total.testPaid).toBe(5);
  expect(r.central.state).toBe("not_connected");
  expect((await go(w, "/api/control/payments?month=2026-13")).status).toBe(400);
  expect((await go(w, "/api/control/payments?month=garbage")).status).toBe(400);
  const withKey = world(); withKey.env.LEDGER_KEY = "ledger-test-key";
  const c = (await go(withKey, "/api/control/payments")).body.central;
  expect(c).toMatchObject({ state: "ok", issues: 0 });
});

test("Logs: errors by hour, mail problems and data requests per game, with a total", async () => {
  const w = world({ bingo: "lacking", tictactoe: "refusing" });
  const r = (await go(w, "/api/control/logs")).body;
  expect(r.games.length).toBe(6);
  expect(r.games.find((g: any) => g.id === "tictactoe").errors.state).toBe("refused");
  expect(r.summary).toEqual({ errors24h: 5 * 6, lastHour: 0, mailProblems: 5 * 1, openRequests: 5 * 2, overdueRequests: 5 * 1 });
});

test("Releases: live version per game, the release log mirror, Cloudflare only when a token is set (with rollback id and the live one marked), and the history table", async () => {
  const w = world({ bingo: "lacking" });
  const r0 = (await go(w, "/api/control/releases")).body;
  expect(r0.games.length).toBe(6);
  expect(r0.games[0].version.commit).toBe("abc1234def56");
  expect(r0.games.find((g: any) => g.id === "bingo").notes.state).toBe("not_available");
  expect(r0.cloudflare.state).toBe("not_connected");
  expect(r0.releaseLog.entries.length).toBeGreaterThanOrEqual(10);
  expect(r0.history).toEqual({ state: "ok", rows: [] });
  const w2 = world({}, { cf: true });
  const r = (await go(w2, "/api/control/releases")).body;
  expect(r.cloudflare.state).toBe("ok");
  expect(r.cloudflare.projects.map((p: any) => p.project)).toEqual([...CFG.games.map((g) => g.project), CFG.home.project, CFG.console.project, CFG.payments.project]);
  const p = r.cloudflare.projects[0];
  expect(p.deployments.filter((d: any) => d.live).length).toBe(1);
  expect(p.deployments[0].live).toBe(true);
  expect(p.rollbackId).toBe(p.deployments[1].id); // the production deployment before the live one
  expect(p.deployments[2].environment).toBe("preview");
});

test("History table: lines can be added and read newest first; a line can never be changed or deleted; the writer must be owner or ai; texts have a size limit", async () => {
  const w = world();
  const ins = (who: string, what = "Released Bingo", result = "ok", at = NOW) => w.raw.query("INSERT INTO control_history(at_ms,who,site,what,result,ref) VALUES(?,?,?,?,?,?)").run(at, who, "bingo", what, result, "abc1234");
  ins("ai", "Released Bingo fc5f01f", "live, version.json matches", NOW - 1000); ins("owner", "Paid a Rs 1 test", "ok", NOW);
  const h = (await go(w, "/api/control/history?limit=10")).body.history;
  expect(h.rows.map((r: any) => r.who)).toEqual(["owner", "ai"]);
  expect(h.rows[0].atIST).toBe("02 Nov 2026, 16:30 IST");
  expect(() => w.raw.query("UPDATE control_history SET what='x' WHERE id=1").run()).toThrow(/append-only/);
  expect(() => w.raw.query("DELETE FROM control_history WHERE id=1").run()).toThrow(/append-only/);
  expect(() => ins("robot")).toThrow();
  expect(() => ins("ai", "x".repeat(501))).toThrow();
  expect(() => ins("ai", "")).toThrow();
  expect(w.raw.query("SELECT COUNT(*) n FROM control_history").get()).toEqual({ n: 2 });
  const bare = world(); bare.raw.exec("DROP TRIGGER control_history_no_delete; DROP TABLE control_history;");
  expect((await go(bare, "/api/control/history")).body.history.state).toBe("not_created");
});

test("History table works under a table prefix, like the other console tables", async () => {
  const { db, raw } = makeD1([]);
  raw.exec(prefixSql(readFileSync(new URL("../migrations/0005_control_history.sql", import.meta.url), "utf8"), "con_"));
  raw.query("INSERT INTO con_control_history(at_ms,who,site,what,result) VALUES(?,?,?,?,?)").run(NOW, "ai", "home", "Released home", "ok");
  const env: ControlEnv = { DB: db, TABLE_PREFIX: "con_", ORGANIZER_SECRET: PASSWORD, AI_CONTROL_KEY: AI_KEY };
  const w = world();
  const r = await handleControl(new Request("https://console.test/api/control/history", { headers: { "x-organizer": PASSWORD } }), env, NOW, w.fetchFn);
  expect((await r.json()).history.rows.length).toBe(1);
});

test("Organizer lookup (owner only, read only): found, not found, bad input; the address is shown hidden", async () => {
  const w = world({ luckydraw: "lacking" });
  const post = (b: unknown) => go(w, "/api/control/organizer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  const ok = await post({ game: "bingo", email: "DEMO21@demo-test.invalid" });
  expect(ok.body).toMatchObject({ ok: true, found: true, email: "d***@demo-test.invalid" });
  expect(ok.body.games).toEqual([{ id: "E1", state: "ended", start: "2026-10-30T10:00:00.000Z", paid: true, created: "2026-10-29T10:00:00.000Z" }]);
  expect((await post({ game: "bingo", email: "demo22@demo-test.invalid" })).body.found).toBe(false);
  expect((await post({ game: "nope", email: "demo23@demo-test.invalid" })).status).toBe(400);
  expect((await post({ game: "bingo", email: "not-an-email" })).status).toBe(400);
});

test("the files agree: control.json lists the same six games and addresses as config/games.json; the checked-in release log has no e-mail address", () => {
  const live = Object.fromEntries((GAMES_CFG as any).games.map((g: any) => [g.id, g.live]));
  expect(CFG.games.map((g) => g.id).sort()).toEqual(Object.keys(live).sort());
  for (const g of CFG.games) { expect([g.id, g.live]).toEqual([g.id, live[g.id]]); expect(g.noindex).toBe(true); for (const p of g.pages) expect(p.startsWith("/")).toBe(true); }
  expect(CFG.home.noindex).toBe(false);
  expect(CFG.home.pages.length).toBe(12);
  expect(CFG.slowMs).toBeGreaterThan(0);
  const log = readFileSync(new URL("../config/release-log.json", import.meta.url), "utf8");
  expect(log).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  expect(JSON.parse(log).entries.length).toBeGreaterThanOrEqual(10);
});

test("the Pages Function wrapper hands every /api/control/* request to the door and nothing else", async () => {
  const mod = await import("../functions/api/control/[[path]]");
  const w = world();
  const r = await mod.onRequest({ request: new Request("https://console.test/api/control/ping"), env: w.env });
  expect(r.status).toBe(404);
  const ok = await mod.onRequest({ request: new Request("https://console.test/api/control/ping", { headers: { "x-organizer": PASSWORD } }), env: w.env });
  expect(ok.status).toBe(200);
});
