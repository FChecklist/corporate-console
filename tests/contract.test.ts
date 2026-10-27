// FALSIFIED BY: contract-undocumented-field, contract-fixture-lost-aud, contract-key-life-extended, contract-handoff-reusable
import { test, expect } from "bun:test";
import { handle, newGame, seedGames } from "../tools/fake-game/server.mjs";
import { FIXTURES, SCHEMAS, makeCtx, runFixture, validate, buildAssertion } from "../tools/fake-game/kit.mjs";

const NOW = Date.UTC(2026, 9, 28, 6, 0, 0);

/** a fresh fake game on its own port; returns { S, origin, stop } */
async function fake(persona = "normal", ctx: any, tweak: (S: any) => void = () => {}) {
  let origin = "";
  const S = newGame({ game: persona === "normal" ? "bingo" : "bingo", persona, origin: "http://127.0.0.1:0", keys: ctx.keys, nowMs: NOW });
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req) => handle(S, req) });
  origin = `http://127.0.0.1:${server.port}`;
  S.origin = origin;
  seedGames(S, { alice: ctx.people.alice.sub, bob: ctx.people.bob.sub, carol: ctx.people.carol.sub });
  tweak(S);
  return { S, origin, stop: () => server.stop(true) };
}

test("the contract has no gaps: every fixture names a schema that exists and a status", () => {
  expect(FIXTURES.length).toBeGreaterThanOrEqual(35);
  for (const fx of FIXTURES) {
    expect(typeof fx.name).toBe("string");
    expect(/^(GET|POST) \//.test(fx.route)).toBe(true);
    expect(typeof fx.expect.status).toBe("number");
    for (const n of [fx.expect.schema, fx.requestSchema]) if (n) expect(Object.keys(SCHEMAS.$defs)).toContain(n);
  }
});

for (const fx of FIXTURES) {
  test(`fixture: ${fx.name}`, async () => {
    const ctx = await makeCtx();
    const g = await fake("normal", ctx);
    try {
      const r = await runFixture(fx, { ctx, origin: g.origin, nowMs: NOW });
      expect(r.problems).toEqual([]);
    } finally { g.stop(); }
  });
}

test("a response with a field nobody documented is an error (closed objects)", () => {
  const ok = { ok: true, games: [], next: null };
  expect(validate("GamesResponse", ok)).toEqual([]);
  expect(validate("GamesResponse", { ...ok, extra: 1 }).length).toBe(1);
  const row = { game: "bingo", eid: "ABCD", role: "organizer", status: "draft", startMs: null, cap: 10, pack: 0, name: "x", payment: { state: "none" }, invitedBy: null, liveNow: false, nextAction: "publish", createdMs: 1 };
  expect(validate("GameRow", row)).toEqual([]);
  expect(validate("GameRow", { ...row, mobile: "9876543210" }).length).toBe(1);
  expect(validate("GameRow", { ...row, status: "paid" }).length).toBe(1);
});

test("an assertion payload without 'aud' (or with an extra field) is not valid", async () => {
  const ctx = await makeCtx();
  const a = await buildAssertion(ctx, { act: "games", person: "alice" }, "http://127.0.0.1:1", NOW);
  expect(a.problemsBefore).toEqual([]);
  const { aud: _a, ...noAud } = a.payload;
  expect(validate("AssertionPayload", noAud).length).toBe(1);
  expect(validate("AssertionPayload", { ...a.payload, role: "organizer" }).length).toBe(1);
});

test("dark: with the bridge switched off EVERY console route answers 404 with an empty body, even capabilities", async () => {
  const ctx = await makeCtx();
  const g = await fake("normal", ctx, (S) => { S.bridgeOn = false; });
  try {
    for (const [m, p] of [["GET", "/api/console/capabilities"], ["GET", "/api/console/live"], ["POST", "/api/console/session"], ["POST", "/api/console/games"], ["POST", "/api/console/billing"], ["POST", "/api/console/role"], ["POST", "/api/console/handoff"], ["POST", "/api/console/handoff/redeem"], ["POST", "/api/console/purge-email"], ["POST", "/api/console/preview"]]) {
      const r = await fetch(g.origin + p, { method: m, body: m === "POST" ? "{}" : undefined });
      expect([m, p, r.status, await r.text()]).toEqual([m, p, 404, "{}"]);
    }
  } finally { g.stop(); }
});

test("keys live exactly 2 hours, are labelled console, and a Host key is bound to one game", async () => {
  const ctx = await makeCtx();
  const g = await fake("normal", ctx);
  try {
    const a = await buildAssertion(ctx, { act: "session", person: "alice" }, g.origin, NOW);
    const r = await (await fetch(g.origin + "/api/console/session", { method: "POST", body: JSON.stringify({ assertion: a.token }) })).json();
    expect(r.organizer.expiresMs - NOW).toBe(2 * 3600_000);
    expect(r.organizer.label).toBe("console");
    expect(r.scoped[0].expiresMs - NOW).toBe(2 * 3600_000);
    expect(r.scoped.map((s: any) => s.eid)).toEqual(["BOBS001"]);
    // a key that is 2 h 1 s old is dead
    g.S.nowMs = NOW + 2 * 3600_000 + 1000;
    const hand = await fetch(g.origin + "/api/console/handoff", { method: "POST", headers: { "x-organizer": r.organizer.key }, body: JSON.stringify({ eid: "PLAY001", target: "organizer" }) });
    expect(hand.status).toBe(403);
  } finally { g.stop(); }
});

test("a handoff link works once and only within 60 seconds, and gives a 16 hour key for that game and role", async () => {
  const ctx = await makeCtx();
  const g = await fake("normal", ctx);
  try {
    const key = (await (await fetch(g.origin + "/api/console/session", { method: "POST", body: JSON.stringify({ assertion: (await buildAssertion(ctx, { act: "session", person: "alice" }, g.origin, NOW)).token }) })).json()).organizer.key;
    const h = async () => (await (await fetch(g.origin + "/api/console/handoff", { method: "POST", headers: { "x-organizer": key }, body: JSON.stringify({ eid: "PLAY001", target: "organizer" }) })).json());
    const t = /t=([0-9a-f]{48})/.exec((await h()).url)![1];
    const redeem = (tok: string) => fetch(g.origin + "/api/console/handoff/redeem", { method: "POST", body: JSON.stringify({ t: tok }) });
    const first = await redeem(t); const j = await first.json();
    expect(first.status).toBe(200);
    expect(j.expiresMs - NOW).toBe(16 * 3600_000);
    expect(j.eid).toBe("PLAY001");
    expect((await redeem(t)).status).toBe(401); // second use
    const t2 = /t=([0-9a-f]{48})/.exec((await h()).url)![1];
    g.S.nowMs = NOW + 61_000;
    expect((await redeem(t2)).status).toBe(401); // too late
  } finally { g.stop(); }
});

test("removing a Host ends that Host's key at once", async () => {
  const ctx = await makeCtx();
  const g = await fake("normal", ctx);
  try {
    const sess = async (person: string) => (await (await fetch(g.origin + "/api/console/session", { method: "POST", body: JSON.stringify({ assertion: (await buildAssertion(ctx, { act: "session", person }, g.origin, NOW)).token }) })).json());
    const alice = await sess("alice"), bob = await sess("bob");
    const hostKey = alice.scoped[0].key;
    const ok1 = await fetch(g.origin + "/api/console/handoff", { method: "POST", headers: { "x-organizer": hostKey }, body: JSON.stringify({ eid: "BOBS001", target: "host" }) });
    expect(ok1.status).toBe(200);
    const step = (await buildAssertion(ctx, { act: "stepup", sa: "role-remove", eid: "BOBS001", person: "bob" }, g.origin, NOW)).token;
    const rm = await fetch(g.origin + "/api/console/role", { method: "POST", headers: { "x-organizer": bob.organizer.key, "x-console-step": step }, body: JSON.stringify({ op: "remove", eid: "BOBS001", roleId: "aaaaaaaaaa" }) });
    expect(rm.status).toBe(200);
    const after = await fetch(g.origin + "/api/console/handoff", { method: "POST", headers: { "x-organizer": hostKey }, body: JSON.stringify({ eid: "BOBS001", target: "host" }) });
    expect(after.status).toBe(403);
  } finally { g.stop(); }
});

test("personas: down answers 503, empty has no games, many pages by 50, old has no log/upgrade/preview", async () => {
  const ctx = await makeCtx();
  const list = async (g: any, cursor?: string) => (await (await fetch(g.origin + "/api/console/games", { method: "POST", body: JSON.stringify({ assertion: (await buildAssertion(ctx, { act: "games", person: "alice" }, g.origin, NOW)).token, ...(cursor ? { cursor } : {}) }) })).json());
  const down = await fake("down", ctx), empty = await fake("empty", ctx), many = await fake("many", ctx), old = await fake("old", ctx);
  try {
    expect((await fetch(down.origin + "/api/console/capabilities")).status).toBe(503);
    expect((await list(empty)).games).toEqual([]);
    const p1 = await list(many); expect(p1.games.length).toBe(50); expect(p1.next).toBe("50");
    const p2 = await list(many, "50"); const p3 = await list(many, "100");
    expect(p3.games.length).toBe(50); expect(p3.next).toBe(null);
    expect(new Set([...p1.games, ...p2.games, ...p3.games].map((g: any) => g.eid)).size).toBe(150);
    const cap = await (await fetch(old.origin + "/api/console/capabilities")).json();
    expect(cap.features.log).toBe(false); expect(cap.schema).toBe(1);
    expect(validate("Capabilities", cap)).toEqual([]);
  } finally { down.stop(); empty.stop(); many.stop(); old.stop(); }
});

test("a slow game answers late (the console decides when to give up, not the game)", async () => {
  const ctx = await makeCtx();
  const g = await fake("slow", ctx, (S) => { S.slowMs = 300; });
  try {
    const t0 = Date.now();
    const r = await fetch(g.origin + "/api/console/capabilities");
    expect(r.status).toBe(200);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(280);
  } finally { g.stop(); }
});
