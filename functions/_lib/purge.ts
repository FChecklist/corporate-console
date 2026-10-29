// The 365-day rule for the console's own data, plus the signed "forget this e-mail" call to every game.
// A login e-mail is deleted at midnight IST at the END of day 365, counted from the last sign-in (day 0 = the day of the last sign-in).
// Invoices and legal records live in the games and are not touched by this.
import { signAssertion, b64uEncode, type Payload } from "../../packages/bridge/src/assertion";
import type { Env } from "./auth-core";
import { tables } from "./tables";

export const DAY_MS = 86400_000;
const IST_MS = 19_800_000;
export const RETENTION_DAYS = 365;
export const GRACE_MS = 7 * DAY_MS; // a game that cannot be reached is retried for a week, then the console deletes anyway (each game also has its own safety-net tick)

/** start (UTC ms) of the IST calendar day that contains ms */
export const istDayStart = (ms: number) => Math.floor((ms + IST_MS) / DAY_MS) * DAY_MS - IST_MS;
/** the moment (UTC ms) an e-mail last seen at lastSeenMs must be gone: 00:00 IST on the day after day 365 */
export const deleteAtMs = (lastSeenMs: number) => istDayStart(lastSeenMs) + (RETENTION_DAYS + 1) * DAY_MS;

export async function purgeExpired(env: Env, now: number, doFetch: typeof fetch = fetch) {
  const out = { codes: 0, sessions: 0, rates: 0, emails: 0, deferred: 0, gameCalls: 0, gameFailures: 0 };
  out.codes = (await tables(env).prepare("DELETE FROM login_code WHERE expires_ms<?").bind(now - DAY_MS).run()).meta.changes;
  out.sessions = (await tables(env).prepare("DELETE FROM session WHERE expires_ms<?").bind(now).run()).meta.changes;
  out.rates = (await tables(env).prepare("DELETE FROM rate WHERE win_start_ms<?").bind(now - 2 * 3600_000).run()).meta.changes;
  // e-mails whose time has come: last_seen + 366 IST days (midnight) is not after now
  // anything due was last seen more than 365 days ago (the exact IST-midnight rule is checked per row)
  const rows = (await tables(env).prepare("SELECT email_hash, last_seen_ms FROM console_email WHERE last_seen_ms<=? LIMIT 500").bind(now - RETENTION_DAYS * DAY_MS).all<{ email_hash: string; last_seen_ms: number }>()).results;
  const due = rows.filter((r) => now >= deleteAtMs(r.last_seen_ms));
  if (!due.length) return out;
  let origins: Record<string, string> = {};
  try { origins = JSON.parse(env.GAME_ORIGINS); } catch { /* no games configured */ }
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(env.CONSOLE_SIGNING_KEY), (c) => c.charCodeAt(0)), { name: "Ed25519" }, false, ["sign"]);
  for (const r of due) {
    let allOk = true;
    for (const aud of Object.values(origins)) {
      const p: Payload = { v: 1, kid: env.CONSOLE_KID || "k1", aud, sub: r.email_hash, act: "purge", jti: b64uEncode(crypto.getRandomValues(new Uint8Array(16))), iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 60 };
      out.gameCalls++;
      try {
        const res = await doFetch(aud + "/api/console/purge-email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assertion: await signAssertion(p, key) }) });
        if (!(res.ok || res.status === 404)) { allOk = false; out.gameFailures++; } // 404 = that game's bridge is dark: nothing to forget there
      } catch { allOk = false; out.gameFailures++; }
    }
    if (!allOk && now < deleteAtMs(r.last_seen_ms) + GRACE_MS) { out.deferred++; continue; }
    await tables(env).prepare("DELETE FROM session WHERE email_hash=?").bind(r.email_hash).run();
    await tables(env).prepare("DELETE FROM login_code WHERE email_hash=?").bind(r.email_hash).run();
    await tables(env).prepare("DELETE FROM console_email WHERE email_hash=?").bind(r.email_hash).run();
    out.emails++;
  }
  return out;
}
