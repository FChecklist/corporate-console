// A FAKE GAME that speaks contract v1 (docs/CONTRACT_V1.md). The console is built and tested against it before the real games have the bridge, and the same fixtures
// (contract/fixtures.json) are later run against each real game. Run under Bun:   bun tools/fake-game/server.mjs   (starts six personas on ports 8781..8786)
// Personas (each a different kind of trouble):  normal | slow (answers after 7 s, longer than the console's 6 s) | down (always 503) | empty (nobody has a game) | many (150 games, paged by 50) | old (bridge schema 1 without log/upgrade/preview)
import { verifyAssertion, parseKeyList } from "../../packages/bridge/src/assertion.ts";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, x-organizer, x-console-step", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-max-age": "86400" };
const H = { "content-type": "application/json", "cache-control": "no-store" };
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha256hex = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
export const emailHash = (email) => sha256hex("email|" + String(email == null ? "" : email).normalize("NFKC").trim().toLowerCase()); // the same reading of an address as packages/bridge/src/email.ts
const err = (status, error, message, extra = {}) => new Response(JSON.stringify({ ok: false, error, message, ...extra }), { status, headers: { ...H, ...CORS } });
const ok = (body) => new Response(JSON.stringify({ ok: true, ...body }), { status: 200, headers: { ...H, ...CORS } });
const KEY_LIFE_MS = 2 * 3600_000, HANDOFF_KEY_MS = 16 * 3600_000;

const SIZES = [[100, 239900, 3400, false], [250, 349900, 5100, false], [500, 469900, 6700, false], [750, 589900, 8400, false], [1000, 709900, 10100, false], [2500, 1179900, 16900, false], [5000, 1769900, 25300, false], [10000, 2949900, 42100, false]];

/** state = { game, name, origin, persona, nowMs, keys:[{kid,x}], people:Map, games:[], roles:[], invites:[], billing:[] } */
export function newGame({ game = "bingo", name = "Corporate Bingo", persona = "normal", origin, keys, nowMs = Date.now(), freeDemoCap = 10, gameVersion = "1.3.2" }) {
  return { game, name, persona, origin, keys, nowMs, freeDemoCap, gameVersion, bridgeOn: true, jti: new Map(), authKeys: new Map(), handoffs: new Map(), people: new Set(), games: [], roles: [], invites: [], billing: [], log: [], seq: 0, calls: [] };
}

export async function handle(S, req) {
  const url = new URL(req.url);
  S.calls.push(`${req.method} ${url.pathname}`);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (S.persona === "down") return new Response("Bad gateway", { status: 503, headers: CORS });
  if (S.persona === "slow") await new Promise((r) => setTimeout(r, S.slowMs ?? 7000));
  const p = url.pathname;
  if (p === "/version.json") return new Response(JSON.stringify({ commit: "fake", dirty: false, builtAt: "2026-10-27T00:00:00Z", game: "corporate-" + S.game, gameVersion: S.gameVersion, bridgeSchema: S.persona === "old" ? 1 : 2 }), { headers: { ...H, ...CORS } });
  if (!p.startsWith("/api/console/") && !/^\/api\/z\/[^/]+\/(log|upgrade-quote|discard|clone|paylink)$/.test(p)) return err(404, "not_found", "There is nothing at this address.");
  if (!S.bridgeOn) return new Response("{}", { status: 404, headers: { "content-type": "application/json" } }); // dark: no reason given, no CORS
  const body = req.method === "POST" ? await req.json().catch(() => null) : null;
  const now = S.nowMs;
  const asr = async (token, act, eid) => {
    const v = await verifyAssertion(token, { keys: S.keys, aud: S.origin, nowS: Math.floor(now / 1000), act });
    if (!v.ok) return { err: err(401, v.error, v.error === "wrong_audience" ? "This sign-in was made for another game." : v.error === "expired" ? "This sign-in has run out. Please try again." : v.error === "wrong_act" ? "This sign-in is for something else." : v.error === "unknown_kid" ? "This sign-in was made with an unknown key." : "This sign-in could not be checked.") };
    const pl = v.payload;
    if (S.jti.has(pl.jti)) return { err: err(401, "replayed", "This sign-in was already used. Please try again.") };
    S.jti.set(pl.jti, pl.exp);
    if (eid && pl.eid !== eid) return { err: err(401, "wrong_act", "This sign-in is for another game.") };
    return { pl };
  };
  const keyOf = () => { const k = req.headers.get("x-organizer"); const r = k && S.authKeys.get(k); return r && r.expiresMs > now ? r : null; };
  const mint = (sub, kind, eid, life = KEY_LIFE_MS) => { const key = (kind === "master" ? "cbk_" : kind === "host" ? "cbh_" : "cbc_") + hex(24); const r = { sub, kind, eid: eid ?? null, expiresMs: now + life, label: "console" }; S.authKeys.set(key, r); return { key, ...r }; };
  const mayStep = async (sa, eid) => { const h = req.headers.get("x-console-step"); if (!h) return { err: err(403, "step_up_required", "Please confirm with your sign-in once more.") }; const r = await asr(h, "stepup", eid); if (r.err) return r; if (r.pl.sa !== sa) return { err: err(403, "step_up_required", "That confirmation is for a different action.") }; return r; };

  if (req.method === "GET" && p === "/api/console/capabilities") {
    const old = S.persona === "old";
    return ok({ bridge: 1, schema: old ? 1 : 2, game: S.game, gameName: S.name, gameVersion: S.gameVersion, origin: S.origin, kids: S.keys.map((k) => k.kid), sizes: SIZES.map(([pack, inrMinor, usdMinor]) => ({ pack, inrMinor, usdMinor, free: false })).concat([{ pack: S.freeDemoCap, inrMinor: 0, usdMinor: 0, free: true }]), freeDemoCap: S.freeDemoCap, currencies: ["INR"], features: { roles: true, log: !old, upgrade: !old, preview: !old, trail: !old, invited: true }, limits: { drafts: 10 }, ...(old ? {} : { previewUrl: "/screenview/" }), options: {} });
  }
  if (req.method === "GET" && p === "/api/console/live") {
    const playing = S.games.filter((g) => g.status === "playing").length, soon = S.games.filter((g) => g.status === "ready" && g.startMs != null && g.startMs - now <= 3600_000 && g.startMs - now >= -1000).length;
    return ok({ game: S.game, playing, startingWithin60: soon, story: playing ? "Running." : soon ? "Starts soon." : "Nothing is playing.", counts: { joined: 0, waiting: 0 }, ...(S.game === "tictactoe" ? { tournamentsRunning: 0 } : {}) });
  }
  if (req.method === "POST" && p === "/api/console/session") {
    if (!body || typeof body.assertion !== "string") return err(400, "invalid", "The request is not complete.");
    const r = await asr(body.assertion, "session"); if (r.err) return r.err;
    const sub = r.pl.sub; let created = false;
    if (!S.people.has(sub) && !S.games.some((g) => g.orgSub === sub)) {
      if (body.create === true && r.pl.em) { S.people.add(sub); created = true; }
    }
    const isOrg = S.people.has(sub) || S.games.some((g) => g.orgSub === sub);
    const scoped = S.roles.filter((x) => x.sub === sub && x.state === "accepted").map((x) => ({ eid: x.eid, role: x.role, ...(({ key, expiresMs }) => ({ key, expiresMs }))(mint(sub, x.role === "host" ? "host" : "cohost", x.eid)) }));
    const org = isOrg ? mint(sub, "master", null) : null;
    return ok({ created, organizer: org && { key: org.key, expiresMs: org.expiresMs, label: "console" }, scoped });
  }
  if (req.method === "POST" && (p === "/api/console/games" || p === "/api/console/billing" || p === "/api/console/invited" || p === "/api/console/purge-email")) {
    const act = p.endsWith("games") ? "games" : p.endsWith("billing") ? "billing" : p.endsWith("invited") ? "invited" : "purge";
    if (!body || typeof body.assertion !== "string") return err(400, "invalid", "The request is not complete.");
    const r = await asr(body.assertion, act); if (r.err) return r.err;
    const sub = r.pl.sub;
    if (act === "purge") { const n0 = S.people.size + S.roles.length + S.invites.length; const r0 = S.roles.length; S.people.delete(sub); S.roles = S.roles.filter((x) => x.sub !== sub); S.invites = S.invites.filter((x) => x.sub !== sub); return ok({ removed: n0 - (S.people.size + S.roles.length + S.invites.length), rolesErased: r0 - S.roles.length }); }
    if (act === "invited") return ok({ cards: S.invites.filter((x) => x.sub === sub).map((x) => { const g = S.games.find((y) => y.eid === x.eid); return { game: S.game, eid: x.eid, name: g?.name ?? "Game", startMs: g?.startMs ?? null, link: x.link }; }) });
    if (act === "billing") {
      const mine = S.billing.filter((b) => b.sub === sub).sort((a, b) => b.tsMs - a.tsMs);
      const off = Number(body.cursor || 0) || 0, page = mine.filter((b) => (!body.fromMs || b.tsMs >= body.fromMs) && (!body.toMs || b.tsMs <= body.toMs)).slice(off, off + 50);
      return ok({ rows: page.map(({ sub: _x, ...row }) => row), credit: S.credit && S.credit.sub === sub ? { balanceMinor: S.credit.balanceMinor, currency: S.credit.currency, expiresMs: S.credit.expiresMs } : null, next: off + 50 < mine.length ? String(off + 50) : null });
    }
    // games
    const rows = [];
    for (const g of S.games) {
      let role = null, nextAction = g.nextAction;
      if (g.orgSub === sub) role = "organizer";
      const rr = S.roles.find((x) => x.eid === g.eid && x.sub === sub);
      if (!role && rr) { role = rr.role; if (rr.state === "invited") nextAction = "accept"; }
      if (!role) continue;
      const showMoney = role === "organizer" || role === "host";
      rows.push({ game: S.game, eid: g.eid, role, status: g.status, startMs: g.startMs, cap: g.cap, pack: g.pack, name: g.name, payment: showMoney ? g.payment : { state: g.payment.state }, invitedBy: role === "organizer" ? null : g.orgLabel ?? null, liveNow: g.status === "playing", nextAction, ...(nextAction === "accept" && rr ? { roleId: rr.roleId } : {}), createdMs: g.createdMs });
    }
    rows.sort((a, b) => a.createdMs - b.createdMs || a.eid.localeCompare(b.eid));
    const off = Number(body.cursor || 0) || 0, lim = Math.min(Number(body.limit) || 50, 100);
    return ok({ games: rows.slice(off, off + lim), next: off + lim < rows.length ? String(off + lim) : null });
  }
  if (req.method === "POST" && p === "/api/console/role") {
    if (!body || typeof body.op !== "string" || typeof body.eid !== "string") return err(400, "invalid", "The request is not complete.");
    const g = S.games.find((x) => x.eid === body.eid);
    if (body.op === "accept" || body.op === "decline") {
      const r = await asr(body.assertion, "role", body.eid); if (r.err) return r.err;
      const rr = S.roles.find((x) => x.roleId === body.roleId && x.eid === body.eid);
      if (!rr) return err(404, "not_found", "That invitation does not exist any more.");
      if (rr.sub !== r.pl.sub) return err(403, "not_yours", "This invitation was sent to a different e-mail address.");
      if (body.op === "decline") { S.roles = S.roles.filter((x) => x !== rr); return ok({}); }
      rr.state = "accepted"; const m = mint(r.pl.sub, rr.role === "host" ? "host" : "cohost", rr.eid);
      return ok({ scoped: { eid: rr.eid, role: rr.role, key: m.key, expiresMs: m.expiresMs } });
    }
    const k = keyOf(); if (!k) return err(403, "forbidden", "Please sign in again.");
    if (!g || g.orgSub !== k.sub || k.kind !== "master") return err(403, "forbidden", "Only the Organizer can change who helps with this game.");
    if (body.op === "list") return ok({ roles: S.roles.filter((x) => x.eid === body.eid).map(({ roleId, role, state, emailHint }) => ({ roleId, role, state, emailHint })) });
    if (body.op === "invite") {
      const st = await mayStep("role-add", body.eid); if (st.err) return st.err;
      if (!body.email || !body.role) return err(400, "invalid", "The request is not complete.");
      const roleId = hex(5), sub = await emailHash(body.email);
      S.roles.push({ roleId, eid: body.eid, role: body.role, sub, state: "invited", emailHint: body.email[0] + "***@" + body.email.split("@")[1] });
      S.mails = (S.mails || []).concat([{ to: body.email, kind: "role-invite", roleId }]);
      return ok({ roleId });
    }
    if (body.op === "remove") {
      const st = await mayStep("role-remove", body.eid); if (st.err) return st.err;
      const had = S.roles.length; S.roles = S.roles.filter((x) => !(x.roleId === body.roleId && x.eid === body.eid));
      if (S.roles.length === had) return err(404, "not_found", "That person is not on this game.");
      for (const [key, v] of S.authKeys) if (v.eid === body.eid && v.kind !== "master" && !S.roles.some((x) => x.sub === v.sub && x.eid === body.eid && x.state === "accepted")) S.authKeys.delete(key);
      return ok({});
    }
    return err(400, "invalid", "That action is not known.");
  }
  if (req.method === "POST" && p === "/api/console/handoff") {
    const k = keyOf(); if (!k) return err(403, "forbidden", "Please sign in again.");
    if (body?.target === "new") { // start a new game: no game yet, only the Organizer's own key
      if (body.eid !== undefined || k.kind !== "master" || k.eid) return err(403, "forbidden", "Only the organizer can start a new game.");
      if (body.free !== undefined && body.free !== true) return err(400, "invalid", "The request is not complete.");
      const t = hex(24); S.handoffs.set(t, { sub: k.sub, kind: "master", eid: "_new_", expiresMs: now + 60_000 });
      return ok({ url: `${S.origin}/signin.html?t=${t}&go=console&e=_new_${body.free === true ? "&free=1" : ""}`, expiresMs: now + 60_000 });
    }
    const g = S.games.find((x) => x.eid === body?.eid);
    if (!g || !(k.kind === "master" ? g.orgSub === k.sub : k.eid === g.eid)) return err(403, "forbidden", "You do not have a role in this game.");
    const t = hex(24); S.handoffs.set(t, { sub: k.sub, kind: k.kind, eid: g.eid, expiresMs: now + 60_000 });
    return ok({ url: `${S.origin}/signin.html?t=${t}&go=console&e=${g.eid}&to=${body.target}`, expiresMs: now + 60_000 });
  }
  if (req.method === "POST" && p === "/api/console/handoff/redeem") {
    const h = body && S.handoffs.get(body.t);
    if (!h || h.expiresMs < now) return err(401, "expired", "This link has run out. Please open the game again from your console.");
    S.handoffs.delete(body.t);
    const m = h.eid === "_new_" ? mint(h.sub, h.kind, null, KEY_LIFE_MS) : mint(h.sub, h.kind, h.eid, HANDOFF_KEY_MS);
    return ok({ key: m.key, kind: h.kind, eid: h.eid, expiresMs: m.expiresMs });
  }
  if (req.method === "POST" && p === "/api/console/signout") {
    const k = keyOf(); if (!k) return err(403, "forbidden", "Only a key made by the console can be ended here.");
    for (const [key, v] of S.authKeys) if (v.sub === k.sub && v.kind === k.kind && v.eid === k.eid) S.authKeys.delete(key);
    return ok({});
  }
  if (req.method === "POST" && p === "/api/console/preview") {
    if (S.persona === "old") return err(404, "not_found", "This game does not offer the player's screen view yet.");
    const k = keyOf(); if (!k) return err(403, "forbidden", "Please sign in again.");
    const g = S.games.find((x) => x.eid === body?.eid);
    if (!g || !(k.kind === "master" ? g.orgSub === k.sub : k.eid === g.eid)) return err(403, "forbidden", "You do not have a role in this game.");
    return ok({ url: `${S.origin}/screenview/${g.eid}?t=${hex(30)}`, expiresMs: now + 15 * 60_000 });
  }
  const mp = /^\/api\/z\/([^/]+)\/paylink$/.exec(p);
  if (mp && req.method === "POST") { // the game's own pay link route (one open link per game, 7 days)
    const k = keyOf(); if (!k) return err(403, "forbidden", "Please sign in again.");
    const g = S.games.find((x) => x.eid === mp[1]);
    if (!g || !(k.kind === "master" ? g.orgSub === k.sub : k.eid === g.eid)) return err(403, "forbidden", "You do not have a role in this game.");
    return new Response(JSON.stringify({ url: `${S.origin}/paylink.html?t=${hex(24)}`, expiresMs: now + 7 * 86400_000 }), { status: 200, headers: { ...H, ...CORS } });
  }
  const md = /^\/api\/z\/([^/]+)\/(discard|clone)$/.exec(p);
  if (md && req.method === "POST") { // the two ordinary game actions the console's list uses (Delete draft, Clone)
    const k = keyOf(); if (!k || k.kind !== "master") return err(403, "forbidden", "Please sign in again.");
    const g = S.games.find((x) => x.eid === md[1]);
    if (!g || g.orgSub !== k.sub) return err(403, "forbidden", "You do not have a role in this game.");
    if (md[2] === "discard") { if (g.status !== "draft") return err(409, "conflict", "Only a game that is not published yet can be deleted here."); S.games = S.games.filter((x) => x !== g); return ok({}); }
    const id = "CLONE" + hex(2).toUpperCase(); S.games.push({ ...g, eid: id, status: "draft", nextAction: "publish", payment: { state: "none" }, pack: 0, createdMs: S.nowMs }); return ok({ id });
  }
  const mq = /^\/api\/z\/([^/]+)\/(log|upgrade-quote)$/.exec(p);
  if (mq) {
    const k = keyOf(); if (!k) return err(403, "forbidden", "Please sign in again.");
    const g = S.games.find((x) => x.eid === mq[1]);
    if (!g || !(k.kind === "master" ? g.orgSub === k.sub : k.eid === g.eid)) return err(403, "forbidden", "You do not have a role in this game.");
    if (mq[2] === "log") {
      const since = Number(url.searchParams.get("since") || 0) || 0;
      const rows = S.log.filter((r) => r.eid === g.eid && r.seq > since && (k.kind === "master" || k.kind === "host" || r.who === "cohost")).map(({ eid: _e, ...r }) => r);
      return ok({ rows, next: rows.length ? rows[rows.length - 1].seq : since });
    }
    const to = Number(body?.toPack);
    const a = SIZES.find((s) => s[0] === g.pack), b = SIZES.find((s) => s[0] === to);
    if (g.status === "playing" || g.status === "finished") return err(409, "too_late", "A game that has started cannot be made bigger.");
    if (!a || !b || b[0] <= a[0]) return err(400, "invalid", "Choose a bigger size than the one already paid for.");
    const credit = S.credit && S.credit.sub === k.sub ? S.credit.balanceMinor : 0;
    return ok({ fromPack: a[0], toPack: b[0], currency: "INR", priceMinor: b[1], paidMinor: a[1], creditMinor: Math.min(credit, b[1] - a[1]), differenceMinor: Math.max(0, b[1] - a[1] - Math.min(credit, b[1] - a[1])) });
  }
  return err(404, "not_found", "There is nothing at this address.");
}

/** build a game with believable data for one person (sub hash) */
export function seedGames(S, subs, opts = {}) {
  const { alice, bob, carol } = subs;
  const T0 = S.nowMs, day = 86400_000;
  const mk = (eid, o) => S.games.push({ eid, orgSub: alice, name: eid + " party", status: "draft", startMs: T0 + 3 * day, cap: 100, pack: 0, payment: { state: "none" }, nextAction: "publish", createdMs: T0 - 5 * day, orgLabel: "Acme Corp", ...o });
  if (S.persona === "empty") return;
  if (S.persona === "many") { for (let i = 0; i < 150; i++) mk("M" + String(i).padStart(4, "0"), { createdMs: T0 - i * 1000, status: "finished", nextAction: "none", pack: 100, payment: { state: "paid", amountMinor: 239900, currency: "INR" } }); S.people.add(alice); return; }
  mk("DRAFT01", {});
  mk("WAIT001", { status: "waiting_payment", nextAction: "pay", cap: 250, payment: { state: "waiting" } });
  mk("READY01", { status: "ready", nextAction: "share", pack: 100, startMs: T0 + 2 * 3600_000, payment: { state: "paid", amountMinor: 239900, currency: "INR" } });
  mk("PLAY001", { status: "playing", nextAction: "run", pack: 250, startMs: T0 - 600_000, payment: { state: "paid", amountMinor: 349900, currency: "INR" } });
  mk("DONE001", { status: "finished", nextAction: "none", pack: 100, startMs: T0 - 2 * day, payment: { state: "paid", amountMinor: 239900, currency: "INR" } });
  mk("CANC001", { status: "cancelled", nextAction: "none", pack: 100, payment: { state: "credit" } });
  mk("NOST001", { status: "not_started", nextAction: "none", pack: 100, startMs: T0 - day, payment: { state: "paid", amountMinor: 239900, currency: "INR" } });
  // a game owned by Bob where Alice is Host (accepted) and one where she is invited as Co-host
  S.games.push({ eid: "BOBS001", orgSub: bob, name: "Bob's quiz night", status: "ready", startMs: T0 + day, cap: 100, pack: 100, payment: { state: "paid", amountMinor: 239900, currency: "INR" }, nextAction: "none", createdMs: T0 - 2 * day, orgLabel: "Bob Industries" });
  S.games.push({ eid: "CARO001", orgSub: carol, name: "Carol's launch", status: "ready", startMs: T0 + 2 * day, cap: 250, pack: 250, payment: { state: "paid", amountMinor: 349900, currency: "INR" }, nextAction: "none", createdMs: T0 - 1 * day, orgLabel: "Carol & Co" });
  S.roles.push({ roleId: "aaaaaaaaaa", eid: "BOBS001", role: "host", sub: alice, state: "accepted", emailHint: "a***@x.in" });
  S.roles.push({ roleId: "bbbbbbbbbb", eid: "CARO001", role: "cohost", sub: alice, state: "invited", emailHint: "a***@x.in" });
  S.people.add(alice); S.people.add(bob); S.people.add(carol);
  S.invites.push({ sub: alice, eid: "BOBS001", link: S.origin + "/z.html?e=BOBS001#p=personal" });
  S.billing.push({ sub: alice, tsMs: T0 - 3 * day, game: S.game, eid: "READY01", gameName: "READY01 party", what: "pack", amountMinor: 239900, currency: "INR", status: "paid", paidBy: "organizer", invoice: "/api/invoice/inv_" + "a".repeat(32) });
  S.billing.push({ sub: alice, tsMs: T0 - 2 * day, game: S.game, eid: "PLAY001", gameName: "PLAY001 party", what: "pack", amountMinor: 349900, currency: "INR", status: "paid", paidBy: "host", invoice: "/api/invoice/inv_" + "b".repeat(32) });
  S.billing.push({ sub: alice, tsMs: T0 - 1 * day, game: S.game, eid: "WAIT001", gameName: "WAIT001 party", what: "pack", amountMinor: 349900, currency: "INR", status: "waiting", paidBy: "organizer", invoice: null });
  S.credit = { sub: alice, balanceMinor: 239900, currency: "INR", expiresMs: T0 + 300 * day };
  let seq = 0; const lg = (eid, kind, who, text, data = {}) => S.log.push({ eid, seq: ++seq, tsMs: T0 - 1000 * (20 - seq), kind, who, text, data });
  lg("PLAY001", "created", "organizer", "The game was created.");
  lg("PLAY001", "payment", "host", "A payment was received.", { amountMinor: 349900, currency: "INR" });
  lg("PLAY001", "started", "system", "The game started.");
  lg("PLAY001", "number_called", "system", "Number 47 was called.", { number: 47 });
  void opts;
}

if (import.meta.main) {
  const { makeKeyPair } = await import("../../packages/bridge/src/assertion.ts");
  const kp = await makeKeyPair();
  const keys = parseKeyList("k1:" + kp.publicB64u);
  const names = [["tambola", "Corporate Tambola", "normal"], ["bingo", "Corporate Bingo", "slow"], ["tictactoe", "Corporate Tic Tac Toe", "down"], ["snakesladders", "Corporate Snakes and Ladders", "empty"], ["luckbychance", "Corporate Luck by Chance", "many"], ["luckydraw", "Corporate Lucky Draw", "old"]];
  const subs = { alice: await emailHash("demo5@demo-test.invalid"), bob: await emailHash("demo8@demo-test.invalid"), carol: await emailHash("demo9@demo-test.invalid") };
  names.forEach(([game, name, persona], i) => {
    const port = 8781 + i, origin = `http://127.0.0.1:${port}`, S = newGame({ game, name, persona, origin, keys });
    seedGames(S, subs);
    Bun.serve({ port, hostname: "127.0.0.1", fetch: (req) => handle(S, req) });
    console.log(`${game} (${persona}) on ${origin}`);
  });
  console.log("console public key (for CONSOLE_PUBKEYS): k1:" + kp.publicB64u);
}
