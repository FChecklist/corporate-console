// LOCAL DEMO of the pay step (no deploy, no money, no real Moneypenny): `bun tools/pay-demo/server.ts`
//   game page (stand-in for a game's console page, port 8123)  http://localhost:8123/demo.html?flow=new&e=WAIT001&console=http://localhost:8124
//   console (the real /pay routes + payee page, port 8124) with a FAKE Moneypenny whose settings you change at /__set?balance=2000&down=1
// Every number on the screen comes from the fake Moneypenny's answers (1 credit = US$0.01 = 70 paise: test numbers only).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { handleConsole } from "../../packages/bridge/src/bridge";
import { makeHost, seed } from "../../tests/support/fake-host";
import { makeCtx } from "../../packages/bridge/test-kit/kit.mjs";
import { makeD1 } from "../../tests/support/d1-sqlite";
import { makeFakeMoneypenny } from "../../tests/support/fake-moneypenny";
import { handlePay } from "../../functions/_lib/pay-core";
import { sealText, sha256hex } from "../../functions/_lib/auth-core";

const ROOT = join(import.meta.dir, "../..");
const GAME = 8123, CON = 8124, SID = "c".repeat(64);
const ctx = await makeCtx();
const h = await makeHost(); seed(h); h.env.CONSOLE_PUBKEYS = "k1:" + ctx.publicB64u;
h.adapter.nowMs = () => Date.now(); // the demo runs on the real clock
h.origin = `http://localhost:${GAME}`; h.env.PUBLIC_ORIGIN = h.origin;
const migrations = readdirSync(join(ROOT, "migrations")).filter((f) => f.endsWith(".sql")).sort().map((f) => "migrations/" + f);
const { db, raw } = makeD1(migrations);
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", ctx.privateKey));
const env: any = { DB: db, SESSION_PEPPER: "demo", CONSOLE_SIGNING_KEY: btoa(String.fromCharCode(...pkcs8)), CONSOLE_ORIGIN: `http://localhost:${CON}`, GAME_ORIGINS: JSON.stringify({ bingo: h.origin }), MNP_WEBHOOK_SECRET: "demo", PAY_VIA_MONEYPENNY: "1" };
const fake = makeFakeMoneypenny({ payBase: `http://localhost:${CON}/stub/`, catalogue: [{ product: "bingo", item: "250", credits: 5000 }] });
const alice = ctx.people.alice;
let signedIn = true;
raw.query("INSERT INTO console_email(email_hash,email_sealed,created_ms,last_seen_ms,consent_ms) VALUES(?,?,?,?,?)").run(alice.sub, await sealText(env, alice.email), Date.now(), Date.now(), Date.now());
raw.query("INSERT INTO session(sid_hash,email_hash,created_ms,last_seen_ms,expires_ms) VALUES(?,?,?,?,?)").run(await sha256hex("sid|" + SID), alice.sub, Date.now(), Date.now(), Date.now() + 86400_000);
fake.give(alice.email, 2000);
const J = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const file = (p: string, type: string) => new Response(readFileSync(join(ROOT, p)), { headers: { "content-type": type } });
const PAGE = (extra: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Organizer console | Corporate Bingo (local demo)</title>
<link rel="stylesheet" href="/pack/pack.css"><link rel="stylesheet" href="/pack/zc-flow.css"><link rel="stylesheet" href="/core/tokens.css"><link rel="stylesheet" href="/core/app.css"></head><body>
<p style="margin:8px 16px;padding:6px 10px;background:#fff3cd;color:#5c4400;font:14px system-ui">LOCAL DEMO - not live. Test numbers, fake Moneypenny, no money.</p><main id="app" class="wrap"></main>
<script>window.ZFLOW_GAME = { brand: "Corporate Bingo", payGame: "bingo", consoleOrigin: "http://localhost:${CON}" };</script><script src="/pack/zc-flow.js"></script>${extra}</body></html>`;

Bun.serve({ port: GAME, hostname: "127.0.0.1", async fetch(req) {
  const u = new URL(req.url);
  const bridge = await handleConsole(h.adapter, req, h.env); if (bridge) return bridge;
  if (u.pathname === "/demo.html") return new Response(PAGE(""), { headers: { "content-type": "text/html" } });
  if (u.pathname === "/pack/zc-flow.js") return file("packages/game-pack/zc-flow.js", "text/javascript");
  if (u.pathname === "/pack/zc-flow.css") return file("packages/game-pack/zc-flow.css", "text/css");
  if (u.pathname === "/pack/pack.css") return file("packages/game-pack/pack.css", "text/css");
  if (u.pathname.startsWith("/core/") && /\.(css|js)$/.test(u.pathname)) return file("public" + u.pathname, u.pathname.endsWith("css") ? "text/css" : "text/javascript");
  if (u.pathname === "/api/z/WAIT001/info") { const g = h.raw.query("SELECT status,start_ms,cap FROM engagement WHERE id='WAIT001'").get() as any; return J({ draft: false, startMs: g.start_ms, cap: g.cap, unpaid: g.status === "waiting_payment" }); }
  if (u.pathname.startsWith("/api/z/")) return J({ ok: true });
  return new Response("not found", { status: 404 });
} });

Bun.serve({ port: CON, hostname: "127.0.0.1", async fetch(req) {
  const u = new URL(req.url);
  if (u.pathname === "/__set") { // ?balance=N&down=1|0&signedin=1|0&reset=1
    const s = u.searchParams;
    if (s.has("balance")) fake.accounts.set(alice.email.toLowerCase(), Number(s.get("balance")));
    if (s.has("down")) fake.state.down = s.get("down") === "1";
    if (s.has("signedin")) signedIn = s.get("signedin") === "1";
    if (s.get("reset") === "1") { h.raw.run("UPDATE engagement SET status='waiting_payment', pay_state='waiting' WHERE id='WAIT001'"); raw.run("DELETE FROM wallet_order"); raw.run("DELETE FROM pay_order"); raw.run("DELETE FROM pay_link"); fake.holds.clear(); fake.orders.clear(); }
    return J({ ok: true, balance: fake.accounts.get(alice.email.toLowerCase()), down: fake.state.down, signedIn });
  }
  if (u.pathname === "/__pay") { // pretend the payment company confirmed the open buy (Moneypenny then tells the console)
    const ref = [...fake.orders.keys()][0]; if (!ref) return J({ ok: false });
    const ev = fake.complete(ref), text = JSON.stringify(ev), ts = String(Date.now());
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("demo"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ts + "." + text)))].map((x) => x.toString(16).padStart(2, "0")).join("");
    return handlePay(new Request(`http://localhost:${CON}/pay/event`, { method: "POST", headers: { "x-mnp-timestamp": ts, "x-mnp-signature": sig }, body: text }), env, Date.now(), { mnp: fake.mnp });
  }
  if (/^\/pay\/[0-9a-f]{48}$/.test(u.pathname) || u.pathname.startsWith("/pay/")) {
    const headers = new Headers(req.headers); if (signedIn) headers.set("cookie", "cbsess=" + SID); else headers.delete("cookie");
    return handlePay(new Request(req.url, { method: req.method, headers, body: req.method === "POST" ? await req.text() : undefined }), env, Date.now(), { mnp: fake.mnp, assets: async (p) => file("public" + p, "text/html") });
  }
  if (u.pathname.startsWith("/stub/")) return new Response("<!doctype html><title>Payment page (stand-in)</title><p style='font:18px system-ui;margin:40px'>This stands in for the secure payment window (card or UPI). Local demo only.</p>", { headers: { "content-type": "text/html" } });
  const map: Record<string, [string, string]> = { "/pay-link.html": ["public/pay-link.html", "text/html"], "/pay-link.js": ["public/pay-link.js", "text/javascript"], "/pay-link.css": ["public/pay-link.css", "text/css"] };
  if (map[u.pathname]) return file(map[u.pathname][0], map[u.pathname][1]);
  if (u.pathname.startsWith("/core/") && /\.(css|js)$/.test(u.pathname)) return file("public" + u.pathname, u.pathname.endsWith("css") ? "text/css" : "text/javascript");
  return new Response("not found", { status: 404 });
} });
console.log(`pay demo ready: http://localhost:${GAME}/demo.html?flow=new&e=WAIT001&console=http://localhost:${CON}`);
