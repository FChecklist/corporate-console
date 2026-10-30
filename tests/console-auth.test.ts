// FALSIFIED BY: auth-attempt-limit-raised, auth-exists-leak, auth-link-get-consumes, auth-cookie-not-httponly, auth-csrf-skipped, auth-purge-boundary, auth-demo-always-on, auth-assert-em-always, auth-close-keeps-email, auth-close-one-device, auth-code-ttl-10min, auth-cookie-strict, auth-session-30-days, auth-me-no-cookie-refresh
import { test, expect } from "bun:test";
import { makeD1 } from "./support/d1-sqlite";
import { handleAuth, emailHashOf, type Env } from "../functions/_lib/auth-core";
import { purgeExpired, deleteAtMs, istDayStart, DAY_MS } from "../functions/_lib/purge";
import { verifyAssertion, parseKeyList, b64uEncode } from "../packages/bridge/src/assertion";

const NOW = Date.UTC(2026, 9, 28, 6, 0, 0);
const ORIGIN = "https://console.test";
const GAMES = { tambola: "https://housie.test", bingo: "https://bingo.test" };

async function setup(extra: Partial<Env> = {}) {
  const { db, raw } = makeD1();
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const mails: Array<{ to: string; subject: string; text: string }> = [];
  const env: Env = { DB: db, SESSION_PEPPER: "pepper-for-tests", CONSOLE_SIGNING_KEY: btoa(String.fromCharCode(...pkcs8)), CONSOLE_ORIGIN: ORIGIN, GAME_ORIGINS: JSON.stringify(GAMES), MAILER: async (to, subject, text) => { mails.push({ to, subject, text }); }, ...extra };
  const keys = parseKeyList("k1:" + b64uEncode(pub));
  let t = NOW;
  const call = async (method: string, path: string, body?: unknown, o: { cookie?: string; headers?: Record<string, string>; ip?: string; now?: number } = {}) => {
    const headers: Record<string, string> = { "content-type": "application/json", origin: ORIGIN, "x-console": "1", "cf-connecting-ip": o.ip || "1.2.3.4", ...(o.cookie ? { cookie: o.cookie } : {}), ...(o.headers || {}) };
    for (const k of Object.keys(headers)) if (headers[k] === "") delete headers[k];
    const r = await handleAuth(new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, o.now ?? t);
    return { status: r.status, text: await r.clone().text(), json: await r.json().catch(() => null), headers: r.headers };
  };
  const codeOf = (i = mails.length - 1) => /code is (\d{6})/.exec(mails[i].text)![1];
  const linkOf = (i = mails.length - 1) => /t=([0-9a-f]{48})/.exec(mails[i].text)![1];
  const signIn = async (email: string, o: { now?: number; ip?: string } = {}) => {
    await call("POST", "/auth/request", { email, consent: true }, o);
    const v = await call("POST", "/auth/verify", { email, code: codeOf() }, o);
    const cookie = /(cbsess=[0-9a-f]{64})/.exec(v.headers.get("set-cookie") || "")?.[1];
    return { v, cookie: cookie! };
  };
  return { env, raw, db, mails, keys, call, codeOf, linkOf, signIn, advance: (ms: number) => { t += ms; }, now: () => t };
}

test("sign-in by code: ask, get one mail with a 6-digit code and a link, verify, get a cookie", async () => {
  const s = await setup();
  const r = await s.call("POST", "/auth/request", { email: "Demo4@Demo-Test.invalid", consent: true });
  expect(r.status).toBe(200);
  expect(s.mails.length).toBe(1);
  expect(s.mails[0].to).toBe("demo4@demo-test.invalid");
  expect(s.mails[0].subject).toBe(`Your sign-in code is ${/code is (\d{6})/.exec(s.mails[0].text)![1]}`); // the code is readable in the inbox list
  expect(s.mails[0].text).toMatch(/code is \d{6}/);
  expect(s.mails[0].text).toContain(ORIGIN + "/signin.html?t=");
  const v = await s.call("POST", "/auth/verify", { email: "demo4@demo-test.invalid", code: s.codeOf() });
  expect(v.status).toBe(200);
  const me = await s.call("GET", "/auth/me", undefined, { cookie: /(cbsess=[0-9a-f]{64})/.exec(v.headers.get("set-cookie")!)![1] });
  expect(me.json).toEqual({ ok: true, signedIn: true, email: "demo4@demo-test.invalid" });
});

test("consent is required; a bad e-mail is refused before anything is sent", async () => {
  const s = await setup();
  expect((await s.call("POST", "/auth/request", { email: "demo11@demo-test.invalid" })).json.error).toBe("consent");
  expect((await s.call("POST", "/auth/request", { email: "nonsense", consent: true })).json.error).toBe("invalid");
  expect(s.mails.length).toBe(0);
});

test("the cookie has exactly these flags: HttpOnly, Secure, SameSite=Lax, Path=/, 5 years", async () => {
  const s = await setup();
  const { v } = await s.signIn("demo4@demo-test.invalid");
  expect(v.headers.get("set-cookie")).toMatch(/^cbsess=[0-9a-f]{64}; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=157680000$/);
});

test("5 wrong codes lock the code: even the right one fails afterwards", async () => {
  const s = await setup();
  await s.call("POST", "/auth/request", { email: "demo4@demo-test.invalid", consent: true });
  const right = s.codeOf(), wrong = right === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) expect((await s.call("POST", "/auth/verify", { email: "demo4@demo-test.invalid", code: wrong })).status).toBe(401);
  expect((await s.call("POST", "/auth/verify", { email: "demo4@demo-test.invalid", code: right })).status).toBe(401);
});

test("4 wrong codes do not lock: the right one still works", async () => {
  const s = await setup();
  await s.call("POST", "/auth/request", { email: "demo4@demo-test.invalid", consent: true });
  const right = s.codeOf(), wrong = right === "000000" ? "111111" : "000000";
  for (let i = 0; i < 4; i++) await s.call("POST", "/auth/verify", { email: "demo4@demo-test.invalid", code: wrong });
  expect((await s.call("POST", "/auth/verify", { email: "demo4@demo-test.invalid", code: right })).status).toBe(200);
});

test("a code works once and only for 30 minutes", async () => {
  const s = await setup();
  await s.call("POST", "/auth/request", { email: "demo4@demo-test.invalid", consent: true });
  const code = s.codeOf();
  expect((await s.call("POST", "/auth/verify", { email: "demo4@demo-test.invalid", code }, { now: NOW + 30 * 60_000 + 1 })).status).toBe(401);
  await s.call("POST", "/auth/request", { email: "demo4@demo-test.invalid", consent: true });
  const c2 = s.codeOf();
  expect((await s.call("POST", "/auth/verify", { email: "demo4@demo-test.invalid", code: c2 })).status).toBe(200);
  expect((await s.call("POST", "/auth/verify", { email: "demo4@demo-test.invalid", code: c2 })).status).toBe(401);
});

test("the 9th mail within an hour is refused and says how long to wait, the 9th after an hour is fine", async () => {
  const s = await setup();
  for (let i = 0; i < 8; i++) expect((await s.call("POST", "/auth/request", { email: "demo4@demo-test.invalid", consent: true }, { ip: "9.9.9." + i })).status).toBe(200);
  const refused = await s.call("POST", "/auth/request", { email: "demo4@demo-test.invalid", consent: true }, { ip: "9.9.9.9" });
  expect(refused.status).toBe(429);
  expect(refused.json.message).toMatch(/wait \d+ minutes? and try again, or write to hello@corporatetambola\.com/);
  expect(s.mails.length).toBe(8);
  expect((await s.call("POST", "/auth/request", { email: "demo4@demo-test.invalid", consent: true }, { now: NOW + 3600_000 + 1, ip: "9.9.9.9" })).status).toBe(200);
});

test("one office address (IP) may ask for 60 mails an hour, the 61st is refused", async () => {
  const s = await setup();
  for (let i = 0; i < 60; i++) expect((await s.call("POST", "/auth/request", { email: `p${i}@acme.com`, consent: true }, { ip: "7.7.7.7" })).status).toBe(200);
  expect((await s.call("POST", "/auth/request", { email: "demo25@demo-test.invalid", consent: true }, { ip: "7.7.7.7" })).status).toBe(429);
});

test("a known and an unknown e-mail get the same answer, byte for byte", async () => {
  const s = await setup();
  await s.signIn("demo15@demo-test.invalid");
  const a = await s.call("POST", "/auth/request", { email: "demo15@demo-test.invalid", consent: true }, { ip: "5.5.5.5" });
  const b = await s.call("POST", "/auth/request", { email: "demo26@demo-test.invalid", consent: true }, { ip: "5.5.5.6" });
  expect(a.status).toBe(b.status);
  expect(a.text).toBe(b.text);
  expect(a.text).not.toContain("exists");
});

test("the one-tap link: opening it (GET) consumes nothing; the button (POST) works once", async () => {
  const s = await setup();
  await s.call("POST", "/auth/request", { email: "demo4@demo-test.invalid", consent: true });
  const t = s.linkOf();
  for (let i = 0; i < 3; i++) expect((await s.call("GET", "/auth/link?t=" + t)).status).toBe(200); // a mail scanner opening it three times
  const first = await s.call("POST", "/auth/link", { t });
  expect(first.status).toBe(200);
  expect(first.headers.get("set-cookie")).toContain("cbsess=");
  expect((await s.call("POST", "/auth/link", { t })).status).toBe(401);
});

test("a link older than 30 minutes does nothing", async () => {
  const s = await setup();
  await s.call("POST", "/auth/request", { email: "demo4@demo-test.invalid", consent: true });
  expect((await s.call("POST", "/auth/link", { t: s.linkOf() }, { now: NOW + 30 * 60_000 + 1 })).status).toBe(401);
});

test("every POST needs the X-Console header and the console's own Origin", async () => {
  const s = await setup();
  const body = { email: "demo4@demo-test.invalid", consent: true };
  expect((await s.call("POST", "/auth/request", body, { headers: { "x-console": "" } })).status).toBe(403);
  expect((await s.call("POST", "/auth/request", body, { headers: { origin: "https://evil.example" } })).status).toBe(403);
  expect((await s.call("POST", "/auth/request", body)).status).toBe(200);
  expect(s.mails.length).toBe(1);
});

test("test logins demo1/2/demo7@demo-test.invalid with code 123456 exist ONLY when TEST_MODE is set, and send no mail", async () => {
  const off = await setup();
  await off.call("POST", "/auth/request", { email: "demo1@demo-test.invalid", consent: true });
  expect(off.mails.length).toBe(1); // a normal address: a real mail with a random code
  expect((await off.call("POST", "/auth/verify", { email: "demo1@demo-test.invalid", code: "123456" })).status).toBe(off.codeOf() === "123456" ? 200 : 401);
  const on = await setup({ TEST_MODE: "1" });
  await on.call("POST", "/auth/request", { email: "demo2@demo-test.invalid", consent: true });
  expect(on.mails.length).toBe(0);
  expect((await on.call("POST", "/auth/verify", { email: "demo2@demo-test.invalid", code: "123456" })).status).toBe(200);
  await on.call("POST", "/auth/request", { email: "demo24@demo-test.invalid", consent: true });
  expect(on.mails.length).toBe(1); // only the three demo addresses are special
});

test("the e-mail is stored sealed: the database never holds it in plain letters", async () => {
  const s = await setup();
  await s.signIn("demo13@demo-test.invalid");
  const all = JSON.stringify([s.raw.query("SELECT * FROM console_email").all(), s.raw.query("SELECT * FROM login_code").all(), s.raw.query("SELECT * FROM session").all(), s.raw.query("SELECT * FROM rate").all()]);
  expect(all).not.toContain("asha.secret");
  expect(all).toContain(await emailHashOf("demo13@demo-test.invalid"));
});

test("sessions stay until Sign out (they slide 5 years); sign-out ends one, 'everywhere' ends all", async () => {
  const s = await setup();
  const { cookie } = await s.signIn("demo4@demo-test.invalid");
  const day = 86400_000;
  for (let d = 1; d <= 14; d++) expect(((await s.call("GET", "/auth/me", undefined, { cookie, now: NOW + d * 30 * day })).json).signedIn).toBe(true); // used monthly for 420 days: still signed in
  expect(((await s.call("GET", "/auth/me", undefined, { cookie, now: NOW + 14 * 30 * day + 5 * 365 * day + day })).json).signedIn).toBe(false); // 5 idle years end it
  const a = await s.signIn("demo4@demo-test.invalid", { now: NOW + 600 * day }), b = await s.signIn("demo4@demo-test.invalid", { now: NOW + 600 * day, ip: "2.2.2.2" });
  await s.call("POST", "/auth/signout", {}, { cookie: a.cookie, now: NOW + 600 * day });
  expect(((await s.call("GET", "/auth/me", undefined, { cookie: a.cookie, now: NOW + 600 * day })).json).signedIn).toBe(false);
  expect(((await s.call("GET", "/auth/me", undefined, { cookie: b.cookie, now: NOW + 600 * day })).json).signedIn).toBe(true);
  await s.call("POST", "/auth/signout", { everywhere: true }, { cookie: b.cookie, now: NOW + 600 * day });
  expect(((await s.call("GET", "/auth/me", undefined, { cookie: b.cookie, now: NOW + 600 * day })).json).signedIn).toBe(false);
});

test("a code works at 29:59 and not at 30:01; a new request replaces the old code; every visit renews the cookie and the e-mail's 365-day clock", async () => {
  const s = await setup();
  await s.call("POST", "/auth/request", { email: "demo4@demo-test.invalid", consent: true });
  const code = s.codeOf();
  expect((await s.call("POST", "/auth/verify", { email: "demo4@demo-test.invalid", code }, { now: NOW + 30 * 60_000 - 1000 })).status).toBe(200);
  await s.call("POST", "/auth/request", { email: "demo4@demo-test.invalid", consent: true });
  const old = s.codeOf(); await s.call("POST", "/auth/request", { email: "demo4@demo-test.invalid", consent: true }, { ip: "5.5.5.5" });
  expect((await s.call("POST", "/auth/verify", { email: "demo4@demo-test.invalid", code: old })).status).toBe(401);
  const r = await s.call("POST", "/auth/request", { email: "demo4@demo-test.invalid", consent: true }, { ip: "6.6.6.6" });
  expect(r.json.codeMinutes).toBe(30); expect(r.json.expiresMs).toBe(NOW + 30 * 60_000); expect(r.json.message).toContain("30 minutes");
  expect(s.mails[s.mails.length - 1].text).toContain("30 minutes");
  const { cookie } = await s.signIn("demo4@demo-test.invalid", { ip: "7.7.7.7" });
  const later = NOW + 200 * 86400_000, me = await s.call("GET", "/auth/me", undefined, { cookie, now: later });
  expect(me.headers.get("set-cookie")).toMatch(/^cbsess=[0-9a-f]{64}; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=157680000$/);
  const h = await emailHashOf("demo4@demo-test.invalid");
  expect((s.raw.query("SELECT last_seen_ms l FROM console_email WHERE email_hash=?").get(h) as any).l).toBe(later);
});

test("assertions: one per game, 60 seconds, made for that game's address, single-purpose, never the same twice", async () => {
  const s = await setup();
  const { cookie } = await s.signIn("demo4@demo-test.invalid");
  const r = await s.call("POST", "/auth/assert", { requests: [{ game: "tambola", act: "games" }, { game: "bingo", act: "games" }, { game: "nope", act: "games" }, { game: "bingo", act: "bogus" }] }, { cookie });
  expect(r.status).toBe(200);
  const [t, b, bad1, bad2] = r.json.assertions;
  expect(bad1.assertion).toBe(null); expect(bad2.assertion).toBe(null);
  const sub = await emailHashOf("demo4@demo-test.invalid");
  const vt = await verifyAssertion(t.assertion, { keys: s.keys, aud: GAMES.tambola, nowS: Math.floor(NOW / 1000) + 59, act: "games" });
  expect(vt.ok).toBe(true);
  if (vt.ok) { expect(vt.payload.sub).toBe(sub); expect(vt.payload.exp - vt.payload.iat).toBe(60); expect(vt.payload.em).toBeUndefined(); }
  expect((await verifyAssertion(t.assertion, { keys: s.keys, aud: GAMES.bingo, nowS: Math.floor(NOW / 1000) })).ok).toBe(false); // wrong game
  expect((await verifyAssertion(t.assertion, { keys: s.keys, aud: GAMES.tambola, nowS: Math.floor(NOW / 1000) + 91 })).ok).toBe(false); // 60 s + 30 s skew has passed
  const vb = await verifyAssertion(b.assertion, { keys: s.keys, aud: GAMES.bingo, nowS: Math.floor(NOW / 1000) });
  if (vt.ok && vb.ok) expect(vt.payload.jti).not.toBe(vb.payload.jti);
});

test("assertions need a session, and the plain e-mail travels only when asked for AND only for session / role", async () => {
  const s = await setup();
  expect((await s.call("POST", "/auth/assert", { requests: [{ game: "bingo", act: "games" }] })).status).toBe(401);
  const { cookie } = await s.signIn("demo4@demo-test.invalid");
  const r = await s.call("POST", "/auth/assert", { requests: [{ game: "bingo", act: "session", em: true }, { game: "bingo", act: "games", em: true }, { game: "bingo", act: "session" }, { game: "bingo", act: "stepup", sa: "pay", eid: "ABCD1" }, { game: "bingo", act: "stepup" }] }, { cookie });
  const ok = async (a: string) => { const v = await verifyAssertion(a, { keys: s.keys, aud: GAMES.bingo, nowS: Math.floor(NOW / 1000) }); return v.ok ? v.payload : null; };
  expect((await ok(r.json.assertions[0].assertion))!.em).toBe("demo4@demo-test.invalid");
  expect((await ok(r.json.assertions[1].assertion))!.em).toBeUndefined();
  expect((await ok(r.json.assertions[2].assertion))!.em).toBeUndefined();
  const st = (await ok(r.json.assertions[3].assertion))!;
  expect([st.act, st.sa, st.eid]).toEqual(["stepup", "pay", "ABCD1"]);
  expect(r.json.assertions[4].assertion).toBe(null); // a step-up without the action and the game
});

// ---- the 365-day rule ----
const ist = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi) - 19_800_000;

test("deleteAt is midnight IST at the end of day 365 counted from the day of the last sign-in", () => {
  const last = ist(2026, 1, 10, 22, 30); // 10 Jan 2026, 22:30 IST
  expect(istDayStart(last)).toBe(ist(2026, 1, 10));
  expect(deleteAtMs(last)).toBe(ist(2027, 1, 11)); // day 0 = 10 Jan 2026; day 365 = 10 Jan 2027; gone at 00:00 IST on 11 Jan 2027
});

test("purge: an address seen 364 days ago stays, one seen 366 days ago goes, and at the exact IST midnight it goes", async () => {
  const s = await setup();
  const now = ist(2027, 1, 11, 0, 0);
  const put = async (email: string, lastSeen: number) => s.raw.query("INSERT INTO console_email(email_hash,email_sealed,created_ms,last_seen_ms) VALUES(?,?,?,?)").run(await emailHashOf(email), "x", lastSeen, lastSeen);
  await put("demo28@demo-test.invalid", now - 364 * DAY_MS);
  await put("demo23@demo-test.invalid", now - 366 * DAY_MS);
  await put("demo20@demo-test.invalid", ist(2026, 1, 10, 22, 30)); // exactly at its deleteAt
  await put("demo21@demo-test.invalid", ist(2026, 1, 11, 9, 0)); // its deleteAt is a day later
  const calls: string[] = [];
  const out = await purgeExpired(s.env, now, (async (u: string) => { calls.push(String(u)); return new Response("{}", { status: 200 }); }) as any);
  const left = s.raw.query("SELECT email_hash FROM console_email").all().length;
  expect(out.emails).toBe(2);
  expect(left).toBe(2);
  expect(calls.length).toBe(2 * 2); // two removed addresses x two games
  expect(calls.every((u) => u.endsWith("/api/console/purge-email"))).toBe(true);
  const one = await purgeExpired(s.env, now - 1, (async () => new Response("{}")) as any); // one millisecond earlier nothing more is due
  expect(one.emails).toBe(0);
});

test("purge: a game that cannot be reached postpones the deletion for up to a week, then the console deletes anyway", async () => {
  const s = await setup();
  const last = ist(2026, 1, 10, 10);
  s.raw.query("INSERT INTO console_email(email_hash,email_sealed,created_ms,last_seen_ms) VALUES(?,?,?,?)").run("h".repeat(64), "x", last, last);
  const down = (async () => new Response("no", { status: 503 })) as any;
  const day1 = await purgeExpired(s.env, deleteAtMs(last) + 1000, down);
  expect([day1.emails, day1.deferred]).toEqual([0, 1]);
  const later = await purgeExpired(s.env, deleteAtMs(last) + 8 * DAY_MS, down);
  expect(later.emails).toBe(1);
});

test("purge also clears old codes, finished sessions and counters (no personal data is left behind)", async () => {
  const s = await setup();
  const { cookie } = await s.signIn("demo4@demo-test.invalid");
  void cookie;
  const out = await purgeExpired(s.env, NOW + 6 * 365 * DAY_MS, (async () => new Response("{}")) as any);
  expect(out.sessions).toBe(1);
  expect(out.rates).toBeGreaterThan(0);
  expect(s.raw.query("SELECT COUNT(*) c FROM session").get()).toEqual({ c: 0 });
});

test("Close my account: needs a sign-in, then the e-mail, every session and any pending code are gone, and the cookie is cleared", async () => {
  const s = await setup();
  expect((await s.call("POST", "/auth/close", {})).status).toBe(401);
  const a = await s.signIn("demo4@demo-test.invalid");
  const b = await s.signIn("demo4@demo-test.invalid", { ip: "9.9.9.9" });
  await s.signIn("demo18@demo-test.invalid", { ip: "8.8.8.8" });
  await s.call("POST", "/auth/request", { email: "demo4@demo-test.invalid", consent: true }, { ip: "7.7.7.7" }); // a code is pending
  const r = await s.call("POST", "/auth/close", {}, { cookie: a.cookie });
  expect(r.status).toBe(200);
  expect(r.headers.get("set-cookie")).toContain("Max-Age=0");
  expect((await s.call("GET", "/auth/me", undefined, { cookie: a.cookie })).json.signedIn).toBe(false);
  expect((await s.call("GET", "/auth/me", undefined, { cookie: b.cookie })).json.signedIn).toBe(false); // every device
  const h = await emailHashOf("demo4@demo-test.invalid");
  expect(s.raw.query("SELECT COUNT(*) c FROM console_email WHERE email_hash=?").get(h)).toEqual({ c: 0 });
  expect(s.raw.query("SELECT COUNT(*) c FROM login_code WHERE email_hash=?").get(h)).toEqual({ c: 0 });
  expect(s.raw.query("SELECT COUNT(*) c FROM session WHERE email_hash=?").get(h)).toEqual({ c: 0 });
  expect(s.raw.query("SELECT COUNT(*) c FROM console_email").get()).toEqual({ c: 1 }); // another person is untouched
});
