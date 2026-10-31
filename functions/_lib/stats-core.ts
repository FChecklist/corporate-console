// Funnel statistics for the owner: every game site and the home page report where visitors get to (events of corporate-game-core funnel.ts).
// The console keeps one row per visit, day, game and step: a random visit id that lives only in the visitor's page, a game id, a step name, a size and a mode. No address, no IP, no cookie, no person.
// Only the owner key reads the numbers (summary as JSON, or CSV). Rows older than 400 days are deleted.
import type { Env } from "./auth-core";
import { tables } from "./tables";

/** the steps a site may report (corporate-game-core funnel.ts, FUNNEL_EVENTS) */
export const FUNNEL_EVENTS = ["viewed", "size_chosen", "signup_started", "game_created", "game_published", "payment_page_reached", "payment_page_opened", "payment_link_copied", "payment_started", "payment_succeeded", "payment_failed", "game_started", "game_completed"] as const;
const WORD = /^[a-z0-9_-]{1,24}$/;
const VISIT = /^[a-z0-9]{6,24}$/;
const DAY_MS = 86400_000, IST_MS = 19_800_000, KEEP_DAYS = 400;
/** the IST calendar day of a time, as YYYY-MM-DD */
export const istDay = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10);

const json = (status: number, body: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });

let ensured = false;
export async function ensureStatsTable(env: Env) {
  if (ensured) return;
  await tables(env).prepare("CREATE TABLE IF NOT EXISTS funnel_hit (day TEXT NOT NULL, game TEXT NOT NULL, event TEXT NOT NULL, visit TEXT NOT NULL, size INTEGER, mode TEXT, PRIMARY KEY (day, game, event, visit))").run();
  ensured = true;
}
export const resetStatsEnsured = () => { ensured = false; };

/** the sites that may report: the six games, the console and the home page */
function allowedOrigins(env: Env): string[] {
  let games: string[] = [];
  try { games = Object.values(JSON.parse(env.GAME_ORIGINS || "{}")) as string[]; } catch { /* no list */ }
  return [...games, env.CONSOLE_ORIGIN, env.HOME_ORIGIN || "https://home.corporatetambola.com"].filter((x) => typeof x === "string" && x);
}
const cors = (env: Env, req: Request): Record<string, string> => {
  const o = req.headers.get("origin") || "";
  return allowedOrigins(env).includes(o) ? { "access-control-allow-origin": o, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" } : { vary: "origin" };
};

function sameKey(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const ownerOk = (env: Env, req: Request) => !!env.STATS_OWNER_KEY && sameKey(req.headers.get("x-owner-key") || "", env.STATS_OWNER_KEY);

/** a clean row from a posted event, or null when it is not one of the allowed steps or carries anything odd */
export function cleanEvent(b: any, now: number) {
  if (!b || typeof b !== "object") return null;
  if (!(FUNNEL_EVENTS as readonly string[]).includes(b.event)) return null;
  if (typeof b.visit !== "string" || !VISIT.test(b.visit)) return null;
  if (typeof b.game !== "string" || !WORD.test(b.game) || /@|\d{6,}/.test(b.game)) return null;
  const at = typeof b.at === "number" && Number.isFinite(b.at) && Math.abs(b.at - now) < 2 * DAY_MS ? b.at : now;
  const size = typeof b.size === "number" && Number.isFinite(b.size) && b.size >= 0 && b.size <= 1_000_000 ? Math.floor(b.size) : null;
  const mode = b.mode === "auto" || b.mode === "manual" ? b.mode : null;
  return { day: istDay(at), game: b.game as string, event: b.event as string, visit: b.visit as string, size, mode };
}

/** the numbers: for each day and game, how many visits reached each step */
async function counts(env: Env, from: string, to: string) {
  await ensureStatsTable(env);
  return ((await tables(env).prepare("SELECT day, game, event, COUNT(*) AS visits FROM funnel_hit WHERE day>=? AND day<=? GROUP BY day, game, event ORDER BY day, game, event").bind(from, to).all()).results || []) as { day: string; game: string; event: string; visits: number }[];
}
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function handleStats(req: Request, env: Env, now = Date.now()): Promise<Response> {
  const url = new URL(req.url), path = url.pathname.replace(/\/+$/, "");
  if (path === "/stats/e") {
    const h = cors(env, req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (req.method !== "POST") return json(405, { ok: false }, h);
    const origin = req.headers.get("origin");
    if (origin && !allowedOrigins(env).includes(origin)) return json(403, { ok: false }, h);
    let b: any; try { b = JSON.parse((await req.text()).slice(0, 2000)); } catch { return json(400, { ok: false }, h); }
    const row = cleanEvent(b, now);
    if (!row) return json(400, { ok: false }, h);
    await ensureStatsTable(env);
    await tables(env).prepare("INSERT OR IGNORE INTO funnel_hit(day,game,event,visit,size,mode) VALUES(?,?,?,?,?,?)").bind(row.day, row.game, row.event, row.visit, row.size, row.mode).run();
    return json(202, { ok: true }, h);
  }
  if (path === "/stats/summary" || path === "/stats/csv") {
    if (req.method !== "GET") return json(405, { ok: false });
    if (!ownerOk(env, req)) return json(401, { ok: false, error: "key" });
    const to = DAY.test(url.searchParams.get("to") || "") ? url.searchParams.get("to")! : istDay(now);
    const from = DAY.test(url.searchParams.get("from") || "") ? url.searchParams.get("from")! : istDay(new Date(to + "T00:00:00Z").getTime() - 29 * DAY_MS);
    const rows = await counts(env, from, to);
    if (path === "/stats/csv") return new Response("day,game,event,visits\n" + rows.map((r) => `${r.day},${r.game},${r.event},${r.visits}`).join("\n") + "\n", { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store", "content-disposition": 'attachment; filename="funnel.csv"' } });
    const games: Record<string, Record<string, number>> = {};
    for (const r of rows) { const g = (games[r.game] ||= {}); g[r.event] = (g[r.event] || 0) + r.visits; }
    return json(200, { ok: true, from, to, steps: FUNNEL_EVENTS, games, rows });
  }
  return json(404, { ok: false });
}

/** rows older than 400 days go, at most once a day per console instance */
let lastPurge = 0;
export async function lazyStatsPurge(env: Env, now: number) {
  if (now - lastPurge < DAY_MS) return;
  lastPurge = now;
  try { await ensureStatsTable(env); await tables(env).prepare("DELETE FROM funnel_hit WHERE day<?").bind(istDay(now - KEEP_DAYS * DAY_MS)).run(); } catch { /* try again tomorrow */ }
}
