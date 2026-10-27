// FALSIFIED BY: shell-brand-in-menu, shell-breakpoint-901, shell-wide-element (see tools/mutations)
// Real Chrome: node tools/browser-tests/console-shell.mjs [--out dir]   (run it through tools/heavy-run.mjs: one Chrome at a time)
// For the shell of the console at the ten widths of the owner's rule plus 899/900 and the phone landscape size:
//   no sideways scroll | menu = Home + six games + Billing, no brand word | the five privacy phrases are on the page | tap targets >= 44 px | no browser errors (a CSP mistake is one)
//   | the design switches exactly at 900 | the manifest and the offline worker are found | a 340 px element is caught at 320 (the check itself is falsified every run)
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { build } from "../../build.mjs";
import { startServer } from "../serve-dist.mjs";
import { launchChrome, sweep, noSidewaysScroll, tapTargets, WIDTHS, SWITCH_WIDTHS, LANDSCAPE } from "./viewport-kit.mjs";

const out = (() => { const i = process.argv.indexOf("--out"); return i >= 0 ? process.argv[i + 1] : join(tmpdir(), "console-shell-shots"); })();
mkdirSync(out, { recursive: true });
const dist = mkdtempSync(join(tmpdir(), "shell-dist-"));
build({ env: "test", out: dist }); // game addresses point at a closed port: the browser never reaches the real games
const srv = await startServer({ dir: dist, extra: async (req, res, url) => { if (url.pathname === "/auth/me") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, signedIn: true, email: "asha@acme.com" })); return true; } if (url.pathname.startsWith("/auth/")) { res.writeHead(401, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false, error: "signed_out", message: "Please sign in again." })); return true; } return false; } });
const chrome = await launchChrome();
const results = [];
const errors = [];
try {
  const check = async (page, w) => {
    await page.waitForSelector("#outlet h1, #outlet .hero", { timeout: 15000 });
    const design = await page.evaluate(() => document.documentElement.dataset.design);
    const menu = await page.evaluate(() => [...document.querySelectorAll(".top nav a, .tabbar a")].map((a) => a.textContent.trim()));
    const strip = await page.evaluate(() => document.querySelector(".priv")?.textContent || "");
    const res = {
      "no sideways scroll": await noSidewaysScroll(page),
      "design is right for this width": design === (w >= 900 ? "laptop" : "phone"),
      "menu entries are right": JSON.stringify(menu) === JSON.stringify(w >= 900 ? ["Home", "Tambola", "Bingo", "Tic-Tac-Toe", "Snakes and Ladders", "Luck by Chance", "Lucky Draw", "Billing"] : ["Home", "My games", "Billing", "More"]),
      "no brand word in the menu": !menu.some((m) => /corporate|console/i.test(m)),
      "privacy strip has the owner's phrases": ["100% data deletion of player data", "DPDP Act", "GDPR", "US privacy law", "global data policy", "close-group online games"].every((p) => strip.includes(p)),
      "menu tap targets are at least 44 px": await tapTargets(page, ".top nav a, .tabbar a, .priv button"),
    };
    return res;
  };
  const run = async (widths, label) => {
    for (const w of widths) {
      const r = await sweep(chrome.browser, srv.origin + "/", async (page, ww) => {
        page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push(`${ww}px: ${m.text().slice(0, 160)}`); });
        page.on("pageerror", (e) => errors.push(`${ww}px: ${String(e).slice(0, 160)}`));
        const res = await check(page, ww);
        await page.screenshot({ path: join(out, `shell-${ww}.png`) });
        return res;
      }, [w]);
      results.push(...r.map((x) => ({ ...x, set: label })));
    }
  };
  await run(WIDTHS, "ten widths");
  await run(SWITCH_WIDTHS, "switch");
  // landscape phone
  { const ctx = await chrome.browser.newContext({ viewport: { width: LANDSCAPE.w, height: LANDSCAPE.h }, hasTouch: true }); const page = await ctx.newPage(); await page.goto(srv.origin + "/"); await page.waitForSelector("#outlet h1, #outlet .hero");
    results.push({ w: LANDSCAPE.w, set: "landscape", name: "no sideways scroll", ...(await noSidewaysScroll(page)) }); await ctx.close(); }
  // manifest and worker
  { const ctx = await chrome.browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage(); await page.goto(srv.origin + "/"); await page.waitForSelector("#outlet h1, #outlet .hero");
    const href = await page.evaluate(() => document.querySelector("link[rel=manifest]")?.href);
    const m = href ? await (await fetch(href)).json() : null;
    results.push({ w: 1280, set: "pwa", name: "manifest found and installable fields present", ok: !!m && m.display === "standalone" && m.start_url === "/?source=pwa" && m.icons.length === 3, detail: href });
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.getRegistration().then((r) => !!r), null, { timeout: 15000 }).catch(() => {});
    const reg = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
    results.push({ w: 1280, set: "pwa", name: "offline worker registered", ok: reg, detail: "" });
    await ctx.close(); }
  // FALSIFICATION: a 340 px wide element must make the sideways-scroll check fail at 320
  { const r = await sweep(chrome.browser, srv.origin + "/", async (page) => { await page.waitForSelector("#outlet h1, #outlet .hero"); await page.evaluate(() => { const d = document.createElement("div"); d.id = "toowide"; d.style.cssText = "width:340px;height:4px;background:red"; document.querySelector("main").append(d); }); return { "no sideways scroll": await noSidewaysScroll(page) }; }, [320]);
    results.push({ w: 320, set: "falsify", name: "a 340 px element is caught", ok: r[0].ok === false, detail: r[0].detail }); }
} finally { await chrome.close(); await srv.close(); }

const bad = results.filter((r) => !r.ok);
if (errors.length) bad.push(...errors.map((e) => ({ w: 0, set: "browser", name: "browser error: " + e, ok: false })));
writeFileSync(join(out, "console-shell-result.json"), JSON.stringify({ checks: results.length, failed: bad.length, bad }, null, 1));
for (const b of bad.slice(0, 30)) console.log(`FAIL ${b.set} ${b.w}px ${b.name} ${b.detail || ""}`);
console.log(`${results.length} checks, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
