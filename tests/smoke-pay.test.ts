// FALSIFIED BY: smoke-pay-item-stale, smoke-pay-paid-no-row-quote, smoke-pay-paid-no-row-check, smoke-pay-size-words, smoke-pay-payee-tells-game, smoke-pay-voice-we
// (addresses with \u0040 are written that way on purpose: the repo rule keeps real-looking addresses out of test source; they are never sent anywhere, the mail service is a stand-in)
// SMOKE 20 NOV 2026, owner steps 12 to 14 (Moneypenny credits, making payment, confirmation of payment) for all six games, all eight sizes and every way a payment can go.
// The real console pay routes, the real bridge of each game (a fake game per game, behind its own address), a fake Moneypenny. No network, no money. One test = one cell of docs/SMOKE-20NOV-CONSOLE.md.
import { test, expect } from "bun:test";
import { handleConsole } from "../packages/bridge/src/bridge";
import { makeHost, seed } from "./support/fake-host";
import { makeCtx } from "../packages/bridge/test-kit/kit.mjs";
import { makeD1 } from "./support/d1-sqlite";
import { makeFakeMoneypenny } from "./support/fake-moneypenny";
import { handlePay, GAME_NAMES } from "../functions/_lib/pay-core";
import { sealText, sha256hex, type Env } from "../functions/_lib/auth-core";
import { readdirSync } from "node:fs";

const CONSOLE = "https://console.corporatetambola.com";
const GAMES = ["tambola", "bingo", "tictactoe", "snakesladders", "luckbychance", "luckydraw"];
const SIZES = [100, 250, 500, 750, 1000, 2500, 5000, 10000];
const PACKS = [1000, 2000, 3000, 5000, 10000, 25000, 50000, 100000];
const costOf = (size: number) => 1400 + size * 8; // a test price list: no console code knows it
const MIGRATIONS = readdirSync(new URL("../migrations/", import.meta.url)).filter((f) => f.endsWith(".sql")).sort().map((f) => "migrations/" + f);
const SID = "a".repeat(64), EID = "WAIT001";
const smallestPack = (short: number) => PACKS.filter((p) => p >= short).sort((a, b) => a - b)[0];

async function world(o: { game?: string; size?: number; flag?: boolean; resize?: boolean } = {}) {
  const game = o.game ?? "bingo", size = o.size ?? 250;
  const ctx = await makeCtx();
  const hosts: Record<string, Awaited<ReturnType<typeof makeHost>>> = {};
  const origins: Record<string, string> = {};
  for (const g of GAMES) {
    const h = await makeHost({ origin: `http://${g}.game.test` });
    seed(h); h.env.CONSOLE_PUBKEYS = "k1:" + ctx.publicB64u;
    (h.adapter as any).game = g; (h.adapter as any).gameName = GAME_NAMES[g];
    h.raw.run("UPDATE engagement SET cap=? WHERE id=?", [size, EID]);
    hosts[g] = h; origins[g] = h.origin;
  }
  const sent = { notices: 0 };
  const routed = (async (u: any, init: any) => {
    const url = new URL(String(u)), g = GAMES.find((x) => origins[x] === url.origin);
    if (url.pathname === "/api/console/paid") sent.notices++; // how many signed "paid" notices the console really sent to a game
    if (!g) throw new Error("the console called an address that is not a game: " + url.origin);
    return (await handleConsole(hosts[g].adapter, new Request(String(u), init), hosts[g].env)) ?? new Response("{}", { status: 404 });
  }) as typeof fetch;
  const { db, raw } = makeD1(MIGRATIONS);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", ctx.privateKey));
  const env: Env = { DB: db, SESSION_PEPPER: "pepper", CONSOLE_SIGNING_KEY: btoa(String.fromCharCode(...pkcs8)), CONSOLE_ORIGIN: CONSOLE, GAME_ORIGINS: JSON.stringify(origins), MNP_WEBHOOK_SECRET: "whsec", PAY_VIA_MONEYPENNY: o.flag === false ? "0" : "1" } as any;
  const fake = makeFakeMoneypenny({ packs: PACKS, resize: o.resize, catalogue: GAMES.flatMap((g) => SIZES.map((s) => ({ product: g, item: String(s), credits: costOf(s) }))) });
  const host = hosts[game], now = () => host.clock.ms;
  const alice = ctx.people.alice;
  const sign = async (email: string, hash: string, sid = SID, expires = 86400_000) => {
    raw.query("INSERT OR REPLACE INTO console_email(email_hash,email_sealed,created_ms,last_seen_ms,consent_ms) VALUES(?,?,?,?,?)").run(hash, await sealText(env, email), now(), now(), now());
    raw.query("INSERT OR REPLACE INTO session(sid_hash,email_hash,created_ms,last_seen_ms,expires_ms) VALUES(?,?,?,?,?)").run(await sha256hex("sid|" + sid), hash, now(), now(), now() + expires);
  };
  await sign(alice.email, alice.sub);
  const call = (method: string, path: string, body?: unknown, o2: { sid?: string | null; headers?: Record<string, string>; raw?: string; at?: number } = {}) =>
    handlePay(new Request(CONSOLE + path, { method, headers: { "content-type": "application/json", "x-console": "1", origin: CONSOLE, ...(o2.sid === null ? {} : { cookie: "cbsess=" + (o2.sid ?? SID) }), ...(o2.headers || {}) }, body: o2.raw ?? (body === undefined ? undefined : JSON.stringify(body)) }), env, o2.at ?? now(), { mnp: fake.mnp, fetch: routed, assets: async () => new Response("<html></html>", { headers: { "content-security-policy": "default-src 'none'" } }) }).then(async (r) => ({ status: r.status, json: (await r.clone().json().catch(() => null)) as any, text: await r.text(), headers: r.headers }));
  const event = async (payload: any, o2: { secret?: string; ts?: number; tamper?: boolean } = {}) => {
    const ts = o2.ts ?? now(), text = JSON.stringify(payload);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(o2.secret ?? "whsec"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ts + "." + text)))].map((x) => x.toString(16).padStart(2, "0")).join("");
    return call("POST", "/pay/event", undefined, { sid: null, raw: o2.tamper ? text.replace(EID, "WAIT002") : text, headers: { "x-mnp-timestamp": String(ts), "x-mnp-signature": sig } });
  };
  const state = () => host.raw.query("SELECT status, pay_state, cap FROM engagement WHERE id=?").get(EID) as any;
  const bal = () => fake.accounts.get(alice.email.toLowerCase()) ?? 0;
  const ask = (item = String(size), price = costOf(size)) => ({ game, eid: EID, item, price });
  const Q = (item = String(size)) => `/pay/quote?game=${game}&eid=${EID}&item=${item}`;
  const paidRows = () => host.raw.query("SELECT COUNT(*) c FROM console_paid WHERE state='paid'").get() as any;
  const note = () => raw.query("SELECT order_ref, item, state FROM pay_order").all() as any[];
  const buyAndPay = async (a = ask()) => { const b = await call("POST", "/pay/buy", a); if (!b.json?.frame) return { b }; const oid = b.json.frame.orderId; const c = await call("POST", "/pay/confirm", { ...a, orderId: oid, resp: fake.windowAnswer(oid) }); return { b, c, oid }; };
  return { ctx, host, hosts, env, raw, fake, call, event, state, bal, ask, Q, sign, now, game, size, alice, paidRows, note, buyAndPay, routed, sent };
}
type W = Awaited<ReturnType<typeof world>>;

// ---------- the main matrix: six games x eight sizes x credits (none, half, exact, more) ----------
for (const game of GAMES) for (const size of SIZES) for (const credit of ["none", "half", "exact", "more"] as const) {
  test(`S-${game}-${size}-${credit} credits ${credit}: quote, pay or buy, the game is paid once, Moneypenny's numbers are shown, the credits add up`, async () => {
    const w = await world({ game, size });
    const cost = costOf(size), have = { none: 0, half: Math.floor(cost / 2), exact: cost, more: cost + 1234 }[credit];
    if (have) w.fake.give(w.alice.email, have);
    const q = await w.call("GET", w.Q());
    expect(q.status).toBe(200);
    expect(q.json.price.credits).toBe(cost); expect(q.json.balance.credits).toBe(have);
    expect(q.json.gameName).toBe(GAME_NAMES[game]);
    const enough = have >= cost;
    expect(q.json.enough).toBe(enough);
    if (enough) {
      expect(q.json.short.credits).toBe(0);
      const p = await w.call("POST", "/pay/pay", w.ask()); expect(p.status).toBe(200); expect(p.json.paid).toBe(true);
      expect(w.state()).toMatchObject({ status: "ready", pay_state: "paid" });
      expect(w.bal()).toBe(have - cost);
      const again = await w.call("POST", "/pay/pay", w.ask()); expect(again.json.paid).toBe(true); expect(w.bal()).toBe(have - cost); // a second click takes nothing
    } else {
      expect(q.json.short.credits).toBe(smallestPack(cost - have)); // the smallest LISTED pack, never the exact gap
      const p = await w.call("POST", "/pay/pay", w.ask()); expect(p.status).toBe(402); expect(w.state().pay_state).toBe("waiting"); expect(w.bal()).toBe(have);
      const { b, c } = await w.buyAndPay();
      expect(b.status).toBe(200); expect(b.json.frame.opts.key).toBeTruthy(); expect(b.json.frame.origin).toMatch(/^https:\/\//);
      expect(c!.json.paid).toBe(true);
      expect(w.state()).toMatchObject({ status: "ready", pay_state: "paid" });
      expect(w.bal()).toBe(have + smallestPack(cost - have) - cost);
    }
    expect((await w.call("GET", w.Q())).json.paid).toBe(true);
    expect(w.paidRows().c).toBe(1);
  });
}

// ---------- every way a payment can go, in every game ----------
type Scenario = [string, string, (w: W) => Promise<void>];
const SCENARIOS: Scenario[] = [
  ["cancel", "the person cancels in the payment window: nothing is paid, nothing is taken, and they can try again to the same order", async (w) => {
    const b = await w.call("POST", "/pay/buy", w.ask()); expect(b.status).toBe(200);
    const c = await w.call("POST", "/pay/check", w.ask()); expect(c.json).toMatchObject({ ok: true, paid: false });
    expect(w.state().pay_state).toBe("waiting"); expect(w.bal()).toBe(0);
    const b2 = await w.call("POST", "/pay/buy", w.ask()); expect(b2.json.frame.orderId).toBe(b.json.frame.orderId); // the same open order, not a second charge
  }],
  ["timeout", "Moneypenny does not answer: soft words, nothing marked, nothing taken", async (w) => {
    w.fake.state.down = true;
    for (const [m, p, b] of [["GET", w.Q(), undefined], ["POST", "/pay/pay", w.ask()], ["POST", "/pay/buy", w.ask()], ["POST", "/pay/link", w.ask()], ["POST", "/pay/check", w.ask()]] as const) {
      const r = await w.call(m, p, b); expect([p, r.status, r.json.error]).toEqual([p, 503, "busy"]); expect(r.json.message).toMatch(/Nothing has been taken|try again/i);
      expect(r.json.message).not.toMatch(/moneypenny|razorpay|it services|api|server|error/i);
    }
    expect(w.state().pay_state).toBe("waiting");
  }],
  ["double-click-pay", "two clicks on 'Pay with your credits' at the same moment: the game is paid once and the credits are taken once", async (w) => {
    w.fake.give(w.alice.email, costOf(w.size) + 500);
    const [a, b] = await Promise.all([w.call("POST", "/pay/pay", w.ask()), w.call("POST", "/pay/pay", w.ask())]);
    expect([a.json.paid, b.json.paid]).toEqual([true, true]); expect(w.bal()).toBe(500); expect(w.paidRows().c).toBe(1);
  }],
  ["double-click-buy", "two clicks on 'Buy now': one open order, one payment window's worth of credits", async (w) => {
    const [a, b] = await Promise.all([w.call("POST", "/pay/buy", w.ask()), w.call("POST", "/pay/buy", w.ask())]);
    expect(a.json.frame.orderId).toBe(b.json.frame.orderId); expect(w.fake.orders.size).toBe(1);
  }],
  ["refresh-mid-payment", "the page is refreshed while the payment window is open: the quote says 'waiting', and flips to paid by itself when Moneypenny says so", async (w) => {
    await w.call("POST", "/pay/buy", w.ask());
    const mid = await w.call("GET", w.Q()); expect(mid.json).toMatchObject({ ok: true, paid: false, waiting: true });
    const ev = w.fake.complete(EID);
    const done = await w.call("GET", w.Q()); expect(done.json.paid).toBe(true);
    expect(w.state().pay_state).toBe("paid"); expect(ev.type).toBe("game.paid");
  }],
  ["browser-back", "browser back after paying: the screen shows Paid, pressing pay again takes nothing more", async (w) => {
    w.fake.give(w.alice.email, costOf(w.size)); await w.call("POST", "/pay/pay", w.ask());
    const back = await w.call("GET", w.Q()); expect(back.json.paid).toBe(true);
    const again = await w.call("POST", "/pay/pay", w.ask()); expect(again.status).toBe(200); expect(w.bal()).toBe(0); expect(w.paidRows().c).toBe(1);
  }],
  ["window-closed-check", "the window is closed after the card was charged and no notice arrived: 'check again' finds it paid and tells the game", async (w) => {
    await w.call("POST", "/pay/buy", w.ask()); w.fake.complete(EID);
    const c = await w.call("POST", "/pay/check", w.ask()); expect(c.json.paid).toBe(true); expect(w.state().pay_state).toBe("paid");
  }],
  ["window-closed-notice", "the window is closed and Moneypenny's signed notice arrives later: the game is paid with no page open", async (w) => {
    await w.call("POST", "/pay/buy", w.ask()); const ev = w.fake.complete(EID);
    const r = await w.event(ev); expect(r.status).toBe(200); expect(w.state().pay_state).toBe("paid");
  }],
  ["duplicate-notice", "the same paid notice three times: the game is marked once and the answer stays calm", async (w) => {
    await w.call("POST", "/pay/buy", w.ask()); const ev = w.fake.complete(EID);
    for (let i = 0; i < 3; i++) expect((await w.event(ev)).status).toBe(200);
    expect(w.paidRows().c).toBe(1); expect(w.state().pay_state).toBe("paid");
  }],
  ["stale-signature", "a notice signed ten minutes ago is refused and changes nothing", async (w) => {
    await w.call("POST", "/pay/buy", w.ask()); const ev = w.fake.complete(EID);
    const r = await w.event(ev, { ts: w.now() - 10 * 60_000 }); expect(r.status).toBe(401); expect(w.state().pay_state).toBe("waiting");
  }],
  ["forged-signature", "a notice signed with another secret, or with the body changed afterwards, is refused", async (w) => {
    await w.call("POST", "/pay/buy", w.ask()); const ev = w.fake.complete(EID);
    expect((await w.event(ev, { secret: "not-the-secret" })).status).toBe(401);
    expect((await w.event(ev, { tamper: true })).status).toBe(401);
    expect(w.state().pay_state).toBe("waiting");
  }],
  ["paid-before-order", "a paid notice that arrives before the console has a note of the order: nothing breaks, and the next look at the game tells the game it is paid", async (w) => {
    w.fake.give(w.alice.email, costOf(w.size)); // Moneypenny paid this game through a path the console has not noted (a note older than 90 days, a second console database)
    await w.call("POST", "/pay/pay", w.ask());
    w.raw.query("DELETE FROM pay_order").run(); w.host.raw.run("UPDATE engagement SET status='waiting_payment', pay_state='waiting' WHERE id=?", [EID]); w.host.raw.run("DELETE FROM console_paid");
    const ev = { id: "ev1", type: "game.paid", data: { game_ref: EID, product: w.game, item: String(w.size) } };
    expect((await w.event(ev)).status).toBe(200);
    const q = await w.call("GET", w.Q()); expect(q.json.paid).toBe(true);
    expect(w.state().pay_state).toBe("paid"); // the screen says Paid, and the game must agree
  }],
  ["paid-before-order-check", "the same through 'Check again' (the window was closed): the console has no note, Moneypenny says paid, the game is told", async (w) => {
    w.fake.give(w.alice.email, costOf(w.size)); await w.call("POST", "/pay/pay", w.ask());
    w.raw.query("DELETE FROM pay_order").run(); w.host.raw.run("UPDATE engagement SET status='waiting_payment', pay_state='waiting' WHERE id=?", [EID]); w.host.raw.run("DELETE FROM console_paid");
    const c = await w.call("POST", "/pay/check", w.ask()); expect(c.json.paid).toBe(true); expect(w.state().pay_state).toBe("paid");
  }],
  ["two-tabs", "two tabs of the same organizer: both can look, buy and confirm; the game is paid once", async (w) => {
    await w.sign(w.alice.email, w.alice.sub, "b".repeat(64));
    const [a, b] = await Promise.all([w.call("POST", "/pay/buy", w.ask()), w.call("POST", "/pay/buy", w.ask(), { sid: "b".repeat(64) })]);
    const oid = a.json.frame.orderId; expect(b.json.frame.orderId).toBe(oid);
    const resp = w.fake.windowAnswer(oid);
    const [c1, c2] = await Promise.all([w.call("POST", "/pay/confirm", { ...w.ask(), orderId: oid, resp }), w.call("POST", "/pay/confirm", { ...w.ask(), orderId: oid, resp }, { sid: "b".repeat(64) })]);
    expect([c1.json.paid, c2.json.paid]).toEqual([true, true]); expect(w.paidRows().c).toBe(1); expect(w.bal()).toBe(smallestPack(costOf(w.size)) - costOf(w.size));
  }],
  ["payee-second-person", "the payment link is opened by a second person: sees only the amount, pays, the organizer's game is paid and the money is in the ORGANIZER's account", async (w) => {
    const l = await w.call("POST", "/pay/link", w.ask()); expect(l.json.url).toMatch(new RegExp("^" + CONSOLE.replace(/\./g, "\\.") + "/pay/"));
    const t = l.json.url.split("/pay/")[1];
    const page = await w.call("GET", "/pay/" + t, undefined, { sid: null }); expect(page.status).toBe(200);
    const info = await w.call("GET", "/pay/link/info?t=" + t, undefined, { sid: null });
    expect(info.json.due.amountMinor).toBeGreaterThan(0); expect(JSON.stringify(info.json)).not.toMatch(/balance|@|credits/);
    const s = await w.call("POST", "/pay/link/start", { t, email: "payee\u0040acme-corp.in" }, { sid: null }); expect(s.status).toBe(200);
    const oid = s.json.frame.orderId;
    const c = await w.call("POST", "/pay/link/confirm", { t, orderId: oid, resp: w.fake.windowAnswer(oid) }, { sid: null });
    expect(c.json.paid).toBe(true); expect(w.state().pay_state).toBe("paid");
    expect(w.bal()).toBe(smallestPack(costOf(w.size)) - costOf(w.size)); // the organizer's own account got the credits, the payee's e-mail has none
    expect(w.fake.accounts.has("payee\u0040acme-corp.in")).toBe(false);
    const late = await w.call("GET", "/pay/link/info?t=" + t, undefined, { sid: null }); expect(late.json).toMatchObject({ covered: true, paid: true }); // a third person opening the link later sees 'paid'
  }],
  ["payee-same-as-organizer", "the organizer opens their own payment link: it works the same and nothing is paid twice", async (w) => {
    const l = await w.call("POST", "/pay/link", w.ask()), t = l.json.url.split("/pay/")[1];
    const s = await w.call("POST", "/pay/link/start", { t, email: w.alice.email }, { sid: null }); const oid = s.json.frame.orderId;
    await w.call("POST", "/pay/link/confirm", { t, orderId: oid, resp: w.fake.windowAnswer(oid) }, { sid: null });
    const again = await w.call("POST", "/pay/link/confirm", { t, orderId: oid, resp: w.fake.windowAnswer(oid) }, { sid: null });
    expect(again.json.paid).toBe(true); expect(w.paidRows().c).toBe(1);
  }],
  ["payee-link-replaced", "a new payment link stops the old one: the first payee is told it is no longer valid, in soft words", async (w) => {
    const l1 = await w.call("POST", "/pay/link", w.ask()), l2 = await w.call("POST", "/pay/link", w.ask());
    const t1 = l1.json.url.split("/pay/")[1], t2 = l2.json.url.split("/pay/")[1]; expect(t1).not.toBe(t2);
    const old = await w.call("GET", "/pay/link/info?t=" + t1, undefined, { sid: null }); expect(old.status).toBe(404); expect(old.json.message).toMatch(/not valid any more/);
    expect((await w.call("GET", "/pay/link/info?t=" + t2, undefined, { sid: null })).status).toBe(200);
  }],
  ["payee-bad-input", "a payee with a wrong token or no e-mail is turned away politely and Moneypenny is not asked to open an order", async (w) => {
    const l = await w.call("POST", "/pay/link", w.ask()), t = l.json.url.split("/pay/")[1];
    for (const bad of ["short", "x".repeat(90), "has space and !!!!!!!!!!!!!!!!!"]) expect((await w.call("GET", "/pay/link/info?t=" + encodeURIComponent(bad), undefined, { sid: null })).status).toBe(404);
    for (const email of ["", "nonsense", "a@b", "x".repeat(130) + "@a.in"]) expect((await w.call("POST", "/pay/link/start", { t, email }, { sid: null })).json.error).toBe("email");
    expect(w.fake.orders.size).toBe(0);
  }],
  ["payee-covered-tells-game", "the payee pays, the notice is lost, the organizer's tab is closed: the payee's own page (it looks every 20 s) still gets the game told", async (w) => {
    const l = await w.call("POST", "/pay/link", w.ask()), t = l.json.url.split("/pay/")[1];
    const s = await w.call("POST", "/pay/link/start", { t, email: "payee\u0040acme-corp.in" }, { sid: null }); w.fake.complete(EID); // paid at Moneypenny; no notice, no confirm
    const info = await w.call("GET", "/pay/link/info?t=" + t, undefined, { sid: null }); expect(info.json.paid).toBe(true);
    expect(s.status).toBe(200); expect(w.state().pay_state).toBe("paid");
  }],
  ["session-expiry", "the sign-in runs out in the middle of paying: every organizer route says 'please sign in'; the payee page and Moneypenny's notice still work", async (w) => {
    await w.call("POST", "/pay/buy", w.ask()); const l = await w.call("POST", "/pay/link", w.ask()), t = l.json.url.split("/pay/")[1];
    const gone = { at: w.now() + 2 * 86400_000 };
    for (const [m, p, b] of [["GET", w.Q(), undefined], ["POST", "/pay/pay", w.ask()], ["POST", "/pay/buy", w.ask()], ["POST", "/pay/link", w.ask()], ["POST", "/pay/check", w.ask()]] as const) { const r = await w.call(m, p, b, gone); expect([p, r.status, r.json.error]).toEqual([p, 401, "sign_in"]); expect(r.json.message).toMatch(/Please sign in/); }
    expect((await w.call("GET", "/pay/link/info?t=" + t, undefined, { sid: null })).status).toBe(200);
    const ev = w.fake.complete(EID); expect((await w.event(ev)).status).toBe(200); expect(w.state().pay_state).toBe("paid");
  }],
  ["flag-off", "the pay step is dark: every route answers 503 'not open yet', calls nobody, changes nothing (the flag is off)", async (w) => {
    const dark = await world({ game: w.game, size: w.size, flag: false });
    for (const [m, p, b] of [["GET", dark.Q(), undefined], ["POST", "/pay/pay", dark.ask()], ["POST", "/pay/buy", dark.ask()], ["POST", "/pay/link", dark.ask()], ["POST", "/pay/check", dark.ask()], ["POST", "/pay/confirm", dark.ask()], ["GET", "/pay/link/info?t=" + "a".repeat(30), undefined], ["POST", "/pay/event", {}], ["GET", "/pay/" + "a".repeat(30), undefined]] as const) {
      const r = await dark.call(m, p, b); expect([m + p, r.status, r.json?.error]).toEqual([m + p, 503, "not_open"]); expect(r.json.message).toMatch(/not open yet/);
    }
    expect(dark.fake.state.calls).toEqual([]); expect(dark.state().pay_state).toBe("waiting"); expect(dark.note()).toEqual([]);
  }],
  ["stranger-and-host", "a stranger and a host of this game cannot quote, pay, buy, link or check it: refused before Moneypenny is asked", async (w) => {
    const bob = w.ctx.people.bob; await w.sign(bob.email, bob.sub, "c".repeat(64));
    for (const [m, p, b] of [["GET", w.Q(), undefined], ["POST", "/pay/pay", w.ask()], ["POST", "/pay/buy", w.ask()], ["POST", "/pay/link", w.ask()], ["POST", "/pay/check", w.ask()]] as const) { const r = await w.call(m, p, b, { sid: "c".repeat(64) }); expect([p, r.status, r.json.error]).toEqual([p, 403, "not_yours"]); }
    expect(w.fake.state.calls).toEqual([]);
  }],
  ["forged-window-answer", "a payment-window answer with a wrong signature is not 'paid': the game stays unpaid and the person is told it is being checked", async (w) => {
    const b = await w.call("POST", "/pay/buy", w.ask()), oid = b.json.frame.orderId;
    const c = await w.call("POST", "/pay/confirm", { ...w.ask(), orderId: oid, resp: { ...w.fake.windowAnswer(oid), razorpay_signature: "forged" } });
    expect(c.json).toMatchObject({ ok: true, paid: false, pending: true }); expect(w.state().pay_state).toBe("waiting"); expect(w.bal()).toBe(0);
  }],
  ["bad-requests", "garbage in the request: a polite 'not complete', never a crash", async (w) => {
    for (const raw of ["", "{", "null", "[]", '{"game":"x"}', '{"game":"' + w.game + '","eid":"a","item":"1"}', '{"game":"' + w.game + '","eid":"' + EID + '","item":"' + w.size + '","price":-5}', '{"game":"nope","eid":"' + EID + '","item":"1","price":5}']) {
      const r = await w.call("POST", "/pay/buy", undefined, { raw }); expect([raw, r.status, r.json.error]).toEqual([raw, 400, "invalid"]);
    }
  }],
  ["price-moved", "the price list moved after the screen was drawn: nothing is taken and the person is asked to look again", async (w) => {
    w.fake.give(w.alice.email, costOf(w.size) + 100);
    const r = await w.call("POST", "/pay/pay", { ...w.ask(), price: costOf(w.size) - 1 }); expect(r.status).toBe(409); expect(r.json.error).toBe("price_changed"); expect(w.bal()).toBe(costOf(w.size) + 100);
  }],
  ["size-not-listed", "a game size that is not on the price list: soft words, nothing started", async (w) => {
    const r = await w.call("GET", `/pay/quote?game=${w.game}&eid=${EID}&item=123`); expect(r.status).toBe(403); // the game says it is not this size: refused before Moneypenny
    w.host.raw.run("UPDATE engagement SET cap=123 WHERE id=?", [EID]);
    const r2 = await w.call("GET", `/pay/quote?game=${w.game}&eid=${EID}&item=123`); expect(r2.status).toBe(404); expect(r2.json.error).toBe("no_item"); expect(r2.json.message).toMatch(/not on the price list yet/);
  }],
  ["edit-after-note-size", "the organizer changes the game's size after a payment was started, then pays the new size (Moneypenny allows the change): the game is told the NEW size, not the old one", async (w) => {
    const w2 = await world({ game: w.game, size: 250, resize: true });
    await w2.call("POST", "/pay/link", w2.ask("250", costOf(250))); // a payment link for 250 notes the order
    w2.host.raw.run("UPDATE engagement SET cap=500 WHERE id=?", [EID]); // the organizer edits the game: 500 people
    w2.fake.give(w2.alice.email, costOf(500));
    const p = await w2.call("POST", "/pay/pay", w2.ask("500", costOf(500)));
    expect(p.status).toBe(200); expect(p.json.paid).toBe(true);
    expect(w2.state()).toMatchObject({ pay_state: "paid", cap: 500 });
    expect(w2.note().map((n) => n.item)).toEqual(["500"]);
  }],
  ["edit-after-note-size-refused", "the same change when Moneypenny keeps the first size: the person gets soft words and nothing is taken", async (w) => {
    await w.call("POST", "/pay/link", w.ask(String(w.size), costOf(w.size)));
    const other = w.size === 500 ? 250 : 500;
    w.host.raw.run("UPDATE engagement SET cap=? WHERE id=?", [other, EID]); w.fake.give(w.alice.email, costOf(other));
    const p = await w.call("POST", "/pay/pay", w.ask(String(other), costOf(other)));
    expect(p.status).toBe(409); expect(p.json.message).not.toMatch(/moneypenny|razorpay|\bapi\b|server|error/i); expect(w.bal()).toBe(costOf(other)); expect(w.state().pay_state).toBe("waiting");
  }],
  ["edit-after-paid-size", "the organizer's open page still shows the old size after the game was changed: the words say the size changed, not 'this game is not in your account'", async (w) => {
    w.host.raw.run("UPDATE engagement SET cap=? WHERE id=?", [w.size === 500 ? 250 : 500, EID]);
    for (const [m, p, b] of [["GET", w.Q(), undefined], ["POST", "/pay/pay", w.ask()]] as const) {
      const r = await w.call(m, p, b); expect([p, r.status]).toEqual([p, 403]); expect(r.json.error).toBe("size_changed"); expect(r.json.message).toMatch(/size of this game has changed/);
    }
    expect(w.fake.state.calls).toEqual([]);
  }],
  ["edit-after-paid", "after the game is paid, the page for a paid game keeps saying Paid and never charges again", async (w) => {
    w.fake.give(w.alice.email, costOf(w.size) * 2); await w.call("POST", "/pay/pay", w.ask());
    for (let i = 0; i < 3; i++) expect((await w.call("GET", w.Q())).json.paid).toBe(true);
    expect((await w.call("POST", "/pay/buy", w.ask())).json.paid).toBe(true); expect(w.bal()).toBe(costOf(w.size));
  }],
  ["game-refuses", "Moneypenny took the credits but the game answers 'no' for sure: the person is told it is being checked (never 'paid'), credits stay safe", async (w) => {
    w.fake.give(w.alice.email, costOf(w.size)); w.host.raw.run("UPDATE engagement SET status='ready' WHERE id=?", [EID]); w.host.raw.run("UPDATE engagement SET pay_state='waiting' WHERE id=?", [EID]);
    const r = await w.call("POST", "/pay/pay", w.ask()); expect(r.status).toBe(409); expect(r.json.error).toBe("review"); expect(r.json.message).toMatch(/being checked/);
  }],
];
for (const game of GAMES) for (const [id, name, fn] of SCENARIOS) {
  test(`S-${id}-${game} ${name}`, async () => { const w = await world({ game, size: 250 }); await fn(w); });
}

// ---------- Moneypenny's error codes become the console's own soft words ----------
const CODES: Array<[string, number, string]> = [["no_item", 404, "no_item"], ["no_pack_covers", 404, "no_item"], ["price_changed", 409, "price_changed"], ["payer_mismatch", 409, "payer"], ["game_ref_used", 409, "review"], ["account_frozen", 409, "review"], ["already_paid", 409, "paid"], ["link_expired", 404, "bad_link"], ["no_link", 404, "bad_link"], ["something_new", 503, "busy"], ["", 503, "busy"]];
for (const [code, status, error] of CODES) {
  test(`S-code-${code || "empty"} Moneypenny says '${code}': the person reads soft words (${error}), never Moneypenny's own text`, async () => {
    const w = await world();
    const orig = w.fake.mnp.post; w.fake.mnp.post = (async () => ({ status: 409, body: { ok: false, error: { code, message: "text the console must not show: " + code } } })) as any;
    w.fake.give(w.alice.email, costOf(250));
    const r = await w.call("POST", "/pay/pay", w.ask());
    expect([r.status, r.json.error]).toEqual([status, error]); expect(r.json.message).not.toMatch(/text the console must not show|moneypenny|razorpay|it services|api|server|error\b/i);
    w.fake.mnp.post = orig;
  });
}

// ---------- the words the person reads: the console's voice ----------
test("S-voice every sentence the pay step puts on the organizer's or the payee's screen is in the console's voice: no 'we', 'our', 'us', 'I'", async () => {
  const { readFileSync } = await import("node:fs");
  const quoted = (f: string) => [...readFileSync(new URL("../" + f, import.meta.url), "utf8").matchAll(/"((?:[^"\\\n]|\\.){12,})"/g)].map((m) => m[1]).filter((t) => / /.test(t));
  const hits: string[] = [];
  for (const f of ["functions/_lib/pay-core.ts", "public/pay-link.js", "public/pay-link.html"]) for (const t of quoted(f)) if (/\b(we|our|ours|us|I|my)\b/.test(t)) hits.push(f + ": " + t);
  const html = readFileSync(new URL("../public/pay-link.html", import.meta.url), "utf8").replace(/<[^>]+>/g, " ");
  if (/\b(we|our|us|I)\b/.test(html)) hits.push("pay-link.html text");
  expect(hits).toEqual([]);
});

// ---------- audit HIGH-1: paid at a small size, game edited to a bigger size, then "check": the game must NOT be marked paid at the bigger size ----------
for (const route of ["quote", "check", "event"] as const) {
  test(`HIGH-1 (${route}): a game paid at 100 and then edited to 10000 is never marked paid at 10000; Moneypenny's paid item decides`, async () => {
    const w = await world({ game: "bingo", size: 100 });
    const lk = await w.call("POST", "/pay/link", w.ask("100", costOf(100))); expect(lk.json.ok).toBe(true);
    const t = lk.json.url.split("/pay/")[1];
    expect((await w.call("POST", "/pay/link/start", { t, email: "demo1@demo-test.invalid" }, { sid: null })).json.ok).toBe(true); // the payee opens the window; the money lands at Moneypenny, the console's notice is lost
    const ev = w.fake.complete(EID);
    w.host.raw.run("UPDATE engagement SET cap=? WHERE id=?", [10000, EID]); // the organizer edits the game to the biggest size
    const r = route === "quote" ? await w.call("GET", w.Q("10000"))
      : route === "check" ? await w.call("POST", "/pay/check", w.ask("10000", costOf(10000)))
      : await w.event(ev);
    expect(w.state().pay_state).not.toBe("paid");
    expect(w.paidRows().c).toBe(0);
    expect(w.note().every((n) => n.state !== "told")).toBe(true);
    expect([200, 202, 409]).toContain(r.status);
  });
}

// ---------- audit MEDIUM-4: a page that is not ours cannot act as the signed-in organizer ----------
test("M-4: every signed-in pay route refuses a call without the console header or from a page that is not the console or a game; ours still work; payee routes and the signed notice are unaffected", async () => {
  const w = await world({ game: "bingo", size: 250 });
  w.fake.give(w.alice.email, 100000);
  const routes: Array<[string, string, unknown]> = [["GET", w.Q(), undefined], ["POST", "/pay/pay", w.ask()], ["POST", "/pay/buy", w.ask()], ["POST", "/pay/confirm", { ...w.ask(), orderId: "x", resp: {} }], ["POST", "/pay/link", w.ask()], ["POST", "/pay/check", w.ask()]];
  for (const [m, p, b] of routes) {
    const noHeader = await w.call(m, p, b, { headers: { "x-console": "" } });
    expect([p, noHeader.status, noHeader.json?.error]).toEqual([p, 403, "csrf"]);
    const foreign = await w.call(m, p, b, { headers: { origin: "https://blog.corporatetambola.com" } });
    expect([p, foreign.status, foreign.json?.error]).toEqual([p, 403, "csrf"]);
    const ours = await w.call(m, p, b); // the console page, header present
    expect([p, ours.json?.error === "csrf"]).toEqual([p, false]);
    const game = await w.call(m, p, b, { headers: { origin: w.host.origin } }); // the game's own page
    expect([p, game.json?.error === "csrf"]).toEqual([p, false]);
  }
  const w2 = await world({ game: "bingo", size: 250 });
  const lk = await w2.call("POST", "/pay/link", w2.ask()); const t = lk.json.url.split("/pay/")[1];
  expect((await w2.call("GET", "/pay/link/info?t=" + t, undefined, { sid: null, headers: { "x-console": "" } })).json.error).not.toBe("csrf"); // the payee has no cookie: nothing to forge
});

test("L-1 (audit): the payee page script has no 'we', 'our', 'us' in any sentence it shows (checked line by line, so one odd quote cannot hide a line)", async () => {
  const { readFileSync } = await import("node:fs");
  const hits: string[] = [], BS = String.fromCharCode(92), LIT = new RegExp('"((?:[^"' + BS + BS + ']|' + BS + BS + '.)*)"', "g"); // a whole string literal, quotes paired from the left
  for (const f of ["public/pay-link.js", "packages/game-pack/zc-flow.js"]) for (const line of readFileSync(new URL("../" + f, import.meta.url), "utf8").split(String.fromCharCode(10))) {
    if (!/pay|Pay|e-mail|payment/.test(line)) continue;
    for (const m of line.matchAll(LIT)) if (m[0].length > 14 && / /.test(m[1]) && /\b(we|our|ours|us)\b/.test(m[1]) && !/^(https?:|[a-z-]+ )/.test(m[1])) hits.push(f + ": " + m[1]);
  }
  expect(hits).toEqual([]);
});

// ---------- audit (1 of 2) MEDIUM-2: "the game is told once" is pinned by counting the notices actually sent ----------
test("N: once the game is told, every later look (check, quote, signed notice, payee page) sends it no second notice", async () => {
  const w = await world({ game: "bingo", size: 250 });
  w.fake.give(w.alice.email, 100000);
  expect((await w.call("POST", "/pay/pay", w.ask())).json.paid).toBe(true);
  expect(w.sent.notices).toBe(1);
  for (let i = 0; i < 3; i++) { await w.call("POST", "/pay/check", w.ask()); await w.call("GET", w.Q()); await w.event(w.fake.complete ? { id: "e" + i, type: "game.paid", created_at: 1, data: { game_ref: EID, product: "bingo", item: "250" } } : {}); }
  expect(w.sent.notices).toBe(1);
});
