// bun e2e/part1/lib/stack.ts
// The local world for the Part 1 organizer journey. Same pieces as tools/browser-tests/stack.ts (the console built with its real _headers, the real sign-in service on an
// in-memory database, fake games that speak contract v1) PLUS what the journey needs and that stack does not have:
//   - a clock the tests can move forward (code expiry, session expiry, 24 h / 365 d rules)
//   - the whole test mailbox (GET /__stack/mail), every mail the console "sent"
//   - the control route of docs/CONTROL_CONTRACT.md (start / pause / resume) and the optional game-row fields (startMode, paused, joinUrl, reportStatus)
//   - a stand-in for the game's own wizard (create a draft, change its date / size / start format)
//   - a stand-in for the payment provider (Moneypenny): modes ok | busy (PAY_VIA_MONEYPENNY off) | fail. NOTHING here can take real money.
//   - /report/* (end-of-game report) wired to the real handler, with test secrets
// Prints ONE line `STACK {json}` when ready, then runs until stopped. Nothing leaves this machine; no real address is used.
import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import { makeD1 } from "../../../tests/support/d1-sqlite";
import { handleAuth, recordedMail, type Env } from "../../../functions/_lib/auth-core";
import { handleReport } from "../../../functions/_lib/report-core";
import { purgeExpired } from "../../../functions/_lib/purge";
import { handle, newGame, emailHash } from "../../../tools/fake-game/server.mjs";
import { makeKeyPair, parseKeyList } from "../../../packages/bridge/src/assertion";
import { build, gamesConfigJs, headersFile } from "../../../build.mjs";
import { parseHeaders } from "../../../tools/serve-dist.mjs";

const ROOT = new URL("../../../", import.meta.url);
const cfg = JSON.parse(readFileSync(new URL("config/games.json", ROOT), "utf8"));
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
export const REPORT_SECRET = "e2e-report-secret";
export const TICK_SECRET = "e2e-tick-secret";

let offset = 0;
const clock = () => Date.now() + offset;
const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, x-organizer, x-console-step", "access-control-allow-methods": "GET, POST, OPTIONS" };
const J = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS } });

const kp = await makeKeyPair();
const keys = parseKeyList("k1:" + kp.publicB64u);
const ready = cfg.games.filter((g: any) => g.ready);
const games: Record<string, any> = {}, ports: Record<string, string> = {}, ext: Record<string, Record<string, any>> = {}; // ext[game][eid] = optional row fields
const mailsOfGames: Array<{ game: string; to: string; kind: string; text: string }> = []; // mails the GAMES would send (stand-in), kept apart from the console's own mail

for (const g of ready) {
  const S: any = newGame({ game: g.id, name: "Corporate " + g.name, persona: "normal", origin: "", keys });
  Object.defineProperty(S, "nowMs", { get: () => clock(), set: () => {} });
  S.slowMs = 0; S.hits = [];
  ext[g.id] = {};
  const srv = Bun.serve({
    port: 0, hostname: "127.0.0.1",
    fetch: async (req) => {
      const url = new URL(req.url);
      S.hits.push(req.method + " " + url.pathname);
      if (url.pathname.startsWith("/screenview/")) return new Response("<!doctype html><meta charset=utf-8><title>Preview</title><body style='font:20px sans-serif;padding:24px'><h1>Player's screen</h1>", { headers: { "content-type": "text/html" } });
      if (url.pathname === "/signin.html") return new Response("<!doctype html><meta charset=utf-8><title>Game wizard (stand-in)</title><body><h1 id=wiz>Game wizard (stand-in)</h1>", { headers: { "content-type": "text/html" } }); // the game's own page where a hand-over lands
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      if (url.pathname === "/api/console/control" && req.method === "POST" && S.persona !== "down") return control(S, req);
      const res = await handle(S, req);
      if (req.method === "POST" && url.pathname === "/api/console/games" && res.ok) { // add the optional row fields of docs/CONTROL_CONTRACT.md section 2
        const j: any = await res.clone().json();
        j.games = j.games.map((r: any) => ({ ...r, ...(ext[g.id][r.eid] || {}) }));
        return new Response(JSON.stringify(j), { status: 200, headers: res.headers });
      }
      return res;
    },
  });
  S.origin = `http://127.0.0.1:${srv.port}`; games[g.id] = S; ports[g.id] = S.origin;
}

/** docs/CONTROL_CONTRACT.md section 1: key -> role -> state, in that order */
async function control(S: any, req: Request) {
  const k = S.authKeys.get(req.headers.get("x-organizer") || "");
  const body: any = await req.json().catch(() => null);
  if (!k || k.expiresMs <= S.nowMs || (k.eid && body?.eid !== k.eid)) return J(401, { ok: false, error: "key" });
  const g = S.games.find((x: any) => x.eid === body?.eid);
  const role = g && (k.kind === "master" ? (g.orgSub === k.sub ? "organizer" : null) : k.kind === "host" && k.eid === g.eid ? "host" : null);
  if (!g || !role) return J(403, { ok: false, error: "role" });
  const e = ext[S.game][g.eid] || (ext[S.game][g.eid] = {});
  const manual = String(e.startMode || "").startsWith("manual");
  if (body.op === "start") { if (!manual || g.status !== "ready") return J(409, { ok: false, error: "state" }); g.status = "playing"; g.nextAction = "run"; e.paused = false; }
  else if (body.op === "pause") { if (g.status !== "playing" || e.paused) return J(409, { ok: false, error: "state" }); e.paused = true; }
  else if (body.op === "resume") { if (g.status !== "playing" || !e.paused) return J(409, { ok: false, error: "state" }); e.paused = false; }
  else return J(400, { ok: false, error: "invalid" });
  S.log.push({ eid: g.eid, seq: S.log.length + 1, tsMs: S.nowMs, kind: body.op, who: role, text: body.op, data: {} });
  return J(200, { ok: true, state: g.status === "playing" ? (e.paused ? "paused" : "playing") : "ready", paused: !!e.paused, atMs: S.nowMs });
}

// ---- the console itself ----
const testCfg = { ...cfg, games: cfg.games.map((g: any) => ({ ...g, test: ports[g.id] || g.test })), consoleOrigin: { ...cfg.consoleOrigin, test: "http://127.0.0.1:0" } };
const dist = mkdtempSync(join(tmpdir(), "e2e1-dist-"));
const rel = JSON.parse(readFileSync(new URL("releases.json", ROOT), "utf8"))[0];
build({ env: "test", out: dist, version: rel.version, releasedAt: rel.releasedAt });
writeFileSync(join(dist, "core/games.config.js"), gamesConfigJs(testCfg, "test"));
const headers = headersFile(testCfg, "test");
writeFileSync(join(dist, "_headers"), headers);
const blocks = parseHeaders(headers);
const matches = (pattern: string, path: string) => pattern === path || (pattern.endsWith("/*") && path.startsWith(pattern.slice(0, -1))) || pattern === "/*";

const { db } = makeD1();
const wouldDeliver: Array<{ to: string; subject: string; text: string }> = []; // mails to NON-test addresses: they reach the mailer (the real mail service in production)
const env: Env = {
  DB: db, SESSION_PEPPER: "e2e-pepper", CONSOLE_SIGNING_KEY: btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey)))),
  CONSOLE_ORIGIN: "", GAME_ORIGINS: JSON.stringify(ports),
  MAILER: async (to, subject, text) => { wouldDeliver.push({ to, subject, text }); },
  REPORT_SECRETS: JSON.stringify(Object.fromEntries(ready.map((g: any) => [g.id, REPORT_SECRET]))), TICK_SECRET, BOUNCE_TOKEN: "e2e-bounce", OWNER_NOTICE_EMAIL: "owner@demo-test.invalid",
};

const pay = async (S: any, g: any, mode: string) => {
  // THE PAYMENT STAND-IN (Moneypenny double). ok = the provider confirms; busy = PAY_VIA_MONEYPENNY is off, the safe "busy" state, nothing changes; fail = the provider refuses.
  if (mode === "busy") return { ok: false, state: "busy", message: "Payment is busy. Please try again in a few minutes." };
  if (mode === "fail") return { ok: false, state: "failed", message: "The payment was not completed." };
  const price = 239900;
  g.status = "ready"; g.nextAction = "share"; g.pack = g.cap; g.payment = { state: "paid", amountMinor: price, currency: "INR" };
  S.billing = S.billing.filter((b: any) => b.eid !== g.eid);
  S.billing.push({ sub: g.orgSub, tsMs: S.nowMs, game: S.game, eid: g.eid, gameName: g.name, what: "pack", amountMinor: price, currency: "INR", status: "paid", paidBy: "organizer", invoice: "/api/invoice/inv_" + hex(16) });
  mailsOfGames.push({ game: S.game, to: "(organizer of " + g.eid + ")", kind: "payment-confirmation (stand-in)", text: "Payment received for " + g.name });
  return { ok: true, state: "paid" };
};

const stackApi = async (req: Request, url: URL) => {
  const p = url.pathname.replace("/__stack", "");
  const b: any = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const S = (id: string) => games[id];
  if (p === "/mail") return J(200, { recorded: recordedMail, wouldDeliver, gameMails: mailsOfGames });
  if (p === "/mail/clear") { recordedMail.length = 0; wouldDeliver.length = 0; mailsOfGames.length = 0; return J(200, { ok: true }); }
  if (p === "/reset-rates") { await db.prepare("DELETE FROM rate").run(); return J(200, { ok: true }); }
  if (p === "/clock") { offset += Number(b.advanceMs || 0); if (b.reset) offset = 0; return J(200, { now: clock(), offset }); }
  if (p === "/expire-session") { // the server forgets this person's sessions (a session that ran out, or was ended elsewhere)
    const eh = await emailHash(b.email);
    const r = await db.prepare("DELETE FROM session WHERE email_hash=?").bind(eh).run();
    return J(200, { removed: r.meta.changes });
  }
  if (p === "/persona") { S(b.game).persona = b.persona; S(b.game).slowMs = b.slowMs ?? 0; return J(200, { ok: true }); }
  if (p === "/game/create") { // stand-in for the game's own wizard: a draft for this e-mail (never mails, never pays)
    const s = S(b.game), sub = await emailHash(b.email), eid = b.eid || ("E" + hex(3).toUpperCase());
    s.people.add(sub);
    s.games.push({ eid, orgSub: sub, name: b.name || eid + " party", status: b.status || "draft", startMs: b.startMs === undefined ? s.nowMs + 3 * 86400_000 : b.startMs, cap: b.cap || 100, pack: b.pack ?? 0, payment: b.payment || { state: "none" }, nextAction: b.nextAction || "publish", createdMs: s.nowMs, orgLabel: "Acme Corp" });
    ext[b.game][eid] = { ...(b.ext || {}) };
    return J(200, { eid });
  }
  if (p === "/game/patch") { const s = S(b.game), g = s.games.find((x: any) => x.eid === b.eid); if (!g) return J(404, { ok: false }); Object.assign(g, b.patch || {}); ext[b.game][b.eid] = { ...(ext[b.game][b.eid] || {}), ...(b.ext || {}) }; return J(200, { ok: true }); }
  if (p === "/game/get") { const s = S(url.searchParams.get("game")!), g = s.games.find((x: any) => x.eid === url.searchParams.get("eid")); return J(200, { game: g || null, ext: ext[s.game][url.searchParams.get("eid")!] || null }); }
  if (p === "/game/credit") { const s = S(b.game), sub = await emailHash(b.email); s.credit = { sub, balanceMinor: b.balanceMinor, currency: "INR", expiresMs: s.nowMs + 300 * 86400_000 }; return J(200, { ok: true }); }
  if (p === "/game/role") { const s = S(b.game), sub = await emailHash(b.email); s.people.add(sub); s.roles.push({ roleId: hex(5), eid: b.eid, role: b.role, sub, state: b.state || "accepted", emailHint: "x***@x.in" }); return J(200, { ok: true }); }
  if (p === "/game/billing") { const s = S(b.game), sub = await emailHash(b.email); s.billing.push({ sub, tsMs: s.nowMs, game: s.game, eid: b.eid, gameName: b.gameName, what: "pack", amountMinor: b.amountMinor ?? 239900, currency: b.currency || "INR", status: b.status || "paid", paidBy: b.paidBy || "organizer", invoice: b.invoice === undefined ? "/api/invoice/inv_" + hex(16) : b.invoice }); return J(200, { ok: true }); }
  if (p === "/game/pay") { const s = S(b.game), g = s.games.find((x: any) => x.eid === b.eid); if (!g) return J(404, { ok: false }); return J(200, await pay(s, g, b.mode || "ok")); }
  if (p === "/game/hits") { const s = S(url.searchParams.get("game")!); return J(200, { hits: s.hits, calls: s.calls }); }
  if (p === "/game/hits/clear") { const s = S(b.game); s.hits.length = 0; s.calls.length = 0; return J(200, { ok: true }); }
  if (p === "/purge") return J(200, await purgeExpired(env, clock(), fetch));
  if (p === "/idtool.html") return new Response(`<!doctype html><meta charset=utf-8><title>ID reader</title><textarea id=in rows=10 cols=40></textarea><button id=go>Check</button><ul id=out></ul>
<script type=module>import { checkEmployeeId, EMPLOYEE_ID_MAX } from "/__stack/employee-id.js";
// stand-in for the game's upload screen: one row per line, each row read by the SHARED reader (the only ID logic in this repo); duplicates after cleaning are flagged by this page
document.getElementById("go").onclick = () => { const seen = new Set(), out = document.getElementById("out"); out.innerHTML = "";
  document.getElementById("in").value.split(/\\r?\\n/).forEach((raw, i) => { const r = checkEmployeeId(raw); const li = document.createElement("li");
    li.dataset.row = String(i + 1); li.dataset.ok = String(r.ok && !seen.has(r.id)); li.dataset.id = r.ok ? r.id : ""; li.textContent = r.ok ? (seen.has(r.id) ? "Row " + (i + 1) + ": repeated ID " + r.id : "Row " + (i + 1) + ": " + r.id) : "Row " + (i + 1) + ": " + r.error; if (r.ok) seen.add(r.id); out.append(li); }); window.__max = EMPLOYEE_ID_MAX; document.title = "done"; };</script>`, { headers: { "content-type": "text/html" } });
  if (p === "/employee-id.js") return new Response(readFileSync(new URL("packages/game-pack/employee-id.js", ROOT)), { headers: { "content-type": "text/javascript" } });
  return J(404, { ok: false });
};

const con = Bun.serve({
  port: 0, hostname: "127.0.0.1",
  fetch: async (req) => {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/__stack/")) return stackApi(req, url);
    if (url.pathname.startsWith("/auth/")) return handleAuth(req, env, clock());
    if (url.pathname.startsWith("/report/")) return handleReport(req, env, clock());
    const p = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = join(dist, p);
    if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) return new Response("Not found", { status: 404 });
    const h: Record<string, string> = { "content-type": TYPES[extname(file)] || "application/octet-stream" };
    for (const bl of blocks) if (matches(bl.pattern, url.pathname)) Object.assign(h, bl.headers);
    return new Response(readFileSync(file), { headers: h });
  },
});
env.CONSOLE_ORIGIN = `http://127.0.0.1:${con.port}`;
console.log("STACK " + JSON.stringify({ origin: env.CONSOLE_ORIGIN, games: ports, reportSecret: REPORT_SECRET, tickSecret: TICK_SECRET }));
// run until stopped, or until the test run that started this stack has ended (so a crashed run never leaves a stack behind)
const parent = Number(process.env.E2E_PARENT_PID || 0);
if (parent) setInterval(() => { try { process.kill(parent, 0); } catch { process.exit(0); } }, 1500);
await new Promise(() => {});
