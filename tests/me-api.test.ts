// FALSIFIED BY: me-cors-any-origin, me-no-credentials-header, me-leaks-email, me-ignores-cookie, me-outside-origin-allowed, me-leaks-join-key
// Console 0.4.0 "stay signed in": GET /api/me tells Home and the games who is signed in, from the one console cookie (HttpOnly, host-only on the console address).
import { test, expect } from "bun:test";
import { makeD1 } from "./support/d1-sqlite";
import { handleAuth, emailHashOf, type Env } from "../functions/_lib/auth-core";
import { handleMe, meOrigins, displayNameOf, organizerIdOf, ME_PER_HOUR } from "../functions/_lib/me-core";
import { onRequest } from "../functions/api/me";

const NOW = Date.UTC(2026, 10, 22, 6, 0, 0);
const CONSOLE = "https://console.corporatetambola.com";
const HOME = "https://home.corporatetambola.com";
const at = (local: string) => local + String.fromCharCode(64) + "demo-test.invalid"; // owner rule: only undeliverable test addresses (.invalid) appear in the tests
const GAMES = { tambola: "https://housie.corporatetambola.com", bingo: "https://bingo.corporatetambola.com", tictactoe: "https://tictactoe.corporatetambola.com", snakesladders: "https://snakes.corporatetambola.com", luckbychance: "https://luck.corporatetambola.com", luckydraw: "https://luckydraw.corporatetambola.com" };

async function setup(extra: Partial<Env> = {}) {
  const { db, raw } = makeD1();
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const mails: Array<{ to: string; subject: string; text: string }> = [];
  const env: Env = { DB: db, SESSION_PEPPER: "pepper-for-tests", CONSOLE_SIGNING_KEY: btoa(String.fromCharCode(...pkcs8)), CONSOLE_ORIGIN: CONSOLE, GAME_ORIGINS: JSON.stringify(GAMES), MAILER: async (to, subject, text) => { mails.push({ to, subject, text }); }, ...extra };
  const auth = async (method: string, path: string, body?: unknown) => handleAuth(new Request(CONSOLE + path, { method, headers: { "content-type": "application/json", origin: CONSOLE, "x-console": "1", "cf-connecting-ip": "1.2.3.4" }, body: body === undefined ? undefined : JSON.stringify(body) }), env, NOW);
  const signIn = async (email: string) => {
    await auth("POST", "/auth/request", { email, consent: true });
    const code = /code is (\d{6})/.exec(mails[mails.length - 1].text)![1];
    const v = await auth("POST", "/auth/verify", { email, code });
    return /(cbsess=[0-9a-f]{64})/.exec(v.headers.get("set-cookie") || "")![1];
  };
  const me = async (o: { cookie?: string; origin?: string; method?: string; now?: number } = {}) => {
    const headers: Record<string, string> = { ...(o.cookie ? { cookie: o.cookie } : {}), ...(o.origin ? { origin: o.origin } : {}) };
    const r = await handleMe(new Request(CONSOLE + "/api/me", { method: o.method || "GET", headers }), env, o.now ?? NOW);
    const text = await r.clone().text();
    return { status: r.status, text, json: JSON.parse(text || "null"), headers: r.headers };
  };
  return { env, raw, mails, signIn, me };
}

test("signed in: the name and the ID, to Home and to every game, with credentials allowed only for that exact address", async () => {
  const s = await setup();
  const cookie = await s.signIn(at("raajat.agarwal"));
  for (const origin of [HOME, ...Object.values(GAMES)]) {
    const r = await s.me({ cookie, origin });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ signedIn: true, name: "Raajat Agarwal", id: await organizerIdOf(await emailHashOf(at("raajat.agarwal"))) });
    expect(r.headers.get("access-control-allow-origin")).toBe(origin); // the exact address, never *
    expect(r.headers.get("access-control-allow-credentials")).toBe("true");
    expect(r.headers.get("vary")).toMatch(/Origin/i);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("set-cookie")).toBeNull(); // this route never sets or renews the cookie
  }
});

test("not signed in (no cookie, a made-up cookie, a signed-out cookie): exactly { signedIn: false }", async () => {
  const s = await setup();
  expect((await s.me({ origin: HOME })).json).toEqual({ signedIn: false });
  expect((await s.me({ origin: HOME, cookie: "cbsess=" + "a".repeat(64) })).json).toEqual({ signedIn: false });
  expect((await s.me({ origin: HOME, cookie: "cbsess=not-hex" })).json).toEqual({ signedIn: false });
  const cookie = await s.signIn(at("Demo4"));
  expect((await s.me({ origin: HOME, cookie })).json.signedIn).toBe(true);
  await handleAuth(new Request(CONSOLE + "/auth/signout", { method: "POST", headers: { "content-type": "application/json", origin: CONSOLE, "x-console": "1", cookie } , body: "{}" }), s.env, NOW);
  const after = await s.me({ origin: HOME, cookie });
  expect(after.status).toBe(200);
  expect(after.json).toEqual({ signedIn: false });
  expect(after.headers.get("access-control-allow-origin")).toBe(HOME); // the page can still read the plain "no"
});

test("an account that was closed is not signed in, even if the session row were left behind", async () => {
  const s = await setup();
  const cookie = await s.signIn(at("closed.person"));
  s.raw.prepare("DELETE FROM console_email").run();
  expect((await s.me({ origin: HOME, cookie })).json).toEqual({ signedIn: false });
});

test("the answer holds no e-mail address and no join key, and no cookie value", async () => {
  const s = await setup();
  const email = at("private.person");
  const cookie = await s.signIn(email);
  const r = await s.me({ cookie, origin: HOME });
  const hash = await emailHashOf(email);
  expect(Object.keys(r.json).sort()).toEqual(["id", "name", "signedIn"]);
  expect(r.text.includes("@")).toBe(false);
  expect(r.text.includes(hash)).toBe(false);
  expect(r.text.includes(cookie.split("=")[1])).toBe(false);
  expect(r.json.id).toMatch(/^org_[0-9a-f]{16}$/);
  expect(r.json.id).not.toBe("org_" + hash.slice(0, 16));
});

test("the same person always gets the same ID; two people never share one", async () => {
  const s = await setup();
  const c1 = await s.signIn(at("one"));
  const c1b = await s.signIn(at("one"));
  const c2 = await s.signIn(at("two"));
  const a = (await s.me({ cookie: c1 })).json, b = (await s.me({ cookie: c1b })).json, c = (await s.me({ cookie: c2 })).json;
  expect(a.id).toBe(b.id);
  expect(a.id).not.toBe(c.id);
});

test("a page that is not Home, a game or the console gets no data and no CORS header (credentials are not shared with it)", async () => {
  const s = await setup();
  const cookie = await s.signIn(at("someone"));
  for (const origin of ["https://evil.example", "https://corporatetambola.com.evil.example", "http://home.corporatetambola.com", "https://home.corporatetambola.com:8443", "https://evil.corporatetambola.com", "null", "https://corporate-tambola.pages.dev"]) {
    const r = await s.me({ cookie, origin });
    expect([origin, r.status]).toEqual([origin, 403]);
    expect(r.json).toEqual({ signedIn: false });
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
    expect(r.headers.get("access-control-allow-credentials")).toBeNull();
    expect(r.text.includes("Agarwal")).toBe(false);
  }
});

test("the console's own page and a plain request without Origin are served, but get no CORS header (same-origin needs none)", async () => {
  const s = await setup();
  const cookie = await s.signIn(at("same.origin"));
  for (const origin of [CONSOLE, undefined]) {
    const r = await s.me({ cookie, origin });
    expect(r.status).toBe(200);
    expect(r.json.signedIn).toBe(true);
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
  }
});

test("the allowed list is only https addresses on corporatetambola.com; anything else in the settings is dropped, HOME_ORIGIN can move Home", async () => {
  const s = await setup({ GAME_ORIGINS: JSON.stringify({ a: "https://housie.corporatetambola.com", b: "https://corporate-tambola.pages.dev", c: "http://bingo.corporatetambola.com", d: "https://housie.corporatetambola.com/path", e: "*", f: 5 }) });
  expect(meOrigins(s.env)).toEqual([HOME, "https://housie.corporatetambola.com"]);
  expect(meOrigins({ ...s.env, HOME_ORIGIN: "https://www.corporatetambola.com" })).toEqual(["https://www.corporatetambola.com", "https://housie.corporatetambola.com"]);
  expect(meOrigins({ ...s.env, HOME_ORIGIN: "https://evil.example", GAME_ORIGINS: "not json" })).toEqual([]);
});

test("preflight: only the allowed pages get an answer with credentials; other methods are refused and never change anything", async () => {
  const s = await setup();
  const cookie = await s.signIn(at("method.test"));
  const pre = await s.me({ method: "OPTIONS", origin: HOME });
  expect(pre.status).toBe(204);
  expect(pre.headers.get("access-control-allow-origin")).toBe(HOME);
  expect(pre.headers.get("access-control-allow-credentials")).toBe("true");
  expect(pre.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
  expect((await s.me({ method: "OPTIONS", origin: "https://evil.example" })).status).toBe(403);
  for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
    const r = await s.me({ method, cookie, origin: HOME });
    expect([method, r.status]).toEqual([method, 405]);
    expect(r.json).toEqual({ signedIn: false });
  }
  expect(s.raw.prepare("SELECT COUNT(*) AS n FROM session").get().n).toBe(1);
});

test("a loop of requests from one sign-in is stopped after the hourly limit, and the count starts again in the next hour", async () => {
  const s = await setup();
  const cookie = await s.signIn(at("busy.person"));
  s.raw.prepare("INSERT INTO rate(k,n,win_start_ms) SELECT 'me:' || sid_hash, ?, ? FROM session").run(ME_PER_HOUR, NOW);
  const r = await s.me({ cookie, origin: HOME });
  expect(r.status).toBe(429);
  expect(r.json).toEqual({ signedIn: false });
  expect(r.headers.get("retry-after")).toBe("3600");
  expect((await s.me({ cookie, origin: HOME, now: NOW + 3600_000 + 1000 })).json.signedIn).toBe(true);
});

test("display names: made from the e-mail's first part; tags, digits and odd characters never reach the page", () => {
  expect(displayNameOf(at("raajat.agarwal"))).toBe("Raajat Agarwal");
  expect(displayNameOf(at("PRIYA_SHARMA+events"))).toBe("Priya Sharma");
  expect(displayNameOf(at("a-b.c.d.e.f"))).toBe("A B C D");
  expect(displayNameOf(at("12345"))).toBe("Organizer");
  expect(displayNameOf(at("<script>alert(1)</script>"))).toBe("Scriptalertscript");
  expect(/[<>&\"'@]/.test(displayNameOf(at("<b>\"x\"&y")))).toBe(false);
  expect(displayNameOf("")).toBe("Organizer");
  expect(displayNameOf(at("x".repeat(200))).length).toBeLessThanOrEqual(40);
});

test("the Pages Function wrapper at functions/api/me.ts answers the same way (the route /api/me)", async () => {
  const s = await setup();
  const cookie = await s.signIn(at("wrapper"));
  const res = await onRequest({ request: new Request(CONSOLE + "/api/me", { headers: { cookie, origin: HOME } }), env: s.env });
  expect(res.status).toBe(200);
  expect((await res.json()).signedIn).toBe(true);
  expect(res.headers.get("access-control-allow-origin")).toBe(HOME);
});
