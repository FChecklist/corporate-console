// FALSIFIED BY: forms3-phone-fields (CSS side; this script is the real-browser proof)
// node tools/browser-tests/mobile-360.mjs [--out dir]      (a real Chromium at 360 x 640, the console built for the test, no network to the games)
// Proves, in a real browser: no sideways scroll on any page | the cookie banner shows both answers at the same size and does not cover the page | NOTHING is stored and NO worker exists
// before the answer | "Only what is needed" leaves no worker | "Also remember your choices" registers the worker | every field is at least 44 px tall and 16 px in text, with its example visible
// | the step banner says "Step 1 of 6" | no browser errors (a Content-Security-Policy mistake is one). Screenshots go to --out.
import { mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { build } from "../../build.mjs";
import { startServer } from "../serve-dist.mjs";

const out = (() => { const i = process.argv.indexOf("--out"); return i >= 0 ? process.argv[i + 1] : join(tmpdir(), "mobile-360-shots"); })();
mkdirSync(out, { recursive: true });
const dist = mkdtempSync(join(tmpdir(), "m360-dist-"));
build({ env: "test", out: dist });
let signedIn = false;
const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); return true; };
const srv = await startServer({ dir: dist, extra: async (req, res, url) => {
  if (url.pathname === "/auth/me") return json(res, 200, signedIn ? { ok: true, signedIn: true, email: "demo1@demo-test.invalid" } : { ok: true, signedIn: false });
  if (url.pathname === "/auth/assert") return json(res, 200, { ok: true, assertions: [] }); // keys: none, the games are not reachable in this test (the screen shows each game as slow, never signs the person out)
  if (url.pathname.startsWith("/auth/")) return json(res, 401, { ok: false });
  if (url.pathname.startsWith("/pay/")) return json(res, 200, { ok: false, message: "Credits are refreshing. Please try again in a few minutes." });
  if (url.pathname.startsWith("/stats/")) return json(res, 401, { ok: false });
  return false;
} });
const pw = createRequire(import.meta.url)("playwright-core");
const exe = ["/opt/pw-browsers/chromium", process.env.CHROME_EXE].find((p) => p && existsSync(p));
const browser = await pw.chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ["--no-sandbox", "--disable-gpu"] });
const results = [], errors = [];
const ok = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail }); if (!pass) console.log("FAIL " + name + " " + detail); };
const newPage = async (consentCookie) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, serviceWorkers: "allow" });
  if (consentCookie) await ctx.addCookies([{ name: "cg_consent", value: consentCookie, url: srv.origin }]);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  return { ctx, page };
};
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const small = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44) && getComputedStyle(n).visibility !== "hidden"; }).map((n) => (n.id || n.textContent.trim().slice(0, 20))), sel);
try {
  // 1. before any answer: stored nothing, no worker, banner with two equal answers
  {
    const { ctx, page } = await newPage();
    await page.goto(srv.origin + "/", { waitUntil: "networkidle" });
    await page.waitForSelector("#cookie-banner");
    const st = await page.evaluate(async () => ({ cookie: document.cookie, ls: localStorage.length, ss: sessionStorage.length, regs: (await navigator.serviceWorker.getRegistrations()).length, caches: (await caches.keys()).length }));
    ok("before the answer: no cookie, no storage, no worker, no cache", st.cookie === "" && st.ls === 0 && st.ss === 0 && st.regs === 0 && st.caches === 0, JSON.stringify(st));
    const sizes = await page.evaluate(() => ["cookie-needed", "cookie-prefs"].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    ok("the two answers are the same size", JSON.stringify(sizes[0]) === JSON.stringify(sizes[1]) && sizes[0][1] >= 48, JSON.stringify(sizes));
    const h = await page.evaluate(() => document.getElementById("cookie-banner").getBoundingClientRect().height);
    ok("the banner leaves room for the page (under 85% of the screen)", h <= 640 * 0.85 + 1, String(h));
    ok("no sideways scroll with the banner", await noSideways(page));
    await page.screenshot({ path: join(out, "01-first-visit-banner.png") });
    // 2. decline: still no worker
    await page.click("#cookie-needed"); await page.waitForTimeout(600);
    const after = await page.evaluate(async () => ({ cookie: document.cookie, ls: localStorage.length, regs: (await navigator.serviceWorker.getRegistrations()).length, caches: (await caches.keys()).length }));
    ok("after Only what is needed: just the answer cookie, no worker, no cache", /cg_consent=v1\.needed/.test(after.cookie) && after.ls === 0 && after.regs === 0 && after.caches === 0, JSON.stringify(after));
    await ctx.close();
  }
  // 3. accept: the worker comes only now
  {
    const { ctx, page } = await newPage();
    await page.goto(srv.origin + "/", { waitUntil: "networkidle" });
    await page.click("#cookie-prefs"); await page.waitForTimeout(1500);
    const after = await page.evaluate(async () => ({ cookie: document.cookie, regs: (await navigator.serviceWorker.getRegistrations()).length }));
    ok("after Also remember your choices: the worker is registered", /cg_consent=v1\.prefs/.test(after.cookie) && after.regs === 1, JSON.stringify(after));
    // 4. change the mind in the footer: decline removes it
    await page.click("#footer-cookies"); await page.waitForSelector("#cookie-needed"); await page.click("#cookie-needed"); await page.waitForTimeout(800);
    const gone = await page.evaluate(async () => ({ regs: (await navigator.serviceWorker.getRegistrations()).length, caches: (await caches.keys()).filter((k) => k.startsWith("console-shell-")).length }));
    ok("Cookie choices > Only what is needed removes the worker and its cache", gone.regs === 0 && gone.caches === 0, JSON.stringify(gone));
    await ctx.close();
  }
  // 5. static pages, answered: no sideways scroll, fields big enough, examples visible
  for (const [path, file] of [["/", "10-home"], ["/games/", "11-games"], ["/changes", "12-changes"], ["/signin.html", "13-signin-link"], ["/pay-link.html", "14-pay-link"], ["/owner-funnel/", "15-owner"], ["/no-such-page", "16-404"]]) {
    const { ctx, page } = await newPage("v1.needed");
    await page.goto(srv.origin + path, { waitUntil: "networkidle" });
    ok(`${path}: no sideways scroll`, await noSideways(page));
    const tooSmall = await small(page, "button, a.btn, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select");
    ok(`${path}: buttons and fields are at least 44 px`, tooSmall.length === 0, tooSmall.join(","));
    const tiny = await page.evaluate(() => [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select")].filter((n) => parseFloat(getComputedStyle(n).fontSize) < 16).map((n) => n.id));
    ok(`${path}: text in fields is 16 px or more (a phone does not zoom in)`, tiny.length === 0, tiny.join(","));
    await page.screenshot({ path: join(out, file + ".png"), fullPage: true });
    await ctx.close();
  }
  // 6. the console app, signed out and signed in
  {
    const { ctx, page } = await newPage("v1.needed");
    await page.goto(srv.origin + "/", { waitUntil: "networkidle" });
    await page.waitForSelector("#si-email");
    ok("sign-in: example and error line are there for each field", await page.evaluate(() => ["si-email", "si-consent"].every((id) => document.getElementById(id + "-hint")?.textContent.length > 10 && document.getElementById(id + "-err")?.getAttribute("role") === "alert")));
    await page.click("button[type=submit]"); await page.waitForTimeout(200);
    const err = await page.evaluate(() => document.getElementById("si-email-err").textContent);
    ok("sign-in: pressing the button with an empty box says what to fix right under the field", /type your work e-mail address, for example/.test(err), err);
    ok("sign-in: no sideways scroll", await noSideways(page));
    await page.screenshot({ path: join(out, "20-signin-error.png"), fullPage: true });
    await ctx.close();
    signedIn = true;
    const b = await newPage("v1.needed");
    await b.page.goto(srv.origin + "/#/create", { waitUntil: "networkidle" });
    await b.page.waitForSelector(".stepbanner", { timeout: 8000 }).catch(async () => { console.log("DEBUG body:", (await b.page.evaluate(() => document.body.innerText)).slice(0, 400), "ERRORS:", errors.slice(0, 3)); });
    const txt = await b.page.evaluate(() => [document.querySelector(".stepnow")?.textContent, document.querySelector(".stepnext")?.textContent, document.querySelector('meta[name=robots]')?.content, document.title]);
    ok("Create: the banner says Step 1 of 6 and what is next", /^Step 1 of 6: Date and time/.test(txt[0]) && /^Next: Step 2 of 6/.test(txt[1]), JSON.stringify(txt));
    ok("signed in: the screen asks not to be indexed and has its own title", txt[2] === "noindex,nofollow" && /^Create a new game: /.test(txt[3]), JSON.stringify(txt));
    ok("Create: no sideways scroll", await noSideways(b.page));
    await b.page.screenshot({ path: join(out, "21-create-steps.png"), fullPage: true });
    await b.ctx.close();
  }
  ok("no browser errors (a policy mistake would be one)", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally { await browser.close(); await srv.close(); }
const bad = results.filter((r) => !r.pass);
console.log(`${results.length - bad.length} of ${results.length} checks passed at 360 px. Screenshots: ${out}`);
process.exit(bad.length ? 1 : 0);
