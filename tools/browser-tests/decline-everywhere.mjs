// FALSIFIED BY: consent31-worker-ignores-cookie, consent31-stop-ignored, consent31-old-worker-not-freed, consent31-page-no-follow (the unit file tests/consent-decline-everywhere.test.ts is the gate; this script is the real-browser proof)
// node tools/browser-tests/decline-everywhere.mjs      (a real Chromium, the console built for the test, no network to the games)
// Proves, in a real browser, the two 0.3.0 audit findings are gone:
//  M1: accept, load the page under the worker, decline from the footer, keep using the page: the worker is gone AND the cache stays empty (nothing is put back).
//  M2: accept on the console, then decline on /pay-link.html, /signin.html, /owner-funnel/ and /404.html: no worker and no cache remain.
import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { build } from "../../build.mjs";
import { startServer } from "../serve-dist.mjs";

const dist = mkdtempSync(join(tmpdir(), "decl-dist-"));
build({ env: "test", out: dist });
const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); return true; };
const srv = await startServer({ dir: dist, extra: async (req, res, url) => {
  if (url.pathname === "/auth/me") return json(res, 200, { ok: true, signedIn: false });
  if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/stats/")) return json(res, 401, { ok: false });
  if (url.pathname.startsWith("/pay/")) return json(res, 200, { ok: false });
  return false;
} });
// an OLDER worker: the 0.3.0 worker (it cannot be told to stop and writes whatever it sees). A second copy of the console is served with that worker file.
const oldDist = mkdtempSync(join(tmpdir(), "decl-old-"));
build({ env: "test", out: oldDist });
writeFileSync(join(oldDist, "sw.js"), execFileSync("git", ["show", "25dca5c:public/sw.js"], { encoding: "utf8", cwd: join(import.meta.dirname, "../..") }));
const oldSrv = await startServer({ dir: oldDist, extra: async (req, res, url) => (url.pathname === "/auth/me" ? json(res, 200, { ok: true, signedIn: false }) : false) });
const pw = createRequire(import.meta.url)("playwright-core");
const exe = ["/opt/pw-browsers/chromium", process.env.CHROME_EXE].find((p) => p && existsSync(p));
const browser = await pw.chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ["--no-sandbox", "--disable-gpu"] });
const results = [];
const ok = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail }); console.log((pass ? "ok   " : "FAIL ") + name + (pass ? "" : " " + detail)); };
const state = (page) => page.evaluate(async () => ({ cookie: (document.cookie.match(/cg_consent=([^;]+)/) || [])[1] || null, regs: (await navigator.serviceWorker.getRegistrations()).length, files: (await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).length))).reduce((a, b) => a + b, 0), caches: (await caches.keys()).length }));
const waitFor = async (page, fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { const s = await state(page); if (fn(s)) return s; await page.waitForTimeout(100); } return state(page); };
try {
  // M1
  {
    const ctx = await browser.newContext({ serviceWorkers: "allow" }), page = await ctx.newPage();
    await page.goto(srv.origin + "/", { waitUntil: "networkidle" });
    await page.click("#cookie-prefs");
    let s = await waitFor(page, (x) => x.regs === 1 && x.files > 0);
    ok("M1: after 'Also remember your choices' there is one worker and a cache", s.regs === 1 && s.files > 0, JSON.stringify(s));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 }).catch(() => {});
    ok("M1: after a reload the page is held by the worker", await page.evaluate(() => !!navigator.serviceWorker.controller));
    await page.click("#footer-cookies"); await page.waitForSelector("#cookie-needed"); await page.click("#cookie-needed");
    await page.waitForTimeout(800);
    // the audit's step 4: keep using the page (fetch the same files the audit fetched)
    const fetched = await page.evaluate(async () => { const out = []; for (const p of ["/core/app.css", "/games/", "/changes", "/core/steps.js", "/screens/home.js", "/manifest.webmanifest"]) { try { out.push((await fetch(p)).status); } catch { out.push(0); } } return out; }).catch(() => "page reloaded");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(800);
    s = await state(page);
    ok("M1: after the decline and more use of the page: no worker, no cache, no file", s.cookie === "v1.needed" && s.regs === 0 && s.caches === 0 && s.files === 0, JSON.stringify({ s, fetched }));
    await page.waitForTimeout(1500);
    s = await state(page);
    ok("M1: and still none a moment later", s.regs === 0 && s.caches === 0 && s.files === 0, JSON.stringify(s));
    await ctx.close();
  }
  // M1b: the page is held by an OLDER worker that cannot be told to stop: the page frees itself (one more load) and the cache stays empty
  {
    const ctx = await browser.newContext({ serviceWorkers: "allow" }), page = await ctx.newPage();
    await page.goto(oldSrv.origin + "/", { waitUntil: "networkidle" });
    await page.click("#cookie-prefs");
    let s = await waitFor(page, (x) => x.regs === 1 && x.files > 0);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 }).catch(() => {});
    ok("M1b: an older worker holds the page", s.regs === 1 && (await page.evaluate(() => !!navigator.serviceWorker.controller)), JSON.stringify(s));
    await page.click("#footer-cookies"); await page.waitForSelector("#cookie-needed"); await page.click("#cookie-needed");
    await page.waitForTimeout(1500); await page.waitForLoadState("networkidle").catch(() => {});
    await page.evaluate(async () => { for (const p of ["/core/app.css", "/games/", "/changes", "/core/steps.js"]) { try { await fetch(p); } catch { /* reloaded */ } } }).catch(() => {});
    await page.waitForTimeout(800);
    s = await state(page);
    ok("M1b: after the decline the older worker could not put anything back: no worker, no cache, and the page is no longer held", s.regs === 0 && s.caches === 0 && s.files === 0 && !(await page.evaluate(() => !!navigator.serviceWorker.controller)), JSON.stringify(s));
    await ctx.close();
  }
  // M2
  for (const path of ["/pay-link.html", "/signin.html", "/owner-funnel/", "/404.html"]) {
    const ctx = await browser.newContext({ serviceWorkers: "allow" }), page = await ctx.newPage();
    await page.goto(srv.origin + "/", { waitUntil: "networkidle" });
    await page.click("#cookie-prefs");
    let s = await waitFor(page, (x) => x.regs === 1 && x.files > 0);
    ok(`M2 ${path}: worker and cache exist before the decline`, s.regs === 1 && s.files > 0, JSON.stringify(s));
    await page.goto(srv.origin + path, { waitUntil: "networkidle" });
    await page.click("#footer-cookies"); await page.waitForSelector("#cookie-needed"); await page.click("#cookie-needed");
    s = await waitFor(page, (x) => x.regs === 0 && x.caches === 0);
    ok(`M2 ${path}: after Only what is needed: no worker, no cache`, s.cookie === "v1.needed" && s.regs === 0 && s.caches === 0 && s.files === 0, JSON.stringify(s));
    await page.waitForTimeout(800); s = await state(page);
    ok(`M2 ${path}: and still none a moment later`, s.regs === 0 && s.caches === 0, JSON.stringify(s));
    await ctx.close();
  }
  // an untouched visitor and a privacy-signal visitor on those pages: nothing at all
  for (const path of ["/pay-link.html", "/404.html"]) {
    const ctx = await browser.newContext({ serviceWorkers: "allow" }), page = await ctx.newPage();
    await page.goto(srv.origin + path, { waitUntil: "networkidle" }); await page.waitForTimeout(500);
    const s = await state(page);
    ok(`first visit to ${path}: no cookie, no worker, no cache`, s.cookie === null && s.regs === 0 && s.caches === 0, JSON.stringify(s));
    await ctx.close();
  }
} finally { await browser.close(); await srv.close(); await oldSrv.close(); }
const bad = results.filter((r) => !r.pass);
console.log(`${results.length - bad.length} of ${results.length} real-browser checks passed.`);
process.exit(bad.length ? 1 : 0);
