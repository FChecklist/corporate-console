// Mission Control, STEP 1 (read only): the owner's control room for the Corporate Games family. Everything under /api/control/*.
// The console asks each game (and the sites and the Cloudflare Pages list) from the server side, so there is no cross-site browser call and no password in any address.
// Two keys, never mixed: the owner password (header x-organizer = the platform ORGANIZER_SECRET, the same one every game's own /api/owner/* uses) and the AI read key
// (header x-control-key = AI_CONTROL_KEY, accepted ONLY here, only for reading, never sent to a game). Anyone else gets the same plain 404 as for an address that does not exist.
// Nothing here changes anything anywhere: every call to a game is a GET; the one database table (control_history) is only READ here; its write helper is tools/control-history.mjs.
// No participant details: fields that could carry them (notes, card ids, subjects) are never copied, and every text from a game passes scrub() (e-mail addresses masked, long numbers removed).
import type { D1 } from "../../packages/bridge/src/d1";
import { tables } from "./tables";
import { sha256hex } from "./auth-core";
import CFG from "../../config/control.json";
import RELEASE_LOG from "../../config/release-log.json";

export interface ControlEnv {
  DB: D1;
  TABLE_PREFIX?: string;
  ORGANIZER_SECRET?: string; // the owner password (the platform key every game already knows); a Pages secret, never in a repo
  AI_CONTROL_KEY?: string; // the AI read key for /api/control/* only; a Pages secret, never in a repo
  CF_API_TOKEN?: string; CF_ACCOUNT_ID?: string; // optional: a READ-ONLY Cloudflare token for the Pages deployment list
  LEDGER_KEY?: string; // optional: the central payment site's own read key (a different secret from the owner password)
}
type Fetch = typeof fetch;
type Site = { id: string; name: string; live: string; preview?: string; project?: string; noindex?: boolean; noindexPaths?: string[]; pages?: string[]; redirectOk?: string[] };
const GAMES = CFG.games as Site[];
const HOME = CFG.home as Site;
const SLOW_MS = CFG.slowMs || 3000;

const HEAD = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: HEAD });
const notFound = () => json(404, { error: "Not found" });

// ---------------------------------------------------------------- small helpers
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n: number) => String(n).padStart(2, "0");
/** "02 Nov 2026, 16:45 IST" */
export const istText = (ms: number) => { const d = new Date(ms + 19_800_000); return `${p2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} IST`; };
const istMonth = (ms: number) => new Date(ms + 19_800_000).toISOString().slice(0, 7);
const stamp = (now: number) => ({ at: new Date(now).toISOString(), atIST: istText(now) });

function same(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+/g;
export const maskEmail = (e: string) => { const i = e.indexOf("@"); return (i > 0 ? e[0] : "") + "***" + e.slice(i); };
/** a text from a game, made safe to show: e-mail addresses masked, any run of 9 or more digits (phone, account numbers) removed, shortened */
const ID_LIKE = /^(?=.*[a-f-])[0-9a-f-]{7,64}$/i; // a commit or a deployment id (hex, with a letter or a hyphen): never cut, or a rollback id could turn into "..." by bad luck
export const scrubText = (s: string, max = 300) => (ID_LIKE.test(s) ? s : s.replace(EMAIL_RE, (m) => maskEmail(m)).replace(/\d{9,}/g, "...")).slice(0, max);
export function scrub<T>(v: T, depth = 0): T {
  if (typeof v === "string") return scrubText(v) as unknown as T;
  if (v === null || typeof v !== "object" || depth > 8) return v;
  if (Array.isArray(v)) return v.slice(0, 500).map((x) => scrub(x, depth + 1)) as unknown as T;
  const o: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = scrub(x, depth + 1);
  return o as T;
}
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : Number.isFinite(Number(x)) && x !== null && x !== "" ? Number(x) : 0);
const top = (a: unknown, n: number) => (Array.isArray(a) ? a.slice(0, n) : []);
const secs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

// ---------------------------------------------------------------- who is asking
type Who = "owner" | "ai";
export function whoIs(req: Request, env: ControlEnv): Who | null {
  const pw = env.ORGANIZER_SECRET || "", ai = env.AI_CONTROL_KEY || "";
  if (pw.length >= 8 && same(req.headers.get("x-organizer") || "", pw)) return "owner";
  // the AI key must be long, and must not be the owner password (then the two doors would be one)
  if (ai.length >= 24 && ai !== pw && same(req.headers.get("x-control-key") || "", ai)) return "ai";
  return null;
}

const WRONG_PER_HOUR = 40;
const ipKey = async (req: Request) => "ctl|" + (await sha256hex(req.headers.get("cf-connecting-ip") || "local")).slice(0, 24);
async function tooManyWrong(env: ControlEnv, req: Request, now: number) {
  try {
    const r = await tables(env).prepare("SELECT n, win_start_ms FROM rate WHERE k=?").bind(await ipKey(req)).first<{ n: number; win_start_ms: number }>();
    return !!r && now - r.win_start_ms < 3600_000 && r.n >= WRONG_PER_HOUR;
  } catch { return false; } // never let the counter break the door
}
async function noteWrong(env: ControlEnv, req: Request, now: number) {
  try {
    await tables(env).prepare("INSERT INTO rate(k,n,win_start_ms) VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=CASE WHEN win_start_ms<? THEN 1 ELSE n+1 END, win_start_ms=CASE WHEN win_start_ms<? THEN ? ELSE win_start_ms END")
      .bind(await ipKey(req), now, now - 3600_000, now - 3600_000, now).run();
  } catch { /* the door still answers 404 */ }
}

// ---------------------------------------------------------------- asking other sites (GET only)
type R = { s: "ok" | "na" | "down"; status: number; ms: number; json: any; text: string; headers: Headers | null; note?: string };
async function call(doFetch: Fetch, url: string, o: { headers?: Record<string, string>; ms?: number; text?: boolean } = {}): Promise<R> {
  const t0 = Date.now(), ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), o.ms ?? 8000);
  try {
    const r = await doFetch(url, { method: "GET", headers: o.headers, signal: ctl.signal, redirect: "manual" });
    const ms = Date.now() - t0;
    if (r.status >= 500) return { s: "down", status: r.status, ms, json: null, text: "", headers: r.headers, note: `answered ${r.status}` };
    const text = (await r.text()).slice(0, 60_000);
    let j: any = null; if (!o.text) { try { j = JSON.parse(text); } catch { /* not json */ } }
    return { s: r.status === 200 && (o.text || j !== null) ? "ok" : "na", status: r.status, ms, json: j, text: o.text ? text : "", headers: r.headers };
  } catch (e: any) {
    return { s: "down", status: 0, ms: Date.now() - t0, json: null, text: "", headers: null, note: e && e.name === "AbortError" ? "no answer in time" : "no connection" };
  } finally { clearTimeout(timer); }
}
const ownerHeaders = (env: ControlEnv) => ({ "x-organizer": env.ORGANIZER_SECRET || "" });

type Panel<T = any> = { state: "ok"; data: T } | { state: "not_available" } | { state: "refused" } | { state: "unreachable"; note?: string };
/** ownerOk: did this game accept the owner password (true), refuse it or have no owner desk (false), or could it not be asked (undefined) */
function panel<T>(r: R, ownerOk: boolean | undefined, read: (j: any) => T): Panel<T> {
  if (r.s === "ok") { try { return { state: "ok", data: scrub(read(r.json)) }; } catch { return { state: "not_available" }; } }
  if (r.s === "down") return { state: "unreachable", note: r.note };
  return ownerOk === false ? { state: "refused" } : { state: "not_available" };
}
const versionOf = (j: any) => ({ commit: String(j?.commit ?? "").replace(/\.+$/, "").slice(0, 12), dirty: !!j?.dirty, builtAt: j?.builtAt ?? null, version: j?.version ?? null, releasedAtIST: j?.releasedAtIST ?? null });

const robotsOf = (headers: Headers | null, html: string) => {
  const hdr = headers?.get("x-robots-tag") || "";
  let meta = "";
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) if (/name\s*=\s*["']robots["']/i.test(m[0])) { meta = /content\s*=\s*["']([^"']*)/i.exec(m[0])?.[1] ?? ""; break; }
  return { header: hdr || null, meta: meta || null, noindex: /noindex/i.test(hdr) || /noindex/i.test(meta) };
};

// ---------------------------------------------------------------- Overview: one traffic-light line per game and site
export type Light = "green" | "amber" | "red";
export type Line = { id: string; kind: "game" | "site" | "payments" | "console"; name: string; light: Light; reason: string; facts: Record<string, unknown> };
const worst = (a: Light, b: Light): Light => (a === "red" || b === "red" ? "red" : a === "amber" || b === "amber" ? "amber" : "green");

/** the judging rules for a game, in plain words: returns the light and the reason (all the reasons that matter, red ones first) */
export function judgeGame(g: Site, r: { version: R; mode: R; health: R; site: R; root: R }, hasPassword: boolean) {
  const red: string[] = [], amber: string[] = [];
  const dead = r.version.s === "down" && r.health.s === "down" && r.root.s === "down";
  if (dead) return { light: "red" as Light, reason: `${g.name} did not answer in time.`, facts: {} };
  const h = r.health.json || {}, mode = r.mode.s === "ok" ? String(r.mode.json?.mode ?? "") : "";
  const errs = num(h.errors_last_hour), limit = num(h.threshold) || 20;
  if (r.health.s !== "ok") red.push("The health check did not answer.");
  else {
    if (num(h.overdue_purge) > 0) red.push(`${num(h.overdue_purge)} game(s) are past the 20-hour deletion of players' details${h.overdue_hours != null ? ` (the oldest has waited ${num(h.overdue_hours)} hours)` : ""}.`);
    else if (h.ok === false) red.push("The health check says something is not right.");
    if (h.maintenance) red.push("The site is switched off and shows 'Back soon'.");
    if (errs >= limit) red.push(`${errs} errors in the last hour (the alarm is at ${limit}).`);
    else if (errs > 0) amber.push(`${errs} error${errs === 1 ? "" : "s"} in the last hour.`);
  }
  if (r.root.s === "down") red.push(r.root.note ? `The front page: ${r.root.note}.` : "The front page did not answer.");
  else if (r.root.status !== 200) red.push(`The front page answered ${r.root.status}.`);
  else {
    const rb = robotsOf(r.root.headers, r.root.text);
    if (g.noindex && !rb.noindex) red.push("The front page is not hidden from search engines.");
    if (!g.noindex && rb.noindex) red.push("The front page is hidden from search engines but should be listed.");
    if (r.root.ms > SLOW_MS) amber.push(`The front page took ${secs(r.root.ms)}.`);
  }
  if (r.version.s !== "ok") amber.push("The version file could not be read.");
  if (r.mode.s === "ok" && mode && mode !== "LIVE") amber.push(`In ${mode} mode: payments are not real.`);
  if (r.mode.s !== "ok" && g.id !== "home") amber.push("The mode (live or test) could not be read.");
  if (hasPassword && r.site.s === "na") amber.push("The owner password was not accepted by this game.");
  const facts = { commit: r.version.s === "ok" ? versionOf(r.version.json).commit : null, dirty: r.version.s === "ok" ? !!r.version.json?.dirty : null, mode: mode || null, errorsLastHour: r.health.s === "ok" ? errs : null, frontPageMs: r.root.ms, frontPageStatus: r.root.status, hidden: r.root.s !== "down" ? robotsOf(r.root.headers, r.root.text).noindex : null, off: r.health.s === "ok" ? !!h.maintenance : null };
  if (red.length) return { light: "red" as Light, reason: [...red, ...amber].join(" "), facts };
  if (amber.length) return { light: "amber" as Light, reason: amber.join(" "), facts };
  const ver = r.version.s === "ok" ? versionOf(r.version.json) : null;
  return { light: "green" as Light, reason: `Live${ver?.version ? `, version ${ver.version}` : ""}${ver?.commit ? ` (commit ${ver.commit})` : ""}, ${errs} errors in the last hour, front page in ${secs(r.root.ms)}, hidden from search engines.`, facts };
}

export async function overview(env: ControlEnv, origin: string, now: number, doFetch: Fetch) {
  const oh = ownerHeaders(env), hasPassword = !!env.ORGANIZER_SECRET;
  const games = await Promise.all(GAMES.map(async (g) => {
    const [version, mode, health, site, root] = await Promise.all([
      call(doFetch, g.live + "/version.json"), call(doFetch, g.live + "/api/mode"), call(doFetch, g.live + "/api/status/health"),
      call(doFetch, g.live + "/api/owner/site", { headers: oh }), call(doFetch, g.live + "/", { text: true }),
    ]);
    const j = judgeGame(g, { version, mode, health, site, root }, hasPassword);
    return { id: g.id, kind: "game", name: g.name, light: j.light, reason: scrubText(j.reason, 400), facts: scrub(j.facts) } as Line;
  }));
  const [homeRoot, homeVer, payPing, selfVer] = await Promise.all([
    call(doFetch, HOME.live + "/", { text: true }), call(doFetch, HOME.live + "/sitemap.xml", { text: true }),
    call(doFetch, CFG.payments.live + CFG.payments.ping), call(doFetch, origin + "/version.json"),
  ]);
  const lines: Line[] = [...games];
  { // the public home page: answering, listed in search engines
    let light: Light = "green", reason = `Answering in ${secs(homeRoot.ms)}, open to search engines, ${homeVer.s === "ok" ? "site map found" : "site map not found"}.`;
    const rb = robotsOf(homeRoot.headers, homeRoot.text);
    if (homeRoot.s !== "ok") { light = "red"; reason = homeRoot.s === "down" ? `The home page did not answer (${homeRoot.note ?? "error"}).` : `The home page answered ${homeRoot.status}.`; }
    else if (rb.noindex) { light = "red"; reason = "The home page is hidden from search engines but it should be listed."; }
    else if (homeVer.s !== "ok") { light = "amber"; reason = "The home page is fine, but its site map could not be read."; }
    else if (homeRoot.ms > SLOW_MS) { light = "amber"; reason = `The home page took ${secs(homeRoot.ms)}.`; }
    lines.push({ id: "home", kind: "site", name: HOME.name, light, reason, facts: { status: homeRoot.status, ms: homeRoot.ms, hidden: homeRoot.s === "ok" ? rb.noindex : null } });
  }
  {
    const ok = selfVer.s === "ok", v = ok ? versionOf(selfVer.json) : null;
    lines.push({ id: "console", kind: "console", name: CFG.console.name, light: ok ? "green" : "amber", reason: ok ? `Answering${v?.commit ? `, commit ${v.commit}` : ""}.` : "The console's own version file could not be read.", facts: { commit: v?.commit ?? null } });
  }
  lines.push({ id: "payments", kind: "payments", name: CFG.payments.name, light: payPing.s === "ok" ? "green" : "red", reason: payPing.s === "ok" ? `Answering in ${secs(payPing.ms)}.` : `The payment site did not answer properly (${payPing.s === "down" ? payPing.note ?? "no answer" : payPing.status}).`, facts: { ms: payPing.ms } });
  const counts = { green: 0, amber: 0, red: 0 };
  for (const l of lines) counts[l.light]++;
  return { ok: true, name: "Mission Control", readOnly: true, ...stamp(now), overall: lines.reduce<Light>((a, l) => worst(a, l.light), "green"), counts, lines };
}

// ---------------------------------------------------------------- Games: everything one game can tell, panel by panel
const maskedEvents = (j: any) => top(j?.events, 10).map((e: any) => ({ at: e.at, event: e.event, to: e.to, kind: e.kind, detail: typeof e.detail === "string" ? e.detail.slice(0, 120) : null }));
export async function gameDetail(env: ControlEnv, id: string, now: number, doFetch: Fetch) {
  const g = GAMES.find((x) => x.id === id);
  if (!g) return null;
  const oh = ownerHeaders(env), o = (p: string) => call(doFetch, g.live + p, { headers: oh });
  const [version, mode, health, errors, site, visits, funnel, mail, dreq, rel, recs] = await Promise.all([
    call(doFetch, g.live + "/version.json"), call(doFetch, g.live + "/api/mode"), call(doFetch, g.live + "/api/status/health"),
    o("/api/owner/errors"), o("/api/owner/site"), o("/api/owner/visits/summary"), o("/api/owner/funnel"), o("/api/owner/mail-events?limit=10"),
    o("/api/owner/data-requests?status=all"), o("/api/owner/releases"), o("/api/owner/game-records"),
  ]);
  const ownerOk: boolean | undefined = errors.s === "ok" ? true : errors.s === "na" ? false : undefined; // the errors route is the canary: every game has it
  const P = {
    version: version.s === "ok" ? { state: "ok" as const, data: scrub(versionOf(version.json)) } : panel(version, undefined, () => null),
    mode: mode.s === "ok" ? { state: "ok" as const, data: scrub(String(mode.json?.mode ?? "")) } : panel(mode, undefined, () => null),
    health: panel(health, undefined, (j) => ({ ok: !!j.ok, errorsLastHour: num(j.errors_last_hour), threshold: num(j.threshold), overduePurge: num(j.overdue_purge), overdueHours: j.overdue_hours ?? null, off: !!j.maintenance, at: j.at ?? null })),
    errors: panel(errors, ownerOk, (j) => ({ lastHour: num(j.lastHour), threshold: num(j.threshold), hours: top(j.hours, 48).map((h: any) => ({ hour: h.hour, errors: num(h.errors) })) })),
    site: panel(site, ownerOk, (j) => ({ off: !!j.off, since: j.since ?? null, note: j.note ?? null })),
    visits: panel(visits, ownerOk, (j) => ({ from: j.fromDay ?? null, to: j.toDay ?? null, mode: j.mode ?? null, humans: j.humans ?? null, bots: j.bots ?? null, sources: top(j.sources, 8), landing: top(j.landing, 8), devices: top(j.devices, 6), languages: top(j.languages, 6), countries: top(j.countries, 8), exits: j.exits ?? null, funnel: top(j.funnel, 12), convertedBySource: top(j.convertedBySource, 8), sections: top(j.sections, 10), actions: top(j.actions, 10), sizeChoice: top(j.sizeChoice, 10), note: j.note ?? null })),
    funnel: panel(funnel, ownerOk, (j) => ({ on: j.enabled ?? (j.flag ? j.flag !== "off" : null), steps: top(j.total, 14).map((t: any) => ({ step: t.label ?? t.event ?? t.step, count: num(t.count) })), note: j.note ?? null })),
    mail: panel(mail, ownerOk, (j) => ({ counts: j.counts ?? {}, webhook: String(j.webhook ?? "").split(" ")[0] || null, keptDays: num(j.keptDays), latest: maskedEvents(j) })),
    dataRequests: panel(dreq, ownerOk, (j) => { // counts only: the free-text note and the card id are never copied
      const list: any[] = Array.isArray(j.requests) ? j.requests : [], open = list.filter((x) => x.status === "open");
      return { total: list.length, open: open.length, overdue: open.filter((x) => x.overdue).length, done: list.filter((x) => x.status === "done").length, oldestOpenDue: open.map((x) => x.due).filter(Boolean).sort()[0] ?? null };
    }),
    releases: panel(rel, ownerOk, (j) => ({ count: Array.isArray(j.releases) ? j.releases.length : 0, current: j.current ? { version: j.current.version ?? null, date: j.current.date ?? null, title: j.current.title ?? null, changes: top(j.current.changes, 6).map((c: unknown) => String(c).slice(0, 220)) } : null })),
    gamesKept: panel(recs, ownerOk, (j) => { const list: any[] = Array.isArray(j.records) ? j.records : []; return { count: list.length, newest: list.map((x) => num(x.createdMs)).sort((a, b) => b - a)[0] ?? null }; }), // a count only: no organisation name, no result
  };
  return { ok: true, game: { id: g.id, name: g.name, live: g.live, preview: g.preview, project: g.project }, ...stamp(now), ownerPassword: ownerOk === undefined ? "unknown" : ownerOk ? "accepted" : "not accepted", panels: P };
}

// ---------------------------------------------------------------- Websites and pages
export function judgePage(site: Site, path: string, r: R) {
  const expectIndex = !site.noindex && !(site.noindexPaths || []).includes(path);
  const moved = r.status >= 300 && r.status < 400 && (site.redirectOk || []).includes(path);
  const base = { path, status: r.status, ms: r.ms, expected: expectIndex ? "listed in search engines" : "hidden from search engines" };
  if (r.s === "down") return { ...base, light: "red" as Light, note: r.note || "no answer", robots: null };
  const rb = robotsOf(r.headers, r.text);
  const robots = { header: rb.header, meta: rb.meta, noindex: rb.noindex };
  if (moved) return { ...base, light: r.ms > SLOW_MS ? "amber" as Light : "green" as Light, note: "moves to another address (allowed)", robots };
  if (r.status !== 200) return { ...base, light: "red" as Light, note: `answered ${r.status}`, robots };
  if (expectIndex && rb.noindex) return { ...base, light: "red" as Light, note: "hidden from search engines but should be listed", robots };
  if (!expectIndex && !rb.noindex) return { ...base, light: "red" as Light, note: "not hidden from search engines", robots };
  if (r.ms > SLOW_MS) return { ...base, light: "amber" as Light, note: `slow: ${secs(r.ms)}`, robots };
  return { ...base, light: "green" as Light, note: "fine", robots };
}
export function listSites() { return [HOME, ...GAMES].map((s) => ({ id: s.id, name: s.name, live: s.live, pages: (s.pages || []).length })); }
export async function websiteDetail(id: string, now: number, doFetch: Fetch) {
  const site = id === "home" ? HOME : GAMES.find((x) => x.id === id);
  if (!site) return null;
  const pages = await Promise.all((site.pages || []).map(async (p) => judgePage(site, p, await call(doFetch, site.live + p, { text: true }))));
  const extra = site.id === "home" ? await Promise.all([call(doFetch, site.live + "/sitemap.xml", { text: true }), call(doFetch, site.live + "/robots.txt", { text: true })]) : null;
  const counts = { green: 0, amber: 0, red: 0 }; for (const p of pages) counts[p.light]++;
  return { ok: true, site: { id: site.id, name: site.name, live: site.live, rule: site.noindex ? "every page hidden from search engines" : "listed in search engines (two utility pages hidden)" }, ...stamp(now), counts, pages,
    ...(extra ? { siteMap: extra[0].s === "ok" ? { urls: (extra[0].text.match(/<loc>/g) || []).length } : null, robotsTxt: extra[1].s === "ok" ? { found: true } : null } : {}) };
}

// ---------------------------------------------------------------- Payments (each game's own ledger C; the central ledger B only with its own key)
type Tally = { paid: number; waiting: number; failed: number; paidMinor: number; waitingMinor: number; feeMinor: number };
const tally = (list: any[]): Tally => {
  const t: Tally = { paid: 0, waiting: 0, failed: 0, paidMinor: 0, waitingMinor: 0, feeMinor: 0 };
  for (const p of list) {
    const s = String(p.status), m = num(p.amount_minor);
    if (s === "paid") { t.paid++; t.paidMinor += m; t.feeMinor += num(p.fee_minor); } else if (s === "failed") t.failed++; else { t.waiting++; t.waitingMinor += m; }
  }
  return t;
};
const receipt = (p: any) => ({ txn: scrubText(String(p.txn_id ?? p.payment_id ?? ""), 60), whenIST: p.paid_ist ?? null, minor: num(p.amount_minor), currency: p.currency ?? "INR", method: p.method ?? null, status: String(p.status), organisation: p.org ? scrubText(String(p.org), 60) : null });
export async function paymentsDetail(env: ControlEnv, month: string, now: number, doFetch: Fetch) {
  const perGame = await Promise.all(GAMES.map(async (g) => {
    const r = await call(doFetch, `${g.live}/api/owner/ledger?month=${month}`, { headers: ownerHeaders(env), ms: 12000 });
    if (r.s !== "ok") return { id: g.id, name: g.name, state: r.s === "down" ? "unreachable" : "not_available", note: r.note ?? null };
    const j = r.json, list: any[] = Array.isArray(j.payments) ? j.payments : [];
    const real = list.filter((p) => !p.is_test), test = list.filter((p) => p.is_test);
    const byPaid = (a: any, b: any) => String(b.paid_utc ?? b.created_utc ?? "").localeCompare(String(a.paid_utc ?? a.created_utc ?? ""));
    const refunds: any[] = Array.isArray(j.refunds) ? j.refunds : [];
    const s = j.summary || {};
    return scrub({ id: g.id, name: g.name, state: "ok", month: j.month ?? month, currency: s.currency ?? "INR",
      real: tally(real), test: tally(test),
      refunds: { count: refunds.length, minor: refunds.reduce((a, x) => a + num(x.amount_minor), 0) },
      commission: { accruedMinor: num(s.commission_accrued_minor), paidMinor: num(s.commission_paid_minor) },
      lastReceipts: real.filter((p) => String(p.status) === "paid").sort(byPaid).slice(0, 5).map(receipt),
      waitingNow: real.filter((p) => String(p.status) !== "paid" && String(p.status) !== "failed").sort(byPaid).slice(0, 5).map(receipt),
      lastTests: test.sort(byPaid).slice(0, 3).map(receipt) });
  }));
  const total = { paid: 0, waiting: 0, failed: 0, paidMinor: 0, waitingMinor: 0, feeMinor: 0, refundsMinor: 0, testPaid: 0, testWaiting: 0, testFailed: 0 };
  for (const g of perGame as any[]) if (g.state === "ok") { for (const k of ["paid", "waiting", "failed", "paidMinor", "waitingMinor", "feeMinor"] as const) total[k] += g.real[k]; total.refundsMinor += g.refunds.minor; total.testPaid += g.test.paid; total.testWaiting += g.test.waiting; total.testFailed += g.test.failed; }
  let central: any = { state: "not_connected", note: "The central payment site needs its own read key (LEDGER_KEY). Until it is added here, only each game's own ledger is shown." };
  if (env.LEDGER_KEY) {
    const h = { authorization: "Bearer " + env.LEDGER_KEY };
    const [pnl, issues] = await Promise.all([call(doFetch, CFG.payments.live + "/api/pay/ledger?view=pnl_summary", { headers: h, ms: 12000 }), call(doFetch, CFG.payments.live + "/api/pay/ledger?view=issues", { headers: h, ms: 12000 })]);
    central = pnl.s === "ok" && issues.s === "ok" ? { state: "ok", issues: Array.isArray(issues.json) ? issues.json.length : null, summary: scrub(top(pnl.json, 24)) } : { state: pnl.s === "down" || issues.s === "down" ? "unreachable" : "refused" };
  }
  return { ok: true, ...stamp(now), month, currencyNote: "Amounts are in rupees; test payments (Rs 1 payment tests) are kept apart and never added to the real totals.", total, games: perGame, central };
}

// ---------------------------------------------------------------- Logs and errors
export async function logsDetail(env: ControlEnv, now: number, doFetch: Fetch) {
  const oh = ownerHeaders(env);
  const games = await Promise.all(GAMES.map(async (g) => {
    const [errors, mail, dreq] = await Promise.all([call(doFetch, g.live + "/api/owner/errors", { headers: oh }), call(doFetch, g.live + "/api/owner/mail-events?limit=10", { headers: oh }), call(doFetch, g.live + "/api/owner/data-requests?status=all", { headers: oh })]);
    const ownerOk: boolean | undefined = errors.s === "ok" ? true : errors.s === "na" ? false : undefined;
    return { id: g.id, name: g.name,
      errors: panel(errors, ownerOk, (j) => ({ lastHour: num(j.lastHour), threshold: num(j.threshold), hours: top(j.hours, 48).map((h: any) => ({ hour: h.hour, errors: num(h.errors) })) })),
      mail: panel(mail, ownerOk, (j) => ({ counts: j.counts ?? {}, latest: maskedEvents(j) })),
      dataRequests: panel(dreq, ownerOk, (j) => { const l: any[] = Array.isArray(j.requests) ? j.requests : [], open = l.filter((x) => x.status === "open"); return { total: l.length, open: open.length, overdue: open.filter((x) => x.overdue).length }; }) };
  }));
  const sum = { errors24h: 0, lastHour: 0, mailProblems: 0, openRequests: 0, overdueRequests: 0 };
  for (const g of games) {
    if (g.errors.state === "ok") { sum.lastHour += g.errors.data.lastHour; sum.errors24h += g.errors.data.hours.reduce((a: number, h: any) => a + h.errors, 0); }
    if (g.mail.state === "ok") sum.mailProblems += num(g.mail.data.counts?.bounced) + num(g.mail.data.counts?.complained);
    if (g.dataRequests.state === "ok") { sum.openRequests += g.dataRequests.data.open; sum.overdueRequests += g.dataRequests.data.overdue; }
  }
  return { ok: true, ...stamp(now), note: "Counts and times only. A request's free text and a player's card are never copied here.", summary: sum, games };
}

// ---------------------------------------------------------------- Releases and history
async function readHistory(env: ControlEnv, limit: number) {
  try {
    const rows = ((await tables(env).prepare("SELECT id, at_ms, who, site, what, result, ref FROM control_history ORDER BY at_ms DESC, id DESC LIMIT ?").bind(limit).all()).results || []) as any[];
    return { state: "ok" as const, rows: rows.map((r) => scrub({ id: r.id, at: new Date(r.at_ms).toISOString(), atIST: istText(r.at_ms), who: r.who, site: r.site, what: r.what, result: r.result, ref: r.ref ?? null })) };
  } catch { return { state: "not_created" as const, rows: [] as any[] }; }
}
const cf = (env: ControlEnv, doFetch: Fetch, path: string) => call(doFetch, "https://api.cloudflare.com/client/v4" + path, { headers: { authorization: "Bearer " + env.CF_API_TOKEN }, ms: 12000 });
async function deployments(env: ControlEnv, doFetch: Fetch) {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) return { state: "not_connected" as const, note: "Add a read-only Cloudflare token (CF_API_TOKEN and CF_ACCOUNT_ID) to see the deployment list and rollback ids here." };
  const projects = [...GAMES, HOME, CFG.console, CFG.payments].map((s: any) => ({ id: s.id as string, name: s.name as string, project: s.project as string }));
  const rows = await Promise.all(projects.map(async (p) => {
    const [list, proj] = await Promise.all([cf(env, doFetch, `/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${p.project}/deployments?per_page=8`), cf(env, doFetch, `/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${p.project}`)]);
    if (list.s !== "ok" || !Array.isArray(list.json?.result)) return { ...p, state: list.s === "down" ? "unreachable" : "refused", deployments: [] as any[] };
    const liveId = proj.json?.result?.canonical_deployment?.id ?? null;
    const ds = list.json.result.map((d: any) => ({ id: String(d.id), short: String(d.id).slice(0, 8), createdOn: d.created_on, createdIST: d.created_on ? istText(Date.parse(d.created_on)) : null, environment: d.environment, status: d.latest_stage?.status ?? null, commit: d.deployment_trigger?.metadata?.commit_hash ? String(d.deployment_trigger.metadata.commit_hash).slice(0, 7) : null, live: d.id === liveId }));
    const prod = ds.filter((d: any) => d.environment === "production" && d.status === "success");
    const liveIdx = prod.findIndex((d: any) => d.live), idx = liveIdx >= 0 ? liveIdx : 0;
    return scrub({ ...p, state: "ok", liveId, rollbackId: prod[idx + 1]?.id ?? null, deployments: ds });
  }));
  return { state: "ok" as const, projects: rows };
}
export async function releasesDetail(env: ControlEnv, now: number, doFetch: Fetch) {
  const oh = ownerHeaders(env);
  const [games, dep, history] = await Promise.all([
    Promise.all(GAMES.map(async (g) => {
      const [v, r] = await Promise.all([call(doFetch, g.live + "/version.json"), call(doFetch, g.live + "/api/owner/releases", { headers: oh })]);
      return { id: g.id, name: g.name, version: v.s === "ok" ? scrub(versionOf(v.json)) : null,
        notes: panel(r, undefined, (j) => ({ count: Array.isArray(j.releases) ? j.releases.length : 0, latest: top(j.releases, 5).map((x: any) => ({ version: x.version ?? null, date: x.date ?? null, title: x.title ?? null })) })) };
    })),
    deployments(env, doFetch), readHistory(env, 50),
  ]);
  return { ok: true, ...stamp(now), games, cloudflare: dep, releaseLog: { source: (RELEASE_LOG as any).source, mirroredAt: (RELEASE_LOG as any).mirroredAt, entries: (RELEASE_LOG as any).entries.slice(0, 60) }, history };
}

// ---------------------------------------------------------------- Organizer lookup (owner only; read only; the address asked about is shown masked and kept nowhere)
async function organizerLookup(env: ControlEnv, req: Request, now: number, doFetch: Fetch) {
  let b: any = null; try { b = JSON.parse((await req.text()).slice(0, 1000)); } catch { /* bad body */ }
  const g = GAMES.find((x) => x.id === b?.game), email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!g || !/^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/.test(email)) return json(400, { ok: false, error: "Say which game and the organizer's e-mail address." });
  const r = await call(doFetch, `${g.live}/api/owner/organizer?email=${encodeURIComponent(email)}`, { headers: ownerHeaders(env) });
  if (r.s === "down") return json(502, { ok: false, error: "That game did not answer just now." });
  if (r.s !== "ok") return json(200, { ok: true, game: g.id, state: "not_available" });
  const j = r.json || {};
  return json(200, scrub({ ok: true, ...stamp(now), game: g.id, state: "ok", found: !!j.found, email: maskEmail(email), mailProblems: num(j.mailProblems), games: top(j.games, 50).map((x: any) => ({ id: x.id, state: x.state, start: x.start, paid: !!x.paid, created: x.created })) }));
}

// ---------------------------------------------------------------- the manifest for the AI, and the door
const ENDPOINTS = [
  ["GET /api/control/ping", "who is asking (owner or ai) and the console version"],
  ["GET /api/control/overview", "one traffic-light line per game and site, with the reason in plain words"],
  ["GET /api/control/games", "the six game ids; then GET /api/control/game?id=<id> for everything one game can tell"],
  ["GET /api/control/websites", "the sites and how many pages each has; then GET /api/control/websites?site=<id> for a live check of each page (status, speed, search-engine rule)"],
  ["GET /api/control/payments?month=YYYY-MM", "payments per game: paid, waiting, failed, last receipts; test payments apart"],
  ["GET /api/control/logs", "errors by hour, mail problems and data requests per game"],
  ["GET /api/control/releases", "live version per game, release notes, Cloudflare deployments with rollback ids (when connected), the release log and the history table"],
  ["GET /api/control/history?limit=50", "the append-only history table (when, who, site, what, result)"],
  ["POST /api/control/organizer", "owner password only: {game, email} shows that organizer's games (read only)"],
];
export const manifest = () => ({ name: "Mission Control", step: 1, readOnly: true, auth: "header x-organizer (owner password) or header x-control-key (AI read key); anything else answers 404", games: GAMES.map((g) => g.id), endpoints: ENDPOINTS.map(([call, what]) => ({ call, what })) });

/** the door. Plain function of (request, env, now, fetch) so it is tested without a server. */
export async function handleControl(req: Request, env: ControlEnv, now = Date.now(), doFetch: Fetch = fetch): Promise<Response> {
  const url = new URL(req.url), path = url.pathname.replace(/\/+$/, "");
  if (path !== "/api/control" && !path.startsWith("/api/control/")) return notFound();
  if (await tooManyWrong(env, req, now)) return notFound();
  const who = whoIs(req, env);
  if (!who) { await noteWrong(env, req, now); return notFound(); }
  const sub = path.slice("/api/control".length) || "/", q = url.searchParams;
  try {
    if (req.method === "POST" && sub === "/organizer") return who === "owner" ? await organizerLookup(env, req, now, doFetch) : notFound();
    if (req.method !== "GET") return notFound();
    if (sub === "/ping") return json(200, { ok: true, who, ...stamp(now) });
    if (sub === "/schema") return json(200, { ok: true, ...manifest() });
    if (sub === "/overview") return json(200, await overview(env, url.origin, now, doFetch));
    if (sub === "/games") return json(200, { ok: true, games: GAMES.map((g) => ({ id: g.id, name: g.name, live: g.live })) });
    if (sub === "/game") { const d = await gameDetail(env, q.get("id") || "", now, doFetch); return d ? json(200, d) : notFound(); }
    if (sub === "/websites") { if (!q.get("site")) return json(200, { ok: true, sites: listSites() }); const d = await websiteDetail(q.get("site")!, now, doFetch); return d ? json(200, d) : notFound(); }
    if (sub === "/payments") { const m = q.get("month") || istMonth(now); return /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? json(200, await paymentsDetail(env, m, now, doFetch)) : json(400, { ok: false, error: "month must be YYYY-MM" }); }
    if (sub === "/logs") return json(200, await logsDetail(env, now, doFetch));
    if (sub === "/releases") return json(200, await releasesDetail(env, now, doFetch));
    if (sub === "/history") return json(200, { ok: true, ...stamp(now), history: await readHistory(env, Math.max(1, Math.min(200, Number(q.get("limit")) || 50))) });
  } catch {
    return json(500, { ok: false, error: "Mission Control could not read this just now. Please try again." });
  }
  return notFound();
}
