// GET /api/me: "who is signed in?" for Home and the games, so one sign-in is enough (Console 0.4.0, "stay signed in").
// It reads the ONE console sign-in cookie (cbsess: HttpOnly, host-only on the console address, SameSite=Lax). Home and the games sit on the same site (corporatetambola.com),
// so their browser sends that cookie to the console on a credentialed fetch; this route answers with a name and an ID, or { signedIn: false }.
// Safe by design: GET only, no write except the hourly "last seen" the session already does, no e-mail, no e-mail hash, no cookie set or renewed, CORS only for Home and the six game addresses
// (https, on corporatetambola.com), credentials allowed only for those, and nothing is cached.
import { sessionOf, unsealText, sha256hex, bump, type Env } from "./auth-core";
import { tables } from "./tables";

export const ME_PER_HOUR = 1200; // per sign-in (a home page may ask on every load and every focus; a loop of requests is stopped)
export const DEFAULT_HOME_ORIGIN = "https://home.corporatetambola.com";
const SITE = "corporatetambola.com";

/** the pages that may ask: Home and the games, each an exact https origin on corporatetambola.com (anything else in the settings is ignored) */
export function meOrigins(env: Env): string[] {
  let games: string[] = [];
  try { games = Object.values(JSON.parse(env.GAME_ORIGINS || "{}")) as string[]; } catch { /* no list */ }
  return [env.HOME_ORIGIN || DEFAULT_HOME_ORIGIN, ...games].filter((o) => {
    if (typeof o !== "string") return false;
    try { const u = new URL(o); return u.origin === o && u.protocol === "https:" && (u.hostname === SITE || u.hostname.endsWith("." + SITE)); } catch { return false; }
  });
}

/** a friendly name from the part of the e-mail before the @ ("raajat.agarwal+x@..." gives "Raajat Agarwal"); the console stores no other name */
export function displayNameOf(email: string): string {
  const local = String(email).split("@")[0].split("+")[0];
  const words = local.split(/[._\-\s]+/).map((w) => w.replace(/[^\p{L}]/gu, "")).filter(Boolean).slice(0, 4);
  const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ").slice(0, 40);
  return name || "Organizer";
}

/** the public organizer ID: a one-way short form of the console's join key, so the real key (the one every game matches on) never leaves the console in this route */
export const organizerIdOf = async (emailHash: string) => "org_" + (await sha256hex("organizer|" + emailHash)).slice(0, 16);

const HEAD = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow" };
const reply = (status: number, body: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...HEAD, ...extra } });

export async function handleMe(req: Request, env: Env, now: number): Promise<Response> {
  const origin = req.headers.get("origin");
  const allowed = meOrigins(env);
  const cors: Record<string, string> = origin && allowed.includes(origin)
    ? { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "Origin, Cookie" }
    : { vary: "Origin, Cookie" };
  if (origin && !allowed.includes(origin) && origin !== env.CONSOLE_ORIGIN) return reply(403, { signedIn: false }, cors); // a page that is not Home, a game or the console itself gets nothing (and no CORS headers)
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "access-control-allow-methods": "GET, OPTIONS", "access-control-max-age": "600" } });
  if (req.method !== "GET") return reply(405, { signedIn: false }, { ...cors, allow: "GET, OPTIONS" });
  const s = await sessionOf(req, env, now);
  if (!s) return reply(200, { signedIn: false }, cors);
  if (!(await bump(env, "me:" + s.sidHash, ME_PER_HOUR, now)).ok) return reply(429, { signedIn: false }, { ...cors, "retry-after": "3600" });
  const r = await tables(env).prepare("SELECT email_sealed FROM console_email WHERE email_hash=?").bind(s.emailHash).first<{ email_sealed: string }>();
  if (!r) return reply(200, { signedIn: false }, cors); // the account was closed: the session is not real any more
  let email = ""; try { email = await unsealText(env, r.email_sealed); } catch { /* unreadable: still signed in, with the default name */ }
  return reply(200, { signedIn: true, name: displayNameOf(email), id: await organizerIdOf(s.emailHash) }, cors);
}
