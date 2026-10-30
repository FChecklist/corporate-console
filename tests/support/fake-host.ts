// A miniature game used to test the bridge: its own SQLite database (organizer accounts, keys, games) and an Adapter in the shape every real game will write.
// Seeded with the SAME people and games as tools/fake-game, so the contract fixtures run unchanged against the real bridge code.
import { Database } from "bun:sqlite";
import { BRIDGE_SCHEMA } from "../../packages/bridge/src/schema";
import type { Adapter, KeyAuth, RoleRow } from "../../packages/bridge/src/bridge";
import { makeKeyPair } from "../../packages/bridge/src/assertion";
import type { D1, D1Stmt } from "../../packages/bridge/src/d1";

const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const DAY = 86400_000;

export const GAME_SQL = [
  "CREATE TABLE organizer_email (email_hash TEXT PRIMARY KEY, org TEXT NOT NULL)",
  "CREATE TABLE organizer_key (hash TEXT PRIMARY KEY, org TEXT, kind TEXT NOT NULL, revoked INTEGER DEFAULT 0, created_ms INTEGER, expires_ms INTEGER, label TEXT, eid TEXT, created_by TEXT)",
  "CREATE TABLE engagement (id TEXT PRIMARY KEY, org TEXT NOT NULL, name TEXT, status TEXT NOT NULL, start_ms INTEGER, cap INTEGER, pack INTEGER, created_ms INTEGER, pay_state TEXT, pay_minor INTEGER, org_label TEXT, next_action TEXT, ended INTEGER DEFAULT 0)",
  "CREATE TABLE invited (email_hash TEXT, eid TEXT, link TEXT)",
  "CREATE TABLE bill (org TEXT, ts_ms INTEGER, eid TEXT, game_name TEXT, what TEXT, minor INTEGER, status TEXT, paid_by TEXT, invoice TEXT)",
  "CREATE TABLE credit (org TEXT, minor INTEGER, currency TEXT, expires_ms INTEGER)",
];

export interface Host { env: any; raw: Database; db: D1; adapter: Adapter<any>; mails: Array<{ to: string; eid: string; role: string }>; clock: { ms: number }; pub: string; priv: CryptoKey; origin: string; people: Record<string, string> }

export async function makeHost(o: { origin?: string; nowMs?: number; pubkeys?: "on" | "off" } = {}): Promise<Host> {
  const raw = new Database(":memory:");
  for (const s of GAME_SQL) raw.run(s);
  for (const s of BRIDGE_SCHEMA) raw.run(s);
  const stmt = (sql: string, vals: unknown[] = []): D1Stmt => ({
    bind: (...v) => stmt(sql, v),
    run: async () => { const r = raw.query(sql).run(...(vals as any[])); return { meta: { changes: r.changes } }; },
    all: async () => ({ results: raw.query(sql).all(...(vals as any[])) as any[] }),
    first: async () => (raw.query(sql).get(...(vals as any[])) as any) ?? null,
  });
  const db: D1 = { prepare: (s) => stmt(s), batch: async (xs) => Promise.all(xs.map((x) => x.run())) };
  const kp = await makeKeyPair();
  const clock = { ms: o.nowMs ?? Date.UTC(2026, 9, 28, 6, 0, 0) };
  const origin = o.origin ?? "http://game.test";
  const env: any = { DB: db, PUBLIC_ORIGIN: origin, ORGANIZER_SECRET: "platform-secret", CONSOLE_PUBKEYS: o.pubkeys === "off" ? undefined : "k1:" + kp.publicB64u };
  const mails: Host["mails"] = [];
  const keyHash = (k: string) => sha("key|" + k);
  const adapter: Adapter<any> = {
    game: "bingo", gameName: "Corporate Bingo", gameVersion: "1.3.2",
    nowMs: () => clock.ms, origin: (e) => e.PUBLIC_ORIGIN, pubkeys: (e) => e.CONSOLE_PUBKEYS, db: (e) => e.DB,
    organizerOf: async (e, h) => { const r = await db.prepare("SELECT org FROM organizer_email WHERE email_hash=?").bind(h).first<any>(); return r ? { org: r.org } : null; },
    createOrganizer: async (e, email, h) => { const org = "org" + hex(4); await db.prepare("INSERT INTO organizer_email(email_hash,org) VALUES(?,?)").bind(h, org).run(); return { org }; },
    mintKey: async (e, k) => {
      const key = (k.kind === "master" ? "cbk_" : k.kind === "host" ? "cbh_" : "cbc_") + hex(24);
      await db.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms,expires_ms,label,eid,created_by) VALUES(?,?,?,0,?,?,?,?,?)").bind(await keyHash(key), k.org, k.kind, clock.ms, k.expiresMs, "console", k.eid, k.createdBy).run();
      return key;
    },
    revokeKeys: async (e, by) => { await db.prepare("UPDATE organizer_key SET revoked=1 WHERE created_by=?").bind(by).run(); },
    authOfKey: async (e, key, now): Promise<KeyAuth | null> => {
      if (key === e.ORGANIZER_SECRET) return { org: null, kind: "platform", eid: null }; // the owner's platform key: it must never open a console route
      const r = await db.prepare("SELECT org, kind, eid, created_by FROM organizer_key WHERE hash=? AND revoked=0 AND (expires_ms IS NULL OR expires_ms>?)").bind(await keyHash(key), now).first<any>();
      return r ? { org: r.org, kind: r.kind, eid: r.eid, createdBy: r.created_by } : null;
    },
    engagement: async (e, eid) => { const r = await db.prepare("SELECT org, name, ended FROM engagement WHERE id=?").bind(eid).first<any>(); return r ? { org: r.org, name: r.name, ended: !!r.ended } : null; },
    listGames: async (e, a) => {
      const rows: any[] = [];
      const row = (g: any, role: string, nextAction: string) => ({ game: "bingo", eid: g.id, role, status: g.status, startMs: g.start_ms, cap: g.cap, pack: g.pack, name: g.name, payment: role === "cohost" ? { state: g.pay_state } : g.pay_minor ? { state: g.pay_state, amountMinor: g.pay_minor, currency: "INR" } : { state: g.pay_state }, invitedBy: role === "organizer" ? null : g.org_label, liveNow: g.status === "playing", nextAction, createdMs: g.created_ms });
      if (a.org) for (const g of (await db.prepare("SELECT * FROM engagement WHERE org=?").bind(a.org).all<any>()).results) rows.push(row(g, "organizer", g.next_action));
      for (const r of a.roles) { if (r.state === "ended") continue; const g = await db.prepare("SELECT * FROM engagement WHERE id=?").bind(r.eid).first<any>(); if (g) rows.push(row(g, r.role, r.state === "invited" ? "accept" : g.next_action)); }
      rows.sort((x, y) => x.createdMs - y.createdMs || x.eid.localeCompare(y.eid));
      const off = Number(a.cursor || 0) || 0;
      return { games: rows.slice(off, off + a.limit), next: off + a.limit < rows.length ? String(off + a.limit) : null };
    },
    billing: async (e, a) => {
      if (!a.org) return { rows: [], credit: null, next: null };
      const all = (await db.prepare("SELECT * FROM bill WHERE org=? ORDER BY ts_ms DESC").bind(a.org).all<any>()).results.filter((b) => (!a.fromMs || b.ts_ms >= a.fromMs) && (!a.toMs || b.ts_ms <= a.toMs));
      const off = Number(a.cursor || 0) || 0;
      const c = await db.prepare("SELECT minor, currency, expires_ms FROM credit WHERE org=?").bind(a.org).first<any>();
      return { rows: all.slice(off, off + 50).map((b) => ({ tsMs: b.ts_ms, game: "bingo", eid: b.eid, gameName: b.game_name, what: b.what, amountMinor: b.minor, currency: "INR", status: b.status, paidBy: b.paid_by, invoice: b.invoice })), credit: c ? { balanceMinor: c.minor, currency: c.currency, expiresMs: c.expires_ms } : null, next: off + 50 < all.length ? String(off + 50) : null };
    },
    invitedCards: async (e, h) => (await db.prepare("SELECT i.eid, i.link, g.name, g.start_ms FROM invited i JOIN engagement g ON g.id=i.eid WHERE i.email_hash=?").bind(h).all<any>()).results.map((r) => ({ game: "bingo", eid: r.eid, name: r.name, startMs: r.start_ms, link: r.link })),
    purgePerson: async (e, h) => (await db.prepare("DELETE FROM invited WHERE email_hash=?").bind(h).run()).meta.changes,
    live: async () => ({ playing: ((await db.prepare("SELECT COUNT(*) c FROM engagement WHERE status='playing'").first<any>())?.c) ?? 0, startingWithin60: ((await db.prepare("SELECT COUNT(*) c FROM engagement WHERE status='ready' AND start_ms BETWEEN ? AND ?").bind(clock.ms - 1000, clock.ms + 3600_000).first<any>())?.c) ?? 0 }),
    capabilities: async () => ({ sizes: [{ pack: 10, inrMinor: 0, usdMinor: 0, free: true }, ...[100, 250, 500, 750, 1000, 2500, 5000, 10000].map((p) => ({ pack: p, inrMinor: p * 1000, usdMinor: null, free: false }))], freeDemoCap: 10, currencies: ["INR"], features: { roles: true, log: false, upgrade: false, preview: true, trail: false, invited: true }, limits: { drafts: 10 }, options: {} }),
    sendRoleInvite: async (e, m) => { mails.push({ to: m.to, eid: m.eid, role: m.role }); },
    seal: async (e, t) => "sealed:" + btoa(t), unseal: async (e, s) => atob(s.replace("sealed:", "")),
    previewUrl: async (e, p) => ({ url: `${origin}/screenview/${p.eid}?t=${hex(30)}`, expiresMs: p.nowMs + 15 * 60_000 }),
  };
  const people = { alice: await sha("email|demo5@demo-test.invalid"), bob: await sha("email|demo8@demo-test.invalid"), carol: await sha("email|demo9@demo-test.invalid") };
  return { env, raw, db, adapter, mails, clock, pub: kp.publicB64u, priv: kp.privateKey, origin, people };
}

/** the same story as tools/fake-game seedGames: Alice owns seven games, is accepted Host of Bob's, and invited as Co-host of Carol's */
export function seed(h: Host) {
  const T0 = h.clock.ms;
  const { alice, bob, carol } = h.people;
  h.raw.run("INSERT INTO organizer_email VALUES (?,?)", [alice, "orgA"]); h.raw.run("INSERT INTO organizer_email VALUES (?,?)", [bob, "orgB"]); h.raw.run("INSERT INTO organizer_email VALUES (?,?)", [carol, "orgC"]);
  const g = (id: string, org: string, name: string, status: string, start: number | null, cap: number, pack: number, created: number, pay: string, minor: number | null, label: string, next: string) =>
    h.raw.run("INSERT INTO engagement(id,org,name,status,start_ms,cap,pack,created_ms,pay_state,pay_minor,org_label,next_action) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [id, org, name, status, start, cap, pack, created, pay, minor, label, next]);
  g("DRAFT01", "orgA", "DRAFT01 party", "draft", T0 + 3 * DAY, 100, 0, T0 - 5 * DAY, "none", null, "Acme Corp", "publish");
  g("WAIT001", "orgA", "WAIT001 party", "waiting_payment", T0 + 3 * DAY, 250, 0, T0 - 5 * DAY, "waiting", null, "Acme Corp", "pay");
  g("READY01", "orgA", "READY01 party", "ready", T0 + 2 * 3600_000, 100, 100, T0 - 5 * DAY, "paid", 239900, "Acme Corp", "share");
  g("PLAY001", "orgA", "PLAY001 party", "playing", T0 - 600_000, 100, 250, T0 - 5 * DAY, "paid", 349900, "Acme Corp", "run");
  g("DONE001", "orgA", "DONE001 party", "finished", T0 - 2 * DAY, 100, 100, T0 - 5 * DAY, "paid", 239900, "Acme Corp", "none");
  g("CANC001", "orgA", "CANC001 party", "cancelled", T0 + 3 * DAY, 100, 100, T0 - 5 * DAY, "credit", null, "Acme Corp", "none");
  g("NOST001", "orgA", "NOST001 party", "not_started", T0 - DAY, 100, 100, T0 - 5 * DAY, "paid", 239900, "Acme Corp", "none");
  g("BOBS001", "orgB", "Bob's quiz night", "ready", T0 + DAY, 100, 100, T0 - 2 * DAY, "paid", 239900, "Bob Industries", "none");
  g("CARO001", "orgC", "Carol's launch", "ready", T0 + 2 * DAY, 250, 250, T0 - DAY, "paid", 349900, "Carol & Co", "none");
  h.raw.run("INSERT INTO game_role VALUES ('aaaaaaaaaa','BOBS001','host',?,?, 'accepted',?,?, 'orgB')", [alice, "sealed:" + btoa("demo5@demo-test.invalid"), T0 - DAY, T0 - DAY]);
  h.raw.run("INSERT INTO game_role VALUES ('bbbbbbbbbb','CARO001','cohost',?,?, 'invited',?,NULL, 'orgC')", [alice, "sealed:" + btoa("demo5@demo-test.invalid"), T0 - DAY]);
  h.raw.run("INSERT INTO bill VALUES (?,?,?,?,?,?,?,?,?)", ["orgA", T0 - 3 * DAY, "READY01", "READY01 party", "pack", 239900, "paid", "organizer", "/api/invoice/inv_" + "a".repeat(32)]);
  h.raw.run("INSERT INTO bill VALUES (?,?,?,?,?,?,?,?,?)", ["orgA", T0 - 2 * DAY, "PLAY001", "PLAY001 party", "pack", 349900, "paid", "host", "/api/invoice/inv_" + "b".repeat(32)]);
  h.raw.run("INSERT INTO bill VALUES (?,?,?,?,?,?,?,?,?)", ["orgA", T0 - DAY, "WAIT001", "WAIT001 party", "pack", 349900, "waiting", "organizer", null]);
  h.raw.run("INSERT INTO credit VALUES (?,?,?,?)", ["orgA", 239900, "INR", T0 + 300 * DAY]);
  h.raw.run("INSERT INTO invited VALUES (?,?,?)", [alice, "BOBS001", h.origin + "/z.html?e=BOBS001#p=personal"]);
}
