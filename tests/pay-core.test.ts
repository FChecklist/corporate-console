// FALSIFIED BY: pay-flag-open-by-default, pay-price-in-code, pay-calls-other-host, pay-double-spend, pay-refused-keeps-credits, pay-event-unsigned, pay-event-twice, pay-link-shows-balance, pay-down-hard-error, pay-store-contract
// The console's pay step, whole: a fake Moneypenny (no money), the real console routes, the real bridge of a game behind a real port.
import { test, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { handleConsole } from "../packages/bridge/src/bridge";
import { makeHost, seed } from "./support/fake-host";
import { makeCtx } from "../packages/bridge/test-kit/kit.mjs";
import { makeD1 } from "./support/d1-sqlite";
import { makeFakeMoneypenny } from "./support/fake-moneypenny";
import { handlePay, d1WalletStore, GAME_NAMES, retryStuck } from "../functions/_lib/pay-core";
import { sealText, sha256hex, type Env } from "../functions/_lib/auth-core";
// @ts-ignore plain JS copy of the Moneypenny wallet
import { storeContract } from "../packages/console-wallet/index.js";

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

test("DARK: with the flag off every pay route says 'not open yet'", async () => {
  const w = await world({ flag: false });
  try { const r = await w.call("GET", "/pay/quote?game=bingo&eid=WAIT001&item=250"); expect(r.status).toBe(503); expect(r.json.error).toBe("not_open"); expect(w.fake.state.calls).toEqual([]); } finally { w.stop(); }
});

test("not signed in: a polite sign-in answer, Moneypenny is not asked", async () => {
  const w = await world();
  try { const r = await w.call("GET", "/pay/quote?game=bingo&eid=WAIT001&item=250", undefined, { cookie: false }); expect(r.status).toBe(401); expect(r.json.error).toBe("sign_in"); expect(w.fake.state.calls).toEqual([]); } finally { w.stop(); }
});

test("quote when credits are short: price, own credits and the missing credits, every figure from Moneypenny", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 2000);
    const r = await w.call("GET", "/pay/quote?game=bingo&eid=WAIT001&item=250");
    expect(r.status).toBe(200);
    expect(r.json.price).toEqual({ credits: 5000, usd: "50.00", inrMinor: 350000 });
    expect(r.json.balance).toEqual({ credits: 2000, usd: "20.00", inrMinor: 140000 });
    expect(r.json.short).toEqual({ credits: 3000, usd: "30.00", inrMinor: 210000 });
    expect(r.json.enough).toBe(false);
    expect(r.headers.get("access-control-allow-origin")).toBe(w.h.origin); expect(r.headers.get("access-control-allow-credentials")).toBe("true");
  } finally { w.stop(); }
});

test("no price is written in the console: change Moneypenny's price list and the quote follows", async () => {
  const w = await world({ catalogue: [{ product: "bingo", item: "250", credits: 1234 }] });
  try { const r = await w.call("GET", "/pay/quote?game=bingo&eid=WAIT001&item=250"); expect(r.json.price.credits).toBe(1234); expect(r.json.price.inrMinor).toBe(1234 * 70); } finally { w.stop(); }
  const src = readFileSync(new URL("../functions/_lib/pay-core.ts", import.meta.url), "utf8");
  expect(src.match(/\b\d{4,}\b/g)?.filter((x) => !["1000", "3000", "8000", "86400"].includes(x) && !/^\d{5,}$/.test(x)) ?? []).toEqual([]); // no price-sized number in the code (time constants only)
});

test("enough credits: ONE button pays, the game is marked PAID, credits go down once; a second click changes nothing", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 6000);
    const r = await w.call("POST", "/pay/pay", ASK);
    expect(r.json).toEqual({ ok: true, paid: true });
    expect(w.state("WAIT001")).toEqual({ status: "ready", pay_state: "paid" });
    expect(w.fake.accounts.get(w.alice.email.toLowerCase())).toBe(1000);
    const again = await w.call("POST", "/pay/pay", ASK);
    expect(again.json.ok).toBe(true);
    expect(w.fake.accounts.get(w.alice.email.toLowerCase())).toBe(1000); // not spent twice
  } finally { w.stop(); }
});

test("short of credits: 'pay' is refused softly and nothing is held", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 100);
    const r = await w.call("POST", "/pay/pay", ASK);
    expect(r.status).toBe(402); expect(r.json.error).toBe("short");
    expect(w.fake.holds.size).toBe(0); expect(w.state("WAIT001").status).toBe("waiting_payment");
  } finally { w.stop(); }
});

test("the game refuses for sure (wrong size): the credits come back and the game stays unpaid", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 6000);
    const r = await w.call("POST", "/pay/pay", { ...ASK, item: "100" }); // WAIT001 is the 250 size
    expect(r.status).toBe(409); expect(r.json.error).toBe("refused"); expect(r.json.message).toContain("back in your account");
    expect(w.fake.accounts.get(w.alice.email.toLowerCase())).toBe(6000);
    expect(w.state("WAIT001")).toEqual({ status: "waiting_payment", pay_state: "waiting" });
  } finally { w.stop(); }
});

test("somebody else's game: refused for sure, credits come back", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 6000);
    const r = await w.call("POST", "/pay/pay", { game: "bingo", eid: "BOBS001", item: "100" });
    expect(r.json.ok).toBe(false); expect(w.fake.accounts.get(w.alice.email.toLowerCase())).toBe(6000);
  } finally { w.stop(); }
});

test("Moneypenny down: soft words, nothing taken, no hard error", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 6000); w.fake.state.down = true;
    for (const [m, p, b] of [["GET", "/pay/quote?game=bingo&eid=WAIT001&item=250", undefined], ["POST", "/pay/buy", ASK]] as const) {
      const r = await w.call(m, p, b);
      expect([r.status, r.json.error]).toEqual([503, "busy"]);
      expect(r.json.message).toContain("Nothing has been taken"); expect(r.json.message).not.toMatch(/error|failed|exception/i);
    }
    const p = await w.call("POST", "/pay/pay", ASK); // the click is kept as ONE order for this game; Moneypenny not answering is not a hard error
    expect([p.status, p.json.pending]).toEqual([202, true]); expect(p.json.message).toContain("You do not need to pay again");
    expect(w.fake.accounts.get(w.alice.email.toLowerCase())).toBe(6000); expect(w.state("WAIT001").status).toBe("waiting_payment");
    w.fake.state.down = false;
    const again = await w.call("POST", "/pay/pay", ASK); expect(again.json.pending).toBe(true); // a second click does not make a second order
    w.h.clock.ms += 3 * 60_000; await retryStuck(w.env, w.h.clock.ms, { mnp: w.fake.mnp, fetch: fetch }); // the 2-minute job finishes the one order
    expect(w.state("WAIT001")).toEqual({ status: "ready", pay_state: "paid" }); expect(w.fake.accounts.get(w.alice.email.toLowerCase())).toBe(1000);
  } finally { w.stop(); }
});

test("Buy now: Moneypenny opens a buy of exactly the missing credits for THIS game; Moneypenny's signed notice marks the game paid once", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 2000);
    const b = await w.call("POST", "/pay/buy", ASK);
    expect(b.json.ok).toBe(true); expect(b.json.orderRef).toBe("GAME-bingo-WAIT001-3000"); expect(b.json.payPage).toContain("pay.invalid"); expect(b.json.amountMinor).toBe(3000 * 70);
    expect(w.fake.orders.get("GAME-bingo-WAIT001-3000")!.gameId).toBe("WAIT001");
    expect(w.state("WAIT001").status).toBe("waiting_payment"); // not paid until Moneypenny says so
    const ev = w.fake.complete("GAME-bingo-WAIT001-3000");
    const bad = await w.event(ev, "wrong-secret"); expect(bad.status).toBe(401); expect(w.state("WAIT001").status).toBe("waiting_payment");
    const old = await w.event(ev, "whsec", w.h.clock.ms - 10 * 60_000); expect(old.status).toBe(401);
    const good = await w.event(ev); expect(good.status).toBe(200); expect(w.state("WAIT001")).toEqual({ status: "ready", pay_state: "paid" });
    w.h.raw.run("UPDATE engagement SET status='waiting_payment', pay_state='waiting' WHERE id='WAIT001'");
    const twice = await w.event(ev); expect(twice.status).toBe(200);
    expect(w.state("WAIT001").status).toBe("waiting_payment"); // the second notice did not mark it again
    expect((await w.event({ type: "credit.added", order_ref: "x" })).json.ignored).toBe(true);
  } finally { w.stop(); }
});

test("backup path: /pay/check asks Moneypenny and tells the game when the buy is paid", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 2000);
    await w.call("POST", "/pay/buy", ASK);
    expect((await w.call("POST", "/pay/check", ASK)).json.paid).toBe(false);
    w.fake.complete("GAME-bingo-WAIT001-3000");
    expect((await w.call("POST", "/pay/check", ASK)).json.paid).toBe(true);
    expect(w.state("WAIT001").pay_state).toBe("paid");
  } finally { w.stop(); }
});

test("payment link: the payee sees only an amount due (no credits balance, no e-mail); the buy goes into the organizer's account for this game; it ends after 7 days", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 2000);
    const l = await w.call("POST", "/pay/link", ASK);
    expect(l.json.url).toMatch(/^https:\/\/console\.test\/pay\/[0-9a-f]{48}$/);
    const t = l.json.url.split("/pay/")[1];
    const info = await w.call("GET", "/pay/link/info?t=" + t, undefined, { cookie: false });
    expect(info.json.due).toEqual({ credits: 3000, usd: "30.00", inrMinor: 210000 }); expect(info.json.gameName).toBe("Corporate Bingo");
    const text = JSON.stringify(info.json); expect(text).not.toContain(w.alice.email); expect(info.json.balance).toBeUndefined(); expect(text).not.toContain('"credits":2000');
    const s = await w.call("POST", "/pay/link/start", { t }, { cookie: false });
    expect(s.json.payPage).toContain("pay.invalid");
    await w.event(w.fake.complete("GAME-bingo-WAIT001-3000"));
    expect(w.state("WAIT001").pay_state).toBe("paid");
    const gone = await handlePay(new Request(CONSOLE + "/pay/link/info?t=" + t), w.env, w.h.clock.ms + 8 * 86400_000, { mnp: w.fake.mnp, fetch: fetch });
    expect(gone.status).toBe(404);
    expect((await w.call("GET", "/pay/link/info?t=" + "0".repeat(48), undefined, { cookie: false })).status).toBe(404);
  } finally { w.stop(); }
});

test("the console talks to the game and to Moneypenny only: never IT Services, never Razorpay", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 6000); await w.call("POST", "/pay/pay", ASK);
    expect([...new Set(w.hosts)]).toEqual([w.h.origin]);
    const src = readFileSync(new URL("../functions/_lib/pay-core.ts", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(src).not.toMatch(/razorpay|itservices|it-services|api\/pay\//i);
  } finally { w.stop(); }
});

test("the wallet's order store on D1 keeps every promise the wallet needs (storeContract)", async () => {
  const bad = await storeContract(() => { const { db } = makeD1(MIGRATIONS); return d1WalletStore({ DB: db } as any); });
  expect(bad).toEqual([]);
});

test("the 2-minute job exists and does nothing while the step is dark", async () => {
  const w = await world({ flag: false });
  try { expect(await retryStuck(w.env, w.h.clock.ms, { mnp: w.fake.mnp })).toBe(null); } finally { w.stop(); }
});

test("game names here are the names in config/games.json", () => {
  const cfg = JSON.parse(readFileSync(new URL("../config/games.json", import.meta.url), "utf8")).games;
  expect(Object.fromEntries(cfg.map((g: any) => [g.id, g.name]))).toEqual(GAME_NAMES);
});

// ---- seamless: everything the organizer, host and payee see is a console screen ----
test("the screen flips to Paid by itself: while the buy is open the quote says 'waiting'; after the notice (even on a reopened tab) it says 'paid'; the payee's page says paid too", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 2000);
    const l = await w.call("POST", "/pay/link", ASK); const t = l.json.url.split("/pay/")[1];
    await w.call("POST", "/pay/buy", ASK);
    const q1 = await w.call("GET", "/pay/quote?game=bingo&eid=WAIT001&item=250"); expect(q1.json.paid).toBe(false); expect(q1.json.waiting).toBe(true);
    await w.event(w.fake.complete("GAME-bingo-WAIT001-3000"));
    const q2 = await w.call("GET", "/pay/quote?game=bingo&eid=WAIT001&item=250"); expect(q2.json).toMatchObject({ ok: true, paid: true });
    const i = await w.call("GET", "/pay/link/info?t=" + t, undefined, { cookie: false }); expect(i.json).toMatchObject({ ok: true, covered: true, paid: true });
  } finally { w.stop(); }
});

test("the payee's link is a console page: /pay/<token> serves the one payee page (no redirect, no other site)", async () => {
  const w = await world();
  try {
    const asked: string[] = [];
    const assets = async (p: string) => { asked.push(p); return new Response("<html>payee page</html>", { status: 200 }); };
    const r = await handlePay(new Request(CONSOLE + "/pay/" + "a".repeat(48)), w.env, w.h.clock.ms, { mnp: w.fake.mnp, assets });
    expect(r.status).toBe(200); expect(await r.text()).toContain("payee page"); expect(asked).toEqual(["/pay-link.html"]); expect(r.headers.get("location")).toBe(null);
  } finally { w.stop(); }
});

test("the organizer's e-mail is not kept in plain words in the wallet's order rows", async () => {
  const w = await world();
  try {
    w.fake.give(w.alice.email, 6000); await w.call("POST", "/pay/pay", ASK);
    const rows = w.raw.query("SELECT row_json FROM wallet_order").all() as any[];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.row_json.toLowerCase()).not.toContain(w.alice.email.toLowerCase());
  } finally { w.stop(); }
});

test("error words: nothing the organizer or payee reads names the backend (no 'Moneypenny site', 'API', 'IT Services', 'Razorpay', 'server', 'error')", async () => {
  const w = await world();
  try {
    const seen: string[] = [];
    const note = (r: any) => { if (r?.json?.message) seen.push(r.json.message); };
    w.fake.state.down = true;
    note(await w.call("GET", "/pay/quote?game=bingo&eid=WAIT001&item=250")); note(await w.call("POST", "/pay/pay", ASK)); note(await w.call("POST", "/pay/buy", ASK)); note(await w.call("POST", "/pay/link", ASK));
    w.fake.state.down = false;
    note(await w.call("GET", "/pay/quote?game=bingo&eid=WAIT001&item=250", undefined, { cookie: false })); note(await w.call("GET", "/pay/link/info?t=" + "0".repeat(48), undefined, { cookie: false }));
    note(await w.call("POST", "/pay/pay", { game: "x" })); note(await w.call("POST", "/pay/pay", ASK)); // short of credits
    w.fake.give(w.alice.email, 6000); note(await w.call("POST", "/pay/buy", ASK)); note(await w.call("GET", "/pay/nothing"));
    const src = readFileSync(new URL("../functions/_lib/pay-core.ts", import.meta.url), "utf8");
    for (const m of src.match(/^  [a-zA-Z]+: "[^"]+",$/gm) || []) seen.push(m);
    expect(seen.length).toBeGreaterThan(8);
    for (const s of seen) expect(s).not.toMatch(/moneypenny|\bapi\b|it services|razorpay|payu|server|exception|\berror\b|failed|invalid|undefined/i);
  } finally { w.stop(); }
});
