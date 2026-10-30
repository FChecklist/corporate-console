// FALSIFIED BY: email-no-nfkc, email-no-lowercase, email-bridge-old-reading, email-auth-own-reading, email-signin-copy-differs
// Owner rule 30 Oct 2026: an e-mail ID is NOT case-sensitive. One normalizer (NFKC, trim, lower case); only that form is hashed, stored, compared, shown.
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeD1 } from "./support/d1-sqlite";
import { handleAuth, emailHashOf, type Env } from "../functions/_lib/auth-core";
import { normEmail } from "../packages/bridge/src/email";

const ROOT = join(import.meta.dir, "..");
const NOW = Date.UTC(2026, 9, 30, 6, 0, 0), ORIGIN = "https://console.test";
const variants = (s: string) => { const out: string[] = []; for (let m = 0; m < 16; m++) out.push(s.replace(/demo/, (d) => [...d].map((c, i) => ((m >> i) & 1 ? c.toUpperCase() : c)).join(""))); return out; };

async function world() {
  const { db, raw } = makeD1();
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const mails: Array<{ to: string; text: string }> = [];
  const env = { DB: db, SESSION_PEPPER: "p", CONSOLE_SIGNING_KEY: btoa(String.fromCharCode(...pkcs8)), CONSOLE_ORIGIN: ORIGIN, GAME_ORIGINS: "{}", MAILER: async (to: string, _s: string, text: string) => { mails.push({ to, text }); } } as unknown as Env;
  let n = 0, shift = 0;
  const call = async (method: string, path: string, body?: unknown, cookie?: string) => {
    const r = await handleAuth(new Request(ORIGIN + path, { method, headers: { "content-type": "application/json", origin: ORIGIN, "x-console": "1", "cf-connecting-ip": "10.1.0." + (n++ % 250), ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env, NOW + shift);
    return { status: r.status, json: (await r.json().catch(() => null)) as any, headers: r.headers };
  };
  return { env, raw, mails, call, hour: () => { shift += 3600_000; } };
}

test("all 16 capital/small variants of one address read as the same address", async () => {
  const base = "demo1@demo-test.invalid", hash = await emailHashOf(base);
  for (const v of variants(base)) {
    expect([v, normEmail(v)]).toEqual([v, base]);
    expect([v, await emailHashOf(v)]).toEqual([v, hash]);
  }
  expect(normEmail("demo1@DEMO-TEST.INVALID")).toBe(base);
});

test("spaces, a tab, a wide space, the full-width @ and full-width letters are read as the plain address", () => {
  const base = "demo1@demo-test.invalid";
  for (const v of ["  demo1@demo-test.invalid  ", "\t" + base + "\n", "　demo1@demo-test.invalid　", "demo1＠demo-test.invalid", "ＤＥＭＯ1" + "@demo-test.invalid", "ＤＥＭＯ１＠ＤＥＭＯ－ＴＥＳＴ．ＩＮＶＡＬＩＤ"]) expect([v, normEmail(v)]).toEqual([v, base]);
});

test("spaces inside an address are removed too", () => {
  expect(normEmail(" demo1 @ demo-test .invalid ")).toBe("demo1@demo-test.invalid");
});

test("signing in as every variant reaches the same account: request, code, link, session, display, no second record", async () => {
  const w = await world(), base = "demo1@demo-test.invalid";
  for (const v of variants(base)) {
    w.hour(); // a new hour, so the per-address mail limit does not get in the way
    expect((await w.call("POST", "/auth/request", { email: v, consent: true })).status).toBe(200);
    const m = w.mails[w.mails.length - 1];
    expect(m.to).toBe(base);
    const ver = await w.call("POST", "/auth/verify", { email: v.toUpperCase(), code: m.text.match(/code is (\d{6})/)![1] });
    expect(ver.status).toBe(200);
    const cookie = /(cbsess=[0-9a-f]{64})/.exec(ver.headers.get("set-cookie")!)![1];
    expect((await w.call("GET", "/auth/me", undefined, cookie)).json.email).toBe(base);
  }
  expect(w.raw.query("SELECT COUNT(*) c FROM console_email").get()).toEqual({ c: 1 });
  await w.call("POST", "/auth/request", { email: "  ＤＥＭＯ1＠demo-test.invalid ", consent: true });
  const link = w.mails[w.mails.length - 1].text.match(/t=([0-9a-f]{48})/)![1];
  expect((await w.call("POST", "/auth/link", { t: link })).status).toBe(200);
  expect(w.raw.query("SELECT COUNT(*) c FROM console_email").get()).toEqual({ c: 1 });
});

test("the sign-in service and the bridge read addresses only through normEmail; the sign-in page has an identical copy; the employee-ID cleaner is never used on an e-mail", () => {
  const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
  const fn = /export const normEmail = \(e: string\): string => ([^;]+);/.exec(src("packages/bridge/src/email.ts"))![1];
  const copy = /const normEmail = \(e\) => ([^;]+);/.exec(src("public/screens/signin.js"))![1];
  expect(copy.replace(/\s+/g, "")).toBe(fn.replace(/\s+/g, ""));
  for (const p of ["functions/_lib/auth-core.ts", "packages/bridge/src/bridge.ts"]) {
    expect([p, /normEmail/.test(src(p))]).toEqual([p, true]);
    expect([p, /email[^\n;]*\.toLowerCase\(\)/i.test(src(p))]).toEqual([p, false]);
  }
  expect(/emailHash[^\n]*NFKC/.test(src("tools/fake-game/server.mjs"))).toBe(true);
  for (const p of ["functions/_lib/auth-core.ts", "packages/bridge/src/bridge.ts", "public/screens/signin.js"]) expect([p, /cleanEmployeeId|employee-id/i.test(src(p))]).toEqual([p, false]);
});
