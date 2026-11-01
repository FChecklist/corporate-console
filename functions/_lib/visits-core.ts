// Visitor statistics (first-party, no personal details): page views with the path sequence, where visitors came from, time on a page, scroll depth, presses, shares, device, language and country.
// Switched off until VISITS_ON is "1". Respects Global Privacy Control and Do Not Track. Traffic flagged x-test-run is answered but never counted.
// Only the owner key reads the numbers. A path never carries its query; a referrer is kept as a host only; nothing that looks like an e-mail or a long number is kept.
import type { Env } from "./auth-core";
import { tables } from "./tables";

const WORD = /^[a-z0-9_-]{1,24}$/, VISIT = /^[a-z0-9]{6,24}$/;
const KINDS = ["page", "leave", "click", "share", "copy"];
const DAY_MS = 86400_000, IST_MS = 19_800_000, LIVE_MS = 5 * 60_000, KEEP_DAYS = 400;
const istDay = (ms: number) => new Date(ms + IST_MS).toISOString().slice(0, 10);
const clean = (s: unknown, max: number) => { const t = typeof s === "string" ? s.trim().slice(0, max) : ""; return t && !/@|\d{6,}/.test(t) ? t : null; };
const pathOnly = (s: unknown) => { const t = clean(typeof s === "string" ? s.split(/[?#]/)[0] : "", 120); return t && t.startsWith("/") ? t : null; };
const hostOnly = (s: unknown) => { try { return s ? new URL(String(s)).hostname.slice(0, 80) : null; } catch { return null; } };
const label = (s: unknown) => { const t = clean(s, 40); return t && /^[A-Za-z0-9 _.\-]+$/.test(t) ? t : null; };
const num = (x: unknown, lo: number, hi: number) => (typeof x === "number" && Number.isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : null);

export function deviceOf(ua: string, width: number | null) {
  const mobile = /Mobi|Android.+Mobile|iPhone/i.test(ua), tablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua);
  const device = tablet ? "tablet" : mobile || (width !== null && width < 700) ? "mobile" : "desktop";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Other";
  return { device, browser };
}

let ensured = false;
export const resetVisitsEnsured = () => { ensured = false; };
async function ensure(env: Env) {
  if (ensured) return;
  const db = tables(env);
  await db.prepare("CREATE TABLE IF NOT EXISTS visit_event (ts_ms INTEGER NOT NULL, day TEXT NOT NULL, game TEXT NOT NULL, visit TEXT NOT NULL, kind TEXT NOT NULL, path TEXT, ref TEXT, src TEXT, target TEXT, ms INTEGER, scroll INTEGER, device TEXT, browser TEXT, lang TEXT, country TEXT, width INTEGER)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS visit_event_day ON visit_event(day, game)").run();
  ensured = true;
}

/** a clean row from a posted event, or null */
export function cleanVisit(b: any, ua: string, country: string, now: number) {
  if (!b || typeof b !== "object" || !KINDS.includes(b.kind)) return null;
  if (typeof b.visit !== "string" || !VISIT.test(b.visit)) return null;
  if (typeof b.game !== "string" || !WORD.test(b.game)) return null;
  const width = num(b.w, 0, 10000), { device, browser } = deviceOf(ua, width);
  const u = b.utm && typeof b.utm === "object" ? [b.utm.s, b.utm.m, b.utm.c].map((x: unknown) => clean(x, 40) || "").join("|").replace(/\|+$/, "") : "";
  return { ts: now, day: istDay(now), game: b.game as string, visit: b.visit as string, kind: b.kind as string, path: pathOnly(b.path), ref: hostOnly(b.ref), src: u || null, target: label(b.target),
    ms: b.kind === "leave" ? num(b.ms, 0, 6 * 3600_000) : null, scroll: b.kind === "leave" ? num(b.scroll, 0, 100) : null, device, browser, lang: clean(b.lang, 10), country: /^[A-Z]{2}$/.test(country) ? country : null, width };
}

const json = (status: number, body: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });

export async function recordVisit(req: Request, env: Env, now: number, h: Record<string, string>): Promise<Response> {
  if (env.VISITS_ON !== "1") return json(202, { ok: true }, h); // switched off: answered, nothing kept
  if (req.headers.get("sec-gpc") === "1" || req.headers.get("dnt") === "1" || req.headers.get("x-test-run")) return json(202, { ok: true }, h);
  let b: any; try { b = JSON.parse((await req.text()).slice(0, 2000)); } catch { return json(400, { ok: false }, h); }
  const r = cleanVisit(b, req.headers.get("user-agent") || "", req.headers.get("cf-ipcountry") || "", now);
  if (!r) return json(400, { ok: false }, h);
  await ensure(env);
  await tables(env).prepare("INSERT INTO visit_event(ts_ms,day,game,visit,kind,path,ref,src,target,ms,scroll,device,browser,lang,country,width) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(r.ts, r.day, r.game, r.visit, r.kind, r.path, r.ref, r.src, r.target, r.ms, r.scroll, r.device, r.browser, r.lang, r.country, r.width).run();
  return json(202, { ok: true }, h);
}

const top = (rows: any[], k: string, n = 20) => rows.slice(0, n).map((r) => ({ [k]: r.k ?? "unknown", visitors: r.v }));
/** the numbers for the owner: live visitors, per game, per page (views, time, scroll), sources, devices, browsers, countries, languages, presses */
export async function visitSummary(env: Env, from: string, to: string, now: number) {
  await ensure(env);
  const db = tables(env), all = async (sql: string, ...a: any[]) => ((await db.prepare(sql).bind(...a).all()).results || []) as any[];
  const live = (await db.prepare("SELECT COUNT(DISTINCT visit) n FROM visit_event WHERE ts_ms>=?").bind(now - LIVE_MS).first<{ n: number }>())?.n || 0;
  const tot = await db.prepare("SELECT COUNT(DISTINCT visit) v, SUM(kind='page') p FROM visit_event WHERE day>=? AND day<=?").bind(from, to).first<{ v: number; p: number }>();
  const games = await all("SELECT game, COUNT(DISTINCT visit) visitors, SUM(kind='page') views FROM visit_event WHERE day>=? AND day<=? GROUP BY game ORDER BY visitors DESC", from, to);
  const pages = await all("SELECT game, path, SUM(kind='page') views, COUNT(DISTINCT visit) visitors, CAST(AVG(CASE WHEN kind='leave' THEN ms END) AS INTEGER) avgMs, CAST(AVG(CASE WHEN kind='leave' THEN scroll END) AS INTEGER) avgScroll FROM visit_event WHERE day>=? AND day<=? AND path IS NOT NULL GROUP BY game, path ORDER BY views DESC LIMIT 200", from, to);
  const src = await all("SELECT COALESCE(NULLIF(substr(src,1,instr(src||'|','|')-1),''), ref, 'direct') k, COUNT(DISTINCT visit) v FROM visit_event WHERE day>=? AND day<=? AND kind='page' GROUP BY k ORDER BY v DESC", from, to);
  const dim = (col: string) => all(`SELECT ${col} k, COUNT(DISTINCT visit) v FROM visit_event WHERE day>=? AND day<=? GROUP BY k ORDER BY v DESC`, from, to);
  const presses = await all("SELECT game, kind, target, COUNT(*) n FROM visit_event WHERE day>=? AND day<=? AND kind IN ('click','share','copy') GROUP BY game, kind, target ORDER BY n DESC LIMIT 100", from, to);
  return { ok: true, from, to, live, visitors: tot?.v || 0, pageViews: tot?.p || 0, games, pages, sources: top(src, "source"), devices: top(await dim("device"), "device"), browsers: top(await dim("browser"), "browser"), countries: top(await dim("country"), "country"), languages: top(await dim("lang"), "lang"), presses };
}
const csvCell = (x: unknown) => { const s = String(x ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function visitCsv(s: Awaited<ReturnType<typeof visitSummary>>) {
  const L = ["section,game,key,visitors_or_count,views,avg_seconds,avg_scroll"];
  for (const g of s.games) L.push(["game", g.game, "", g.visitors, g.views, "", ""].map(csvCell).join(","));
  for (const p of s.pages) L.push(["page", p.game, p.path, p.visitors, p.views, p.avgMs == null ? "" : Math.round(p.avgMs / 1000), p.avgScroll ?? ""].map(csvCell).join(","));
  for (const [name, rows, key] of [["source", s.sources, "source"], ["device", s.devices, "device"], ["browser", s.browsers, "browser"], ["country", s.countries, "country"], ["language", s.languages, "lang"]] as const) for (const r of rows as any[]) L.push([name, "", r[key], r.visitors, "", "", ""].map(csvCell).join(","));
  for (const p of s.presses) L.push(["press:" + p.kind, p.game, p.target, p.n, "", "", ""].map(csvCell).join(","));
  return L.join("\n") + "\n";
}
export async function purgeVisits(env: Env, now: number) { await ensure(env); await tables(env).prepare("DELETE FROM visit_event WHERE day<?").bind(istDay(now - KEEP_DAYS * DAY_MS)).run(); }
