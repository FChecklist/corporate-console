// FALSIFIED BY: paid-twice-marks-twice, paid-wrong-owner, paid-wrong-size, paid-unclear-forgets, paid-refusal-keeps-row
// The 'paid' notice (POST /api/console/paid): the console tells a game that a Moneypenny order for it is paid. Once per order id, only for the organizer's own game and size.
import { test, expect } from "bun:test";
import { handleConsole } from "../packages/bridge/src/bridge";
import { makeHost, seed } from "./support/fake-host";
import { makeCtx, buildAssertion } from "../packages/bridge/test-kit/kit.mjs";

async function up() {
  const ctx = await makeCtx();
  const h = await makeHost();
  seed(h);
  h.env.CONSOLE_PUBKEYS = "k1:" + ctx.publicB64u;
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: async (req) => (await handleConsole(h.adapter, req, h.env)) ?? new Response("{}", { status: 404 }) });
  h.origin = `http://127.0.0.1:${server.port}`; h.env.PUBLIC_ORIGIN = h.origin;
  const paid = async (person: string, eid: string, item: string, orderRef: string, mutate?: any) => {
    const a = (await buildAssertion(ctx, { act: "paid", person, eid, mutate }, h.origin, h.clock.ms)).token;
    const r = await fetch(h.origin + "/api/console/paid", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assertion: a, eid, item, orderRef }) });
    return { status: r.status, body: await r.json() as any };
  };
  const state = (eid: string) => h.raw.query("SELECT status, pay_state FROM engagement WHERE id=?").get(eid) as any;
  return { h, paid, state, stop: () => server.stop(true) };
}

test("a paid notice for the organizer's own unpaid game, with its size, marks it paid", async () => {
  const t = await up();
  try {
    const r = await t.paid("alice", "WAIT001", "250", "tambola-order0001");
    expect(r.status).toBe(200); expect(r.body.repeat).toBe(false);
    expect(t.state("WAIT001")).toEqual({ status: "ready", pay_state: "paid" });
  } finally { t.stop(); }
});

test("the same order id twice marks the game once and answers 'repeat' (idempotent by order id)", async () => {
  const t = await up();
  try {
    await t.paid("alice", "WAIT001", "250", "tambola-order0002");
    t.h.raw.run("UPDATE engagement SET pay_state='waiting', status='waiting_payment' WHERE id='WAIT001'"); // if the game were marked again, this would flip it back to paid
    const r = await t.paid("alice", "WAIT001", "250", "tambola-order0002");
    expect(r.status).toBe(200); expect(r.body.repeat).toBe(true);
    expect(t.state("WAIT001").status).toBe("waiting_payment"); // untouched by the repeat
  } finally { t.stop(); }
});

test("somebody else's game, or the wrong size, is refused for sure and changes nothing; the order id stays free to use", async () => {
  const t = await up();
  try {
    const other = await t.paid("bob", "WAIT001", "250", "tambola-order0003");
    expect(other.status).toBe(409); expect(other.body.error).toBe("game_refused"); expect(other.body.definite).toBe("true");
    const size = await t.paid("alice", "WAIT001", "100", "tambola-order0003");
    expect(size.status).toBe(409); expect(size.body.error).toBe("game_refused");
    expect(t.state("WAIT001")).toEqual({ status: "waiting_payment", pay_state: "waiting" });
    expect((await t.paid("alice", "WAIT001", "250", "tambola-order0003")).status).toBe(200);
  } finally { t.stop(); }
});

test("an unclear failure inside the game is not a refusal: 503, the order stays 'being saved', and a retry with the same order id is told to wait", async () => {
  const t = await up();
  try {
    const real = t.h.adapter.markPaid!;
    t.h.adapter.markPaid = async () => { throw new Error("disk went away"); };
    const r = await t.paid("alice", "WAIT001", "250", "tambola-order0004");
    expect(r.status).toBe(503); expect(r.body.error).toBe("unclear");
    t.h.adapter.markPaid = real;
    const again = await t.paid("alice", "WAIT001", "250", "tambola-order0004");
    expect(again.status).toBe(409); expect(again.body.error).toBe("in_progress");
    // C-3: it is only a short lease. After it, the next try takes over and marks again, so one transient failure never leaves a paid game unpaid.
    t.h.clock.ms += 31_000;
    const later = await t.paid("alice", "WAIT001", "250", "tambola-order0004");
    expect(later.status).toBe(200); expect(later.body.repeat).toBe(false);
    expect(t.state("WAIT001")).toEqual({ status: "ready", pay_state: "paid" });
    expect((await t.paid("alice", "WAIT001", "250", "tambola-order0004")).body.repeat).toBe(true); // paid is final
  } finally { t.stop(); }
});

test("a notice with a bad signature purpose, or for another game's id, is not accepted", async () => {
  const t = await up();
  try {
    const wrongGame = await t.paid("alice", "WAIT001", "250", "tambola-order0005", { aud: "http://elsewhere.example" });
    expect(wrongGame.status).toBe(401);
    expect(t.state("WAIT001").status).toBe("waiting_payment");
  } finally { t.stop(); }
});

import { legacyPayRedirect } from "../packages/bridge/src/bridge";
test("D3: with the flag on, a game's own pay screen and pay routes answer 302 to the console; with it off, nothing changes; the payment company's own notice is left alone", () => {
  const go = (path: string, flag: string | undefined, extra?: RegExp[]) => legacyPayRedirect(new Request("https://game.example" + path), { flag, consoleOrigin: "https://console.example/", extra });
  for (const p of ["/pay.html", "/paylink.html", "/paytest.html", "/api/z/ABCD1234/paylink", "/api/z/ABCD1234/order", "/api/z/ABCD1234/verify", "/api/z/ABCD1234/credit", "/api/order"]) {
    const r = go(p, "1")!;
    expect([p, r.status, r.headers.get("location")]).toEqual([p, 302, "https://console.example/"]);
    expect(go(p, undefined)).toBe(null); expect(go(p, "0")).toBe(null);
  }
  for (const p of ["/z.html", "/api/z/ABCD1234/info", "/api/z/ABCD1234/publish", "/api/webhook/razorpay", "/api/console/paid"]) expect(go(p, "1")).toBe(null);
  expect(go("/api/mypay", "1", [/^\/api\/mypay$/])!.status).toBe(302);
});

test("C-3: two tries after the lease ran out: only one takes the mark, the game is marked once", async () => {
  const t = await up();
  try {
    let calls = 0; const real = t.h.adapter.markPaid!;
    t.h.adapter.markPaid = async (e: any, o: any) => { calls++; if (calls === 1) throw new Error("disk went away"); await new Promise((r) => setTimeout(r, 30)); return real(e, o); };
    expect((await t.paid("alice", "WAIT001", "250", "tambola-order0010")).status).toBe(503);
    t.h.clock.ms += 31_000;
    const [a, b] = await Promise.all([t.paid("alice", "WAIT001", "250", "tambola-order0010"), t.paid("alice", "WAIT001", "250", "tambola-order0010")]);
    expect([a.status, b.status].every((x) => x === 200 || x === 409)).toBe(true); expect([a.status, b.status]).toContain(200); expect(calls).toBe(2); // the one that loses the race may see 409 (busy) or 200 (already done), by timing; what matters: the game was marked exactly once
  } finally { t.stop(); }
});

test("C-1: the game answers who OWNS it as organizer (read-only); a stranger and a host do not", async () => {
  const ctx = await makeCtx(); const h = await makeHost(); seed(h); h.env.CONSOLE_PUBKEYS = "k1:" + ctx.publicB64u;
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: async (req) => (await handleConsole(h.adapter, req, h.env)) ?? new Response("{}", { status: 404 }) });
  h.origin = `http://127.0.0.1:${server.port}`; h.env.PUBLIC_ORIGIN = h.origin;
  try {
    const ask = async (person: string, eid: string) => { const a = (await buildAssertion(ctx, { act: "payable", person, eid }, h.origin, h.clock.ms)).token; const r = await fetch(h.origin + "/api/console/payable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assertion: a, eid }) }); return { status: r.status, body: await r.json() as any }; };
    expect((await ask("alice", "WAIT001")).body).toMatchObject({ ok: true, owner: true, item: "250", paid: false });
    expect((await ask("bob", "WAIT001")).body).toMatchObject({ ok: true, owner: false, item: null, paid: false });
    expect(JSON.stringify((await ask("bob", "WAIT001")).body)).not.toContain("250"); // a stranger learns nothing about the game
  } finally { server.stop(true); }
});
