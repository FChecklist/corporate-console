// bun tools/browser-tests/control-stack.ts [--mode sample|real] [--port N]
// A local copy of Mission Control for looking at it in a real browser. The console is built into a temp folder and served with its real _headers (so a Content-Security-Policy mistake is a real browser error);
// /api/control/* is answered by the real handleControl code. Prints ONE line `STACK {json}` when ready, then runs until it is stopped.
//   sample (default): a fake internet (tests/support/control-world.ts): six made-up games in different moods, a made-up home page, payments and Cloudflare. Nothing leaves this laptop.
//                     The owner password of the sample is made up for this run and is part of the STACK line.
//   real:             the real games and sites are asked (GET only, read only). The owner password (ORGANIZER_SECRET) is read at run time from C:/ct/tambola/config/live-secrets.txt and the AI key from
//                     mission-control-keys.txt; they stay in this process and are NEVER printed or written. If a Cloudflare token is in the environment (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID,
//                     or in C:/ct/ct/.env.local) it is used for GET calls to the Pages deployment list only.
import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import { handleControl, type ControlEnv } from "../../functions/_lib/control-core";
import { makeD1 } from "../../tests/support/d1-sqlite";
import { world } from "../../tests/support/control-world";
import { build, headersFile } from "../../build.mjs";
import { parseHeaders } from "../serve-dist.mjs";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1]! : d; };
const mode = arg("--mode", "sample");
if (mode !== "sample" && mode !== "real") { console.error("--mode must be sample or real"); process.exit(2); }

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8" };
const line = (file: string, key: string) => { try { return (new RegExp("^" + key + "=(.*)$", "m").exec(readFileSync(file, "utf8")) || [])[1]?.trim() || ""; } catch { return ""; } };

let env: ControlEnv, fetchFn: typeof fetch, extra: Record<string, unknown> = {};
if (mode === "sample") {
  const w = world({ tambola: "full", bingo: "lacking", tictactoe: "full", snakesladders: "test-mode", luckbychance: "many-errors", luckydraw: "down" }, { cf: true });
  env = w.env; fetchFn = w.fetchFn;
  extra = { password: w.env.ORGANIZER_SECRET };
  // some history lines so the table is not empty in the pictures
  const t = Date.UTC(2026, 10, 2, 5, 0, 0);
  for (const [i, [who, site, what, result]] of ([["ai", "bingo", "Released Bingo fc5f01f", "live gate 0; version.json matches"], ["owner", "home", "Checked the 12 pages", "all fine"], ["ai", "console", "Looked at Mission Control", "no problems found"]] as const).entries())
    w.raw.exec(`INSERT INTO control_history(at_ms,who,site,what,result,ref) VALUES(${t + i * 600000},'${who}','${site}','${what}','${result}',NULL)`);
} else {
  const { db } = makeD1(["migrations/0001_console.sql", "migrations/0005_control_history.sql"]);
  const pw = line("C:/ct/tambola/config/live-secrets.txt", "ORGANIZER_SECRET"), ai = line("C:/ct/tambola/config/mission-control-keys.txt", "AI_CONTROL_KEY");
  const envLocal = (k: string) => process.env[k] || line("C:/ct/ct/.env.local", k);
  env = { DB: db, ORGANIZER_SECRET: pw, AI_CONTROL_KEY: ai };
  const cf = envLocal("CLOUDFLARE_API_TOKEN"), acct = envLocal("CLOUDFLARE_ACCOUNT_ID");
  if (cf && acct) { env.CF_API_TOKEN = cf; env.CF_ACCOUNT_ID = acct; }
  fetchFn = fetch;
  extra = { passwordFound: pw.length >= 8, aiKeyFound: ai.length >= 24, cloudflare: !!(cf && acct) };
}

const dist = mkdtempSync(join(tmpdir(), "control-dist-"));
build({ env: "test", out: dist });
const cfg = JSON.parse(readFileSync(new URL("../../config/games.json", import.meta.url), "utf8"));
const headers = headersFile(cfg, "test");
writeFileSync(join(dist, "_headers"), headers);
const blocks = parseHeaders(headers);
const matches = (pattern: string, path: string) => pattern === path || (pattern.endsWith("/*") && path.startsWith(pattern.slice(0, -1))) || pattern === "/*";

const srv = Bun.serve({
  port: Number(arg("--port", "0")), hostname: "127.0.0.1",
  fetch: async (req) => {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/control")) return handleControl(req, env, Date.now(), fetchFn);
    let p = url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname;
    let file = join(dist, p);
    if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) return new Response("Not found", { status: 404 });
    const h: Record<string, string> = { "content-type": TYPES[extname(file)] || "application/octet-stream" };
    for (const b of blocks) if (matches(b.pattern, url.pathname)) Object.assign(h, b.headers);
    return new Response(readFileSync(file), { headers: h });
  },
});
console.log("STACK " + JSON.stringify({ mode, origin: `http://127.0.0.1:${srv.port}`, ...extra }));
await new Promise(() => {}); // run until stopped
