// "Continue with Google" and "Continue with Microsoft": OAuth 2 authorization code + PKCE (OpenID Connect), state and nonce.
// The ID token is checked in full (signature against the provider's published keys, issuer, audience, expiry, nonce) and only a VERIFIED e-mail is accepted.
// Nothing is kept: the one-time state lives in a short signed cookie, the tokens are dropped as soon as the e-mail is read, and no name or photo is read at all.
// Plain functions of (request, env, now); the caller (auth-core) turns a verified e-mail into the same session an e-mail code gives.

export interface OAuthEnv {
  CONSOLE_ORIGIN: string;
  SESSION_PEPPER: string;
  GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string; MICROSOFT_CLIENT_SECRET?: string;
  OAUTH_FETCH?: typeof fetch; // tests
}

export type Provider = "google" | "microsoft";
export const PROVIDERS: Record<Provider, { auth: string; token: string; jwks: string; scope: string; idKey: keyof OAuthEnv; secretKey: keyof OAuthEnv }> = {
  google: { auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", jwks: "https://www.googleapis.com/oauth2/v3/certs", scope: "openid email", idKey: "GOOGLE_CLIENT_ID", secretKey: "GOOGLE_CLIENT_SECRET" },
  microsoft: { auth: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", token: "https://login.microsoftonline.com/common/oauth2/v2.0/token", jwks: "https://login.microsoftonline.com/common/discovery/v2.0/keys", scope: "openid email", idKey: "MICROSOFT_CLIENT_ID", secretKey: "MICROSOFT_CLIENT_SECRET" },
};
export const CALLBACK = (env: OAuthEnv, p: Provider) => `${env.CONSOLE_ORIGIN}/auth/oauth/callback/${p}`;
export const STATE_COOKIE = "cboa";
const STATE_TTL_MS = 10 * 60_000, SKEW_MS = 60_000;
const MS_PERSONAL_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad"; // personal Microsoft accounts (Outlook, Hotmail, Live): the mailbox is proved when the account is made

const enc = new TextEncoder();
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const rand = (n: number) => b64u(crypto.getRandomValues(new Uint8Array(n)));
const sha256b64u = async (s: string) => b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));
const hmacKey = (env: OAuthEnv) => crypto.subtle.importKey("raw", enc.encode("oauth-state|" + env.SESSION_PEPPER), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export const providerOn = (env: OAuthEnv, p: Provider) => !!(env[PROVIDERS[p].idKey] && env[PROVIDERS[p].secretKey]);
export const providersOn = (env: OAuthEnv) => ({ google: providerOn(env, "google"), microsoft: providerOn(env, "microsoft") });

/** the signed one-time note kept in the browser while the person is at the provider */
async function sealState(env: OAuthEnv, v: object) {
  const body = b64u(enc.encode(JSON.stringify(v)));
  return body + "." + b64u(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(body))));
}
async function openState(env: OAuthEnv, raw: string): Promise<any | null> {
  const [body, sig] = String(raw || "").split(".");
  if (!body || !sig) return null;
  try {
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(env), unb64u(sig), enc.encode(body)))) return null;
    return JSON.parse(new TextDecoder().decode(unb64u(body)));
  } catch { return null; }
}
const cookieOf = (req: Request, name: string) => { const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(req.headers.get("cookie") || ""); return m ? m[1] : ""; };
const stateCookie = (v: string, maxAge: number) => `${STATE_COOKIE}=${v}; HttpOnly; Secure; SameSite=Lax; Path=/auth/oauth; Max-Age=${maxAge}`;

export type Checked = { ok: true; email: string } | { ok: false; reason: string };

/** Full check of an ID token. `jwks` is the provider's key list. Never throws. */
export async function verifyIdToken(p: Provider, token: string, o: { clientId: string; nonce: string; now: number; jwks: { keys: any[] } }): Promise<Checked> {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return { ok: false, reason: "shape" };
    const head = JSON.parse(new TextDecoder().decode(unb64u(parts[0])));
    const c = JSON.parse(new TextDecoder().decode(unb64u(parts[1])));
    if (head.alg !== "RS256") return { ok: false, reason: "alg" };
    const jwk = (o.jwks.keys || []).find((k) => k.kid === head.kid && k.kty === "RSA");
    if (!jwk) return { ok: false, reason: "key" };
    const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, unb64u(parts[2]), enc.encode(parts[0] + "." + parts[1])))) return { ok: false, reason: "signature" };
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (!aud.includes(o.clientId)) return { ok: false, reason: "audience" };
    if (p === "google") { if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") return { ok: false, reason: "issuer" }; }
    else if (!(typeof c.tid === "string" && /^[0-9a-f-]{36}$/i.test(c.tid) && c.iss === `https://login.microsoftonline.com/${c.tid}/v2.0`)) return { ok: false, reason: "issuer" };
    if (typeof c.exp !== "number" || c.exp * 1000 + SKEW_MS < o.now) return { ok: false, reason: "expired" };
    if (typeof c.nbf === "number" && c.nbf * 1000 - SKEW_MS > o.now) return { ok: false, reason: "early" };
    if (!c.nonce || c.nonce !== o.nonce) return { ok: false, reason: "nonce" };
    const email = typeof c.email === "string" ? c.email.trim() : "";
    if (!/^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/.test(email)) return { ok: false, reason: "no-email" };
    const verified = p === "google" ? c.email_verified === true || c.email_verified === "true"
      : c.tid === MS_PERSONAL_TENANT || c.xms_edov === true || c.xms_edov === 1 || c.xms_edov === "1" || c.xms_edov === "true";
    if (!verified) return { ok: false, reason: "unverified" };
    return { ok: true, email };
  } catch { return { ok: false, reason: "bad-token" }; }
}

const redirect = (to: string, cookie?: string, extra: string[] = []) => {
  const h = new Headers({ location: to, "cache-control": "no-store" });
  if (cookie) h.append("set-cookie", cookie);
  for (const x of extra) h.append("set-cookie", x);
  return new Response(null, { status: 302, headers: h });
};
const back = (env: OAuthEnv, why: string) => redirect(`${env.CONSOLE_ORIGIN}/?oauth=${why}#/home`, stateCookie("", 0));

/** GET /auth/oauth/start?p=google|microsoft&c=1 and GET /auth/oauth/callback/<p>. `finish(email)` makes the session and returns its Set-Cookie value. */
export async function handleOAuth(req: Request, env: OAuthEnv, now: number, finish: (email: string, now: number) => Promise<string>): Promise<Response> {
  const url = new URL(req.url), path = url.pathname.replace(/\/+$/, "");
  const doFetch = env.OAUTH_FETCH || fetch;
  if (req.method !== "GET") return new Response("Not found", { status: 404 });
  if (path === "/auth/oauth/start") {
    const p = url.searchParams.get("p") as Provider;
    if (!PROVIDERS[p] || !providerOn(env, p)) return back(env, "off");
    if (url.searchParams.get("c") !== "1") return back(env, "tick"); // the terms box is ticked first, as for the e-mail code
    const state = rand(24), nonce = rand(24), verifier = rand(48);
    const q = new URLSearchParams({ client_id: String(env[PROVIDERS[p].idKey]), redirect_uri: CALLBACK(env, p), response_type: "code", scope: PROVIDERS[p].scope, state, nonce, code_challenge: await sha256b64u(verifier), code_challenge_method: "S256", prompt: "select_account" });
    if (p === "microsoft") q.set("response_mode", "query");
    const hint = url.searchParams.get("h") || "";
    if (/^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/.test(hint)) q.set("login_hint", hint); // saves retyping at the provider
    return redirect(PROVIDERS[p].auth + "?" + q, stateCookie(await sealState(env, { p, state, nonce, verifier, exp: now + STATE_TTL_MS }), STATE_TTL_MS / 1000));
  }
  const m = /^\/auth\/oauth\/callback\/(google|microsoft)$/.exec(path);
  if (!m) return new Response("Not found", { status: 404 });
  const p = m[1] as Provider;
  const st = await openState(env, cookieOf(req, STATE_COOKIE));
  if (!st || st.p !== p || typeof st.exp !== "number" || st.exp < now) return back(env, "retry");
  if (url.searchParams.get("error")) return back(env, "declined");
  const code = url.searchParams.get("code") || "";
  if (!code || url.searchParams.get("state") !== st.state || !providerOn(env, p)) return back(env, "retry");
  try {
    const tr = await doFetch(PROVIDERS[p].token, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: CALLBACK(env, p), client_id: String(env[PROVIDERS[p].idKey]), client_secret: String(env[PROVIDERS[p].secretKey]), code_verifier: st.verifier }) });
    if (!tr.ok) return back(env, "retry");
    const idToken = (await tr.json() as any).id_token;
    const jwks = await (await doFetch(PROVIDERS[p].jwks)).json() as { keys: any[] };
    const r = await verifyIdToken(p, idToken, { clientId: String(env[PROVIDERS[p].idKey]), nonce: st.nonce, now, jwks });
    if (!r.ok) return back(env, r.reason === "unverified" || r.reason === "no-email" ? "unverified" : "retry");
    const setCookie = await finish(r.email, now); // the tokens are not kept anywhere
    return redirect(`${env.CONSOLE_ORIGIN}/#/home`, setCookie, [stateCookie("", 0)]);
  } catch { return back(env, "retry"); }
}
