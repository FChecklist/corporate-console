// FALSIFIED BY: mail-invalid-sent, mail-invalid-not-recorded, mail-real-not-sent, mail-case-blind, mail-rule-regex-wide
// Test addresses (owner rule 30 Oct 2026): every test, fixture and scenario uses demoN@demo-test.invalid. They can never be delivered, so the mail sender must NEVER give them to the real mail service: it only records them.
import { test, expect, setDefaultTimeout } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { makeD1 } from "./support/d1-sqlite";
import { handleAuth, recordedMail, isTestAddress, type Env } from "../functions/_lib/auth-core";

setDefaultTimeout(30_000);
const ORIGIN = "https://console.test", NOW = Date.UTC(2026, 9, 30, 6, 0, 0);
async function world(extra: any = {}) {
  const { db } = makeD1();
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  return { DB: db, SESSION_PEPPER: "p", CONSOLE_SIGNING_KEY: btoa(String.fromCharCode(...pkcs8)), CONSOLE_ORIGIN: ORIGIN, GAME_ORIGINS: "{}", RESEND_API_KEY: "test-key-not-real", ...extra } as Env;
}
const ask = (env: Env, email: string) => handleAuth(new Request(ORIGIN + "/auth/request", { method: "POST", headers: { "content-type": "application/json", "x-console": "1", origin: ORIGIN, "cf-connecting-ip": "10.0.0." + Math.floor(Math.random() * 200) }, body: JSON.stringify({ email, consent: true }) }), env, NOW);
async function spying<T>(run: () => Promise<T>) {
  const calls: string[] = [], saved = globalThis.fetch;
  (globalThis as any).fetch = async (u: any) => { calls.push(String(u)); return new Response("{}", { status: 200 }); };
  try { return { out: await run(), calls }; } finally { (globalThis as any).fetch = saved; }
}

test("an address that ends in .invalid is never given to the mail service: the sign-in works and the mail is only recorded", async () => {
  recordedMail.length = 0;
  const env = await world();
  const { out, calls } = await spying(() => ask(env, "demo1@demo-test.invalid"));
  expect(out.status).toBe(200);
  expect(calls.filter((u) => u.includes("resend"))).toEqual([]);
  expect(recordedMail.length).toBe(1);
  expect(recordedMail[0].to).toBe("demo1@demo-test.invalid");
  expect(recordedMail[0].subject).toMatch(/^Your sign-in code is \d{6}$/);
});

test("any other address still goes to the real mail service, once, to that address only", async () => {
  recordedMail.length = 0;
  const env = await world();
  const { out, calls } = await spying(() => ask(env, "someone@example.org"));
  expect(out.status).toBe(200);
  expect(calls.filter((u) => u.includes("api.resend.com")).length).toBe(1);
  expect(recordedMail.length).toBe(0);
});

test("the rule reads the address carefully: capitals and spaces count, a look-alike does not", () => {
  for (const a of ["demo1@demo-test.invalid", "Demo2@Demo-Test.INVALID", "  demo3@demo-test.invalid  "]) expect([a, isTestAddress(a)]).toEqual([a, true]);
  for (const a of ["demo1@demo-test.invalid.com", "demo1@invalid", "invalid@gmail.com", "demo1@demo-test.invalidx", "raajat.agarwal@gmail.com"]) expect([a, isTestAddress(a)]).toEqual([a, false]);
});

test("a test mailer set by a test still sees the mail of a test address, and the real service still does not", async () => {
  const seen: string[] = [];
  const env = await world({ MAILER: async (to: string) => { seen.push(to); } });
  const { calls } = await spying(() => ask(env, "demo4@demo-test.invalid"));
  expect(seen).toEqual(["demo4@demo-test.invalid"]);
  expect(calls.filter((u) => u.includes("resend"))).toEqual([]);
});

test("every e-mail address in the tests, the test tools and the fixtures is a demoN@demo-test.invalid (or the help address)", () => {
  const ROOT = join(import.meta.dir, "..");
  const OK = /^(demo\d+@demo-test\.invalid|hello@corporatetambola\.com|console@corporatetambola\.com)$/i;
  const bad: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (!/^(node_modules|mutations)$/.test(e.name)) walk(p); continue; }
      if (!/\.(ts|js|mjs|json)$/.test(e.name) || /mail-test-mode\.test\.ts$/.test(e.name)) continue;
      for (const m of readFileSync(p, "utf8").matchAll(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) if (!OK.test(m[0]) && !/^(you@yourcompany\.com|name@company\.com|evil|x)@/.test(m[0]) && !/@evil\./.test(m[0])) bad.push(p.slice(ROOT.length + 1) + ": " + m[0]);
    }
  };
  for (const d of ["tests", "packages/bridge/test-kit", "tools/fake-game", "tools/browser-tests"]) walk(join(ROOT, d));
  expect(bad).toEqual([]);
});
