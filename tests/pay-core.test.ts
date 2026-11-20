// FALSIFIED BY: pay-flag-open-by-default, pay-price-in-code, pay-calls-other-host, pay-double-spend, pay-refused-keeps-credits, pay-event-unsigned, pay-event-twice, pay-link-shows-balance, pay-down-hard-error, pay-store-contract
// The console's pay step, whole: a fake Moneypenny (no money), the real console routes, the real bridge of a game behind a real port.
import { test, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { handleConsole } from "../packages/bridge/src/bridge";
import { makeHost, seed } from "./support/fake-host";
import { makeCtx } from "../packages/bridge/test-kit/kit.mjs";
import { makeD1 } from "./support/d1-sqlite";
import { makeFakeMoneypenny } from "./support/fake-moneypenny";
import { handlePay, GAME_NAMES } from "../functions/_lib/pay-core";
import { sealText, sha256hex, type Env } from "../functions/_lib/auth-core";

const CONSOLE = "https://console.test";
const MIGRATIONS = readdirSync(new URL("../migrations/", import.meta.url)).filter((f) => f.endsWith(".sql")).sort().map((f) => "migrations/" + f);
const SID = "a".repeat(64);

async function world(o: { flag?: boolean; catalogue?: any[] } = {}) {
  const ctx = await makeCtx();
  const h = await makeHost();
  seed(h);
  h.env.CONSOLE_PUBKEYS = "k1:" + ctx.publicB64u;
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: async (req) => (await handleConsole(h.adapter, req, h.env)) ?? new Response("{}", { status: 404 }) });
  h.origin = `http://127.0.0.1:${server.port}`; h.env.PUBLIC_ORIGIN = h.origin;
  const { db, raw } = makeD1(MIGRATIONS);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", ctx.privateKey));
  const env: Env = { DB: db, SESSION_PEPPER: "pepper", CONSOLE_SIGNING_KEY: btoa(String.fromCharCode(...pkcs8)), CONSOLE_ORIGIN: CONSOLE, GAME_ORIGINS: JSON.stringify({ bingo: h.origin, tambola: h.origin }), MNP_WEBHOOK_SECRET: "whsec", PAY_VIA_MONEYPENNY: o.flag === false ? "0" : "1" } as any;
  const fake = makeFakeMoneypenny({ catalogue: o.catalogue ?? [{ product: "bingo", item: "250", credits: 5000 }, { product: "bingo", item: "100", credits: 3400 }] });
  const hosts: string[] = [];
  const doFetch = (async (u: any, init: any) => { hosts.push(new URL(String(u)).origin); return fetch(u, init); }) as typeof fetch;
  const alice = ctx.people.alice;
  const sign = async (email: string, hash: string) => { // a signed-in person, as the sign-in service would have left it
    raw.query("INSERT OR REPLACE INTO console_email(email_hash,email_sealed,created_ms,last_seen_ms,consent_ms) VALUES(?,?,?,?,?)").run(hash, await sealText(env, email), h.clock.ms, h.clock.ms, h.clock.ms);
    raw.query("INSERT OR REPLACE INTO session(sid_hash,email_hash,created_ms,last_seen_ms,expires_ms) VALUES(?,?,?,?,?)").run(await sha256hex("sid|" + SID), hash, h.clock.ms, h.clock.ms, h.clock.ms + 86400_000);
  };
  await sign(alice.email, alice.sub);
  const call = (method: string, path: string, body?: unknown, o2: { cookie?: boolean; headers?: Record<string, string>; raw?: string } = {}) =>
    handlePay(new Request(CONSOLE + path, { method, headers: { "content-type": "application/json", origin: h.origin, ...(o2.cookie === false ? {} : { cookie: "cbsess=" + SID }), ...(o2.headers || {}) }, body: o2.raw ?? (body === undefined ? undefined : JSON.stringify(body)) }), env, h.clock.ms, { mnp: fake.mnp, fetch: doFetch }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) as any, headers: r.headers }));
  const state = (eid: string) => h.raw.query("SELECT status, pay_state FROM engagement WHERE id=?").get(eid) as any;
  const event = async (payload: any, secret = "whsec", ts = h.clock.ms) => {
    const text = JSON.stringify(payload);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ts + "." + text)))].map((x) => x.toString(16).padStart(2, "0")).join("");
    return call("POST", "/pay/event", undefined, { cookie: false, raw: text, headers: { "x-mnp-timestamp": String(ts), "x-mnp-signature": sig } });
  };
  return { ctx, h, env, fake, call, state, event, hosts, alice, raw, stop: () => server.stop(true) };
}
const ASK = { game: "bingo", eid: "WAIT001", item: "250" };
const Q = "/pay/quote?game=bingo&eid=WAIT001&item=250";

test("DARK: with the flag off every pay route says 'not open yet'", async () => {
  const w = await world({ flag: false });
  try { const r = await w.call("GET", Q); expect(r.status).toBe(503); expect(r.json.error).toBe("not_open"); expect(w.fake.state.calls).toEqual([]); } finally { w.stop(); }
});

test("not signed in: a polite sign-in answer, Moneypenny is not asked", async () => {
  const w = await world();
  try { const r = await w.call("GET", Q, undefined, { cookie: false }); expect(r.status).toBe(401); expect(r.json.error).toBe("sign_in"); expect(w.fake.state.calls).toEqual([]); } finally { w.stop(); }
});

test("quote when credits are short: price, own credits and the credits to buy (the listed pack), every figure from Moneypenny", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 2000);
    const r = await w.call("GET", Q);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, paid: false, enough: false, price: { credits: 5000, usd: "50.00", inrMinor: 350000 }, balance: { credits: 2000, usd: "20.00", inrMinor: 140000 }, short: { credits: 3000, usd: "30.00", inrMinor: 210000 } });
    expect(w.fake.state.calls).toContain("GET /v1/game_pay/quote");
    expect(JSON.stringify(r.json)).not.toContain(w.alice.email);
  } finally { w.stop(); }
});

test("a shortfall buys the smallest LISTED pack, not the exact gap (Moneypenny's rule): 2,000 missing -> the 2,000 pack; 2,500 missing -> the 3,000 pack", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 3000); expect((await w.call("GET", Q)).json.short.credits).toBe(2000);
    w.fake.accounts.set(w.alice.email.toLowerCase(), 2500); expect((await w.call("GET", Q)).json.short.credits).toBe(3000);
  } finally { w.stop(); }
});

test("no price is written in the console: change Moneypenny's price list and the quote follows", async () => {
  const w = await world({ catalogue: [{ product: "bingo", item: "250", credits: 7777 }] });
  try {
    w.fake.give(w.alice.email, 100);
    const r = await w.call("GET", Q); expect(r.json.price.credits).toBe(7777); expect(r.json.price.usd).toBe("77.77");
    const none = await w.call("GET", "/pay/quote?game=bingo&eid=WAIT001&item=999"); expect(none.status).toBe(404); expect(none.json.error).toBe("no_item");
  } finally { w.stop(); }
});

test("enough credits: ONE button pays, Moneypenny takes the credits in one step, the game is marked PAID; a second click changes nothing", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 6000);
    const r = await w.call("POST", "/pay/pay", ASK);
    expect(r.json).toEqual({ ok: true, paid: true });
    expect(w.state("WAIT001")).toEqual({ status: "ready", pay_state: "paid" });
    expect(w.fake.accounts.get(w.alice.email.toLowerCase())).toBe(1000);
    expect(w.fake.state.calls.some((c) => /spend\/(reserve|capture)/.test(c))).toBe(false); // Moneypenny reserves and captures itself
    const again = await w.call("POST", "/pay/pay", ASK);
    expect(again.json.ok).toBe(true);
    expect(w.fake.accounts.get(w.alice.email.toLowerCase())).toBe(1000); // not spent twice
    expect((await w.call("GET", Q)).json.paid).toBe(true);
  } finally { w.stop(); }
});

test("short of credits: 'pay' is refused softly and nothing is taken", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 2000);
    const r = await w.call("POST", "/pay/pay", ASK);
    expect(r.status).toBe(402); expect(r.json.message).toContain("a few more credits");
    expect(w.fake.accounts.get(w.alice.email.toLowerCase())).toBe(2000); expect(w.state("WAIT001").status).toBe("waiting_payment");
  } finally { w.stop(); }
});

test("the game refuses for sure (wrong size): Moneypenny has the money, so the answer is 'being checked' (never 'paid'), and the game stays unpaid", async () => {
  const w = await world({ catalogue: [{ product: "bingo", item: "100", credits: 3400 }] });
  try {
    w.fake.give(w.alice.email, 6000);
    const r = await w.call("POST", "/pay/pay", { ...ASK, item: "100" }); // the game's own size is 250
    expect(r.status).toBe(409); expect(r.json.message).toContain("being checked");
    expect(w.state("WAIT001")).toEqual({ status: "waiting_payment", pay_state: "waiting" });
  } finally { w.stop(); }
});

test("Moneypenny down: soft words, nothing taken, no hard error", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 6000); w.fake.state.down = true;
    for (const [m, p, b] of [["GET", Q, undefined], ["POST", "/pay/buy", ASK], ["POST", "/pay/pay", ASK], ["POST", "/pay/check", ASK]] as const) {
      const r = await w.call(m, p, b);
      expect([r.status, r.json.error]).toEqual([503, "busy"]);
      expect(r.json.message).toContain("Nothing has been taken"); expect(r.json.message).not.toMatch(/error|failed|exception/i);
    }
    expect(w.fake.accounts.get(w.alice.email.toLowerCase())).toBe(6000); expect(w.state("WAIT001").status).toBe("waiting_payment");
    w.fake.state.down = false;
    expect((await w.call("POST", "/pay/pay", ASK)).json.paid).toBe(true); // the next click simply works
  } finally { w.stop(); }
});

test("the game cannot be reached right after Moneypenny took the credits: 'on its way' (202), and the next look tells the game; the game is marked once", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 6000);
    const real = w.env.GAME_ORIGINS;
    w.env.GAME_ORIGINS = JSON.stringify({ bingo: "http://127.0.0.1:1" }); // the game does not answer
    const r = await w.call("POST", "/pay/pay", ASK);
    expect([r.status, r.json.pending]).toEqual([202, true]); expect(r.json.message).toContain("You do not need to pay again");
    expect(w.state("WAIT001").status).toBe("waiting_payment");
    w.env.GAME_ORIGINS = real;
    w.h.clock.ms += 60_000;
    const look = await w.call("POST", "/pay/check", ASK); expect(look.json.paid).toBe(true);
    expect(w.state("WAIT001")).toEqual({ status: "ready", pay_state: "paid" });
    expect(w.fake.accounts.get(w.alice.email.toLowerCase())).toBe(1000); // taken once
  } finally { w.stop(); }
});

test("Buy now: Moneypenny opens a purchase for THIS game and gives the secure window's details; the window's answer goes to /pay/confirm; the game is paid once", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 2000);
    const b = await w.call("POST", "/pay/buy", ASK);
    expect(b.json.ok).toBe(true); expect(b.json.frame.url).toMatch(/\/payframe\/$/); expect(b.json.frame.opts).toMatchObject({ key: "rzp_test_stub", currency: "INR", amount: 3000 * 70, prefill: { email: w.alice.email } });
    expect(w.fake.games.get("WAIT001")!.credits).toBe(5000);
    expect(w.state("WAIT001").status).toBe("waiting_payment"); // not paid until Moneypenny says so
    expect((await w.call("GET", Q)).json.waiting).toBe(true);
    const bad = await w.call("POST", "/pay/confirm", { ...ASK, orderId: b.json.frame.orderId, resp: { ...w.fake.windowAnswer(b.json.frame.orderId), razorpay_signature: "wrong" } });
    expect(bad.json).toMatchObject({ ok: true, paid: false, pending: true }); expect(w.state("WAIT001").status).toBe("waiting_payment");
    const good = await w.call("POST", "/pay/confirm", { ...ASK, orderId: b.json.frame.orderId, resp: w.fake.windowAnswer(b.json.frame.orderId) });
    expect(good.json).toEqual({ ok: true, paid: true }); expect(w.state("WAIT001")).toEqual({ status: "ready", pay_state: "paid" });
    expect(w.fake.accounts.get(w.alice.email.toLowerCase())).toBe(0); // the pack (3,000) came in, the game's 5,000 went out
    w.h.raw.run("UPDATE engagement SET status='waiting_payment', pay_state='waiting' WHERE id='WAIT001'");
    await w.call("POST", "/pay/confirm", { ...ASK, orderId: b.json.frame.orderId, resp: w.fake.windowAnswer(b.json.frame.orderId) });
    expect(w.state("WAIT001").status).toBe("waiting_payment"); // the repeat did not mark it again
  } finally { w.stop(); }
});

test("Moneypenny's signed game.paid notice marks the game paid once; bad signature, old time and other kinds of notice change nothing", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 2000);
    await w.call("POST", "/pay/buy", ASK);
    const ev = w.fake.complete("WAIT001");
    const bad = await w.event(ev, "wrong-secret"); expect(bad.status).toBe(401); expect(w.state("WAIT001").status).toBe("waiting_payment");
    const old = await w.event(ev, "whsec", w.h.clock.ms - 10 * 60_000); expect(old.status).toBe(401);
    const good = await w.event(ev); expect(good.status).toBe(200); expect(w.state("WAIT001")).toEqual({ status: "ready", pay_state: "paid" });
    w.h.raw.run("UPDATE engagement SET status='waiting_payment', pay_state='waiting' WHERE id='WAIT001'");
    const twice = await w.event(ev); expect(twice.status).toBe(200);
    expect(w.state("WAIT001").status).toBe("waiting_payment"); // the second notice did not mark it again
    expect((await w.event({ id: "x", type: "credit.added", data: { game_ref: "WAIT001", product: "bingo" } })).json.ignored).toBe(true);
    expect((await w.event({ id: "y", type: "game.paid", data: { game_ref: "OTHER999", product: "someothergame" } })).json.ignored).toBe(true); // every notice reaches every endpoint
    expect((await w.event({ id: "z", type: "game.paid", data: { game_ref: "OTHER999", product: "bingo" } })).status).toBe(200); // a game this console never noted: nothing to tell
  } finally { w.stop(); }
});

test("backup path: /pay/check asks Moneypenny and tells the game when it is paid", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 2000);
    await w.call("POST", "/pay/buy", ASK);
    expect((await w.call("POST", "/pay/check", ASK)).json.paid).toBe(false);
    w.fake.complete("WAIT001");
    expect((await w.call("POST", "/pay/check", ASK)).json.paid).toBe(true);
    expect(w.state("WAIT001").pay_state).toBe("paid");
  } finally { w.stop(); }
});

test("payment link: a console page /pay/<token>; the payee sees only an amount due (no credits balance, no e-mail); the money goes into the organizer's account for this game", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 2000);
    const l = await w.call("POST", "/pay/link", ASK);
    expect(l.json.url).toMatch(/^https:\/\/console\.test\/pay\/[A-Za-z0-9_-]{20,80}$/);
    const t = l.json.url.split("/pay/")[1];
    const info = await w.call("GET", "/pay/link/info?t=" + t, undefined, { cookie: false });
    expect(info.json.due).toEqual({ currency: "INR", amountMinor: 3000 * 70 }); expect(info.json.gameName).toBe("Corporate Bingo");
    const text = JSON.stringify(info.json); expect(text).not.toContain(w.alice.email); expect(info.json.balance).toBeUndefined(); expect(text).not.toContain('"credits"');
    const noMail = await w.call("POST", "/pay/link/start", { t }, { cookie: false }); expect(noMail.status).toBe(400);
    const s = await w.call("POST", "/pay/link/start", { t, email: "demo9@demo-test.invalid" }, { cookie: false });
    expect(s.json.frame.opts.prefill.email).toBe("demo9@demo-test.invalid");
    const done = await w.call("POST", "/pay/link/confirm", { t, orderId: s.json.frame.orderId, resp: w.fake.windowAnswer(s.json.frame.orderId) }, { cookie: false });
    expect(done.json).toEqual({ ok: true, paid: true });
    expect(w.state("WAIT001")).toEqual({ status: "ready", pay_state: "paid" });
    expect((await w.call("GET", "/pay/link/info?t=" + t, undefined, { cookie: false })).json).toMatchObject({ ok: true, covered: true, paid: true });
    expect((await w.call("GET", "/pay/link/info?t=" + "0".repeat(48), undefined, { cookie: false })).status).toBe(404);
  } finally { w.stop(); }
});

test("a payee who pays after the organizer's tab is closed: the game is still told, by the signed notice", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 2000);
    const l = await w.call("POST", "/pay/link", ASK); const t = l.json.url.split("/pay/")[1];
    const s = await w.call("POST", "/pay/link/start", { t, email: "demo9@demo-test.invalid" }, { cookie: false });
    expect(s.json.ok).toBe(true);
    await w.event(w.fake.complete("WAIT001"));
    expect(w.state("WAIT001")).toEqual({ status: "ready", pay_state: "paid" });
  } finally { w.stop(); }
});

test("a game that is already paid cannot be bought twice from a link or from Buy now", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 6000);
    const l = await w.call("POST", "/pay/link", ASK); const t = l.json.url.split("/pay/")[1];
    await w.call("POST", "/pay/pay", ASK);
    expect((await w.call("GET", "/pay/link/info?t=" + t, undefined, { cookie: false })).json).toMatchObject({ covered: true, paid: true });
    const again = await w.call("POST", "/pay/link", ASK); expect(again.status).toBe(409); expect(again.json.message).toContain("already paid");
  } finally { w.stop(); }
});

test("the console talks to the game and to Moneypenny only: never IT Services, never Razorpay by name", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 6000); await w.call("POST", "/pay/pay", ASK);
    expect([...new Set(w.hosts)]).toEqual([w.h.origin]);
    const src = readFileSync(new URL("../functions/_lib/pay-core.ts", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n").replace(/razorpay_(order_id|payment_id|signature)/g, "").replace("itservices-rajat-agarwal.pages.dev", ""); // the window's own address is a setting, not a call
    expect(src).not.toMatch(/razorpay|itservices|it-services|api\/pay\//i);
  } finally { w.stop(); }
});

test("game names here are the names in config/games.json", () => {
  const cfg = JSON.parse(readFileSync(new URL("../config/games.json", import.meta.url), "utf8")).games;
  expect(Object.fromEntries(cfg.map((g: any) => [g.id, g.name]))).toEqual(GAME_NAMES);
});

// ---- seamless: everything the organizer, host and payee see is a console screen ----
test("the screen flips to Paid by itself: while the purchase is open the quote says 'waiting'; after the notice (even on a reopened tab) it says 'paid'; the payee's page says paid too", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 2000);
    const l = await w.call("POST", "/pay/link", ASK); const t = l.json.url.split("/pay/")[1];
    await w.call("POST", "/pay/buy", ASK);
    const q1 = await w.call("GET", Q); expect(q1.json.paid).toBe(false); expect(q1.json.waiting).toBe(true);
    await w.event(w.fake.complete("WAIT001"));
    const q2 = await w.call("GET", Q); expect(q2.json).toMatchObject({ ok: true, paid: true });
    const i = await w.call("GET", "/pay/link/info?t=" + t, undefined, { cookie: false }); expect(i.json).toMatchObject({ ok: true, covered: true, paid: true });
  } finally { w.stop(); }
});

test("the payee's link is a console page: /pay/<token> serves the one payee page (no redirect, no other site)", async () => {
  const w = await world();
  try {
    const asked: string[] = [];
    const assets = async (p: string) => { asked.push(p); return new Response("<html>payee page</html>", { status: 200 }); };
    const r = await handlePay(new Request(CONSOLE + "/pay/" + "a".repeat(43)), w.env, w.h.clock.ms, { mnp: w.fake.mnp, assets });
    expect(r.status).toBe(200); expect(await r.text()).toContain("payee page"); expect(asked).toEqual(["/pay-link.html"]); expect(r.headers.get("location")).toBe(null);
  } finally { w.stop(); }
});

test("the organizer's e-mail is kept sealed in the console's own note of the order", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 6000); await w.call("POST", "/pay/pay", ASK);
    const rows = w.raw.query("SELECT * FROM pay_order").all() as any[];
    expect(rows.length).toBe(1); expect(rows[0].state).toBe("told");
    expect(JSON.stringify(rows).toLowerCase()).not.toContain(w.alice.email.toLowerCase());
  } finally { w.stop(); }
});

test("error words: nothing the organizer or payee reads names the backend, and Moneypenny's own error text is never shown", async () => {
  const w = await world();
  try {
    const seen: string[] = [];
    const note = (r: any) => { if (r?.json?.message) seen.push(r.json.message); };
    w.fake.state.down = true;
    note(await w.call("GET", Q)); note(await w.call("POST", "/pay/pay", ASK)); note(await w.call("POST", "/pay/buy", ASK)); note(await w.call("POST", "/pay/link", ASK));
    w.fake.state.down = false;
    note(await w.call("GET", Q, undefined, { cookie: false })); note(await w.call("GET", "/pay/link/info?t=" + "0".repeat(48), undefined, { cookie: false }));
    note(await w.call("POST", "/pay/pay", { game: "x" })); w.fake.give(w.alice.email, 2000); note(await w.call("POST", "/pay/pay", ASK)); // short of credits
    note(await w.call("GET", "/pay/quote?game=bingo&eid=WAIT001&item=999")); // an error code from Moneypenny: our own words
    note(await w.call("GET", "/pay/nothing"));
    const src = readFileSync(new URL("../functions/_lib/pay-core.ts", import.meta.url), "utf8");
    for (const m of src.match(/^  [a-zA-Z]+: "[^"]+",$/gm) || []) seen.push(m);
    expect(seen.length).toBeGreaterThan(8);
    for (const s of seen) expect(s).not.toMatch(/moneypenny|\bapi\b|it services|razorpay|payu|server|exception|\berror\b|failed|invalid|undefined|text the console must not show/i);
  } finally { w.stop(); }
});
