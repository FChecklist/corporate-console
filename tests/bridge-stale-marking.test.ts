// FALSIFIED BY: marking-forever, lease-takeover-removed, paid-marked-twice
// A paid notice that failed with a one-off error leaves the order 'marking'. It must never stay locked for ever: after the short lease the next try finishes it, once, and a game that is already paid is never touched again.
import { test, expect } from "bun:test";
import { handleConsole, MARK_LEASE_MS } from "../packages/bridge/src/bridge";
import { makeHost, seed } from "./support/fake-host";
import { makeCtx, buildAssertion } from "../packages/bridge/test-kit/kit.mjs";

async function up() {
  const ctx = await makeCtx(); const h = await makeHost(); seed(h); h.env.CONSOLE_PUBKEYS = "k1:" + ctx.publicB64u;
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: async (req) => (await handleConsole(h.adapter, req, h.env)) ?? new Response("{}", { status: 404 }) });
  h.origin = `http://127.0.0.1:${server.port}`; h.env.PUBLIC_ORIGIN = h.origin;
  const paid = async (orderRef: string) => {
    const a = (await buildAssertion(ctx, { act: "paid", person: "alice", eid: "WAIT001" }, h.origin, h.clock.ms)).token;
    const r = await fetch(h.origin + "/api/console/paid", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assertion: a, eid: "WAIT001", item: "250", orderRef }) });
    return { status: r.status, body: await r.json() as any };
  };
  const row = (ref: string) => h.raw.query("SELECT state FROM console_paid WHERE order_ref=?").get(ref) as any;
  const game = () => h.raw.query("SELECT status, pay_state FROM engagement WHERE id='WAIT001'").get() as any;
  // markPaid that fails once with a one-off database error, counting every call
  const flaky = (failures: number) => { const real = h.adapter.markPaid!; const c = { calls: 0 }; h.adapter.markPaid = async (e: any, o: any) => { c.calls++; if (c.calls <= failures) throw new Error("D1_ERROR: database is busy"); return real(e, o); }; return c; };
  return { h, paid, row, game, flaky, stop: () => server.stop(true) };
}

test("a database error inside markPaid, then a retry after the lease: the game is marked paid", async () => {
  const t = await up();
  try {
    const c = t.flaky(1);
    const first = await t.paid("order-stale-0001");
    expect(first.status).toBe(503); expect(t.row("order-stale-0001")).toEqual({ state: "marking" }); expect(t.game().pay_state).not.toBe("paid");
    t.h.clock.ms += MARK_LEASE_MS + 1000;
    const again = await t.paid("order-stale-0001");
    expect(again.status).toBe(200); expect(again.body.repeat).toBe(false);
    expect(t.row("order-stale-0001")).toEqual({ state: "paid" }); expect(t.game()).toEqual({ status: "ready", pay_state: "paid" }); expect(c.calls).toBe(2);
  } finally { t.stop(); }
});

test("inside the lease the retry is told to wait (not marked twice); the row never stays locked beyond the lease", async () => {
  const t = await up();
  try {
    const c = t.flaky(1);
    expect((await t.paid("order-stale-0002")).status).toBe(503);
    t.h.clock.ms += MARK_LEASE_MS - 5000;
    const wait = await t.paid("order-stale-0002");
    expect(wait.status).toBe(409); expect(wait.body.error).toBe("in_progress"); expect(c.calls).toBe(1);
    t.h.clock.ms += 6000;
    expect((await t.paid("order-stale-0002")).status).toBe(200);
  } finally { t.stop(); }
});

test("two retries at the same moment after the lease: exactly one marks the game, nobody pays twice", async () => {
  const t = await up();
  try {
    const c = t.flaky(1);
    expect((await t.paid("order-stale-0003")).status).toBe(503);
    t.h.clock.ms += MARK_LEASE_MS + 1000;
    const [a, b] = await Promise.all([t.paid("order-stale-0003"), t.paid("order-stale-0003")]);
    expect([a.status, b.status].every((x) => x === 200 || x === 409)).toBe(true); expect([a.status, b.status]).toContain(200);
    expect(c.calls).toBe(2); expect(t.game()).toEqual({ status: "ready", pay_state: "paid" }); expect(t.row("order-stale-0003")).toEqual({ state: "paid" });
  } finally { t.stop(); }
});

test("an already-paid order is a no-op: markPaid is not called again and nothing resets", async () => {
  const t = await up();
  try {
    expect((await t.paid("order-stale-0004")).status).toBe(200);
    const before = t.game(); const c = t.flaky(0);
    t.h.clock.ms += MARK_LEASE_MS * 10;
    const again = await t.paid("order-stale-0004");
    expect(again.status).toBe(200); expect(again.body.repeat).toBe(true); expect(c.calls).toBe(0); expect(t.game()).toEqual(before);
  } finally { t.stop(); }
});

test("a failure that keeps happening stays retryable: every later try after the lease runs markPaid again until it works", async () => {
  const t = await up();
  try {
    const c = t.flaky(3);
    for (let i = 0; i < 3; i++) { expect((await t.paid("order-stale-0005")).status).toBe(503); t.h.clock.ms += MARK_LEASE_MS + 1000; }
    expect((await t.paid("order-stale-0005")).status).toBe(200); expect(c.calls).toBe(4);
  } finally { t.stop(); }
});
