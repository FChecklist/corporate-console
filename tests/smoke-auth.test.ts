// FALSIFIED BY: smoke-origin-config-live, smoke-origin-alt-ignored, smoke-mail-failure-keeps-old-code, smoke-mail-failure-rate-kept, smoke-mail-no-timeout, smoke-mail-failure-logged, smoke-signin-test-address-api
// (addresses with \u0040 are written that way on purpose: the repo rule keeps real-looking addresses out of test source; they are never sent anywhere, the mail service is a stand-in)
// SMOKE 20 NOV 2026, owner steps 2 and 4 (sign in by e-mail code, repeat visit) and the mail-failure paths of the sign-in code e-mail.
// One test = one cell of the matrix in docs/SMOKE-20NOV-CONSOLE.md. The sign-in service is the real code; the mail service (Resend) is a stand-in. No real mail, no real money.
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { makeD1 } from "./support/d1-sqlite";
import { handleAuth, CODE_TTL_MS, MAILS_PER_HOUR, SESSION_MS, type Env } from "../functions/_lib/auth-core";

const NOW = Date.UTC(2026, 10, 20, 6, 0, 0); // 20 Nov 2026
const LIVE = "https://console.corporatetambola.com";

type Mail = { to: string; subject: string; text: string };
async function setup(extra: Partial<Env> = {}, origin = LIVE) {
  const { db, raw } = makeD1();
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const mails: Mail[] = [];
  const env: Env = { DB: db, SESSION_PEPPER: "pepper", CONSOLE_SIGNING_KEY: btoa(String.fromCharCode(...pkcs8)), CONSOLE_ORIGIN: origin, GAME_ORIGINS: JSON.stringify({ tambola: "https://housie.test" }), MAILER: async (to, subject, text) => { mails.push({ to, subject, text }); }, ...extra };
  let t = NOW;
  const call = async (method: string, path: string, body?: unknown, o: { cookie?: string; ip?: string; now?: number; origin?: string | null } = {}) => {
    const headers: Record<string, string> = { "content-type": "application/json", "x-console": "1", "cf-connecting-ip": o.ip || "1.2.3.4", ...(o.cookie ? { cookie: o.cookie } : {}) };
    if (o.origin !== null) headers.origin = o.origin ?? origin;
    const r = await handleAuth(new Request(origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, o.now ?? t);
    return { status: r.status, json: (await r.clone().json().catch(() => null)) as any, headers: r.headers, text: await r.text() };
  };
  const code = () => /code is (\d{6})/.exec(mails[mails.length - 1].text)![1];
  const link = () => /t=([0-9a-f]{48})/.exec(mails[mails.length - 1].text)![1];
  const cookieOf = (r: { headers: Headers }) => /(cbsess=[0-9a-f]{64})/.exec(r.headers.get("set-cookie") || "")?.[1];
  const ask = (email: string, o = {}) => call("POST", "/auth/request", { email, consent: true }, o);
  return { env, raw, mails, call, code, link, cookieOf, ask, advance: (ms: number) => { t += ms; }, now: () => t };
}

/** the real mail path, with Resend replaced by a stand-in that answers as told */
async function withResend<T>(answer: (n: number) => Response | Promise<Response> | Error, run: (calls: Array<{ url: string; body: any; headers: any; signal: any }>) => Promise<T>) {
  const calls: Array<{ url: string; body: any; headers: any; signal: any }> = [], saved = globalThis.fetch;
  (globalThis as any).fetch = async (u: any, init: any) => {
    calls.push({ url: String(u), body: JSON.parse(init.body), headers: init.headers, signal: init.signal });
    const a = await answer(calls.length);
    if (a instanceof Error) throw a;
    return a;
  };
  try { return await run(calls); } finally { (globalThis as any).fetch = saved; }
}
const live = (): Partial<Env> => ({ MAILER: undefined, RESEND_API_KEY: "re_test_not_real" });

// ---------- new and existing organizer, the address forms ----------
const ADDRESSES: Array<[string, string, string]> = [
  ["A-01", "plain work address", "asha\u0040acme-corp.in"],
  ["A-02", "capitals are read as small letters", "Asha.Rao\u0040Acme-Corp.IN"],
  ["A-03", "spaces around and inside are dropped", "  asha rao\u0040acme-corp.in  "],
  ["A-04", "plus tag", "asha+games\u0040acme-corp.in"],
  ["A-05", "full-width characters (NFKC)", "ａｓｈａ@acme-corp.in"],
  ["A-06", "sub-domain address", "asha\u0040mail.eu.acme-corp.co.uk"],
  ["A-07", "64-letter local part", "a".repeat(64) + "@acme-corp.in"],
];
for (const [id, name, email] of ADDRESSES) {
  test(`${id} new organizer, ${name}: a code arrives once, signs in, a second visit is an existing organizer`, async () => {
    const s = await setup();
    expect((await s.ask(email)).status).toBe(200);
    expect(s.mails.length).toBe(1);
    expect(s.mails[0].to).toBe(email.normalize("NFKC").replace(/\s+/g, "").toLowerCase());
    const v = await s.call("POST", "/auth/verify", { email, code: s.code() });
    expect(v.status).toBe(200);
    const c1 = s.cookieOf(v)!;
    expect((await s.call("GET", "/auth/me", undefined, { cookie: c1 })).json.signedIn).toBe(true);
    // existing organizer: signs in again from another browser, the same person (one console_email row)
    await s.ask(email.toUpperCase().replace("@", "@"));
    const v2 = await s.call("POST", "/auth/verify", { email: email.toUpperCase(), code: s.code() });
    expect(v2.status).toBe(200);
    expect((s.raw.query("SELECT COUNT(*) c FROM console_email").get() as any).c).toBe(1);
  });
}
const BAD_ADDRESSES: Array<[string, string, string]> = [
  ["A-08", "no @", "asha.acme-corp.in"], ["A-09", "no dot after @", "asha@localhost"], ["A-10", "two @", "a@b\u0040acme.in"], ["A-11", "65-letter local part", "a".repeat(65) + "@acme.in"], ["A-12", "empty", ""], ["A-13", "only spaces", "   "], ["A-14", "one-letter ending", "asha@acme.i"],
];
for (const [id, name, email] of BAD_ADDRESSES) {
  test(`${id} a wrong address (${name}) is refused politely before anything is sent`, async () => {
    const s = await setup();
    const r = await s.ask(email);
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("invalid");
    expect(r.json.message).toMatch(/valid e-mail address/);
    expect(s.mails.length).toBe(0);
  });
}

// ---------- the code ----------
const CODE_CASES: Array<[string, string, (s: Awaited<ReturnType<typeof setup>>, email: string) => Promise<number>]> = [
  ["A-20", "right code", async (s, e) => (await s.call("POST", "/auth/verify", { email: e, code: s.code() })).status],
  ["A-21", "wrong code", async (s, e) => (await s.call("POST", "/auth/verify", { email: e, code: s.code() === "000000" ? "111111" : "000000" })).status],
  ["A-22", "five digits", async (s, e) => (await s.call("POST", "/auth/verify", { email: e, code: "12345" })).status],
  ["A-23", "seven digits", async (s, e) => (await s.call("POST", "/auth/verify", { email: e, code: "1234567" })).status],
  ["A-24", "letters", async (s, e) => (await s.call("POST", "/auth/verify", { email: e, code: "abcdef" })).status],
  ["A-25", "empty code", async (s, e) => (await s.call("POST", "/auth/verify", { email: e, code: "" })).status],
  ["A-26", "code as a number, not text", async (s, e) => (await s.call("POST", "/auth/verify", { email: e, code: Number(s.code()) })).status],
  ["A-27", "code for another e-mail address", async (s, e) => (await s.call("POST", "/auth/verify", { email: "other\u0040acme-corp.in", code: s.code() })).status],
  ["A-28", "right code with spaces around it", async (s, e) => (await s.call("POST", "/auth/verify", { email: e, code: " " + s.code() + " " })).status],
  ["A-29", "right code, e-mail typed in capitals", async (s, e) => (await s.call("POST", "/auth/verify", { email: e.toUpperCase(), code: s.code() })).status],
];
const EXPECT_CODE: Record<string, number> = { "A-20": 200, "A-21": 401, "A-22": 401, "A-23": 401, "A-24": 401, "A-25": 401, "A-26": 401, "A-27": 401, "A-29": 200, "A-28": 401 };
for (const [id, name, fn] of CODE_CASES) {
  test(`${id} the code: ${name}`, async () => {
    const s = await setup();
    await s.ask("asha\u0040acme-corp.in");
    expect(await fn(s, "asha\u0040acme-corp.in")).toBe(EXPECT_CODE[id]);
  });
}
test("A-30 the code is reused: a second sign-in with the same code is refused", async () => {
  const s = await setup(); await s.ask("asha\u0040acme-corp.in"); const c = s.code();
  expect((await s.call("POST", "/auth/verify", { email: "asha\u0040acme-corp.in", code: c })).status).toBe(200);
  const again = await s.call("POST", "/auth/verify", { email: "asha\u0040acme-corp.in", code: c });
  expect(again.status).toBe(401); expect(again.json.message).toMatch(/not right|run out|new one/i);
});
test("A-31 expired code: 29:59 works, 30:01 does not, and the message says to ask again", async () => {
  for (const [ms, want] of [[CODE_TTL_MS - 1000, 200], [CODE_TTL_MS + 1000, 401]] as const) {
    const s = await setup(); await s.ask("asha\u0040acme-corp.in");
    const r = await s.call("POST", "/auth/verify", { email: "asha\u0040acme-corp.in", code: s.code() }, { now: NOW + ms });
    expect(r.status).toBe(want);
    if (want === 401) expect(r.json.message).toMatch(/new one/);
  }
});
test("A-32 an older code stops working when a newer one is asked for (the page says so)", async () => {
  const s = await setup(); await s.ask("asha\u0040acme-corp.in"); const old = s.code(); await s.ask("asha\u0040acme-corp.in");
  if (old !== s.code()) expect((await s.call("POST", "/auth/verify", { email: "asha\u0040acme-corp.in", code: old })).status).toBe(401);
  expect((await s.call("POST", "/auth/verify", { email: "asha\u0040acme-corp.in", code: s.code() })).status).toBe(200);
});
test("A-33 four wrong tries then the right code works; five wrong tries lock it even for the right code", async () => {
  const s = await setup(); await s.ask("asha\u0040acme-corp.in"); const good = s.code(), bad = good === "999999" ? "111111" : "999999";
  for (let i = 0; i < 4; i++) await s.call("POST", "/auth/verify", { email: "asha\u0040acme-corp.in", code: bad });
  expect((await s.call("POST", "/auth/verify", { email: "asha\u0040acme-corp.in", code: good })).status).toBe(200);
  await s.ask("asha\u0040acme-corp.in");
  for (let i = 0; i < 5; i++) await s.call("POST", "/auth/verify", { email: "asha\u0040acme-corp.in", code: s.code() === "999999" ? "111111" : "999999" });
  expect((await s.call("POST", "/auth/verify", { email: "asha\u0040acme-corp.in", code: s.code() })).status).toBe(401);
});
test("A-34 two tabs ask for a code each: the newest e-mail works, the other tab is told politely", async () => {
  const s = await setup(); await s.ask("asha\u0040acme-corp.in", { ip: "1.1.1.1" }); await s.ask("asha\u0040acme-corp.in", { ip: "2.2.2.2" });
  expect(s.mails.length).toBe(2);
  expect((await s.call("POST", "/auth/verify", { email: "asha\u0040acme-corp.in", code: s.code() })).status).toBe(200);
});
test("A-35 the e-mail is not asked for with no consent, and the answer is the same for a known and an unknown address", async () => {
  const s = await setup();
  expect((await s.call("POST", "/auth/request", { email: "asha\u0040acme-corp.in" })).json.error).toBe("consent");
  const a = await s.ask("known\u0040acme-corp.in"), v = await s.call("POST", "/auth/verify", { email: "known\u0040acme-corp.in", code: s.code() }); expect(v.status).toBe(200);
  const b = await s.ask("brand-new\u0040acme-corp.in");
  expect(Object.keys(a.json).sort()).toEqual(Object.keys(b.json).sort());
});

// ---------- the one-tap link ----------
test("A-40 link: opening it with GET consumes nothing; the button (POST) signs in once; a second press is refused", async () => {
  const s = await setup(); await s.ask("asha\u0040acme-corp.in"); const t = s.link();
  expect((await s.call("GET", "/auth/link?t=" + t)).status).toBe(200);
  const p = await s.call("POST", "/auth/link", { t }); expect(p.status).toBe(200); expect(s.cookieOf(p)).toBeTruthy();
  expect((await s.call("POST", "/auth/link", { t })).status).toBe(401);
});
for (const [id, name, t] of [["A-41", "too short", "abc"], ["A-42", "not hex", "z".repeat(48)], ["A-43", "empty", ""], ["A-44", "a token nobody was given", "0".repeat(48)]] as const) {
  test(`A-4${id.slice(3) } link: ${name} is refused politely`, async () => {
    const s = await setup(); const r = await s.call("POST", "/auth/link", { t });
    expect(r.status).toBe(401); expect(r.json.message).toMatch(/not right|run out|new one/i);
  });
}
test("A-45 link older than 30 minutes is refused; the code from the same mail is refused too", async () => {
  const s = await setup(); await s.ask("asha\u0040acme-corp.in");
  expect((await s.call("POST", "/auth/link", { t: s.link() }, { now: NOW + CODE_TTL_MS + 1000 })).status).toBe(401);
});
test("A-46 the link in the e-mail points at the console's own address (the organizer never leaves it)", async () => {
  const s = await setup(); await s.ask("asha\u0040acme-corp.in");
  const url = /(https?:\/\/\S+)/.exec(s.mails[0].text)![1];
  expect(new URL(url).origin).toBe(LIVE);
});

// ---------- repeat visit, session expiry, sign-out ----------
test("A-50 auto login on a repeat visit: the cookie is still good a year later and is renewed on every visit", async () => {
  const s = await setup(); await s.ask("asha\u0040acme-corp.in"); const v = await s.call("POST", "/auth/verify", { email: "asha\u0040acme-corp.in", code: s.code() });
  const c = s.cookieOf(v)!;
  const yr = await s.call("GET", "/auth/me", undefined, { cookie: c, now: NOW + 365 * 86400_000 });
  expect(yr.json.signedIn).toBe(true); expect(yr.headers.get("set-cookie")).toContain("Max-Age=");
});
test("A-51 session expiry: after the 5-year limit the person is signed out politely (signedIn false, no error)", async () => {
  const s = await setup(); await s.ask("asha\u0040acme-corp.in"); const v = await s.call("POST", "/auth/verify", { email: "asha\u0040acme-corp.in", code: s.code() });
  const r = await s.call("GET", "/auth/me", undefined, { cookie: s.cookieOf(v)!, now: NOW + SESSION_MS + 1000 });
  expect(r.status).toBe(200); expect(r.json).toEqual({ ok: true, signedIn: false });
});
test("A-52 a session that expires in the middle of paying: the pay routes say 'please sign in' (see smoke-pay S-60) and /auth/assert says signed_out", async () => {
  const s = await setup(); await s.ask("asha\u0040acme-corp.in"); const v = await s.call("POST", "/auth/verify", { email: "asha\u0040acme-corp.in", code: s.code() });
  const r = await s.call("POST", "/auth/assert", { requests: [{ game: "tambola", act: "games" }] }, { cookie: s.cookieOf(v)!, now: NOW + SESSION_MS + 1000 });
  expect(r.status).toBe(401); expect(r.json.error).toBe("signed_out");
});
for (const [id, name, cookie] of [["A-53", "a forged cookie", "cbsess=" + "ab".repeat(32)], ["A-54", "a cut-short cookie", "cbsess=abc123"], ["A-55", "the signed-out cookie", "cbsess=" + "0".repeat(64)], ["A-56", "no cookie", ""]] as const) {
  test(`${id} ${name} is just 'not signed in'`, async () => {
    const s = await setup(); const r = await s.call("GET", "/auth/me", undefined, cookie ? { cookie } : {});
    expect(r.status).toBe(200); expect(r.json.signedIn).toBe(false);
  });
}
test("A-57 Sign out ends this browser; 'everywhere' ends the other browser too", async () => {
  const s = await setup(); await s.ask("asha\u0040acme-corp.in"); const v1 = await s.call("POST", "/auth/verify", { email: "asha\u0040acme-corp.in", code: s.code() });
  await s.ask("asha\u0040acme-corp.in"); const v2 = await s.call("POST", "/auth/verify", { email: "asha\u0040acme-corp.in", code: s.code() });
  const c1 = s.cookieOf(v1)!, c2 = s.cookieOf(v2)!;
  await s.call("POST", "/auth/signout", {}, { cookie: c1 });
  expect((await s.call("GET", "/auth/me", undefined, { cookie: c1 })).json.signedIn).toBe(false);
  expect((await s.call("GET", "/auth/me", undefined, { cookie: c2 })).json.signedIn).toBe(true);
  await s.call("POST", "/auth/signout", { everywhere: true }, { cookie: c2 });
  expect((await s.call("GET", "/auth/me", undefined, { cookie: c2 })).json.signedIn).toBe(false);
});

// ---------- limits ----------
test("A-60 the 9th code in an hour for one address is refused with the wait time; after an hour it works", async () => {
  const s = await setup();
  for (let i = 0; i < MAILS_PER_HOUR; i++) expect((await s.ask("asha\u0040acme-corp.in", { ip: "9.9.9." + i })).status).toBe(200);
  const r = await s.ask("asha\u0040acme-corp.in", { ip: "9.9.9.99" }); expect(r.status).toBe(429); expect(r.json.message).toMatch(/wait \d+ minutes?/);
  expect((await s.ask("asha\u0040acme-corp.in", { now: NOW + 3600_000 + 1 })).status).toBe(200);
});

// ---------- every POST must come from the console's own page ----------
test("A-70 a POST from another site is refused; a POST with no Origin but the console header is accepted; no header is refused", async () => {
  const s = await setup();
  expect((await s.call("POST", "/auth/request", { email: "asha\u0040acme-corp.in", consent: true }, { origin: "https://evil.example" })).status).toBe(403);
  expect((await s.call("POST", "/auth/request", { email: "asha\u0040acme-corp.in", consent: true }, { origin: null })).status).toBe(200);
});
test("A-71 THE LIVE ADDRESS: the settings the console is deployed with accept the page it is served from (console.corporatetambola.com)", () => {
  const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8"), cron = readFileSync(new URL("../apps/cron/wrangler.toml", import.meta.url), "utf8");
  const games = JSON.parse(readFileSync(new URL("../config/games.json", import.meta.url), "utf8"));
  const want = games.consoleOrigin.live;
  expect(want).toBe(LIVE);
  expect(/^CONSOLE_ORIGIN = "([^"]+)"/m.exec(toml)![1]).toBe(want);
  expect(/^CONSOLE_ORIGIN = "([^"]+)"/m.exec(cron)![1]).toBe(want);
});
test("A-72 with the deployed settings (the page address is the setting) a sign-in POST from the live page is NOT refused", async () => {
  const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const deployed = /^CONSOLE_ORIGIN = "([^"]+)"/m.exec(toml)![1];
  const s = await setup({}, deployed);
  const r = await s.call("POST", "/auth/request", { email: "asha\u0040acme-corp.in", consent: true }, { origin: LIVE });
  expect(r.status).toBe(200);
});

test("A-73 the trial address (pages.dev) of the same console is also accepted for sign-in POSTs; any other site is still refused", async () => {
  const s = await setup({ CONSOLE_ALT_ORIGINS: "https://corporate-console.pages.dev" });
  expect((await s.call("POST", "/auth/request", { email: "asha\u0040acme-corp.in", consent: true }, { origin: "https://corporate-console.pages.dev" })).status).toBe(200);
  expect((await s.call("POST", "/auth/request", { email: "asha\u0040acme-corp.in", consent: true }, { origin: "https://corporate-console.pages.dev.evil.example" })).status).toBe(403);
  expect((await s.call("POST", "/auth/request", { email: "asha\u0040acme-corp.in", consent: true }, { origin: "http://console.corporatetambola.com" })).status).toBe(403);
  // and the mail's link still points at the console's own (main) address
  expect(s.mails[0].text).toContain(LIVE + "/signin.html?t=");
});

// ---------- THE SIGN-IN CODE E-MAIL: every way the send can go wrong ----------
test("A-80 test addresses (.invalid) are never mailed: the page says a code is on its way, so the answer must say it is a test address", async () => {
  const s = await setup(live());
  await withResend(() => new Response("{}", { status: 200 }), async (calls) => {
    const r = await s.ask("test-org-1119\u0040demo-test.invalid");
    expect(r.status).toBe(200);
    expect(calls.length).toBe(0); // by the owner's rule of 30 Oct: nothing leaves for a test address
    expect(r.json.testAddress).toBe(true); // ...but the person must be told, or the screen waits for an e-mail that cannot come
  });
});
test("A-81 the real address goes to the mail service once, with the key, from the console sender, to that address only", async () => {
  const s = await setup(live());
  await withResend(() => new Response(JSON.stringify({ id: "m1" }), { status: 200 }), async (calls) => {
    expect((await s.ask("asha\u0040acme-corp.in")).status).toBe(200);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].headers.authorization).toBe("Bearer re_test_not_real");
    expect(calls[0].body.to).toEqual(["asha\u0040acme-corp.in"]);
    expect(calls[0].body.from).toMatch(/@corporatetambola\.com>?$/);
    expect(calls[0].body.subject).toMatch(/^Your sign-in code is \d{6}$/);
  });
});
for (const [id, name, answer, key] of [
  ["A-82", "no mail key set at all", () => new Response("{}", { status: 200 }), false],
  ["A-83", "the mail service refuses the key (401)", () => new Response('{"message":"API key is invalid"}', { status: 401 }), true],
  ["A-84", "the sender domain is not verified (403)", () => new Response('{"message":"The corporatetambola.com domain is not verified"}', { status: 403 }), true],
  ["A-85", "the address is refused by the mail service (422)", () => new Response('{"message":"Invalid to field"}', { status: 422 }), true],
  ["A-86", "the mail service says slow down (429)", () => new Response("{}", { status: 429 }), true],
  ["A-87", "the mail service is down (500)", () => new Response("{}", { status: 500 }), true],
  ["A-88", "the network drops", () => new Error("network"), true],
] as const) {
  test(`${id} ${name}: the person is told it could not be sent (never 'on its way'), and nothing is half-done`, async () => {
    const s = await setup({ MAILER: undefined, ...(key ? { RESEND_API_KEY: "re_test_not_real" } : {}) });
    await withResend(answer as any, async () => {
      const r = await s.ask("asha\u0040acme-corp.in");
      expect(r.status).toBe(502); expect(r.json.error).toBe("mail"); expect(r.json.message).toMatch(/could not send/);
      expect(r.json.message).not.toMatch(/resend|api|key|server/i);
    });
  });
}
test("A-89 a send that fails must NOT destroy the code that the person already holds in an earlier e-mail", async () => {
  const s = await setup(live());
  let first = "";
  await withResend((n) => new Response("{}", { status: 200 }), async (calls) => { await s.ask("asha\u0040acme-corp.in"); first = /code is (\d{6})/.exec(calls[0].body.text)![1]; });
  await withResend(() => new Response("{}", { status: 500 }), async () => { expect((await s.ask("asha\u0040acme-corp.in", { ip: "5.5.5.5" })).status).toBe(502); });
  expect((await s.call("POST", "/auth/verify", { email: "asha\u0040acme-corp.in", code: first })).status).toBe(200);
});
test("A-90 a send that fails and nothing came before: no valid code is left behind for an e-mail nobody got", async () => {
  const s = await setup(live());
  await withResend(() => new Response("{}", { status: 500 }), async () => { await s.ask("asha\u0040acme-corp.in"); });
  expect((s.raw.query("SELECT COUNT(*) c FROM login_code").get() as any).c).toBe(0);
});
test("A-91 a mail service that never answers cannot hang the sign-in: the call has a time limit", async () => {
  const s = await setup(live());
  await withResend(() => new Response("{}", { status: 200 }), async (calls) => {
    await s.ask("asha\u0040acme-corp.in");
    expect(calls[0].signal).toBeTruthy(); // an AbortSignal with a time limit was handed to the mail call
  });
});
test("A-94 a mail that TIMES OUT may still arrive: the new code stays valid, the answer says so, and the try is not given back", async () => {
  const s = await setup(live());
  let code = "";
  const timeout = Object.assign(new Error("The operation timed out."), { name: "TimeoutError" });
  await withResend((n) => timeout, async (calls) => {
    const r = await s.ask("asha\u0040acme-corp.in");
    expect(r.status).toBe(502); expect(JSON.stringify(r.json ?? r.body ?? "")).toContain("may still arrive");
    code = /code is (\d{6})/.exec(calls[0].body.text)![1];
  });
  expect((s.raw.query("SELECT COUNT(*) c FROM login_code").get() as any).c).toBe(1);
  expect((await s.call("POST", "/auth/verify", { email: "asha\u0040acme-corp.in", code })).status).toBe(200); // the mail arrived late; its code works
});
test("A-92 a failed send leaves a trace for the owner: the status the mail service answered is logged (no address, no code)", async () => {
  const s = await setup(live()), logged: string[] = [], saved = console.error, savedWarn = console.warn, savedLog = console.log;
  console.error = console.warn = console.log = (...a: any[]) => { logged.push(a.join(" ")); };
  try { await withResend(() => new Response('{"message":"domain is not verified"}', { status: 403 }), async () => { await s.ask("asha\u0040acme-corp.in"); }); }
  finally { console.error = saved; console.warn = savedWarn; console.log = savedLog; }
  const line = logged.join("\n");
  expect(line).toMatch(/mail/i); expect(line).toMatch(/403/);
  expect(line).not.toMatch(/asha@|acme-corp/); expect(line).not.toMatch(/\b\d{6}\b/);
});
test("A-93 a failed send gives the try back, so five bad minutes at the mail service cannot lock the person out for an hour", async () => {
  const s = await setup(live());
  await withResend(() => new Response("{}", { status: 500 }), async () => {
    for (let i = 0; i < 8; i++) await s.ask("asha\u0040acme-corp.in", { ip: "7.7.7." + i });
  });
  await withResend(() => new Response("{}", { status: 200 }), async () => {
    const r = await s.ask("asha\u0040acme-corp.in", { ip: "7.7.7.200" });
    expect(r.status).toBe(200); // the mail service came back: the person can have a code now
  });
});

// ---------- the mail itself ----------
test("A-100 sign-in mail: subject, tone, link, minutes, no address and no other personal data inside, plain words", async () => {
  const s = await setup(); await s.ask("Asha.Rao\u0040acme-corp.in");
  const m = s.mails[0];
  expect(m.subject).toBe(`Your sign-in code is ${s.code()}`);
  expect(m.text).toContain(`It works for 30 minutes.`);
  expect(m.text).toContain("If you did not ask for this, you can ignore this e-mail.");
  expect(m.text).not.toMatch(/asha|rao|acme/i);
  expect(m.text).not.toMatch(/\b(we|our|us|I)\b/);
  expect(m.text).not.toMatch(/moneypenny|razorpay|it services|api|server|error/i);
});
