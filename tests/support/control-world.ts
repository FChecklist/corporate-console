// A small fake internet for the Mission Control tests: six games that answer the owner routes (each in a different mood), the home page, the payment site, the console itself and the Cloudflare list.
// No real address is used and no real password exists here: every secret in these tests is made up for the test. The fake records every call (method, address, header names) so a test can prove nothing but GETs go out
// and that the AI read key is never sent to a game.
import CFG from "../../config/control.json";
import { makeD1 } from "./d1-sqlite";
import type { ControlEnv } from "../../functions/_lib/control-core";

export const PASSWORD = "test-owner-password-" + crypto.randomUUID();
export const AI_KEY = "test-ai-read-key-" + crypto.randomUUID() + "-0123456789";
export const NOW = Date.UTC(2026, 10, 2, 11, 0, 0); // 2 Nov 2026, 16:30 IST
export type Persona = "full" | "lacking" | "refusing" | "down" | "erroring" | "test-mode" | "indexable" | "off" | "late-deletion" | "many-errors";

/** things a game must NEVER let through to Mission Control: they are planted in the fake answers and the tests look for them in every output */
export const SECRET_BITS = ["Ravi Kumar", "9876543210", "demo27@demo-test.invalid", "card-77123", "Priya Menon", "demo28@demo-test.invalid", "SECRET-NOTE-TEXT", "Subject: Winner list for Acme"];

const j = (b: unknown, status = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", ...h } });
const nf = () => j({ error: "Not found" }, 404);
const html = (robots: string, extra: Record<string, string> = {}) => new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="${robots}"><title>x</title></head><body>page</body></html>`, { status: 200, headers: { "content-type": "text/html", ...extra } });

function ledger(month: string) {
  const pay = (id: string, status: string, minor: number, test = 0, paid: string | null = "2026-11-02T05:00:00.000Z") => ({ txn_id: (test ? "PAYTEST-" : "TAM-") + id, payment_id: id, amount: minor / 100, amount_minor: minor, currency: "INR", status, method: "upi", fee_minor: Math.round(minor * 0.02), paid_utc: status === "paid" ? paid : null, paid_ist: status === "paid" ? "2026-11-02 10:30:00 IST" : null, created_utc: "2026-11-02T04:00:00.000Z", org: "Acme Ltd", is_test: test, attempts: [{ card_last4: "4242", vpa_masked: "r***@upi" }] });
  return { site: "x.pages.dev", month, summary: { site: "x", period_key: month, currency: "INR", paid_count: 2, failed_count: 1, revenue_minor: 500000, fee_minor: 0, tax_minor: 0, refunded_minor: 0, commission_accrued_minor: 1000, commission_paid_minor: 500 }, summaries: [],
    payments: [pay("a1", "paid", 300000), pay("a2", "paid", 200000, 0, "2026-11-01T05:00:00.000Z"), pay("a3", "created", 100000), pay("a4", "failed", 50000), pay("t1", "paid", 100, 1), pay("t2", "created", 100, 1)],
    refunds: [{ amount_minor: 2000, status: "processed" }], commission: [] };
}

/** one fake game: p decides the mood */
export function fakeGame(id: string, p: Persona, log: (e: any) => void) {
  return (req: Request): Response => {
    const u = new URL(req.url), path = u.pathname, owner = req.headers.get("x-organizer") === PASSWORD;
    log({ kind: "game", game: id, method: req.method, path, headers: [...req.headers.keys()] });
    if (p === "down") throw new TypeError("connection refused");
    if (path === "/version.json") return j({ commit: "abc1234def56", dirty: false, builtAt: "2026-11-01T10:00:00.000Z", game: id, version: "1.2.3", releasedAtIST: "01 Nov 2026, 22:39 IST" });
    if (path === "/api/mode") return j({ mode: p === "test-mode" ? "TEST" : "LIVE" });
    if (path === "/api/status/health") {
      if (p === "erroring") return j({ error: "boom" }, 500);
      return j({ ok: p !== "late-deletion", errors_last_hour: p === "many-errors" ? 25 : p === "full" ? 0 : 3, threshold: 20, overdue_purge: p === "late-deletion" ? 2 : 0, overdue_hours: p === "late-deletion" ? 5 : null, maintenance: p === "off", at: new Date(NOW).toISOString() });
    }
    if (path === "/") return html(p === "indexable" ? "index, follow" : "noindex, nofollow", { "x-robots-tag": p === "indexable" ? "" : "noindex" });
    if (path.startsWith("/api/owner/")) {
      if (!owner || p === "refusing") return nf();
      const lacks = p === "lacking" && ["/api/owner/funnel", "/api/owner/releases", "/api/owner/game-records"].includes(path);
      if (lacks) return nf();
      switch (path) {
        case "/api/owner/errors": return j({ lastHour: p === "many-errors" ? 25 : 0, threshold: 20, hours: [{ hour: "2026-11-02T08:00Z", errors: 2 }, { hour: "2026-11-02T09:00Z", errors: 4 }] });
        case "/api/owner/site": return j({ off: p === "off", since: p === "off" ? "2026-11-02T10:00:00.000Z" : null, note: p === "off" ? "maintenance" : null });
        case "/api/owner/visits/summary": return j({ fromDay: "2026-10-03", toDay: "2026-11-02", mode: "live", humans: { visitors: 46, sessions: 66, returningVisitors: 5, avgPagesPerSession: 2 }, bots: { sessions: 4, crawlers: 1 }, sources: [{ k: "direct", n: 30 }], landing: [{ k: "/", n: 61 }], devices: [{ k: "mobile", n: 20 }], languages: [{ k: "en", n: 40 }], countries: [{ k: "IN", n: 40 }], cities: [{ k: "SomeCity", n: 9 }], exits: { pages: 3 }, funnel: [{ step: "visit", visitors: 46 }], convertedBySource: [], sections: [{ section: "hero", views: 10 }], actions: [{ name: "start", n: 5 }], sizeChoice: [], privateCounts: [{ day: "x", dim: "ip", k: "1.2.3.4", n: 1 }], note: "n" });
        case "/api/owner/funnel": return j({ enabled: true, total: [{ event: "viewed", label: "Site viewed", count: 12 }, { event: "game_created", label: "Game created", count: 3 }], note: "ok" });
        case "/api/owner/mail-events": return j({ counts: { bounced: 1, delivered: 7 }, events: [{ id: 1, at: "2026-11-02T08:00:00.000Z", event: "bounced", to: "r***@example.com", subject: "Subject: Winner list for Acme", kind: "organizer", detail: "mailbox full for demo28@demo-test.invalid" }], keptDays: 90, webhook: "on" });
        case "/api/owner/data-requests": return j({ requests: [{ id: "r1", game: "G1", card: "card-77123", kind: "delete", note: "Please delete: Ravi Kumar, 9876543210, demo27@demo-test.invalid. SECRET-NOTE-TEXT", received: "2026-11-01T00:00:00.000Z", due: "2026-11-30T00:00:00.000Z", overdue: false, status: "open", closed: null }, { id: "r2", game: "G2", card: "card-1", kind: "access", note: "x", received: "2026-10-01T00:00:00.000Z", due: "2026-10-05T00:00:00.000Z", overdue: true, status: "open", closed: null }, { id: "r3", game: "G3", card: "c", kind: "access", note: "y", received: "a", due: "b", overdue: false, status: "done", closed: "z" }] });
        case "/api/owner/releases": return j({ current: { version: "1.2.3", date: "2026-11-01", title: "A new look", changes: ["Two columns on laptops"] }, releases: [{ version: "1.2.3", date: "2026-11-01", title: "A new look" }, { version: "1.2.2", date: "2026-10-30", title: "Before" }] });
        case "/api/owner/game-records": return j({ records: [{ gameId: "g1", org: "Acme Ltd", createdMs: NOW - 5000, keptMs: NOW, settings: {}, outcome: { winners: ["Priya Menon"] } }, { gameId: "g2", org: "Beta", createdMs: NOW - 9000, keptMs: NOW, settings: {}, outcome: {} }] });
        case "/api/owner/ledger": return j(ledger(u.searchParams.get("month") || "2026-11"));
        case "/api/owner/organizer": return j({ found: u.searchParams.get("email") === "demo21@demo-test.invalid", email: u.searchParams.get("email"), test: false, games: [{ id: "E1", state: "ended", start: "2026-10-30T10:00:00.000Z", paid: true, created: "2026-10-29T10:00:00.000Z" }], mailProblems: 0 });
      }
      return nf();
    }
    if (/^\/(signin|pricing|contact|terms|privacy|partner|pay|paytest|demo|guide|how-it-works)$/.test(path)) return html(p === "indexable" && path === "/pricing" ? "index, follow" : "noindex, nofollow");
    return new Response("missing", { status: 404 });
  };
}

export type Moods = Partial<Record<string, Persona>>;
/** the whole fake internet; moods says which game is in which mood (default: all "full") */
export function world(moods: Moods = {}, o: { home?: "ok" | "noindex" | "down"; payments?: "ok" | "down"; cf?: boolean } = {}) {
  const seen: any[] = [];
  const log = (e: any) => seen.push(e);
  const handlers = new Map<string, (r: Request) => Response>();
  for (const g of CFG.games) handlers.set(g.live, fakeGame(g.id, moods[g.id] ?? "full", log));
  const sitemap = `<urlset>${CFG.home.pages.slice(0, 10).map((p) => `<url><loc>${CFG.home.live}${p}</loc></url>`).join("")}</urlset>`;
  const homeHandler = (req: Request) => {
    const path = new URL(req.url).pathname;
    log({ kind: "home", method: req.method, path, headers: [...req.headers.keys()] });
    if (o.home === "down") throw new TypeError("connection refused");
    if (path === "/sitemap.xml") return new Response(sitemap, { status: 200 });
    if (path === "/robots.txt") return new Response("User-agent: *\nAllow: /", { status: 200 });
    if (CFG.home.pages.includes(path)) return html((CFG.home.noindexPaths || []).includes(path) || o.home === "noindex" ? "noindex, follow" : "index, follow");
    return new Response("missing", { status: 404 });
  };
  const consoleHandler = (req: Request) => { log({ kind: "console", method: req.method, path: new URL(req.url).pathname, headers: [...req.headers.keys()] }); return new URL(req.url).pathname === "/version.json" ? j({ commit: "6ef68cd...", version: "0.1.0" }) : nf(); };
  const payHandler = (req: Request) => { log({ kind: "payments", method: req.method, path: new URL(req.url).pathname, headers: [...req.headers.keys()] }); if (o.payments === "down") throw new TypeError("connection refused"); const p = new URL(req.url).pathname; if (p === "/api/pay/ping") return j({ ok: true }); if (p === "/api/pay/ledger") return req.headers.get("authorization") === "Bearer ledger-test-key" ? j(new URL(req.url).searchParams.get("view") === "issues" ? [] : [{ financial_year: "2026-27", net_minor: 1 }]) : nf(); return nf(); };
  const cfHandler = (req: Request) => {
    const u = new URL(req.url); log({ kind: "cloudflare", method: req.method, path: u.pathname, headers: [...req.headers.keys()], auth: req.headers.get("authorization") });
    const m = /\/pages\/projects\/([^/]+)(\/deployments)?$/.exec(u.pathname);
    if (!m) return nf();
    const mk = (n: number, env = "production") => ({ id: `${n.toString(16).padStart(8, "0")}-aaaa-bbbb-cccc-dddddddddddd`, created_on: new Date(NOW - n * 3600_000).toISOString(), environment: env, latest_stage: { name: "deploy", status: "success" }, deployment_trigger: { metadata: { commit_hash: "abcdef1234567" + n } } });
    if (m[2]) return j({ success: true, result: [mk(1), mk(2), mk(3, "preview"), mk(4)] });
    return j({ success: true, result: { canonical_deployment: { id: mk(1).id } } });
  };
  const fetchFn = (async (input: any, init: any = {}) => {
    const req = new Request(typeof input === "string" ? input : input.url, init);
    const origin = new URL(req.url).origin;
    if (handlers.has(origin)) return handlers.get(origin)!(req);
    if (origin === CFG.home.live) return homeHandler(req);
    if (origin === CFG.payments.live) return payHandler(req);
    if (origin === "https://api.cloudflare.com") return cfHandler(req);
    if (origin === "https://console.test") return consoleHandler(req);
    log({ kind: "stranger", method: req.method, path: req.url });
    return new Response("no such site", { status: 502 });
  }) as typeof fetch;
  const { db, raw } = makeD1(["migrations/0001_console.sql", "migrations/0005_control_history.sql"]);
  const env: ControlEnv = { DB: db, ORGANIZER_SECRET: PASSWORD, AI_CONTROL_KEY: AI_KEY, ...(o.cf ? { CF_API_TOKEN: "cf-test-token", CF_ACCOUNT_ID: "acct" } : {}) };
  const ask = (path: string, init: RequestInit & { as?: "owner" | "ai" | "none" | "wrong"; ip?: string } = {}) => {
    const { as = "owner", ip, ...rest } = init as any;
    const headers: Record<string, string> = { ...((rest.headers as any) || {}) };
    if (as === "owner") headers["x-organizer"] = PASSWORD; else if (as === "ai") headers["x-control-key"] = AI_KEY; else if (as === "wrong") headers["x-organizer"] = "nope-nope-nope";
    if (ip) headers["cf-connecting-ip"] = ip;
    return { req: new Request("https://console.test" + path, { ...rest, headers }) };
  };
  return { seen, env, db, raw, fetchFn, ask };
}
