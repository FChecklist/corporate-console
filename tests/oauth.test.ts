// Google / Microsoft sign-in: token checks (signature, issuer, audience, expiry, nonce, verified e-mail) and the start / callback steps.
import { test, expect } from "bun:test";
import { verifyIdToken, handleOAuth, providersOn, STATE_COOKIE } from "../functions/_lib/oauth-core";

const enc = new TextEncoder();
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const other = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pub = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid: "k1" };
const jwks = { keys: [pub] };
const TID = "11111111-2222-3333-4444-555555555555";
async function token(claims: any, key = kp.privateKey, kid = "k1") {
  const h = b64u(enc.encode(JSON.stringify({ alg: "RS256", kid }))), c = b64u(enc.encode(JSON.stringify(claims)));
  return `${h}.${c}.${b64u(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(h + "." + c))))}`;
}
const g = (o: any = {}) => ({ iss: "https://accounts.google.com", aud: "gid", exp: NOW / 1000 + 600, nonce: "N", email: "a@acme.com", email_verified: true, ...o });
const ms = (o: any = {}) => ({ iss: `https://login.microsoftonline.com/${TID}/v2.0`, tid: TID, aud: "mid", exp: NOW / 1000 + 600, nonce: "N", email: "a@acme.com", xms_edov: true, ...o });
const chk = (p: any, t: string, clientId: string, nonce = "N") => verifyIdToken(p, t, { clientId, nonce, now: NOW, jwks });

test("Google: a good token gives the e-mail", async () => { expect(await chk("google", await token(g()), "gid")).toEqual({ ok: true, email: "a@acme.com" }); });
test("Microsoft: a good token with a confirmed e-mail domain gives the e-mail", async () => { expect(await chk("microsoft", await token(ms()), "mid")).toEqual({ ok: true, email: "a@acme.com" }); });
test("Microsoft personal accounts (Outlook, Hotmail) are accepted", async () => {
  const t = "9188040d-6c67-4c5b-b112-36a304b66dad";
  expect((await chk("microsoft", await token(ms({ tid: t, iss: `https://login.microsoftonline.com/${t}/v2.0`, xms_edov: undefined })), "mid")).ok).toBe(true);
});
test("a wrong nonce is refused", async () => { expect(await chk("google", await token(g()), "gid", "OTHER")).toEqual({ ok: false, reason: "nonce" }); });
test("a missing nonce is refused", async () => { expect((await chk("google", await token(g({ nonce: undefined })), "gid")).ok).toBe(false); });
test("a token for another client (audience) is refused", async () => { expect(await chk("google", await token(g({ aud: "someone-else" })), "gid")).toEqual({ ok: false, reason: "audience" }); });
test("an unverified Google e-mail is refused", async () => { expect(await chk("google", await token(g({ email_verified: false })), "gid")).toEqual({ ok: false, reason: "unverified" }); });
test("a Microsoft work e-mail without a confirmed domain is refused", async () => { expect(await chk("microsoft", await token(ms({ xms_edov: undefined })), "mid")).toEqual({ ok: false, reason: "unverified" }); });
test("an expired token is refused", async () => { expect(await chk("google", await token(g({ exp: NOW / 1000 - 300 })), "gid")).toEqual({ ok: false, reason: "expired" }); });
test("a wrong issuer is refused", async () => {
  expect(await chk("google", await token(g({ iss: "https://evil.example" })), "gid")).toEqual({ ok: false, reason: "issuer" });
  expect(await chk("microsoft", await token(ms({ iss: "https://login.microsoftonline.com/other/v2.0" })), "mid")).toEqual({ ok: false, reason: "issuer" });
});
test("a token signed with another key, an unknown key id, or altered after signing is refused", async () => {
  expect(await chk("google", await token(g(), other.privateKey), "gid")).toEqual({ ok: false, reason: "signature" });
  expect(await chk("google", await token(g(), kp.privateKey, "nope"), "gid")).toEqual({ ok: false, reason: "key" });
  const t = (await token(g())).split("."); t[1] = b64u(enc.encode(JSON.stringify(g({ email: "boss@acme.com" }))));
  expect(await chk("google", t.join("."), "gid")).toEqual({ ok: false, reason: "signature" });
});
test("a token with no e-mail, or an unsigned token (alg none), is refused", async () => {
  expect((await chk("google", await token(g({ email: undefined })), "gid")).ok).toBe(false);
  const none = `${b64u(enc.encode('{"alg":"none"}'))}.${b64u(enc.encode(JSON.stringify(g())))}.`;
  expect((await chk("google", none, "gid")).ok).toBe(false);
});

// ---- the two steps ----
const env = (extra: any = {}): any => ({ CONSOLE_ORIGIN: "https://console.example", SESSION_PEPPER: "pepper", GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsec", ...extra });
const get = (u: string, cookie = "") => new Request(u, { headers: cookie ? { cookie } : {} });
const cookieValue = (r: Response) => /cboa=([^;]*)/.exec(r.headers.get("set-cookie") || "")![1];

test("buttons exist only when both secret names of a provider are set", () => {
  expect(providersOn(env())).toEqual({ google: true, microsoft: false });
  expect(providersOn(env({ GOOGLE_CLIENT_SECRET: "" }))).toEqual({ google: false, microsoft: false });
});
test("start: needs the ticked terms box and a switched-on provider, then goes to the provider with PKCE, state and nonce", async () => {
  const fin = async () => "";
  expect((await handleOAuth(get("https://console.example/auth/oauth/start?p=google"), env(), NOW, fin)).headers.get("location")).toContain("oauth=tick");
  expect((await handleOAuth(get("https://console.example/auth/oauth/start?p=microsoft&c=1"), env(), NOW, fin)).headers.get("location")).toContain("oauth=off");
  const r = await handleOAuth(get("https://console.example/auth/oauth/start?p=google&c=1"), env(), NOW, fin);
  const u = new URL(r.headers.get("location")!);
  expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  expect(u.searchParams.get("redirect_uri")).toBe("https://console.example/auth/oauth/callback/google");
  for (const k of ["state", "nonce", "code_challenge"]) expect((u.searchParams.get(k) || "").length).toBeGreaterThan(20);
  expect(r.headers.get("set-cookie")).toContain("HttpOnly");
});

async function runCallback(idClaims: any, mutate: (u: URL, cookie: string) => [string, string] = (u, c) => [u.toString(), c], e = env()) {
  const fin = async () => "cbsess=abc; HttpOnly";
  const start = await handleOAuth(get("https://console.example/auth/oauth/start?p=google&c=1"), e, NOW, fin);
  const au = new URL(start.headers.get("location")!), cookie = `${STATE_COOKIE}=${cookieValue(start)}`;
  const tokenCalls: any[] = [];
  const doFetch = async (url: any, init?: any) => {
    if (String(url).includes("token")) { tokenCalls.push(init.body); return new Response(JSON.stringify({ id_token: await token({ ...g(), nonce: au.searchParams.get("nonce"), ...idClaims }) })); }
    return new Response(JSON.stringify(jwks));
  };
  const cb = new URL("https://console.example/auth/oauth/callback/google?code=C&state=" + au.searchParams.get("state"));
  const [url, ck] = mutate(cb, cookie);
  const emails: string[] = [];
  const r = await handleOAuth(get(url, ck), { ...e, OAUTH_FETCH: doFetch as any }, NOW + 5000, async (m) => { emails.push(m); return "cbsess=abc; HttpOnly"; });
  return { r, emails, tokenCalls };
}
test("callback: a verified e-mail signs in at once (no code step) and sends the PKCE verifier and secret, keeping nothing", async () => {
  const { r, emails, tokenCalls } = await runCallback({});
  expect(emails).toEqual(["a@acme.com"]);
  expect(r.headers.get("location")).toBe("https://console.example/#/home");
  expect(r.headers.get("set-cookie")).toContain("cbsess=abc");
  expect(String(tokenCalls[0])).toContain("code_verifier=");
  expect(String(tokenCalls[0])).toContain("client_secret=gsec");
});
test("callback: unverified e-mail, wrong audience, wrong nonce and expired tokens do not sign in", async () => {
  for (const claims of [{ email_verified: false }, { aud: "x" }, { nonce: "other" }, { exp: NOW / 1000 - 600 }]) {
    const { r, emails } = await runCallback(claims);
    expect(emails).toEqual([]);
    expect(r.headers.get("location")).toContain("oauth=");
    expect(r.headers.get("set-cookie") || "").not.toContain("cbsess");
  }
});
test("callback: a wrong state, a missing note or a declined sign-in does not sign in", async () => {
  expect((await runCallback({}, (u, c) => { u.searchParams.set("state", "forged"); return [u.toString(), c]; })).emails).toEqual([]);
  expect((await runCallback({}, (u) => [u.toString(), ""])).emails).toEqual([]);
  expect((await runCallback({}, (u, c) => { u.searchParams.delete("code"); u.searchParams.set("error", "access_denied"); return [u.toString(), c]; })).emails).toEqual([]);
  expect((await runCallback({}, (u, c) => [u.toString(), c.slice(0, -3) + "xyz"])).emails).toEqual([]); // the note was altered
});
