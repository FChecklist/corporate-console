// The pay step of the organizer's game flow (last step, all six games). The console talks ONLY to Moneypenny; it never calls IT Services or Razorpay.
// Every number (price, balance, shortfall, dollars, rupees) comes from Moneypenny's answers. Nothing here knows a price.
// Moneypenny's game-pay routes (contract/v1/openapi.json, game_pay): the game id is the order reference.
//   GET  /pay/quote?game=&eid=&item=   price of this game, the organizer's credits, the credits still to buy (the smallest listed pack); says 'paid' once it is paid
//   POST /pay/pay                      enough credits: Moneypenny reserves and captures in one step; then the game is told it is paid
//   POST /pay/buy                      credits are short: Moneypenny opens a purchase and gives the secure payment window's details (shown on top of the page)
//   POST /pay/confirm                  the window finished: Moneypenny checks what really happened and pays the game
//   POST /pay/link                     a payment link (a console page /pay/<token>); the money goes to the organizer's own account for this game
//   GET  /pay/link/info, POST /pay/link/start, /pay/link/confirm   the payee's page (no sign-in; sees only an amount due)
//   POST /pay/check                    asks Moneypenny whether this game is paid (a closed tab, a missed notice)
//   POST /pay/event                    Moneypenny's signed "game.paid" notice; the console then tells the game (act 'paid', once per order id)
// Dark by default: PAY_VIA_MONEYPENNY must be "1". Voice: 'you', polite, simple English, no threats.
import type { D1 } from "../../packages/bridge/src/d1";
import { sessionOf, unsealText, sealText, sha256hex, type Env } from "./auth-core";
import { tables } from "./tables";
import { signAssertion, b64uEncode, type Payload } from "../../packages/bridge/src/assertion";

export type Mnp = { get(path: string): Promise<{ status: number; body: any }>; post(path: string, body: unknown): Promise<{ status: number; body: any }> };
export interface PayDeps { mnp?: Mnp; fetch?: typeof fetch; assets?: (path: string) => Promise<Response> }

/** the six games' names (labels only; no price anywhere). A test keeps this list equal to config/games.json. */
export const GAME_NAMES: Record<string, string> = { tambola: "Corporate Tambola", bingo: "Corporate Bingo", tictactoe: "Corporate Tic Tac Toe", snakesladders: "Corporate Snakes and Ladders", luckbychance: "Corporate Luck by Chance", luckydraw: "Corporate Lucky Draw" };
export const LINK_MS = 7 * 86400_000; // the payment link works 7 days (the words already printed on the screen)
const EID = /^[A-Za-z0-9_-]{4,40}$/, ITEM = /^[A-Za-z0-9_.-]{1,40}$/, TOKEN = /^[A-Za-z0-9_-]{20,80}$/;

const json = (status: number, body: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
const MSG = {
  busy: "Credits are refreshing. Nothing has been taken from you. Please try again in a few minutes.",
  notOpen: "Paying for games is not open yet. Please check again soon.",
  signIn: "Please sign in to your console to pay for your game.",
  noItem: "This game size is not on the price list yet. Please try again later.",
  enough: "You already have enough credits for this game.",
  short: "You need a few more credits for this game.",
  refused: "This game could not accept the payment. Your payment is safe and is being checked.",
  pending: "Your payment is on its way. It can take a few minutes. You do not need to pay again.",
  review: "Your payment is being checked. Your credits are safe.",
  link: "This payment link is not valid any more. Please ask the organizer for a new one.",
  bad: "The request is not complete.",
  price: "The price of this game has just changed. Please check the new amount and try again.",
  payer: "This payment was made with a different e-mail address. Please pay with the e-mail address of the account that owns the game.",
  alreadyPaid: "This game is already paid. Thank you.",
  email: "Please type your e-mail address so we can match your payment.",
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

const asks = (b: any): { game: string; eid: string; item: string } | null => (b && typeof b.game === "string" && typeof b.eid === "string" && typeof b.item === "string" && EID.test(b.eid) && ITEM.test(b.item) ? { game: b.game, eid: b.eid, item: b.item } : null);
const orderRefOf = (game: string, eid: string) => `GAME-${game}-${eid}`; // the id the game's "paid" notice carries (a game marks itself paid once per id)

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

async function purgeOld(env: Env, now: number) {
  await tables(env).prepare("DELETE FROM pay_order WHERE created_ms<?").bind(now - 90 * 86400_000).run();
}

/** The console's own note of a game being paid for: who (sealed e-mail), which game, and whether the game has been told. */
async function noteGame(env: Env, db: D1, now: number, o: { email: string; emailHash: string; game: string; eid: string; item: string }) {
  await db.prepare("INSERT OR IGNORE INTO pay_order(order_ref,email_hash,email_sealed,game,eid,item,state,created_ms) VALUES(?,?,?,?,?,?,'open',?)").bind(orderRefOf(o.game, o.eid), o.emailHash, await sealText(env, o.email), o.game, o.eid, o.item, now).run();
}

/** Moneypenny says this game is paid: tell the game (once per order id; repeated safely). Returns null when the game knows, or an answer to send when it does not yet. */
async function settle(env: Env, doFetch: typeof fetch, now: number, db: D1, game: string, eid: string): Promise<Response | null> {
  const ref = orderRefOf(game, eid);
  const o = await db.prepare("SELECT order_ref, email_hash, game, eid, item, state FROM pay_order WHERE order_ref=?").bind(ref).first<any>();
  if (!o) return null; // not a game this console is paying for: nothing to tell
  if (o.state === "told") return null;
  try { await tellGamePaid(env, doFetch, now, { game: o.game, eid: o.eid, item: o.item, orderRef: o.order_ref, emailHash: o.email_hash }); }
  catch (e: any) { return e?.definite ? fail(409, "review", MSG.review) : json(202, { ok: true, paid: false, pending: true, message: MSG.pending }); } // the payment is safe at Moneypenny; the next look tells the game again
  await db.prepare("UPDATE pay_order SET state='told' WHERE order_ref=?").bind(ref).run();
  return null;
}

/** Moneypenny's error code -> our own soft words (its text is never shown). */
function softError(code: string): Response {
  switch (code) {
    case "no_item": case "no_pack_covers": return fail(404, "no_item", MSG.noItem);
    case "price_changed": return fail(409, "price_changed", MSG.price);
    case "payer_mismatch": return fail(409, "payer", MSG.payer);
    case "game_ref_used": case "account_frozen": return fail(409, "review", MSG.review);
    case "already_paid": return fail(409, "paid", MSG.alreadyPaid);
    case "link_expired": case "no_link": return fail(404, "bad_link", MSG.link);
    default: return busy();
  }
}
const codeOf = (r: { status: number; body: any }) => String(r?.body?.error?.code ?? "");

/** The secure payment window's details (Moneypenny's order.payframe) plus where the window comes from. The page opens the window on top of itself. */
function frameOf(env: Env, order: any, email: string) {
  const f = order?.payframe;
  if (!f || typeof f.key !== "string" || typeof f.order_id !== "string") return null;
  const base = String(env.PAYFRAME_ORIGIN || "https://itservices-rajat-agarwal.pages.dev").replace(/\/$/, "");
  return { url: base + "/payframe/", origin: base, opts: { key: f.key, order_id: f.order_id, amount: f.amount, currency: f.currency, name: "Corporate Games", description: "Credits for your game", prefill: { email } }, orderId: String(order.order_id || f.order_id) };
}
const respOf = (b: any) => (b && b.resp && typeof b.resp.razorpay_order_id === "string" && typeof b.resp.razorpay_payment_id === "string" && typeof b.resp.razorpay_signature === "string" ? { razorpay_order_id: b.resp.razorpay_order_id, razorpay_payment_id: b.resp.razorpay_payment_id, razorpay_signature: b.resp.razorpay_signature } : null);

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

    // ---- Moneypenny's signed notice: a game is paid ----
    if (req.method === "POST" && path === "/pay/event") return reply(await onEvent(env, doFetch, now, req, body, rawText));

    // ---- the payee's page is a console page: /pay/<token> (the same page for every token; it asks /pay/link/info) ----
    if (req.method === "GET" && /^\/pay\/[A-Za-z0-9_-]{20,80}$/.test(path) && deps.assets) {
      const r = await deps.assets("/pay-link.html");
      return new Response(r.body, { status: r.status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
    }

    // ---- the payee's calls: no sign-in; the link is the key ----
    if (path === "/pay/link/info" || path === "/pay/link/start" || path === "/pay/link/confirm") {
      const t = path.endsWith("info") ? url.searchParams.get("t") : body?.t;
      if (typeof t !== "string" || !TOKEN.test(t)) return reply(fail(404, "bad_link", MSG.link));
      const li = await mnp.get(`/v1/game_pay/link?token=${encodeURIComponent(t)}`);
      if (li.status !== 200 || !li.body?.ok) return reply(softError(codeOf(li)));
      const L = li.body, gameName = GAME_NAMES[String(L.product)] ?? "a game";
      if (L.status === "paid" || L.status === "nothing_due") return reply(json(200, { ok: true, covered: true, paid: L.status === "paid", gameName }));
      if (L.status !== "open") return reply(fail(409, "price_changed", MSG.price));
      const due = { currency: String(L.currency), amountMinor: Number(L.amount_minor) };
      if (path === "/pay/link/info") return reply(json(200, { ok: true, covered: false, gameName, due, expiresMs: Number(L.expires_at) || null }));
      if (path === "/pay/link/start") {
        const email = typeof body?.email === "string" ? body.email.trim() : "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return reply(fail(400, "email", MSG.email));
        const s = await mnp.post("/v1/game_pay/link/start", { token: t, payer_email: email, currency: L.currency });
        if (s.status !== 200 || !s.body?.ok) return reply(softError(codeOf(s)));
        const frame = frameOf(env, s.body.order, email);
        return reply(frame ? json(200, { ok: true, frame }) : busy());
      }
      // confirm: the payment window finished; Moneypenny checks what really happened
      const resp = respOf(body), oid = typeof body?.orderId === "string" ? body.orderId : "";
      if (!resp || !oid) return reply(fail(400, "invalid", MSG.bad));
      const cf = await mnp.post("/v1/game_pay/confirm", { order_ref: String(L.order_ref), order_id: oid, ...resp });
      if (cf.status !== 200 || !cf.body?.ok) return reply(softError(codeOf(cf)));
      if (!cf.body.paid) return reply(json(200, { ok: true, paid: false, pending: true, message: MSG.pending }));
      const left = await settle(env, doFetch, now, db, String(L.product), String(L.order_ref));
      return reply(left ?? json(200, { ok: true, paid: true }));
    }

    // ---- everything below is the signed-in organizer ----
    const me = await whoIs(req, env, now);
    if (!me) return reply(fail(401, "sign_in", MSG.signIn, { signIn: env.CONSOLE_ORIGIN }));
    const gp = (a: { game: string; eid: string; item: string }) => ({ order_ref: a.eid, product: a.game, item: a.item, email: me.email });

    if (req.method === "GET" && path === "/pay/quote") {
      const a = asks({ game: url.searchParams.get("game"), eid: url.searchParams.get("eid"), item: url.searchParams.get("item") });
      if (!a || !origins(env)[a.game]) return reply(fail(400, "invalid", MSG.bad));
      const q = await mnp.get(`/v1/game_pay/quote?order_ref=${encodeURIComponent(a.eid)}&product=${encodeURIComponent(a.game)}&item=${encodeURIComponent(a.item)}&email=${encodeURIComponent(me.email)}`);
      if (q.status !== 200 || !q.body?.ok) return reply(softError(codeOf(q)));
      const Q = q.body;
      if (Q.paid === true || Q.status === "paid") { const left = await settle(env, doFetch, now, db, a.game, a.eid); return reply(left ?? json(200, { ok: true, paid: true, game: a.game, eid: a.eid })); }
      const enough = Q.can_pay_now === true || Number(Q.short_by) <= 0;
      if (!enough && !(Q.to_buy && Number.isSafeInteger(Q.to_buy.credits))) return reply(fail(404, "no_item", MSG.noItem));
      return reply(json(200, { ok: true, paid: false, waiting: Q.status === "awaiting_payment", game: a.game, gameName: GAME_NAMES[a.game], eid: a.eid, item: a.item, label: "Moneypenny", price: { credits: Number(Q.cost_credits), usd: String(Q.cost_usd), inrMinor: Number(Q.cost_inr_minor) }, balance: await worth(mnp, Math.max(0, Number(Q.balance) || 0)), short: enough ? await worth(mnp, 0) : await worth(mnp, Q.to_buy.credits), enough }));
    }

    if (req.method === "POST" && (path === "/pay/pay" || path === "/pay/buy")) {
      const a = asks(body);
      if (!a || !origins(env)[a.game]) return reply(fail(400, "invalid", MSG.bad));
      await noteGame(env, db, now, { ...me, ...a });
      const s = await mnp.post("/v1/game_pay/start", { ...gp(a), currency: "INR" });
      if (s.status !== 200 || !s.body?.ok) return reply(softError(codeOf(s)));
      if (s.body.paid === true || s.body.status === "paid") { const left = await settle(env, doFetch, now, db, a.game, a.eid); return reply(left ?? json(200, { ok: true, paid: true })); }
      if (path === "/pay/pay") return reply(fail(402, "short", MSG.short));
      const frame = frameOf(env, s.body.order, me.email);
      return reply(frame ? json(200, { ok: true, frame }) : busy());
    }

    if (req.method === "POST" && path === "/pay/confirm") { // the payment window finished: Moneypenny checks what really happened and pays the game
      const a = asks(body), resp = respOf(body), oid = typeof body?.orderId === "string" ? body.orderId : "";
      if (!a || !resp || !oid || !origins(env)[a.game]) return reply(fail(400, "invalid", MSG.bad));
      await noteGame(env, db, now, { ...me, ...a });
      const cf = await mnp.post("/v1/game_pay/confirm", { order_ref: a.eid, order_id: oid, ...resp });
      if (cf.status !== 200 || !cf.body?.ok) return reply(softError(codeOf(cf)));
      if (!cf.body.paid) return reply(json(200, { ok: true, paid: false, pending: true, message: MSG.pending }));
      const left = await settle(env, doFetch, now, db, a.game, a.eid);
      return reply(left ?? json(200, { ok: true, paid: true }));
    }

    if (req.method === "POST" && path === "/pay/link") {
      const a = asks(body);
      if (!a || !origins(env)[a.game]) return reply(fail(400, "invalid", MSG.bad));
      await noteGame(env, db, now, { ...me, ...a }); // so the game is told even if the payee pays after this tab is closed
      const l = await mnp.post("/v1/game_pay/link", gp(a));
      if (l.status !== 200 || !l.body?.ok || typeof l.body.token !== "string") return reply(softError(codeOf(l)));
      return reply(json(200, { ok: true, url: `${env.CONSOLE_ORIGIN}/pay/${l.body.token}`, expiresMs: Number(l.body.expires_at) || null }));
    }

    if (req.method === "POST" && path === "/pay/check") { // a closed tab, a missed notice: ask Moneypenny whether this game is paid
      const a = asks(body);
      if (!a || !origins(env)[a.game]) return reply(fail(400, "invalid", MSG.bad));
      const s = await mnp.get(`/v1/game_pay/status?order_ref=${encodeURIComponent(a.eid)}`);
      if (s.status !== 200 || !s.body?.ok) return reply(softError(codeOf(s)));
      if (s.body.paid === true || s.body.status === "paid") { const left = await settle(env, doFetch, now, db, a.game, a.eid); return reply(left ?? json(200, { ok: true, paid: true })); }
      return reply(json(200, { ok: true, paid: false, review: s.body.status === "review" }));
    }
    return reply(fail(404, "not_found", "There is nothing at this address."));
  } catch {
    return reply(busy()); // Moneypenny (or the game) did not answer: soft words, and nothing was taken
  }
}

async function onEvent(env: Env, doFetch: typeof fetch, now: number, req: Request, body: any, text: string): Promise<Response> {
  const secret = env.MNP_WEBHOOK_SECRET;
  const ts = req.headers.get("x-mnp-timestamp") || "", sig = req.headers.get("x-mnp-signature") || "";
  if (!secret || !text || !/^\d{10,15}$/.test(ts) || Math.abs(now - Number(ts)) > 5 * 60_000) return fail(401, "bad_signature", "This notice could not be checked.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ts + "." + text)))].map((x) => x.toString(16).padStart(2, "0")).join("");
  if (want.length !== sig.length || [...want].reduce((d, ch, i) => d | (ch.charCodeAt(0) ^ sig.charCodeAt(i)), 0) !== 0) return fail(401, "bad_signature", "This notice could not be checked.");
  const d = body?.data;
  if (!body || body.type !== "game.paid" || !d || typeof d.product !== "string" || typeof d.game_ref !== "string" || !EID.test(d.game_ref) || !origins(env)[d.product]) return json(200, { ok: true, ignored: true }); // every notice reaches every endpoint: only a game of ours is for the pay step
  const r = await settle(env, doFetch, now, tables(env), d.product, d.game_ref);
  return r ?? json(200, { ok: true });
}
