// FALSIFIED BY: core-key-in-storage, core-waits-for-all, core-extra-header, core-signout-keeps-keys, core-price-hardcoded
import { test, expect, setDefaultTimeout } from "bun:test";

setDefaultTimeout(30_000);
import { world, spies } from "./support/world";
import { priceLine } from "../public/core/prices.js";
import { sortGames, needsAttention, totalsByCurrency, mergeBilling } from "../public/core/merge.js";
import { gamesFailedLine } from "../public/core/errors.js";

test("sign in, then connect: every ready game answers on its own; the slow one and the one that is down fail alone", async () => {
  const w = await world(); const writes = spies();
  try {
    expect((await w.signIn()).ok).toBe(true);
    const done: string[] = [];
    const c = await w.api.connect({ onGame: (x: any) => done.push(x.game) });
    const by = Object.fromEntries(c.results.map((r: any) => [r.game, r]));
    expect(by.tambola).toMatchObject({ ok: true, hasAccount: true, scoped: 1 });
    expect(by.snakesladders.ok).toBe(true);
    expect(by.luckbychance.ok).toBe(true);
    expect(by.bingo).toMatchObject({ ok: false, error: "unreachable" }); // takes 3.5 s, the limit here is 1.5 s
    expect(by.tictactoe).toMatchObject({ ok: false, error: "unreachable" }); // down
    expect(c.results.length).toBe(5); // Lucky Draw is not ready: not asked
    expect(w.api.vault.size).toBeGreaterThanOrEqual(3);
    expect(writes).toEqual([]); // nothing was stored or put in an address
  } finally { w.stop(); }
});

test("the list: five games render while one is slow and one is down; each failure names its game; rows are ordered", async () => {
  const w = await world(); spies();
  try {
    await w.signIn(); await w.api.connect();
    const order: string[] = [];
    const t0 = Date.now();
    const l = await w.api.listGames({ onGame: (r: any) => order.push(r.game + (r.ok ? "+" : "-")) });
    expect(l.failed.sort()).toEqual(["bingo", "tictactoe"]);
    expect(gamesFailedLine(["Bingo"])).toBe("Could not reach Bingo. Please try again. The other games are shown.");
    expect(l.rows.filter((r: any) => r.game === "tambola").length).toBe(9);
    expect(l.rows.filter((r: any) => r.game === "luckbychance").length).toBe(150); // paged by 50, three pages
    expect(l.rows[0].status === "waiting_payment" || l.rows[0].nextAction === "accept").toBe(true); // needs attention first
    expect(Date.now() - t0).toBeLessThan(5000);
    // the fast games were reported BEFORE the slow one gave up
    expect(order.indexOf("tambola+")).toBeLessThan(order.indexOf("bingo-"));
  } finally { w.stop(); }
});

test("keys are never written to a storage, a cookie of ours or a web address; they sit in memory and go out only as x-organizer", async () => {
  const w = await world({ slowMs: 0 }); const writes = spies();
  try {
    await w.signIn(); await w.api.connect(); await w.api.listGames(); await w.api.billing();
    expect(writes).toEqual([]);
    expect(JSON.stringify(w.api.vault.all()).includes("cbk_")).toBe(true);
    const h = await w.api.headersFor("tambola", null);
    expect(Object.keys(h!).sort()).toEqual(["content-type", "x-organizer"]);
    const step = await w.api.headersFor("tambola", "READY01", "role-add");
    expect(Object.keys(step!).sort()).toEqual(["content-type", "x-console-step", "x-organizer"]);
    expect(await w.api.headersFor("tambola", null, undefined)).not.toBe(null);
    expect(await w.api.headersFor("luckydraw", null)).toBe(null);
  } finally { w.stop(); }
});

test("only content-type, x-organizer and x-console-step ever reach a game (the cookie and the console's own header stay at home)", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect(); await w.api.listGames(); await w.api.capabilities();
    const allowed = new Set(["content-type", "x-organizer", "x-console-step", "host", "connection", "accept", "accept-encoding", "accept-language", "user-agent", "content-length", "sec-fetch-mode", "origin", "referer"]);
    for (const [game, seen] of Object.entries(w.headersSeen)) for (const h of seen) expect([game, h, allowed.has(h)]).toEqual([game, h, true]);
    for (const seen of Object.values(w.headersSeen)) { expect(seen.has("cookie")).toBe(false); expect(seen.has("x-console")).toBe(false); }
  } finally { w.stop(); }
});

test("prices are what each game says about itself, not a number kept in the console", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    const caps = await w.api.capabilities();
    const t = caps.find((c: any) => c.game === "tambola")!;
    expect(t.ok).toBe(true);
    expect(priceLine(t.caps)).toBe("From Rs 2,399. Free up to 10 people.");
    const changed = { ...t.caps, sizes: t.caps.sizes.map((s: any) => (s.pack === 100 ? { ...s, inrMinor: 250000 } : s)) };
    expect(priceLine(changed)).toBe("From Rs 2,500. Free up to 10 people.");
    expect(priceLine({ sizes: [{ pack: 100, inrMinor: 239900, usdMinor: null, free: false }], freeDemoCap: 0 })).toBe("From Rs 2,399.");
  } finally { w.stop(); }
});

test("sign out ends every held key in its own game, forgets them here, and ends the console session; 'everywhere' too", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect();
    const before = w.api.vault.all().length;
    expect(before).toBeGreaterThan(0);
    const held = w.api.vault.all().filter((k: any) => k.game === "tambola");
    const tambolaKeys = () => w.states.tambola.authKeys.size;
    expect(tambolaKeys()).toBeGreaterThan(0);
    const r = await w.api.signOut({ everywhere: true });
    expect(r.ok).toBe(true);
    expect(w.api.vault.size).toBe(0);
    expect(tambolaKeys()).toBe(0);
    expect(held.length).toBeGreaterThan(0);
    expect((await w.api.auth.me()).json.signedIn).toBe(false);
  } finally { w.stop(); }
});

test("merge: needs-attention first, then playing, ready, draft, the rest; money totals are per currency and never added across", () => {
  const row = (o: any) => ({ game: "x", eid: o.eid, name: o.eid, role: "organizer", status: "draft", startMs: null, nextAction: "none", ...o });
  const s = sortGames([row({ eid: "A", status: "finished" }), row({ eid: "B", status: "ready", startMs: 5 }), row({ eid: "C", status: "waiting_payment" }), row({ eid: "D", status: "playing" }), row({ eid: "E", status: "ready", startMs: 2 }), row({ eid: "F", nextAction: "accept", status: "ready", startMs: 9 }), row({ eid: "G", status: "draft" })]);
  expect(s.map((x: any) => x.eid)).toEqual(["F", "C", "D", "E", "B", "G", "A"]);
  expect(needsAttention(row({ status: "waiting_payment" }))).toBe(true);
  expect(totalsByCurrency([{ status: "paid", currency: "INR", amountMinor: 100 }, { status: "paid", currency: "USD", amountMinor: 50 }, { status: "paid", currency: "INR", amountMinor: 20 }, { status: "waiting", currency: "INR", amountMinor: 999 }])).toEqual({ INR: 120, USD: 50 });
  const m = mergeBilling([{ game: "a", ok: true, rows: [{ tsMs: 1, status: "paid", currency: "INR", amountMinor: 5 }], credit: { balanceMinor: 7, currency: "INR", expiresMs: 1 } }, { game: "b", ok: false }]);
  expect(m.failed).toEqual(["b"]); expect(m.credits.length).toBe(1); expect(m.totals).toEqual({ INR: 5 });
});
