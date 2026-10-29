// FALSIFIED BY: bridge-new-handoff-any-key, bridge-handoff-forgets-target, bridge-purge-roles-uncounted, bridge-new-handoff-long-key, bridge-role-claim-honoured, bridge-jti-dropped, bridge-key-life-extended, bridge-dark-open, bridge-eid-check-removed, bridge-em-hash-unchecked, bridge-step-up-skipped, bridge-handoff-reusable, bridge-revoke-skipped, bridge-end-roles-no-revoke, bridge-invite-to-wrong-address, bridge-accept-wrong-person, bridge-ai-key-allowed, bridge-signout-no-revoke
import { test, expect } from "bun:test";
import { handleConsole, endRoles, keyFitsGame, keyIsAccountWide, KEY_LIFE_MS } from "../packages/bridge/src/bridge";
import { makeHost, seed, type Host } from "./support/fake-host";
import { FIXTURES, makeCtx, runFixture, buildAssertion } from "../packages/bridge/test-kit/kit.mjs";

/** the bridge in front of the mini game, served on a real port; anything the bridge hands back (null) becomes the game's normal 404 */
async function up(o: { pubkeys?: "on" | "off" } = {}) {
  const ctx = await makeCtx();
  const h = await makeHost({ pubkeys: o.pubkeys });
  seed(h);
  // the bridge trusts the console key of this test, whatever makeHost generated
  h.env.CONSOLE_PUBKEYS = o.pubkeys === "off" ? undefined : "k1:" + ctx.publicB64u;
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: async (req) => (await handleConsole(h.adapter, req, h.env)) ?? new Response("{}", { status: 404 }) });
  h.origin = `http://127.0.0.1:${server.port}`; h.env.PUBLIC_ORIGIN = h.origin;
  const asr = async (spec: any) => (await buildAssertion(ctx, spec, h.origin, h.clock.ms)).token;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(h.origin + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const session = async (person: string) => (await (await post("/api/console/session", { assertion: await asr({ act: "session", person }) })).json());
  return { ctx, h, server, asr, post, session, stop: () => server.stop(true) };
}

for (const fx of FIXTURES.filter((f: any) => !f.gameRoute)) {
  test(`contract fixture on the real bridge: ${fx.name}`, async () => {
    const t = await up();
    try { expect((await runFixture(fx, { ctx: t.ctx, origin: t.h.origin, nowMs: t.h.clock.ms })).problems).toEqual([]); } finally { t.stop(); }
  });
}

test("DARK: with CONSOLE_PUBKEYS unset the bridge hands EVERY console request back to the game (null) - the game answers its ordinary 404", async () => {
  const t = await up({ pubkeys: "off" });
  try {
    for (const [m, p] of [["GET", "/api/console/capabilities"], ["GET", "/api/console/live"], ["OPTIONS", "/api/console/games"], ["POST", "/api/console/session"], ["POST", "/api/console/games"], ["POST", "/api/console/billing"], ["POST", "/api/console/invited"], ["POST", "/api/console/role"], ["POST", "/api/console/handoff"], ["POST", "/api/console/handoff/redeem"], ["POST", "/api/console/purge-email"], ["POST", "/api/console/signout"], ["POST", "/api/console/preview"]]) {
      const res = await handleConsole(t.h.adapter, new Request("http://x" + p, { method: m, body: m === "POST" ? "{}" : undefined }), t.h.env);
      expect([m, p, res]).toEqual([m, p, null]);
    }
    const r = await fetch(t.h.origin + "/api/console/capabilities");
    expect(r.status).toBe(404);
  } finally { t.stop(); }
});

test("a path outside /api/console/ is never the bridge's business", async () => {
  const t = await up();
  try { for (const p of ["/api/history", "/", "/api/consolex", "/api/z/ABCD/log"]) expect(await handleConsole(t.h.adapter, new Request("http://x" + p), t.h.env)).toBe(null); } finally { t.stop(); }
});

test("the role claim in an assertion is IGNORED: 'organizer' written in the note gives a stranger nothing", async () => {
  const t = await up();
  try {
    const r = await t.post("/api/console/session", { assertion: await t.asr({ act: "session", person: "nobody", hint: "organizer" }) });
    const j = await r.json();
    expect(j.organizer).toBe(null);
    expect(j.scoped).toEqual([]);
    const g = await (await t.post("/api/console/games", { assertion: await t.asr({ act: "games", person: "nobody", hint: "organizer" }) })).json();
    expect(g.games).toEqual([]);
  } finally { t.stop(); }
});

test("an account is made only if the e-mail in the note really belongs to the person in the note", async () => {
  const t = await up();
  try {
    // dave's e-mail but nobody's hash: the claim does not match, nothing is created
    const bad = await (await t.post("/api/console/session", { create: true, assertion: await t.asr({ act: "session", person: "nobody", mutate: { em: "dave@new.example" } }) })).json();
    expect(bad.created).toBe(false); expect(bad.organizer).toBe(null);
    expect(t.h.raw.query("SELECT COUNT(*) c FROM organizer_email").get()).toEqual({ c: 3 });
    const good = await (await t.post("/api/console/session", { create: true, assertion: await t.asr({ act: "session", person: "dave", withEm: true }) })).json();
    expect(good.created).toBe(true);
    expect(t.h.raw.query("SELECT COUNT(*) c FROM organizer_email").get()).toEqual({ c: 4 });
  } finally { t.stop(); }
});

test("keys: 2 hours, label console, stored with who they were made for", async () => {
  const t = await up();
  try {
    const j = await t.session("alice");
    expect(j.organizer.expiresMs - t.h.clock.ms).toBe(KEY_LIFE_MS);
    const rows = t.h.raw.query("SELECT kind, label, eid, expires_ms, created_by FROM organizer_key ORDER BY kind").all() as any[];
    expect(rows.length).toBe(2);
    for (const r of rows) { expect(r.label).toBe("console"); expect(r.expires_ms - t.h.clock.ms).toBe(7200_000); }
    expect(rows.find((r) => r.kind === "host").eid).toBe("BOBS001");
    expect(rows.find((r) => r.kind === "master").eid).toBe(null);
  } finally { t.stop(); }
});

test("the owner's platform key (ORGANIZER_SECRET) is never accepted on a console route", async () => {
  const t = await up();
  try {
    for (const [p, b] of [["/api/console/handoff", { eid: "READY01", target: "organizer" }], ["/api/console/preview", { eid: "READY01" }], ["/api/console/role", { op: "list", eid: "READY01" }]] as const) {
      const r = await t.post(p, b, { "x-organizer": "platform-secret" });
      expect([p, r.status]).toEqual([p, 403]);
    }
  } finally { t.stop(); }
});

test("an AI work-link key (cba_) of the right account is refused on the console routes too", async () => {
  const t = await up();
  try {
    const key = "cba_" + "e".repeat(48);
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("key|" + key)))].map((b) => b.toString(16).padStart(2, "0")).join("");
    t.h.raw.run("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms) VALUES (?,?,?,0,1)", [hash, "orgA", "ai"]);
    for (const [p, b] of [["/api/console/handoff", { eid: "READY01", target: "organizer" }], ["/api/console/preview", { eid: "READY01" }], ["/api/console/role", { op: "list", eid: "READY01" }]] as const) expect([p, (await t.post(p, b, { "x-organizer": key })).status]).toEqual([p, 403]);
  } finally { t.stop(); }
});

test("a key tied to one game is refused for another game, and for account-wide use", () => {
  expect(keyFitsGame({ eid: "ONE1" }, "ONE1")).toBe(true);
  expect(keyFitsGame({ eid: "ONE1" }, "TWO2")).toBe(false);
  expect(keyFitsGame({ eid: "ONE1" }, undefined)).toBe(false);
  expect(keyFitsGame({ eid: null }, "ANY1")).toBe(true);
  expect(keyIsAccountWide({ eid: "ONE1" })).toBe(false);
  expect(keyIsAccountWide({ eid: null })).toBe(true);
});

test("hand-off for 'Start a new game': Organizer only, no game named, 2 hour key that belongs to no single game, once", async () => {
  const t = await up();
  try {
    const key = (await t.session("alice")).organizer.key;
    const host = (await t.session("alice")).scoped[0].key;
    const ask = (b: unknown, k: string) => t.post("/api/console/handoff", b, { "x-organizer": k });
    const ok = await ask({ target: "new" }, key);
    expect(ok.status).toBe(200);
    const url = (await ok.json()).url as string;
    expect(url).toMatch(/\/signin\.html\?t=[0-9a-f]{48}&go=console&e=_new_$/);
    expect((await ask({ target: "new" }, host)).status).toBe(403); // a Host key is tied to one game
    expect((await ask({ target: "new", eid: "PLAY001" }, key)).status).toBe(400); // "new" names no game
    expect((await ask({ target: "organizer" }, key)).status).toBe(400); // every other target must name its game
    const tok = /t=([0-9a-f]{48})/.exec(url)![1];
    const r = await (await t.post("/api/console/handoff/redeem", { t: tok })).json();
    expect(r.expiresMs - t.h.clock.ms).toBe(KEY_LIFE_MS);
    expect([r.kind, r.eid]).toEqual(["master", "_new_"]);
    const row = t.h.raw.query("SELECT eid FROM organizer_key ORDER BY created_ms DESC, rowid DESC LIMIT 1").get() as any;
    expect(row.eid).toBeNull();
    expect((await t.post("/api/console/handoff/redeem", { t: tok })).status).toBe(401); // once
  } finally { t.stop(); }
});

test("a Host key of one game cannot hand off or preview another game of the same organizer", async () => {
  const t = await up();
  try {
    t.h.raw.run("INSERT INTO engagement(id,org,name,status,start_ms,cap,pack,created_ms,pay_state,org_label,next_action) VALUES ('BOBS002','orgB','Second','ready',1,10,10,1,'paid','Bob','none')");
    const host = (await t.session("alice")).scoped[0].key;
    expect((await t.post("/api/console/handoff", { eid: "BOBS001", target: "host" }, { "x-organizer": host })).status).toBe(200);
    expect((await t.post("/api/console/handoff", { eid: "BOBS002", target: "host" }, { "x-organizer": host })).status).toBe(403);
    expect((await t.post("/api/console/preview", { eid: "BOBS002" }, { "x-organizer": host })).status).toBe(403);
  } finally { t.stop(); }
});

test("a note can be used once: the same signed request twice is refused the second time", async () => {
  const t = await up();
  try {
    const a = await t.asr({ act: "games", person: "alice" });
    expect((await t.post("/api/console/games", { assertion: a })).status).toBe(200);
    const again = await t.post("/api/console/games", { assertion: a });
    expect(again.status).toBe(401);
    expect((await again.json()).error).toBe("replayed");
  } finally { t.stop(); }
});

test("an invitation mail goes only to the typed address, once; a second invitation for the same person is a conflict", async () => {
  const t = await up();
  try {
    const key = (await t.session("alice")).organizer.key;
    const step = await t.asr({ act: "stepup", sa: "role-add", eid: "READY01", person: "alice" });
    const r = await t.post("/api/console/role", { op: "invite", eid: "READY01", role: "cohost", email: "Helper@Acme.Example" }, { "x-organizer": key, "x-console-step": step });
    expect(r.status).toBe(200);
    expect(t.h.mails).toEqual([{ to: "helper@acme.example", eid: "READY01", role: "cohost" }]);
    const step2 = await t.asr({ act: "stepup", sa: "role-add", eid: "READY01", person: "alice" });
    const dup = await t.post("/api/console/role", { op: "invite", eid: "READY01", role: "host", email: "helper@acme.example" }, { "x-organizer": key, "x-console-step": step2 });
    expect(dup.status).toBe(409);
    expect(t.h.mails.length).toBe(1);
    const list = await (await t.post("/api/console/role", { op: "list", eid: "READY01" }, { "x-organizer": key })).json();
    expect(list.roles.length).toBe(1);
    expect(list.roles[0].emailHint).toBe("h***@acme.example");
    expect(JSON.stringify(list)).not.toContain("helper@");
  } finally { t.stop(); }
});

test("only the invited e-mail can accept, and not after the game is over", async () => {
  const t = await up();
  try {
    expect((await t.post("/api/console/role", { op: "accept", eid: "CARO001", roleId: "bbbbbbbbbb", assertion: await t.asr({ act: "role", eid: "CARO001", person: "bob" }) })).status).toBe(403);
    t.h.raw.run("UPDATE engagement SET ended=1 WHERE id='CARO001'");
    const late = await t.post("/api/console/role", { op: "accept", eid: "CARO001", roleId: "bbbbbbbbbb", assertion: await t.asr({ act: "role", eid: "CARO001", person: "alice" }) });
    expect(late.status).toBe(409);
  } finally { t.stop(); }
});

test("removing a Host stops that Host's key at the very next request", async () => {
  const t = await up();
  try {
    const host = (await t.session("alice")).scoped[0].key;
    const bob = (await t.session("bob")).organizer.key;
    expect((await t.post("/api/console/handoff", { eid: "BOBS001", target: "host" }, { "x-organizer": host })).status).toBe(200);
    const step = await t.asr({ act: "stepup", sa: "role-remove", eid: "BOBS001", person: "bob" });
    expect((await t.post("/api/console/role", { op: "remove", eid: "BOBS001", roleId: "aaaaaaaaaa" }, { "x-organizer": bob, "x-console-step": step })).status).toBe(200);
    expect((await t.post("/api/console/handoff", { eid: "BOBS001", target: "host" }, { "x-organizer": host })).status).toBe(403);
    expect((await t.session("alice")).scoped).toEqual([]);
  } finally { t.stop(); }
});

test("when a game ends every Host and Co-host key of it stops at once, and no new one is made", async () => {
  const t = await up();
  try {
    const host = (await t.session("alice")).scoped[0].key;
    expect((await t.post("/api/console/preview", { eid: "BOBS001" }, { "x-organizer": host })).status).toBe(200);
    t.h.raw.run("UPDATE engagement SET ended=1 WHERE id='BOBS001'");
    expect(await endRoles(t.h.adapter, t.h.env, "BOBS001")).toBe(1);
    expect((await t.post("/api/console/preview", { eid: "BOBS001" }, { "x-organizer": host })).status).toBe(403);
    expect((await t.session("alice")).scoped).toEqual([]);
    expect(t.h.raw.query("SELECT state FROM game_role WHERE eid='BOBS001'").get()).toEqual({ state: "ended" });
  } finally { t.stop(); }
});

test("a handoff link opens once, within 60 seconds, as exactly the role it was made for, with a 16 hour key for that game", async () => {
  const t = await up();
  try {
    const key = (await t.session("alice")).organizer.key;
    const mk = async () => /t=([0-9a-f]{48})/.exec((await (await t.post("/api/console/handoff", { eid: "PLAY001", target: "organizer" }, { "x-organizer": key })).json()).url)![1];
    const tok = await mk();
    const first = await (await t.post("/api/console/handoff/redeem", { t: tok })).json();
    expect(first.expiresMs - t.h.clock.ms).toBe(16 * 3600_000);
    expect([first.kind, first.eid]).toEqual(["master", "PLAY001"]);
    expect((await t.post("/api/console/handoff/redeem", { t: tok })).status).toBe(401);
    const tok2 = await mk(); t.h.clock.ms += 61_000;
    expect((await t.post("/api/console/handoff/redeem", { t: tok2 })).status).toBe(401);
    // the redeemed key is tied to that one game
    const row = t.h.raw.query("SELECT eid FROM organizer_key ORDER BY created_ms DESC, rowid DESC LIMIT 1").get() as any;
    expect(row.eid).toBe("PLAY001");
  } finally { t.stop(); }
});

test("purge-email forgets the person: role rows, invitation cards, and their keys", async () => {
  const t = await up();
  try {
    const host = (await t.session("alice")).scoped[0].key;
    const r = await (await t.post("/api/console/purge-email", { assertion: await t.asr({ act: "purge", person: "alice" }) })).json();
    expect(r.removed).toBe(3); // one invitation card, two role rows
    expect(t.h.raw.query("SELECT COUNT(*) c FROM game_role").get()).toEqual({ c: 0 });
    expect((await t.post("/api/console/preview", { eid: "BOBS001" }, { "x-organizer": host })).status).toBe(403);
  } finally { t.stop(); }
});

test("signout: the key and every other console key made for the same person stop at once; other people's keys are untouched", async () => {
  const t = await up();
  try {
    const alice = await t.session("alice"), bob = await t.session("bob");
    const ho = await (await t.post("/api/console/handoff", { eid: "PLAY001", target: "organizer" }, { "x-organizer": alice.organizer.key })).json();
    const redeemed = await (await t.post("/api/console/handoff/redeem", { t: /t=([0-9a-f]{48})/.exec(ho.url)![1] })).json();
    const alive = async (key: string) => (await t.post("/api/console/preview", { eid: "PLAY001" }, { "x-organizer": key })).status === 200;
    expect(await alive(alice.organizer.key)).toBe(true); expect(await alive(redeemed.key)).toBe(true);
    expect((await t.post("/api/console/signout", {}, { "x-organizer": alice.organizer.key })).status).toBe(200);
    expect(await alive(alice.organizer.key)).toBe(false);
    expect(await alive(redeemed.key)).toBe(false); // the hand-off key came from the same sign-in
    const bobAlive = (await t.post("/api/console/handoff", { eid: "BOBS001", target: "organizer" }, { "x-organizer": bob.organizer.key })).status;
    expect(bobAlive).toBe(200);
    // an old long-lived key and the platform key cannot use this door
    expect((await t.post("/api/console/signout", {}, { "x-organizer": "platform-secret" })).status).toBe(403);
    expect((await t.post("/api/console/signout", {})).status).toBe(403);
  } finally { t.stop(); }
});

test("contract additions (optional fields): the hand-off address remembers the page asked for, Close my account reports the roles erased, live may carry a story and counts", async () => {
  const t = await up();
  try {
    const key = (await t.session("alice")).organizer.key;
    for (const target of ["organizer", "host", "big", "tournament"]) {
      const j = await (await t.post("/api/console/handoff", { eid: "PLAY001", target }, { "x-organizer": key })).json();
      expect(j.url).toMatch(new RegExp(`&go=console&e=PLAY001&to=${target}$`));
    }
    // a person with an accepted Host role is forgotten: the number of role rows erased is reported
    const bob = await t.asr({ act: "purge", person: "alice" });
    const p = await (await t.post("/api/console/purge-email", { assertion: bob })).json();
    expect(p.ok).toBe(true);
    expect(typeof p.rolesErased).toBe("number");
    expect(p.rolesErased).toBeGreaterThan(0);
    expect(p.removed).toBeGreaterThanOrEqual(p.rolesErased);
  } finally { t.stop(); }
});
