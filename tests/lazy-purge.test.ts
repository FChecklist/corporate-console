// FALSIFIED BY: lazy-claim-always, lazy-marker-purged, lazy-no-cap, lazy-wrapper-wrong-path, lazy-wrapper-awaited
// The console's clean-up WITHOUT the cron Worker (2026-10-30): the pages do it themselves, in the background, at most once a day. The same clean-up as the Worker (purgeExpired), so the 365-day rule and the expired codes and sessions are handled.
import { test, expect, setDefaultTimeout } from "bun:test";
import { makeD1 } from "./support/d1-sqlite";
import type { Env } from "../functions/_lib/auth-core";
import { lazyPurge, LAZY_MARKER, DAY_MS } from "../functions/_lib/purge";
import { onRequest } from "../functions/auth/[[path]]";

setDefaultTimeout(60_000);
const NOW = Date.UTC(2026, 9, 30, 6, 0, 0);
async function world(games = "{}") {
  const { db, raw } = makeD1();
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const env: Env = { DB: db, SESSION_PEPPER: "pepper", CONSOLE_SIGNING_KEY: btoa(String.fromCharCode(...pkcs8)), CONSOLE_ORIGIN: "https://console.test", GAME_ORIGINS: games } as any;
  return { env, raw };
}
const count = (raw: any, table: string) => raw.query(`SELECT COUNT(*) AS n FROM ${table}`).get().n as number;
const noGames = (async () => new Response("{}")) as any;

test("the first call after the day is up claims the clean-up and does it: old codes, sessions and rate rows go; the marker stays", async () => {
  const { env, raw } = await world();
  raw.run("INSERT INTO login_code(email_hash,email_sealed,code_hash,link_hash,expires_ms,attempts,sent_ms) VALUES('h1','s','c','l1',?,0,?)", [NOW - 3 * DAY_MS, NOW - 3 * DAY_MS]);
  raw.run("INSERT INTO session(sid_hash,email_hash,created_ms,last_seen_ms,expires_ms) VALUES('s1','h1',?,?,?)", [NOW - 9 * DAY_MS, NOW - 9 * DAY_MS, NOW - DAY_MS]);
  raw.run("INSERT INTO rate(k,n,win_start_ms) VALUES('old',3,?)", [NOW - 5 * 3600_000]);
  const out = await lazyPurge(env, NOW, noGames);
  expect(out).toMatchObject({ codes: 1, sessions: 1, rates: 1 });
  expect(count(raw, "login_code") + count(raw, "session")).toBe(0);
  expect(raw.query("SELECT k FROM rate").all().map((r: any) => r.k)).toEqual([LAZY_MARKER]); // the clean-up never removes its own marker
});

test("only once a day: a second call the same day does nothing; the next day it runs again; two calls at the same moment run it once", async () => {
  const { env } = await world();
  expect(await lazyPurge(env, NOW, noGames)).not.toBe(null);
  expect(await lazyPurge(env, NOW + 3600_000, noGames)).toBe(null);
  expect(await lazyPurge(env, NOW + DAY_MS - 1000, noGames)).toBe(null);
  expect(await lazyPurge(env, NOW + DAY_MS + 1000, noGames)).not.toBe(null);
  const w2 = await world();
  const both = await Promise.all([lazyPurge(w2.env, NOW, noGames), lazyPurge(w2.env, NOW, noGames), lazyPurge(w2.env, NOW, noGames)]);
  expect(both.filter((x) => x !== null).length).toBe(1);
});

test("the 365-day rule runs too, a few e-mails at a time: 25 due e-mails go 20 on the first day and 5 on the second", async () => {
  const { env, raw } = await world();
  const old = NOW - 400 * DAY_MS;
  for (let i = 0; i < 25; i++) raw.run("INSERT INTO console_email(email_hash,email_sealed,created_ms,last_seen_ms) VALUES(?,?,?,?)", ["e" + i, "sealed", old, old + i]);
  raw.run("INSERT INTO console_email(email_hash,email_sealed,created_ms,last_seen_ms) VALUES('fresh','sealed',?,?)", [NOW - DAY_MS, NOW - DAY_MS]);
  const d1 = await lazyPurge(env, NOW, noGames);
  expect(d1!.emails).toBe(20);
  expect(count(raw, "console_email")).toBe(6);
  const d2 = await lazyPurge(env, NOW + DAY_MS + 1000, noGames);
  expect(d2!.emails).toBe(5);
  expect(raw.query("SELECT email_hash FROM console_email").all().map((r: any) => r.email_hash)).toEqual(["fresh"]); // someone who signed in recently is never touched
});

test("the pages trigger it: opening the console (GET /auth/me) or asking for a code (POST /auth/request) starts it in the background; other calls do not; a failing clean-up never shows", async () => {
  const { env } = await world();
  const run = async (method: string, path: string, e: any = env) => {
    const waits: Promise<unknown>[] = [];
    const res = await onRequest({ request: new Request("https://console.test" + path, { method, headers: { "x-console": "1", origin: "https://console.test", "content-type": "application/json" }, body: method === "POST" ? "{}" : undefined }), env: e, waitUntil: (p) => { waits.push(p); } });
    await Promise.all(waits);
    return { res, waits: waits.length };
  };
  const me = await run("GET", "/auth/me");
  expect(me.waits).toBe(1);
  expect(await me.res.json()).toEqual({ ok: true, signedIn: false });
  expect((await run("POST", "/auth/verify")).waits).toBe(0);
  expect((await run("GET", "/auth/link")).waits).toBe(0);
  expect((await run("POST", "/auth/request")).waits).toBe(1);
  const broken = { ...env, DB: { prepare: () => { throw new Error("db down"); } } } as any;
  const bad = await run("GET", "/auth/me", broken).catch((e) => e);
  expect(bad instanceof Error).toBe(false); // the clean-up's failure is swallowed
});
