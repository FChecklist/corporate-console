// bun tools/browser-tests/stack.ts
// A small local world for the real-browser tests: the console built into a temp folder (served with its real _headers, so a Content-Security-Policy mistake is a real browser error),
// the real sign-in service on a fresh in-memory database, and five fake games (normal, normal, DOWN, empty, many rows) that answer the contract.
// Prints ONE line `STACK {json}` when ready, then runs until it is stopped. Nothing leaves this laptop; no real address is used. The code of the last sign-in mail is at GET /__code.
import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import { makeD1 } from "../../tests/support/d1-sqlite";
import { handleAuth, type Env } from "../../functions/_lib/auth-core";
import { handle, newGame, seedGames, emailHash } from "../fake-game/server.mjs";
import { makeKeyPair, parseKeyList } from "../../packages/bridge/src/assertion";
import { build, gamesConfigJs, headersFile } from "../../build.mjs";
import { parseHeaders } from "../serve-dist.mjs";

const cfg = JSON.parse(readFileSync(new URL("../../config/games.json", import.meta.url), "utf8"));
const PERSONA: Record<string, string> = { tambola: "normal", bingo: "normal", tictactoe: "down", snakesladders: "empty", luckbychance: "many" };
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" };

const kp = await makeKeyPair();
const keys = parseKeyList("k1:" + kp.publicB64u);
const subs = { alice: await emailHash("alice@acme.example"), bob: await emailHash("bob@bob.example"), carol: await emailHash("carol@carol.example") };
const servers: any[] = [], ports: Record<string, string> = {};
for (const g of cfg.games.filter((x: any) => x.ready)) {
  const S: any = newGame({ game: g.id, name: "Corporate " + g.name, persona: PERSONA[g.id] || "normal", origin: "", keys });
  Object.defineProperty(S, "nowMs", { get: () => Date.now(), set: () => {} });
  S.slowMs = 0;
  const srv = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req) => (new URL(req.url).pathname.startsWith("/screenview/") ? new Response("<!doctype html><meta charset=utf-8><title>Preview</title><body style='font:20px sans-serif;padding:24px'><h1>Player screen</h1><p>The real participant page would show here.</p>", { headers: { "content-type": "text/html; charset=utf-8" } }) : handle(S, req)) });
  S.origin = `http://127.0.0.1:${srv.port}`; seedGames(S, subs); servers.push(srv); ports[g.id] = S.origin;
}
// the console itself: same games list, with the fake games' addresses in the test slot
const testCfg = { ...cfg, games: cfg.games.map((g: any) => ({ ...g, test: ports[g.id] || g.test })), consoleOrigin: { ...cfg.consoleOrigin, test: "http://127.0.0.1:0" } };
const dist = mkdtempSync(join(tmpdir(), "stack-dist-"));
build({ env: "test", out: dist });
writeFileSync(join(dist, "core/games.config.js"), gamesConfigJs(testCfg, "test"));
const headers = headersFile(testCfg, "test");
writeFileSync(join(dist, "_headers"), headers);
const blocks = parseHeaders(headers);
const matches = (pattern: string, path: string) => pattern === path || (pattern.endsWith("/*") && path.startsWith(pattern.slice(0, -1))) || pattern === "/*";

const { db } = makeD1();
let lastMail = "";
const env: Env = { DB: db, SESSION_PEPPER: "stack-pepper", CONSOLE_SIGNING_KEY: btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey)))), CONSOLE_ORIGIN: "", GAME_ORIGINS: JSON.stringify(ports), MAILER: async (_to, _subject, text) => { lastMail = text; } };
const con = Bun.serve({
  port: 0, hostname: "127.0.0.1",
  fetch: async (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/__code") return new Response(/code is (\d{6})/.exec(lastMail)?.[1] || "", { headers: { "cache-control": "no-store" } });
    if (url.pathname === "/__axe.js") return new Response(readFileSync(new URL("../../node_modules/axe-core/axe.min.js", import.meta.url)), { headers: { "content-type": "text/javascript" } }); // the contrast checker is served from the console's own address, so the page policy stays strict
    if (url.pathname === "/__reset") { await db.prepare("DELETE FROM rate").run(); return new Response("ok"); } // the sweep signs in many times: forget the mail limit between runs
    if (url.pathname.startsWith("/auth/")) return handleAuth(req, env, Date.now());
    const p = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = join(dist, p);
    if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) return new Response("Not found", { status: 404 });
    const h: Record<string, string> = { "content-type": TYPES[extname(file)] || "application/octet-stream" };
    for (const b of blocks) if (matches(b.pattern, url.pathname)) Object.assign(h, b.headers);
    return new Response(readFileSync(file), { headers: h });
  },
});
env.CONSOLE_ORIGIN = `http://127.0.0.1:${con.port}`;
console.log("STACK " + JSON.stringify({ origin: env.CONSOLE_ORIGIN, games: ports, email: "alice@acme.example" }));
await new Promise(() => {}); // run until stopped
void servers;
