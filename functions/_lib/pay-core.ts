// The pay step of the organizer's game flow (last step, all six games). The console talks ONLY to Moneypenny; it never calls IT Services or Razorpay.
// Every number (price, balance, shortfall, dollars, rupees) comes from Moneypenny's answers. Nothing here knows a price.
//   GET  /pay/quote?game=&eid=&item=   price of this game, the organizer's credits, what is missing
//   POST /pay/pay                      enough credits: reserve, capture, then tell the game it is paid (console-wallet)
//   POST /pay/buy                      credits are short: Moneypenny opens a buy of exactly the missing credits for this game; the person pays at the address it gives
//   POST /pay/link                     a payment link a payee can open (7 days); the money goes to the organizer's own Moneypenny account for this game
//   GET  /pay/link/info, POST /pay/link/start   the payee's page (no sign-in; sees only an amount due)
//   POST /pay/check                    asks Moneypenny whether the buy of this game is paid (a backup for the notice below)
//   POST /pay/event                    Moneypenny's signed "game paid" notice; the console then tells the game (act 'paid', once per order id)
// Dark by default: PAY_VIA_MONEYPENNY must be "1". Voice: 'you', polite, simple English, no threats.
import type { D1 } from "../../packages/bridge/src/d1";
import { sessionOf, unsealText, sealText, sha256hex, type Env } from "./auth-core";
import { tables } from "./tables";
import { signAssertion, b64uEncode, type Payload } from "../../packages/bridge/src/assertion";
// @ts-ignore the wallet is a plain JS file copied from the Moneypenny repo (packages/console-wallet/VENDORED.md)
import { createWallet } from "../../packages/console-wallet/index.js";

export type Mnp = { get(path: string): Promise<{ status: number; body: any }>; post(path: string, body: unknown): Promise<{ status: number; body: any }> };
export interface PayDeps { mnp?: Mnp; fetch?: typeof fetch }

/** the six games' names (labels only; no price anywhere). A test keeps this list equal to config/games.json. */
export const GAME_NAMES: Record<string, string> = { tambola: "Corporate Tambola", bingo: "Corporate Bingo", tictactoe: "Corporate Tic Tac Toe", snakesladders: "Corporate Snakes and Ladders", luckbychance: "Corporate Luck by Chance", luckydraw: "Corporate Lucky Draw" };
export const LINK_MS = 7 * 86400_000; // the payment link works 7 days (the words already printed on the screen)
const EID = /^[A-Za-z0-9_-]{4,40}$/, ITEM = /^[A-Za-z0-9_.-]{1,40}$/, TOKEN = /^[0-9a-f]{48}$/;

const json = (status: number, body: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
const MSG = {
  busy: "Credits are refreshing. Nothing has been taken from you. Please try again in a few minutes.",
  notOpen: "Paying for games is not open yet. Please check again soon.",
  signIn: "Please sign in to your console to pay for your game.",
  noItem: "This game size is not on the price list yet. Please try again later.",
  enough: "You already have enough credits for this game.",
  short: "You need a few more credits for this game.",
  refused: "This game could not accept the payment. Your credits are back in your account.",
  pending: "Your payment is on its way. It can take a few minutes. You do not need to pay again.",
  review: "Your payment is being checked. Your credits are safe.",
  link: "This payment link is not valid any more. Please ask the organizer for a new one.",
  bad: "The request is not complete.",
};
const fail = (status: number, error: string, message: string, extra: Record<string, unknown> = {}) => json(status, { ok: false, error, message, ...extra });
const busy = () => fail(503, "busy", MSG.busy);

function origins(env: Env): Record<string, string> { try { return JSON.parse(env.GAME_ORIGINS); } catch { return {}; } }
function cors(env: Env, req: Request): Record<string, string> {
  const o = req.headers.get("origin") || "";
  const ok = !!o && ([env.CONSOLE_ORIGIN, ...Object.values(origins(env))] as string[]).includes(o);
  return ok ? { "access-control-allow-origin": o, "access-control-allow-credentials": "true", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" } : { vary: "origin" };
}

/** The signed client to Moneypenny (API.md "Signing"). Three seconds at most per call. */
export function mnpClient(env: Env, doFetch: typeof fetch = fetch): Mnp {
  const te = new TextEncoder();
  const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  const call = async (method: string, path: string, body?: unknown) => {
    if (!env.MNP_URL || !env.MNP_KEY || !env.MNP_SECRET) throw new Error("moneypenny not configured");
    const text = body === undefined ? "" : JSON.stringify(body);
    const ts = String(Date.now()), nonce = b64uEncode(crypto.getRandomValues(new Uint8Array(12)));
    const idem = method === "GET" ? "" : (await sha256hex(method + path + text)).slice(0, 64); // the same request repeated returns Moneypenny's first answer
    const key = await crypto.subtle.importKey("raw", te.encode(env.MNP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = hex(await crypto.subtle.sign("HMAC", key, te.encode([ts, nonce, method, path, await sha256hex(text), idem].join("\n"))));
    const r = await doFetch(env.MNP_URL.replace(/\/$/, "") + path, { method, signal: AbortSignal.timeout(3000), headers: { "content-type": "application/json", "x-mnp-key": env.MNP_KEY, "x-mnp-timestamp": ts, "x-mnp-nonce": nonce, "x-mnp-signature": sig, ...(idem ? { "idempotency-key": idem } : {}) }, body: method === "GET" ? undefined : text });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  return { get: (p) => call("GET", p), post: (p, b) => call("POST", p, b) };
}

/** console-wallet's order store on the console's own database (it must pass storeContract). */
export function d1WalletStore(env: Env) {
  const db: D1 = tables(env);
  const parse = (r: any) => (r ? JSON.parse(r.row_json) : null);
  return {
    get: async (id: string) => parse(await db.prepare("SELECT row_json FROM wallet_order WHERE id=?").bind(id).first()),
    all: async () => (await db.prepare("SELECT row_json FROM wallet_order WHERE status NOT IN ('granted','refused','refunded') OR at_ms>? ").bind(Date.now() - 3 * 86400_000).all<any>()).results.map(parse),
    putNew: async (id: string, row: any) => {
      const r = await db.prepare("INSERT OR IGNORE INTO wallet_order(id,spend_key,order_ref,status,row_json,at_ms) VALUES(?,?,?,?,?,?)").bind(id, row.spendKey, row.orderRef ?? "", row.status, JSON.stringify(row), row.at ?? 0).run();
      if (r.meta.changes === 1) return null;
      return parse(await db.prepare("SELECT row_json FROM wallet_order WHERE spend_key=?").bind(row.spendKey).first());
    },
    cas: async (id: string, from: string[], patch: any) => {
      const cur = parse(await db.prepare("SELECT row_json FROM wallet_order WHERE id=?").bind(id).first());
      if (!cur || !from.includes(cur.status)) return false;
      const next = { ...cur, ...patch };
      const marks = from.map(() => "?").join(",");
      const r = await db.prepare(`UPDATE wallet_order SET row_json=?, status=?, at_ms=? WHERE id=? AND status IN (${marks}) AND row_json=?`).bind(JSON.stringify(next), next.status, next.at ?? Date.now(), id, ...from, JSON.stringify(cur)).run();
      return r.meta.changes === 1;
    },
  };
}

type Who = { emailHash: string; email: string };
async function whoIs(req: Request, env: Env, now: number): Promise<Who | null> {
  const s = await sessionOf(req, env, now);
  if (!s) return null;
  const r = await tables(env).prepare("SELECT email_sealed FROM console_email WHERE email_hash=?").bind(s.emailHash).first<{ email_sealed: string }>();
  if (!r) return null;
  return { emailHash: s.emailHash, email: await unsealText(env, r.email_sealed) };
}

/** What a number of credits is worth, from Moneypenny's own quote (US$ and rupees). Nothing is worked out here. */
async function worth(mnp: Mnp, credits: number) {
  if (credits <= 0) return { credits: 0, usd: "0.00", inrMinor: 0 };
  const q = await mnp.get(`/v1/quote?credits=${credits}`);
  if (q.status !== 200) throw new Error("quote_failed");
  return { credits, usd: String(q.body.usd), inrMinor: Number(q.body.inr_minor) };
}
async function priceCredits(mnp: Mnp, product: string, item: string): Promise<number | null> {
  const c = await mnp.get(`/v1/catalogue?product=${encodeURIComponent(product)}`);
  if (c.status !== 200) throw new Error("catalogue_failed");
  const it = (c.body.items || []).find((x: any) => x.product === product && x.item === item && Number.isSafeInteger(x.credits) && x.credits >= 0);
  return it ? it.credits : null;
}
/** price, balance and what is missing for one game of one person */
async function figures(mnp: Mnp, email: string, product: string, item: string) {
  const price = await priceCredits(mnp, product, item);
  if (price === null) return null;
  const b = await mnp.get(`/v1/balance?email=${encodeURIComponent(email)}`);
  if (b.status !== 200) throw new Error("balance_failed");
  const have = Math.max(0, Number(b.body.balance) || 0), short = Math.max(0, price - have);
  return { price, have, short, label: String(b.body?.display?.label || "Moneypenny") };
}

const asks = (b: any): { game: string; eid: string; item: string } | null => (b && typeof b.game === "string" && typeof b.eid === "string" && typeof b.item === "string" && EID.test(b.eid) && ITEM.test(b.item) ? { game: b.game, eid: b.eid, item: b.item } : null);

/** Tell the game it is paid (its bridge, act 'paid'). A definite refusal throws with definite:true; anything unclear throws plainly and is repeated. */
export async function tellGamePaid(env: Env, doFetch: typeof fetch, now: number, o: { game: string; eid: string; item: string; orderRef: string; emailHash: string }) {
  const aud = origins(env)[o.game];
  if (!aud) throw Object.assign(new Error("unknown game"), { definite: true });
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(env.CONSOLE_SIGNING_KEY), (c) => c.charCodeAt(0)), { name: "Ed25519" }, false, ["sign"]);
  const p: Payload = { v: 1, kid: env.CONSOLE_KID || "k1", aud, sub: o.emailHash, act: "paid", eid: o.eid, jti: b64uEncode(crypto.getRandomValues(new Uint8Array(16))), iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 60 };
  const r = await doFetch(aud + "/api/console/paid", { method: "POST", signal: AbortSignal.timeout(8000), headers: { "content-type": "application/json" }, body: JSON.stringify({ assertion: await signAssertion(p, key), eid: o.eid, item: o.item, orderRef: o.orderRef }) });
  if (r.status === 200) return;
  const j: any = await r.json().catch(() => ({}));
  if (r.status === 409 && j.error === "game_refused") throw Object.assign(new Error(String(j.message || "refused")), { definite: true });
  throw new Error("game_unclear_" + r.status);
}

const walletOf = (env: Env, mnp: Mnp, doFetch: typeof fetch, now: number) => {
  const store = d1WalletStore(env);
  // the game's own step = tell it 'paid'. The game id is the part of the click's key after the colon (the key is "<person>:<game id>").
  const games: Record<string, any> = {};
  for (const product of Object.keys(origins(env))) {
    games[product] = {
      entitle: async ({ email, item, orderRef }: { email: string; item: string; orderRef: string }) => {
        const row = await tables(env).prepare("SELECT row_json FROM wallet_order WHERE order_ref=?").bind(orderRef).first<{ row_json: string }>();
        const w = row ? JSON.parse(row.row_json) : null;
        const eid = w ? String(w.spendKey).split(":")[1] : "";
        if (!w || !EID.test(eid)) throw Object.assign(new Error("no such order"), { definite: true });
        await tellGamePaid(env, doFetch, now, { game: product, eid, item, orderRef, emailHash: await sha256hex("email|" + email.trim().toLowerCase()) });
      },
    };
  }
  return createWallet({ mnp, games, store, now: () => now, alert: (r: any) => console.log(JSON.stringify({ walletNeedsReview: r.orderRef, reason: r.reason })) }); // no e-mail in the log
};

/** The 2-minute job: repeats anything the wallet left half done. */
export async function retryStuck(env: Env, now: number, deps: PayDeps = {}) {
  if (env.PAY_VIA_MONEYPENNY !== "1") return null;
  const doFetch = deps.fetch ?? fetch, mnp = deps.mnp ?? mnpClient(env, doFetch);
  return walletOf(env, mnp, doFetch, now).retryStuck();
}

async function purgeOld(env: Env, now: number) {
  const db = tables(env);
  await db.prepare("DELETE FROM pay_link WHERE expires_ms<?").bind(now - 86400_000).run();
  await db.prepare("DELETE FROM pay_order WHERE created_ms<?").bind(now - 90 * 86400_000).run();
}

export async function handlePay(req: Request, env: Env, now: number, deps: PayDeps = {}): Promise<Response> {
  const url = new URL(req.url), path = url.pathname.replace(/\/+$/, ""), c = cors(env, req);
  const reply = (r: Response) => { for (const [k, v] of Object.entries(c)) r.headers.set(k, v); return r; };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...c, "access-control-max-age": "600" } });
  if (env.PAY_VIA_MONEYPENNY !== "1") return reply(fail(503, "not_open", MSG.notOpen));
  const doFetch = deps.fetch ?? fetch, mnp = deps.mnp ?? mnpClient(env, doFetch), db = tables(env);
  try {
    await purgeOld(env, now);
    const rawText = req.method === "POST" ? await req.text().catch(() => "") : "";
    let body: any = null; try { body = rawText ? JSON.parse(rawText) : null; } catch { body = null; }

    // ---- Moneypenny's notice: this game's buy is paid ----
    if (req.method === "POST" && path === "/pay/event") {
      return reply(await onEvent(env, doFetch, now, req, body, rawText));
    }

    // ---- the payee's page: no sign-in ----
    if (path === "/pay/link/info" || path === "/pay/link/start") {
      const t = path.endsWith("info") ? url.searchParams.get("t") : body?.t;
      if (typeof t !== "string" || !TOKEN.test(t)) return reply(fail(404, "bad_link", MSG.link));
      const row = await db.prepare("SELECT email_hash, email_sealed, game, eid, item, expires_ms FROM pay_link WHERE token_hash=?").bind(await sha256hex("paylink|" + t)).first<any>();
      if (!row || row.expires_ms < now) return reply(fail(404, "bad_link", MSG.link));
      const email = await unsealText(env, row.email_sealed);
      const f = await figures(mnp, email, row.game, row.item);
      if (!f) return reply(fail(404, "no_item", MSG.noItem));
      if (f.short === 0) return reply(json(200, { ok: true, covered: true, game: row.game, gameName: GAME_NAMES[row.game] }));
      const due = await worth(mnp, f.short);
      if (path.endsWith("info")) return reply(json(200, { ok: true, covered: false, game: row.game, gameName: GAME_NAMES[row.game], due, label: f.label, expiresMs: row.expires_ms }));
      return reply(await startBuy(env, mnp, db, now, { email, emailHash: row.email_hash, game: row.game, eid: row.eid, item: row.item, short: f.short }));
    }

    // ---- everything below is the signed-in organizer ----
    const me = await whoIs(req, env, now);
    if (!me) return reply(fail(401, "sign_in", MSG.signIn, { signIn: env.CONSOLE_ORIGIN }));

    if (req.method === "GET" && path === "/pay/quote") {
      const a = asks({ game: url.searchParams.get("game"), eid: url.searchParams.get("eid"), item: url.searchParams.get("item") });
      if (!a || !origins(env)[a.game]) return reply(fail(400, "invalid", MSG.bad));
      const f = await figures(mnp, me.email, a.game, a.item);
      if (!f) return reply(fail(404, "no_item", MSG.noItem));
      return reply(json(200, { ok: true, game: a.game, gameName: GAME_NAMES[a.game], eid: a.eid, item: a.item, label: f.label, price: await worth(mnp, f.price), balance: await worth(mnp, f.have), short: await worth(mnp, f.short), enough: f.short === 0 }));
    }

    if (req.method === "POST" && path === "/pay/pay") {
      const a = asks(body);
      if (!a || !origins(env)[a.game]) return reply(fail(400, "invalid", MSG.bad));
      const r = await walletOf(env, mnp, doFetch, now).spend({ email: me.email, product: a.game, item: a.item, spendKey: a.eid });
      if (r.ok) return reply(json(200, { ok: true, paid: true }));
      if (r.code === "insufficient_credits") return reply(fail(402, "short", MSG.short));
      if (r.code === "order_in_progress") return reply(json(202, { ok: true, paid: false, pending: true, message: MSG.pending })); // Moneypenny did not answer clearly: the 2-minute job finishes it; one order per game, so it can never be taken twice
      if (r.code === "game_step_refused") return reply(fail(409, "refused", MSG.refused));
      if (r.code === "with_owner") return reply(fail(409, "review", MSG.review));
      if (r.code === "no_item") return reply(fail(404, "no_item", MSG.noItem));
      return reply(busy());
    }

    if (req.method === "POST" && (path === "/pay/buy" || path === "/pay/link")) {
      const a = asks(body);
      if (!a || !origins(env)[a.game]) return reply(fail(400, "invalid", MSG.bad));
      const f = await figures(mnp, me.email, a.game, a.item);
      if (!f) return reply(fail(404, "no_item", MSG.noItem));
      if (f.short === 0) return reply(fail(409, "enough", MSG.enough));
      if (path === "/pay/buy") return reply(await startBuy(env, mnp, db, now, { email: me.email, emailHash: me.emailHash, game: a.game, eid: a.eid, item: a.item, short: f.short }));
      const t = [...crypto.getRandomValues(new Uint8Array(24))].map((x) => x.toString(16).padStart(2, "0")).join("");
      await db.prepare("INSERT INTO pay_link(token_hash,email_hash,email_sealed,game,eid,item,expires_ms) VALUES(?,?,?,?,?,?,?)").bind(await sha256hex("paylink|" + t), me.emailHash, await sealText(env, me.email), a.game, a.eid, a.item, now + LINK_MS).run();
      return reply(json(200, { ok: true, url: `${env.CONSOLE_ORIGIN}/pay-link.html?t=${t}`, expiresMs: now + LINK_MS }));
    }

    if (req.method === "POST" && path === "/pay/check") { // backup for the notice: ask Moneypenny, and tell the game if the buy is paid
      const a = asks(body);
      if (!a || !origins(env)[a.game]) return reply(fail(400, "invalid", MSG.bad));
      const rows = (await db.prepare("SELECT order_ref, email_hash, state FROM pay_order WHERE game=? AND eid=? AND email_hash=? ORDER BY created_ms DESC LIMIT 3").bind(a.game, a.eid, me.emailHash).all<any>()).results;
      for (const o of rows) {
        if (o.state === "told") return reply(json(200, { ok: true, paid: true }));
        const s = await mnp.get(`/v1/game_order?order_ref=${encodeURIComponent(o.order_ref)}`);
        if (s.status === 200 && s.body.status === "paid") { const r = await tellFromOrder(env, doFetch, now, db, o.order_ref); if (r) return reply(r); return reply(json(200, { ok: true, paid: true })); }
      }
      return reply(json(200, { ok: true, paid: false }));
    }
    return reply(fail(404, "not_found", "There is nothing at this address."));
  } catch {
    return reply(busy()); // Moneypenny (or the game) did not answer: soft words, and nothing was taken
  }
}

/** Moneypenny opens a buy of exactly the missing credits for this game. The person pays at the address Moneypenny gives (it leads on to the payment company). */
async function startBuy(env: Env, mnp: Mnp, db: D1, now: number, o: { email: string; emailHash: string; game: string; eid: string; item: string; short: number }) {
  const orderRef = `GAME-${o.game}-${o.eid}-${o.short}`;
  const r = await mnp.post("/v1/buy_credits", { email: o.email, credits: o.short, currency: "INR", order_ref: orderRef, product: o.game, item: o.item, game_id: o.eid });
  if (r.status !== 200 || !r.body.ok) return r.status >= 500 || r.status === 429 ? busy() : fail(r.status === 503 ? 503 : 409, "buy_failed", MSG.busy);
  await db.prepare("INSERT OR IGNORE INTO pay_order(order_ref,email_hash,email_sealed,game,eid,item,state,created_ms) VALUES(?,?,?,?,?,?,'open',?)").bind(orderRef, o.emailHash, await sealText(env, o.email), o.game, o.eid, o.item, now).run();
  return json(200, { ok: true, orderRef, payPage: r.body.pay_url ?? null, amountMinor: r.body.amount_minor ?? null, currency: r.body.currency ?? "INR" });
}

async function tellFromOrder(env: Env, doFetch: typeof fetch, now: number, db: D1, orderRef: string): Promise<Response | null> {
  const o = await db.prepare("SELECT order_ref, email_hash, game, eid, item, state FROM pay_order WHERE order_ref=?").bind(orderRef).first<any>();
  if (!o) return fail(404, "unknown_order", "That order is not known here.");
  if (o.state === "told") return null;
  try { await tellGamePaid(env, doFetch, now, { game: o.game, eid: o.eid, item: o.item, orderRef: o.order_ref, emailHash: o.email_hash }); }
  catch (e: any) { return e?.definite ? fail(409, "refused", MSG.refused) : busy(); }
  await db.prepare("UPDATE pay_order SET state='told' WHERE order_ref=?").bind(orderRef).run();
  return null;
}

async function onEvent(env: Env, doFetch: typeof fetch, now: number, req: Request, body: any, text: string): Promise<Response> {
  const secret = env.MNP_WEBHOOK_SECRET;
  const ts = req.headers.get("x-mnp-timestamp") || "", sig = req.headers.get("x-mnp-signature") || "";
  if (!secret || !text || !/^\d{10,15}$/.test(ts) || Math.abs(now - Number(ts)) > 5 * 60_000) return fail(401, "bad_signature", "This notice could not be checked.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ts + "." + text)))].map((x) => x.toString(16).padStart(2, "0")).join("");
  if (want.length !== sig.length || [...want].reduce((d, ch, i) => d | (ch.charCodeAt(0) ^ sig.charCodeAt(i)), 0) !== 0) return fail(401, "bad_signature", "This notice could not be checked.");
  if (!body || body.type !== "game.paid" || typeof body.order_ref !== "string") return json(200, { ok: true, ignored: true }); // other kinds of notice are not for the pay step
  const r = await tellFromOrder(env, doFetch, now, tables(env), body.order_ref);
  return r ?? json(200, { ok: true });
}
