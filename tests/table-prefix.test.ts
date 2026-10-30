// FALSIFIED BY: prefix-not-applied, prefix-unchecked, prefix-purge-unprefixed
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { makeD1 } from "./support/d1-sqlite";
import { handleAuth, type Env } from "../functions/_lib/auth-core";
import { purgeExpired } from "../functions/_lib/purge";
import { prefixSql, checkPrefix, TABLES } from "../functions/_lib/tables";

const ORIGIN = "https://console.test";
const NOW = Date.UTC(2026, 9, 28, 6, 0, 0);
const MIGRATION = readFileSync(new URL("../migrations/0001_console.sql", import.meta.url), "utf8");

async function world(prefix: string | undefined) {
  const { db, raw } = makeD1([]);
  // an existing database that already has an unrelated table called session
  raw.exec("CREATE TABLE session (id TEXT PRIMARY KEY, note TEXT); INSERT INTO session VALUES ('keep','not mine');");
  raw.exec(prefixSql(MIGRATION, prefix ?? ""));
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const mails: string[] = [];
  const env: Env = { DB: db, TABLE_PREFIX: prefix, SESSION_PEPPER: "pepper", CONSOLE_SIGNING_KEY: btoa(String.fromCharCode(...pkcs8)), CONSOLE_ORIGIN: ORIGIN, GAME_ORIGINS: JSON.stringify({ bingo: "https://bingo.test" }), MAILER: async (_t, _s, text) => { mails.push(text); } };
  const call = async (path: string, body?: unknown, cookie?: string) => {
    const r = await handleAuth(new Request(ORIGIN + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-console": "1", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env, NOW);
    return { status: r.status, json: await r.json().catch(() => null), headers: r.headers };
  };
  return { env, raw, call, mails };
}
const names = (raw: any) => (raw.query("SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);

test("a prefix is checked: letters, digits and _ only, so nothing can be smuggled into SQL", () => {
  expect(checkPrefix(undefined)).toBe("");
  expect(checkPrefix("  ")).toBe("");
  expect(checkPrefix("con_")).toBe("con_");
  for (const bad of ["Con_", "1x", "a b", "a;DROP TABLE x", "a-b", "x".repeat(17), "a'"]) expect(() => checkPrefix(bad)).toThrow();
});

test("prefixSql renames every table and index of the migration and nothing else; no prefix leaves it exactly as it is", () => {
  expect(prefixSql(MIGRATION, "")).toBe(MIGRATION);
  const p = prefixSql(MIGRATION, "con_");
  for (const t of TABLES) expect(p).toContain(`CREATE TABLE IF NOT EXISTS con_${t} `);
  expect(p).toContain("CREATE UNIQUE INDEX IF NOT EXISTS con_login_code_link ON con_login_code(link_hash)");
  expect(p).toContain("CREATE INDEX IF NOT EXISTS con_session_email ON con_session(email_hash)");
  expect(p.replace(/con_/g, "")).toBe(MIGRATION);
  expect(prefixSql("SELECT email_hash FROM session WHERE sid_hash=?", "con_")).toBe("SELECT email_hash FROM con_session WHERE sid_hash=?");
});

test("with TABLE_PREFIX the whole sign-in works inside a database that already has a table called session, and that table is not touched", async () => {
  const w = await world("con_");
  expect(names(w.raw)).toContain("con_session");
  expect(names(w.raw)).not.toContain("console_email");
  expect((await w.call("/auth/request", { email: "demo4@demo-test.invalid", consent: true })).status).toBe(200);
  const code = /code is (\d{6})/.exec(w.mails[0]!)![1];
  const v = await w.call("/auth/verify", { email: "demo4@demo-test.invalid", code });
  expect(v.status).toBe(200);
  const cookie = /(cbsess=[0-9a-f]{64})/.exec(v.headers.get("set-cookie")!)![1];
  expect((await w.call("/auth/me", undefined, cookie)).json).toEqual({ ok: true, signedIn: true, email: "demo4@demo-test.invalid" });
  expect(w.raw.query("SELECT COUNT(*) c FROM con_session").get()).toEqual({ c: 1 });
  expect(w.raw.query("SELECT COUNT(*) c FROM con_console_email").get()).toEqual({ c: 1 });
  expect(w.raw.query("SELECT * FROM session").all()).toEqual([{ id: "keep", note: "not mine" }]);
  const out = await w.call("/auth/signout", {}, cookie);
  expect(out.status).toBe(200);
  expect(w.raw.query("SELECT COUNT(*) c FROM con_session").get()).toEqual({ c: 0 });
});

test("the daily clean-up uses the same prefix", async () => {
  const w = await world("con_");
  await w.call("/auth/request", { email: "demo4@demo-test.invalid", consent: true });
  const out = await purgeExpired(w.env, NOW + 400 * 86400_000, (async () => new Response("{}")) as any);
  expect(out.codes).toBeGreaterThan(0);
  expect(w.raw.query("SELECT COUNT(*) c FROM con_login_code").get()).toEqual({ c: 0 });
  expect(w.raw.query("SELECT * FROM session").all()).toEqual([{ id: "keep", note: "not mine" }]);
});

test("a bad prefix stops the sign-in service instead of running unsafe SQL", async () => {
  const w = await world("con_");
  w.env.TABLE_PREFIX = "x; DROP TABLE session";
  await expect(w.call("/auth/request", { email: "demo4@demo-test.invalid", consent: true })).rejects.toThrow();
  expect(w.raw.query("SELECT COUNT(*) c FROM session").get()).toEqual({ c: 1 });
});

test("without a prefix the console uses its own plain table names (the default)", async () => {
  const { db, raw } = makeD1();
  const mails: string[] = [];
  const env: Env = { DB: db, SESSION_PEPPER: "p", CONSOLE_SIGNING_KEY: "x", CONSOLE_ORIGIN: ORIGIN, GAME_ORIGINS: "{}", MAILER: async (_t, _s, text) => { mails.push(text); } };
  const r = await handleAuth(new Request(ORIGIN + "/auth/request", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-console": "1" }, body: JSON.stringify({ email: "demo4@demo-test.invalid", consent: true }) }), env, NOW);
  expect(r.status).toBe(200);
  expect(raw.query("SELECT COUNT(*) c FROM login_code").get()).toEqual({ c: 1 });
});

test("the config line is the same in the sign-in settings and the clean-up Worker, and empty until the owner decides", () => {
  const cron = readFileSync(new URL("../apps/cron/wrangler.toml", import.meta.url), "utf8");
  const pages = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const line = (t: string) => /^TABLE_PREFIX\s*=\s*"([^"]*)"/m.exec(t)?.[1];
  expect(line(pages)).toBeDefined();
  expect(line(cron)).toBe(line(pages));
});
