// Console wallet: the one place an organizer buys and spends credits (design: ORGANIZER-CREDITS-DESIGN, section 16).
// Server-side only. It never sees card data, never moves money, never changes a game.
//
// ROOT RULE (replaces "reserve, game step, capture"): CAPTURE FIRST, THEN GRANT.
//   reserve -> capture -> game step -> done.   A definite refusal by the game -> refund the order (credits come back).
// So there is no moment at which the game has been given and the credits are not already spent, and nothing depends on
// how long a hold lives. An unclear game failure (timeout) is simply repeated: the game step is idempotent by order id.
//
// `mnp` is a signed client with get/post returning { status, body } (production: signed fetch to Moneypenny, api key).
// `games[product].entitle({ email, item, orderRef })`: the game's own existing step, server to server.
//   CONTRACT: all-or-nothing and idempotent by orderRef; it throws an error with `definite: true` ONLY when it is sure
//   nothing was granted. Any other failure is treated as unknown and repeated.
// `store`: console orders. Every store call may be async (it is awaited). Production: the console database with a unique
//   spend_key and a real compare-and-set. Any adapter must pass `storeContract` (exported below).
// RUN `retryStuck` EVERY 2 MINUTES. Money is whole credits only; this module does no division and no rounding.
//
// Two factories on purpose: `createWallet` is what organizer-facing routes may reach (no purchase key).
// `createPaymentSide` is built only inside the IT Services webhook handler, with the purchase key client.
import { randomUUID, createHash } from 'node:crypto';

export function memoryStore() {
  const rows = new Map();
  return {
    get: (id) => (rows.has(id) ? { ...rows.get(id) } : null),
    all: () => [...rows.values()].map((r) => ({ ...r })),
    // unique spend_key: returns the existing row instead of inserting
    putNew: (id, row) => { const old = [...rows.values()].find((r) => r.spendKey === row.spendKey); if (old) return { ...old }; rows.set(id, { ...row }); return null; },
    // compare and set on status; true when this caller won
    cas: (id, from, patch) => { const r = rows.get(id); if (!r || !from.includes(r.status)) return false; rows.set(id, { ...r, ...patch }); return true; },
    plant: (id, row) => { rows.set(id, { ...row }); }, // tests only
  };
}

/** What every store adapter must do. Run it against the real adapter: it returns the list of broken promises. */
export async function storeContract(makeStore) {
  const bad = [];
  const st = await makeStore();
  const row = (id, key) => ({ id, spendKey: key, status: 'new', at: 1 });
  if ((await st.putNew('a', row('a', 'k1'))) !== null) bad.push('putNew of a new key must return null');
  const dup = await st.putNew('b', row('b', 'k1'));
  if (!dup || dup.id !== 'a') bad.push('putNew of an existing key must return the existing row');
  if ((await st.all()).length !== 1) bad.push('a duplicate key must not insert');
  // (the concurrent-insert check below adds one row)
  const races = await Promise.all([1, 2, 3, 4, 5].map((n) => st.putNew(`r${n}`, row(`r${n}`, 'race'))));
  if (races.filter((x) => x === null).length !== 1) bad.push('five concurrent putNew of one key must insert exactly once');
  const wins = (await Promise.all([1, 2, 3, 4, 5].map(() => st.cas('a', ['new'], { status: 'reserving' })))).filter(Boolean).length;
  if (wins !== 1) bad.push(`cas from the same status must have exactly one winner, got ${wins}`);
  if (await st.cas('a', ['new'], { status: 'x' })) bad.push('cas must fail when the status is not in the allowed list');
  if ((await st.get('a')).status !== 'reserving') bad.push('a lost cas must not change the row');
  return bad;
}

const fail = (code, status = 400, extra = {}) => ({ ok: false, status, code, ...extra });
const code = (r) => r?.body?.error?.code;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const CLAIM_MS = 2 * 60 * 1000; // a worker that has not finished in 2 minutes is presumed dead
const OPEN_TOO_LONG_MS = 2 * 60 * 60 * 1000; // any order still unfinished after 2 hours goes to the owner, whatever kept it open
const GIVE_UP_MS = 60 * 60 * 1000; // an unclear game step is repeated for an hour, then the owner decides (credits are already ours)
const MAX_TRIES = 5;
const short = (s) => createHash('sha256').update(String(s).trim().toLowerCase()).digest('hex').slice(0, 32);
// a worker moves a row to a *_ing state; a dead worker's row is put back to its ready state by the job
const WORK = { reserving: 'new', capturing: 'reserved', granting: 'captured', refunding: 'refund_due' };
const READY = ['new', 'reserved', 'captured', 'refund_due'];
const OWNER = ['needs_review'];

export function createWallet({ mnp, games = {}, store = memoryStore(), now = Date.now, currencies = ['INR'], alert = () => {} }) {
  const game = (p) => (typeof p === 'string' && Object.hasOwn(games, p) ? games[p] : null);
  const move = async (id, from, patch) => {
    const ok = await store.cas(id, from, { at: now(), ...patch });
    if (ok && OWNER.includes(patch.status)) { try { alert({ ...(await store.get(id)) }); } catch { /* an alert failure must not stop the flow */ } }
    return ok;
  };
  const bump = async (id) => ((await store.get(id))?.tries ?? 0) + 1;
  const review = async (id, from, reason) => await move(id, from, { status: 'needs_review', reason });

  /** Prices come from Moneypenny settings (data), never from the page. */
  async function quote(credits) {
    if (!Number.isSafeInteger(credits) || credits <= 0) return fail('bad_request');
    const r = await mnp.get(`/v1/quote?credits=${credits}`);
    return r.status === 200 ? { ok: true, ...r.body } : fail('quote_failed', r.status);
  }

  /** Step 1 of a buy: create the Moneypenny order for a listed pack. Payment is taken by IT Services (Razorpay). */
  async function startBuy({ email, credits, currency = 'INR', buyId }) {
    if (!email || typeof buyId !== 'string' || !ID.test(buyId) || !Number.isSafeInteger(credits) || credits <= 0) return fail('bad_request');
    if (!currencies.includes(currency)) return fail('currency_not_offered'); // USD packs are an open owner decision
    const q = await mnp.get(`/v1/quote?credits=${credits}`);
    if (q.status !== 200 || q.body.inr_fixed !== true) return fail('not_a_pack'); // sell listed packs only
    const orderRef = `BUY-${short(email)}-${credits}-${currency}-${buyId}`; // person, pack and currency are all in the id
    const r = await mnp.post('/v1/buy_credits', { email, credits, currency, order_ref: orderRef });
    if (r.status !== 200) return fail(code(r) ?? 'buy_failed', r.status);
    // the order itself must say it is a fixed-price pack order at the quoted price (an old order at an old price is refused)
    if (r.body.fixed_price !== true || r.body.amount_minor !== q.body.inr_minor || r.body.credits !== credits) return fail('price_mismatch', 409);
    return { ok: true, orderRef, orderId: r.body.order_id, amountMinor: r.body.amount_minor, currency: r.body.currency, payUrl: r.body.pay_url ?? null };
  }

  const balance = async (email) => (await mnp.get(`/v1/balance?email=${encodeURIComponent(email)}`)).body;

  /** Spend on a catalogue item. `spendKey` (one per click) makes a repeat return the same order, never a second one. */
  async function spend({ email, product, item, spendKey }) { // spendKey is REQUIRED: one per click, made by the console session
    if (!game(product)) return fail('unknown_product', 404);
    if (!email || typeof item !== 'string' || typeof spendKey !== 'string' || !ID.test(spendKey)) return fail('bad_request');
    const id = randomUUID();
    const scoped = `${short(email)}:${spendKey}`; // keys belong to one person
    const orderRef = `${product}-${short(scoped)}`; // from the click's key: a retried reserve meets the same order
    const again = await store.putNew(id, { id, orderRef, email, product, item, spendKey: scoped, status: 'new', tries: 0, at: now(), createdAt: now() });
    if (again) {
      if (again.product !== product || again.item !== item) return fail('key_conflict', 409);
      // a click refused only for lack of credits may be tried again with the same key after the person buys credits
      if (again.status === 'refused' && again.reason === 'insufficient_credits') {
        if (await store.cas(again.id, ['refused'], { status: 'new', at: now(), createdAt: now(), tries: 0 })) return answer(await run(again.id));
        return answer(await store.get(again.id), true); // lost the race: answer from the current row
      }
      return answer(again, true);
    }
    return answer(await run(id));
  }

  function answer(row, repeat = false) {
    if (row.status === 'granted') return { ok: true, orderRef: row.orderRef, credits: row.credits, ...(repeat ? { repeat: true } : {}) };
    if (row.status === 'refused') return fail(row.reason ?? 'refused', row.http ?? 409, { repeat });
    if (row.status === 'refunded') return fail('game_step_refused', 502, { orderRef: row.orderRef });
    if (row.status === 'needs_review') return fail('with_owner', 409, { orderRef: row.orderRef });
    return fail('order_in_progress', 202, { orderRef: row.orderRef, status: row.status });
  }

  /** Takes one order as far as it will go right now, one claimed step at a time. */
  async function run(id) {
    for (let guard = 0; guard < 8; guard++) {
      const row = (await store.get(id));
      if (!row) return null;
      let next;
      if (row.status === 'new') next = await stepReserve(row);
      else if (row.status === 'reserved') next = await stepCapture(row);
      else if (row.status === 'captured') next = await stepGrant(row);
      else if (row.status === 'refund_due') next = await stepRefund(row);
      else return row;
      if (next === 'stop') return (await store.get(id));
    }
    return (await store.get(id));
  }

  async function stepReserve(row) {
    if (!await move(row.id, ['new'], { status: 'reserving' })) return 'stop';
    let r;
    try { r = await mnp.post('/v1/spend/reserve_item', { email: row.email, product: row.product, item: row.item, order_ref: row.orderRef }); } catch { r = null; }
    if (r === null || r.status >= 500 || r.status === 429) { // unclear: reserve is idempotent, so just try again later
      const tries = (await bump(row.id));
      if (tries >= MAX_TRIES) await review(row.id, ['reserving'], 'reserve_failed'); else await move(row.id, ['reserving'], { status: 'new', tries });
      return 'stop';
    }
    if (code(r) === 'order_already_paid_with_credits') { // a hold of this order was already captured (lost answer, other worker): go on to grant
      if (row.holdId) { await move(row.id, ['reserving'], { status: 'captured', capturedAt: row.capturedAt ?? now() }); return 'go'; }
      await review(row.id, ['reserving'], 'paid_without_hold_id'); return 'stop';
    }
    if (code(r) === 'order_has_open_hold') { // an old hold of this order is still open (it lapses by itself): wait
      const tries = (await bump(row.id));
      if (tries >= MAX_TRIES) await review(row.id, ['reserving'], 'hold_stuck'); else await move(row.id, ['reserving'], { status: 'new', tries });
      return 'stop';
    }
    if (r.status !== 200) { await move(row.id, ['reserving'], { status: 'refused', reason: code(r) ?? 'reserve_failed', http: r.status }); return 'stop'; }
    await move(row.id, ['reserving'], { status: 'reserved', holdId: r.body.hold_id, credits: r.body.credits, tries: 0 });
    return 'go';
  }

  async function stepCapture(row) {
    if (!await move(row.id, ['reserved'], { status: 'capturing' })) return 'stop';
    let c;
    try { c = await mnp.post('/v1/spend/capture', { hold_id: row.holdId }); } catch { c = null; }
    if (c && (c.status === 200 || code(c) === 'hold_already_captured')) { await move(row.id, ['capturing'], { status: 'captured', capturedAt: now(), tries: 0 }); return 'go'; }
    const tries = (await bump(row.id));
    // The hold lapsed or vanished before capture: nothing was given yet, so go back and reserve again (same order id).
    const lapsed = c && (c.status === 410 || c.status === 404 || code(c) === 'hold_closed');
    if (tries >= MAX_TRIES) await review(row.id, ['capturing'], lapsed ? 'hold_lapsed' : 'capture_failed');
    else await move(row.id, ['capturing'], { status: lapsed ? 'new' : 'reserved', tries });
    return 'stop';
  }

  async function stepGrant(row) {
    if (!await move(row.id, ['captured'], { status: 'granting' })) return 'stop';
    try {
      await game(row.product).entitle({ email: row.email, item: row.item, orderRef: row.orderRef });
    } catch (e) {
      if (e?.definite === true) { await move(row.id, ['granting'], { status: 'refund_due', reason: 'game_step_refused' }); return 'go'; }
      await move(row.id, ['granting'], { status: 'captured', at: row.at, tries: (await bump(row.id)), reason: 'game_step_unknown' }); // keep `at`: it ages to the owner
      return 'stop';
    }
    await move(row.id, ['granting'], { status: 'granted' });
    return 'stop';
  }

  async function stepRefund(row) {
    if (!await move(row.id, ['refund_due'], { status: 'refunding' })) return 'stop';
    let r;
    try { r = await mnp.post('/v1/refund', { type: 'order', hold_id: row.holdId }); } catch { r = null; }
    if (r && (r.status === 200 || code(r) === 'nothing_to_return')) { await move(row.id, ['refunding'], { status: 'refunded' }); return 'stop'; }
    const tries = (await bump(row.id));
    if (tries >= MAX_TRIES) await review(row.id, ['refunding'], 'refund_failed'); else await move(row.id, ['refunding'], { status: 'refund_due', tries });
    return 'stop';
  }

  /** The 2-minute job. Safe to run twice at once: every step is claimed first. */
  async function retryStuck() {
    for (const row of (await store.all())) {
      const age = now() - row.at;
      if (WORK[row.status] && age > CLAIM_MS) await move(row.id, [row.status], { status: WORK[row.status], at: row.at }); // a dead worker: put it back
    }
    for (const row of (await store.all())) {
      const age = now() - row.at;
      if (READY.includes(row.status) && now() - (row.createdAt ?? row.at) > OPEN_TOO_LONG_MS) { await review(row.id, [row.status], 'open_too_long'); continue; }
      if ((row.status === 'captured' || row.status === 'granting') && now() - (row.capturedAt ?? row.at) > GIVE_UP_MS) await review(row.id, [row.status], 'game_step_unknown_too_long'); // credits are ours: the owner decides
      else if (READY.includes(row.status) && age > CLAIM_MS) await run(row.id);
    }
    const rows = (await store.all());
    return { review: rows.filter((r) => r.status === 'needs_review').length, open: rows.filter((r) => READY.includes(r.status) || r.status in WORK).length };
  }

  return { quote, startBuy, balance, spend, retryStuck }; // the store is deliberately not exposed: organizer code must not be able to edit orders
}

/** Built only in the IT Services webhook handler, after the Razorpay signature is checked there. */
export function createPaymentSide({ pay }) {
  async function paymentVerified({ orderId, paymentRef, paidMinor, currency }) {
    const r = await pay.post('/v1/rail/confirm', { order_id: orderId, payment_ref: paymentRef, paid_minor: paidMinor, currency });
    if (r.status !== 200) return fail(code(r) ?? 'confirm_failed', r.status);
    return { ok: true, credited: r.body.credited };
  }
  return { paymentVerified };
}
