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

export async function handleStats(req: Request, env: Env, now = Date.now(), doFetch: typeof fetch = fetch): Promise<Response> {
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
  if (path === "/stats/games" || path === "/stats/games.csv") {
    if (req.method !== "GET") return json(405, { ok: false });
    if (!ownerOk(env, req)) return json(401, { ok: false, error: "key" });
    const to = DAY.test(url.searchParams.get("to") || "") ? url.searchParams.get("to")! : istDay(now);
    const from = DAY.test(url.searchParams.get("from") || "") ? url.searchParams.get("from")! : istDay(new Date(to + "T00:00:00Z").getTime() - 29 * DAY_MS);
    const report = await gamesFunnel(env, from, to, doFetch);
    if (path === "/stats/games.csv") return new Response(funnelCsv(report), { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store", "content-disposition": 'attachment; filename="funnel-games.csv"' } });
    return json(200, { ok: true, ...report });
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

/** the thirteen steps the owner sees, in order (corporate-game-core funnel.ts names) */
export const STEPS = FUNNEL_EVENTS;
/** a game that names the payment steps the short way (Tambola: pay_started) is read with the core names */
const ALIAS: Record<string, string> = { pay_page_reached: "payment_page_reached", pay_page_opened: "payment_page_opened", pay_link_copied: "payment_link_copied", pay_started: "payment_started", pay_succeeded: "payment_succeeded", pay_failed: "payment_failed" };
const stepName = (s: unknown) => { const n = ALIAS[String(s)] || String(s); return (STEPS as readonly string[]).includes(n) ? n : null; };
const countsOf = (rows: unknown): Record<string, number> | null => {
  if (!Array.isArray(rows)) return null;
  const o: Record<string, number> = {};
  for (const r of rows) { const n = stepName((r as any)?.step); const c = (r as any)?.count; if (n && Number.isFinite(c) && c >= 0) o[n] = Math.floor(c); }
  return o;
};
export type GameFunnel = { game: string; state: "connected" | "console" | "not-connected"; total: Record<string, number>; days: { day: string; counts: Record<string, number> }[] };

/** a game's own owner funnel answer ({total:[{step,count}], days:[{period, rows}]}) in the console's shape, or null when it is not that shape */
export function readGameFunnel(j: any): { total: Record<string, number>; days: { day: string; counts: Record<string, number> }[] } | null {
  const total = countsOf(j?.total);
  if (!total || !Array.isArray(j?.days)) return null;
  const days = j.days.map((d: any) => ({ day: String(d?.period || ""), counts: countsOf(d?.rows) })).filter((d: any) => DAY.test(d.day) && d.counts);
  return { total, days };
}

/** for each game: its own owner funnel route when it has one and a key is set, else the steps the console received, else not connected yet (never an error) */
export async function gamesFunnel(env: Env, from: string, to: string, doFetch: typeof fetch) {
  let origins: Record<string, string> = {}, keys: Record<string, string> = {};
  try { origins = JSON.parse(env.GAME_ORIGINS || "{}"); } catch { /* none */ }
  try { keys = JSON.parse(env.FUNNEL_KEYS || "{}"); } catch { /* none */ }
  const mine = await counts(env, from, to);
  const games: GameFunnel[] = [];
  for (const id of Object.keys(origins)) {
    let got: ReturnType<typeof readGameFunnel> = null;
    if (typeof keys[id] === "string" && keys[id]) {
      try {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
        try {
          const r = await doFetch(`${origins[id]}/api/owner/funnel?from=${from}&to=${to}`, { headers: { "x-organizer": keys[id] }, signal: ctl.signal });
          if (r.ok) got = readGameFunnel(await r.json());
        } finally { clearTimeout(t); }
      } catch { /* not connected yet */ }
    }
    if (got) { games.push({ game: id, state: "connected", ...got }); continue; }
    const rows = mine.filter((r) => r.game === id);
    if (rows.length) {
      const total: Record<string, number> = {}, byDay = new Map<string, Record<string, number>>();
      for (const r of rows) { total[r.event] = (total[r.event] || 0) + r.visits; const d = byDay.get(r.day) || {}; d[r.event] = r.visits; byDay.set(r.day, d); }
      games.push({ game: id, state: "console", total, days: [...byDay.entries()].map(([day, c]) => ({ day, counts: c })) });
    } else games.push({ game: id, state: "not-connected", total: {}, days: [] });
  }
  return { from, to, steps: [...STEPS], games };
}

/** day by day and in total, one line per game, day and step; no personal details exist in these numbers */
export function funnelCsv(r: { games: GameFunnel[] }): string {
  const L = ["game,state,period,step,count"];
  for (const g of r.games) {
    if (g.state === "not-connected") { L.push(`${g.game},not connected yet,,,`); continue; }
    for (const s of STEPS) L.push(`${g.game},${g.state},all,${s},${g.total[s] ?? 0}`);
    for (const d of g.days) for (const s of STEPS) L.push(`${g.game},${g.state},${d.day},${s},${d.counts[s] ?? 0}`);
  }
  return L.join("\n") + "\n";
}
