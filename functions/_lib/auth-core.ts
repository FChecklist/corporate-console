// console-auth: one e-mail sign-in for the whole console. No password. A code or a one-tap link by e-mail, a cookie session, and short signed notes (assertions) for the games.
// Plain functions of (request, env, now) so they can be tested without a server. The Pages Function in functions/auth/[[path]].ts only calls handleAuth.
import type { D1 } from "../../packages/bridge/src/d1";
import { tables } from "./tables";
import { normEmail } from "../../packages/bridge/src/email";
import { signAssertion, b64uEncode, type Payload, type Act } from "../../packages/bridge/src/assertion";

export interface Env {
  DB: D1;
  TABLE_PREFIX?: string; // "" = own tables in the console's own database; "con_" = the same tables inside an existing database, with this prefix
  SESSION_PEPPER: string;
  CONSOLE_SIGNING_KEY: string; // base64 PKCS8 of the Ed25519 private key (set by the owner with wrangler, never in a repo)
  CONSOLE_KID?: string;
  CONSOLE_ORIGIN: string; // https://console.corporatetambola.com
  GAME_ORIGINS: string; // JSON: {"tambola":"https://housie.corporatetambola.com", ...}
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  TEST_MODE?: string; // "1": demo1/2/demo7@demo-test.invalid with code 123456 and no mail
  MAILER?: (to: string, subject: string, text: string) => Promise<void>; // tests
  REPORT_SECRETS?: string; // JSON {"tambola":"secret",...}: each game signs the report it posts with its own secret (HMAC-SHA256 of the body)
  BOUNCE_TOKEN?: string; // the mail service's bounce notice must carry this token
  OWNER_NOTICE_EMAIL?: string; // where the no-names notice goes when a report e-mail fails
  TICK_SECRET?: string; // the shared secret of /report/tick (set in the Pages settings by the owner, never in the repo)
  BOUNCE_ADDRESS?: string; // return-path / notice address, default hello@corporatetambola.com
}

export const CODE_TTL_MS = 30 * 60_000; // a code and its link work this long (owner decision 30 Oct); 5 wrong tries lock the code, and the rate limits stay
export const CODE_MINUTES = CODE_TTL_MS / 60_000;
export const MAX_TRIES = 5;
export const MAILS_PER_HOUR = 8; // per e-mail address
export const IP_PER_HOUR = 60; // per office address: several colleagues sign in together before an event
export const HELP_MAIL = "hello@corporatetambola.com";
export const SESSION_MS = 5 * 365 * 86400_000; // a person stays signed in until Sign out: the session slides, 5 years from the last visit (owner decision 30 Oct)
export const COOKIE = "cbsess";
const HOUR = 3600_000;
const DEMO = new Set(["demo1@demo-test.invalid", "demo2@demo-test.invalid", "demo3@demo-test.invalid"]);
const enc = new TextEncoder();

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
export const sha256hex = async (s: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));
const randHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));
export { normEmail };
export const emailHashOf = (email: string) => sha256hex("email|" + normEmail(email));
const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/;

const HEAD = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const minutes = (n: number) => (n === 1 ? "1 minute" : n + " minutes");
const tooMany = (waitMin: number) => fail(429, "rate_limited", `Too many tries. Please wait ${minutes(waitMin)} and try again, or write to ${HELP_MAIL}.`);
const json = (status: number, body: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...HEAD, ...extra } });
const fail = (status: number, error: string, message: string) => json(status, { ok: false, error, message });

// ---- sealed e-mail (needed to send mail and to prove the mailbox to a game; unreadable in the database) ----
async function sealKey(env: Env) {
  const base = await crypto.subtle.importKey("raw", enc.encode(env.SESSION_PEPPER), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode("console-seal-v1"), info: enc.encode("email") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function sealText(env: Env, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await sealKey(env), enc.encode(text)));
  return b64uEncode(iv) + "." + b64uEncode(ct);
}
export async function unsealText(env: Env, sealed: string) {
  const [a, b] = sealed.split(".");
  const un = (s: string) => { const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: un(a) }, await sealKey(env), un(b)));
}

// ---- rate limits: fixed one-hour windows ----
type Bumped = { ok: boolean; waitMin: number };
async function bump(env: Env, key: string, limit: number, now: number): Promise<Bumped> {
  // ONE atomic statement: parallel requests cannot all read "not yet at the limit"
  const r = await tables(env).prepare("INSERT INTO rate(k,n,win_start_ms) VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=CASE WHEN ?-win_start_ms>=? THEN 1 ELSE n+1 END, win_start_ms=CASE WHEN ?-win_start_ms>=? THEN ? ELSE win_start_ms END RETURNING n, win_start_ms").bind(key, now, now, HOUR, now, HOUR, now).first<{ n: number; win_start_ms: number }>();
  return { ok: !!r && r.n <= limit, waitMin: r ? Math.max(1, Math.ceil((r.win_start_ms + HOUR - now) / 60_000)) : 60 };
}

// ---- cookie session ----
const cookieHeader = (sid: string, maxAgeS: number) => `${COOKIE}=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeS}`;
const readSid = (req: Request) => { const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-f]{64})`).exec(req.headers.get("cookie") || ""); return m ? m[1] : null; };

async function startSession(env: Env, emailHash: string, sealed: string, consentMs: number | null, now: number) {
  await tables(env).prepare("INSERT INTO console_email(email_hash,email_sealed,created_ms,last_seen_ms,consent_ms) VALUES(?,?,?,?,?) ON CONFLICT(email_hash) DO UPDATE SET last_seen_ms=excluded.last_seen_ms, email_sealed=excluded.email_sealed, consent_ms=COALESCE(excluded.consent_ms, console_email.consent_ms)").bind(emailHash, sealed, now, now, consentMs).run();
  const sid = randHex(32);
  await tables(env).prepare("INSERT INTO session(sid_hash,email_hash,created_ms,last_seen_ms,expires_ms) VALUES(?,?,?,?,?)").bind(await sha256hex("sid|" + sid), emailHash, now, now, now + SESSION_MS).run();
  return json(200, { ok: true }, { "set-cookie": cookieHeader(sid, SESSION_MS / 1000) });
}

export async function sessionOf(req: Request, env: Env, now: number): Promise<{ emailHash: string; sidHash: string } | null> {
  const sid = readSid(req);
  if (!sid) return null;
  const sidHash = await sha256hex("sid|" + sid);
  const row = await tables(env).prepare("SELECT email_hash, last_seen_ms FROM session WHERE sid_hash=? AND expires_ms>?").bind(sidHash, now).first<{ email_hash: string; last_seen_ms: number }>();
  if (!row) return null;
  if (now - row.last_seen_ms > HOUR) { // sliding (5 years), written at most once an hour; the 365-day clock of the e-mail counts from here too
    await tables(env).prepare("UPDATE session SET last_seen_ms=?, expires_ms=? WHERE sid_hash=?").bind(now, now + SESSION_MS, sidHash).run();
    await tables(env).prepare("UPDATE console_email SET last_seen_ms=? WHERE email_hash=?").bind(now, row.email_hash).run();
  }
  return { emailHash: row.email_hash, sidHash };
}

// ---- mail ----
/** Test addresses (owner rule 30 Oct: demoN@demo-test.invalid) can never be delivered, so nothing is ever sent to them: the mail is only RECORDED here (the last 50, in memory), never given to the mail service. */
export const recordedMail: Array<{ to: string; subject: string; text: string }> = [];
export const isTestAddress = (to: string) => /\.invalid$/i.test(String(to).trim());
/** One mail to several people at once, with optional attachments (the end-of-game report). Test addresses (.invalid) are only recorded, never given to the mail service. */
export type Attachment = { filename: string; contentB64: string };
export async function sendMailEx(env: Env, o: { to: string[]; subject: string; text: string; attachments?: Attachment[]; replyTo?: string; from?: string }): Promise<string | undefined> {
  const real = o.to.filter((a) => !isTestAddress(a));
  for (const a of o.to.filter(isTestAddress)) { recordedMail.push({ to: a, subject: o.subject, text: o.text }); if (recordedMail.length > 50) recordedMail.shift(); }
  if (!real.length) return;
  if (env.MAILER) { for (const a of real) await env.MAILER(a, o.subject, o.text); return; }
  if (!env.RESEND_API_KEY) throw new Error("no mail key");
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ from: o.from || env.MAIL_FROM || "Corporate Games <console@corporatetambola.com>", to: real, subject: o.subject, text: o.text, ...(o.replyTo ? { reply_to: o.replyTo } : {}), ...(o.attachments?.length ? { attachments: o.attachments.map((a) => ({ filename: a.filename, content: a.contentB64 })) } : {}) }) });
  if (!r.ok) throw new Error("mail " + r.status);
  try { return String(((await r.json()) as any)?.id || "") || undefined; } catch { return undefined; } // the mail service's id of this mail, so a later bounce notice can be matched
}
async function sendMail(env: Env, to: string, subject: string, text: string) {
  if (isTestAddress(to)) { recordedMail.push({ to, subject, text }); if (recordedMail.length > 50) recordedMail.shift(); if (env.MAILER) await env.MAILER(to, subject, text); return; } // a test mailer may watch it; the real mail service never does
  if (env.MAILER) return env.MAILER(to, subject, text);
  if (!env.RESEND_API_KEY) throw new Error("no mail key");
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ from: env.MAIL_FROM || "Corporate Games <console@corporatetambola.com>", to: [to], subject, text }) });
  if (!r.ok) throw new Error("mail " + r.status);
}

async function readJson(req: Request): Promise<any | null> {
  const t = await req.text();
  if (t.length > 4096) return null;
  try { return JSON.parse(t); } catch { return null; }
}

const OK_REQUEST = { ok: true, message: `If that address can receive mail, a code is on its way. It works for ${CODE_MINUTES} minutes.`, codeMinutes: CODE_MINUTES };
const BAD_CODE = { ok: false, error: "bad_code", message: "That code is not right or has run out. Ask for a new one." };

export async function handleAuth(req: Request, env: Env, now: number): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const post = req.method === "POST";
  if (post) { // every POST must come from the console's own page: custom header (cannot be sent cross-site without a preflight) and the right Origin
    if (req.headers.get("x-console") !== "1") return fail(403, "csrf", "This request did not come from the console page.");
    const o = req.headers.get("origin");
    if (o && o !== env.CONSOLE_ORIGIN) return fail(403, "csrf", "This request did not come from the console page.");
  }
  const ip = req.headers.get("cf-connecting-ip") || "0.0.0.0";

  if (post && path === "/auth/request") {
    const b = await readJson(req);
    if (!b || typeof b.email !== "string" || !EMAIL_RE.test(normEmail(b.email))) return fail(400, "invalid", "Please type a valid e-mail address.");
    if (b.consent !== true) return fail(400, "consent", "Please tick the box to continue.");
    const email = normEmail(b.email), eh = await emailHashOf(email);
    const byIp = await bump(env, "ip:" + (await sha256hex("ip|" + ip)), IP_PER_HOUR, now);
    if (!byIp.ok) return tooMany(byIp.waitMin);
    const byMail = await bump(env, "mail:" + eh, MAILS_PER_HOUR, now);
    if (!byMail.ok) return tooMany(byMail.waitMin);
    const demo = env.TEST_MODE === "1" && DEMO.has(email);
    const code = demo ? "123456" : String(new DataView(crypto.getRandomValues(new Uint8Array(4)).buffer).getUint32(0) % 1_000_000).padStart(6, "0");
    const link = randHex(24);
    await tables(env).prepare("INSERT INTO login_code(email_hash,email_sealed,code_hash,link_hash,expires_ms,attempts,sent_ms,consent_ms) VALUES(?,?,?,?,?,0,?,?) ON CONFLICT(email_hash) DO UPDATE SET email_sealed=excluded.email_sealed, code_hash=excluded.code_hash, link_hash=excluded.link_hash, expires_ms=excluded.expires_ms, attempts=0, sent_ms=excluded.sent_ms, consent_ms=excluded.consent_ms")
      .bind(eh, await sealText(env, email), await sha256hex(`code|${env.SESSION_PEPPER}|${eh}|${code}`), await sha256hex("link|" + link), now + CODE_TTL_MS, now, now).run();
    if (!demo) {
      try { await sendMail(env, email, `Your sign-in code is ${code}`, `Your code is ${code}. It works for ${CODE_MINUTES} minutes.\n\nOr open this link and press the button:\n${env.CONSOLE_ORIGIN}/signin.html?t=${link}\n\nIf you did not ask for this, you can ignore this e-mail.`); }
      catch { return fail(502, "mail", "The system could not send the e-mail. Please try again in a minute."); }
    }
    return json(200, { ...OK_REQUEST, expiresMs: now + CODE_TTL_MS });
  }

  if (post && path === "/auth/verify") {
    const b = await readJson(req);
    if (!b || typeof b.email !== "string" || typeof b.code !== "string" || !/^\d{6}$/.test(b.code) || !EMAIL_RE.test(normEmail(b.email))) return json(401, BAD_CODE);
    const eh = await emailHashOf(b.email);
    const row = await tables(env).prepare("SELECT code_hash, email_sealed, expires_ms, attempts, consent_ms FROM login_code WHERE email_hash=?").bind(eh).first<any>();
    if (!row || row.expires_ms < now || row.attempts >= MAX_TRIES) return json(401, BAD_CODE);
    // every try is counted FIRST, in one atomic statement, so parallel guesses cannot all get past the limit
    const claim = await tables(env).prepare("UPDATE login_code SET attempts=attempts+1 WHERE email_hash=? AND code_hash=? AND attempts<?").bind(eh, row.code_hash, MAX_TRIES).run();
    if (claim.meta.changes !== 1) return json(401, BAD_CODE);
    const good = (await sha256hex(`code|${env.SESSION_PEPPER}|${eh}|${b.code}`)) === row.code_hash;
    if (!good) {
      await tables(env).prepare("DELETE FROM login_code WHERE email_hash=? AND attempts>=?").bind(eh, MAX_TRIES).run(); // the last try is used: the code is gone
      return json(401, BAD_CODE);
    }
    const gone = await tables(env).prepare("DELETE FROM login_code WHERE email_hash=? AND code_hash=?").bind(eh, row.code_hash).run();
    if (gone.meta.changes !== 1) return json(401, BAD_CODE); // used by someone else a moment ago
    return startSession(env, eh, row.email_sealed, row.consent_ms, now);
  }

  if (req.method === "GET" && path === "/auth/link") { // a mail scanner or a curious click: shows where to press, consumes nothing
    return new Response(`<!doctype html><meta charset="utf-8"><title>Sign in</title><p>To finish signing in, open <a href="${env.CONSOLE_ORIGIN}/signin.html?t=${/^[0-9a-f]{48}$/.test(url.searchParams.get("t") || "") ? url.searchParams.get("t") : ""}">this page</a> and press the button.</p>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  if (post && path === "/auth/link") {
    const b = await readJson(req);
    const linkKey = "linkfail:" + (await sha256hex("ip|" + ip));
    const fails = await tables(env).prepare("SELECT n, win_start_ms FROM rate WHERE k=?").bind(linkKey).first<{ n: number; win_start_ms: number }>();
    if (fails && now - fails.win_start_ms < HOUR && fails.n >= IP_PER_HOUR) return tooMany(Math.max(1, Math.ceil((fails.win_start_ms + HOUR - now) / 60_000)));
    const badLink = async () => { await bump(env, linkKey, IP_PER_HOUR, now); return json(401, BAD_CODE); }; // only a wrong or used link counts, a good one never does
    if (!b || typeof b.t !== "string" || !/^[0-9a-f]{48}$/.test(b.t)) return badLink();
    const lh = await sha256hex("link|" + b.t);
    const row = await tables(env).prepare("SELECT email_hash, email_sealed, consent_ms FROM login_code WHERE link_hash=? AND expires_ms>=?").bind(lh, now).first<any>();
    if (!row) return badLink();
    const gone = await tables(env).prepare("DELETE FROM login_code WHERE link_hash=? AND expires_ms>=?").bind(lh, now).run();
    if (gone.meta.changes !== 1) return badLink();
    return startSession(env, row.email_hash, row.email_sealed, row.consent_ms, now);
  }

  if (req.method === "GET" && path === "/auth/me") {
    const s = await sessionOf(req, env, now);
    if (!s) return json(200, { ok: true, signedIn: false });
    const r = await tables(env).prepare("SELECT email_sealed FROM console_email WHERE email_hash=?").bind(s.emailHash).first<{ email_sealed: string }>();
    const sid = readSid(req)!; // every visit renews the cookie too (browsers cap a cookie's life, so it is sent again each time)
    return json(200, { ok: true, signedIn: true, email: r ? await unsealText(env, r.email_sealed) : null }, { "set-cookie": cookieHeader(sid, SESSION_MS / 1000) });
  }

  if (post && path === "/auth/signout") {
    const s = await sessionOf(req, env, now);
    const b = (await readJson(req)) || {};
    if (s) {
      if (b.everywhere === true) await tables(env).prepare("DELETE FROM session WHERE email_hash=?").bind(s.emailHash).run();
      else await tables(env).prepare("DELETE FROM session WHERE sid_hash=?").bind(s.sidHash).run();
    }
    return json(200, { ok: true }, { "set-cookie": cookieHeader("0".repeat(64), 0) });
  }

  if (post && path === "/auth/close") { // "Close my account": the console forgets this e-mail and every sign-in of it. The page calls this only AFTER every game has been asked to forget the person (purge-email).
    const s = await sessionOf(req, env, now);
    if (!s) return fail(401, "signed_out", "Please sign in again.");
    const db = tables(env);
    await db.prepare("DELETE FROM session WHERE email_hash=?").bind(s.emailHash).run();
    await db.prepare("DELETE FROM login_code WHERE email_hash=?").bind(s.emailHash).run();
    await db.prepare("DELETE FROM console_email WHERE email_hash=?").bind(s.emailHash).run();
    return json(200, { ok: true }, { "set-cookie": cookieHeader("0".repeat(64), 0) });
  }

  if (post && path === "/auth/assert") {
    const s = await sessionOf(req, env, now);
    if (!s) return fail(401, "signed_out", "Please sign in again.");
    if (!(await bump(env, "assert:" + s.sidHash, 600, now)).ok) return fail(429, "rate_limited", "Too many requests. Please wait a minute.");
    const b = await readJson(req);
    if (!b || !Array.isArray(b.requests) || b.requests.length < 1 || b.requests.length > 12) return fail(400, "invalid", "The request is not complete.");
    let origins: Record<string, string>;
    try { origins = JSON.parse(env.GAME_ORIGINS); } catch { return fail(500, "config", "The console is not set up yet."); }
    const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(env.CONSOLE_SIGNING_KEY), (c) => c.charCodeAt(0)), { name: "Ed25519" }, false, ["sign"]);
    const ACTS: Act[] = ["session", "games", "billing", "invited", "role", "handoff", "stepup", "purge"];
    const out: Array<{ game: string; assertion: string | null; error?: string }> = [];
    let plain: string | null = null;
    for (const r of b.requests) {
      const aud = r && typeof r.game === "string" ? origins[r.game] : undefined;
      if (!aud || !ACTS.includes(r.act)) { out.push({ game: String(r?.game ?? ""), assertion: null, error: "invalid" }); continue; }
      if (r.act === "stepup" && !(typeof r.sa === "string" && typeof r.eid === "string")) { out.push({ game: r.game, assertion: null, error: "invalid" }); continue; }
      const p: Payload = { v: 1, kid: env.CONSOLE_KID || "k1", aud, sub: s.emailHash, act: r.act, jti: b64uEncode(crypto.getRandomValues(new Uint8Array(16))), iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 60 };
      if (typeof r.eid === "string") p.eid = r.eid;
      if (typeof r.sa === "string") p.sa = r.sa;
      if (r.em === true && (r.act === "session" || r.act === "role")) { // the plain e-mail travels only when the mailbox was proven by this very sign-in and a game must make an account or match an invitation
        if (plain === null) { const e = await tables(env).prepare("SELECT email_sealed FROM console_email WHERE email_hash=?").bind(s.emailHash).first<{ email_sealed: string }>(); plain = e ? await unsealText(env, e.email_sealed) : ""; }
        if (plain) p.em = plain;
      }
      out.push({ game: r.game, assertion: await signAssertion(p, key) });
    }
    return json(200, { ok: true, assertions: out });
  }

  return fail(404, "not_found", "There is nothing at this address.");
}
