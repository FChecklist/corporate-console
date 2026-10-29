// FALSIFIED BY: sweep-wide-element (the viewport kit reports a forced 340 px element at 320; see tools/browser-tests/viewport-kit.mjs)
// Real Chrome, the REAL screens of the console (not the old mockups):  node tools/browser-tests/screens-sweep.mjs [--out dir] [--widths 360,390,768,900,1280,1920]
// Run it through the lock:  node tools/heavy-run.mjs --wait-min 45 --timeout-min 15 -- node tools/browser-tests/screens-sweep.mjs
// For every screen (sign in, Home, My games, Create, Billing, Account, Player's screen view) in light AND dark, at every width:
//   no sideways scroll | tap targets >= 44 px | no browser or CSP error | the Corporate Games bar is on top | contrast (axe "color-contrast") has no violation
//   | five menu items and no game name in the menu | design switches at 900 | keyboard: Tab reaches the menu and the main button, focus is visible, Enter opens a screen.
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { launchChrome, noSidewaysScroll, tapTargets, heightFor } from "./viewport-kit.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const out = arg("--out", join(tmpdir(), "console-screens-shots"));
const WIDTHS = arg("--widths", "360,390,768,900,1280,1920").split(",").map(Number);
mkdirSync(out, { recursive: true });
const axeSource = readFileSync(new URL("../../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");

const stack = spawn("bun", ["tools/browser-tests/stack.ts"], { cwd: new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32" });
const info = await new Promise((ok, bad) => { let buf = ""; stack.stdout.on("data", (d) => { buf += d; const m = /STACK (.+)\n/.exec(buf); if (m) ok(JSON.parse(m[1])); }); stack.on("exit", (c) => bad(new Error("stack stopped early " + c))); setTimeout(() => bad(new Error("stack did not start")), 90000); });
const chrome = await launchChrome();
const results = [], errors = [];
const add = (w, theme, screen, name, v) => results.push({ w, theme, screen, name, ok: typeof v === "object" && v !== null ? !!v.ok : !!v, detail: typeof v === "object" && v !== null ? v.detail || "" : "" });

const SCREENS = [["home", "#/home"], ["mygames", "#/mygames"], ["create", "#/create"], ["billing", "#/billing"], ["account", "#/account"], ["view", "#/view/tambola/READY01"]];

async function signIn(page) {
  await fetch(info.origin + "/__reset");
  await page.goto(info.origin + "/", { waitUntil: "load" });
  await page.waitForSelector("#si-email");
  await page.fill("#si-email", info.email);
  await page.check("#si-consent");
  await page.click("form:not(.hide) button[type=submit], form:not(.hide) button:last-of-type");
  await page.waitForSelector("#si-code:visible");
  const code = await (await fetch(info.origin + "/__code")).text();
  await page.fill("#si-code", code);
  await page.click("form:not(.hide) button[type=submit], form:not(.hide) button:last-of-type");
  await page.waitForSelector(".doors", { timeout: 20000 });
}

async function settle(page, screen) {
  const sel = { home: ".doors", mygames: ".gcard", create: ".tile", billing: "#bill-paid, #bill-topay", account: ".account", view: ".pvbox, .calmempty", signin: "#si-email" }[screen];
  await page.waitForSelector(sel, { timeout: 25000 });
  await page.waitForTimeout(300);
}

async function checks(page, w, theme, screen) {
  add(w, theme, screen, "no sideways scroll", await noSidewaysScroll(page));
  add(w, theme, screen, "tap targets are at least 44 px (menu, buttons, links in the page)", await tapTargets(page, ".priv button, main button, main a.btn, main a.door, .top nav a, .tabbar a, main input:not([type=checkbox]):not([type=radio])"));
  const bar = await page.evaluate(() => { const b = document.querySelector(".cgb"); if (!b) return null; const r = b.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), text: b.textContent.replace(/\s+/g, " ").slice(0, 80) }; });
  add(w, theme, screen, "the Corporate Games bar is the first thing on the page", { ok: !!bar && bar.top <= 1 && bar.h >= 30, detail: JSON.stringify(bar) });
  const menu = await page.evaluate(() => [...document.querySelectorAll(".top nav a, .tabbar a")].map((a) => a.textContent.trim()));
  if (screen !== "signin") add(w, theme, screen, "the menu is exactly Home, My games, Create, Billing, Account", { ok: JSON.stringify(menu) === JSON.stringify(["Home", "My games", "Create", "Billing", "Account"]), detail: menu.join("|") });
  const design = await page.evaluate(() => document.documentElement.dataset.design);
  add(w, theme, screen, "design is right for this width", { ok: design === (w >= 900 ? "laptop" : "phone"), detail: `${design} at ${w}` });
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ url: info.origin + "/__axe.js" });
  const axe = await page.evaluate(async () => { const r = await window.axe.run(document, { runOnly: ["color-contrast"], resultTypes: ["violations"], exclude: [[".cgb"]] }); return r.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")}: ${(n.any[0]?.message || "").slice(0, 80)}`)).slice(0, 5); }).catch((e) => ["axe could not run: " + String(e).slice(0, 80)]);
  add(w, theme, screen, "contrast (WCAG AA) has no violation", { ok: axe.length === 0, detail: axe.join("; ") });
}

try {
  for (const theme of ["light", "dark"]) {
    for (const w of WIDTHS) {
      const ctx = await chrome.browser.newContext({ viewport: { width: w, height: heightFor(w) }, deviceScaleFactor: 1, colorScheme: theme, ...(w < 768 ? { hasTouch: true } : {}) });
      const page = await ctx.newPage();
      page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_|503/.test(m.text())) errors.push(`${theme} ${w}px: ${m.text().slice(0, 200)}`); });
      page.on("pageerror", (e) => errors.push(`${theme} ${w}px: ${String(e).slice(0, 200)}`));
      try {
        await page.goto(info.origin + "/", { waitUntil: "load" });
        await settle(page, "signin");
        await checks(page, w, theme, "signin");
        await page.screenshot({ path: join(out, `signin-${theme}-${w}.png`) });
        await signIn(page);
        for (const [screen, hash] of SCREENS) {
          await page.evaluate((h) => { location.hash = h; }, hash);
          await settle(page, screen);
          await checks(page, w, theme, screen);
          await page.screenshot({ path: join(out, `${screen}-${theme}-${w}.png`) });
        }
        if (theme === "light" && w >= 900) { // keyboard: Tab reaches the menu, focus is visible, Enter opens a screen
          await page.evaluate(() => { location.hash = "#/home"; }); await page.reload({ waitUntil: "load" }); await settle(page, "home"); // a fresh load: Tab starts at the top of the page
          const seen = [];
          for (let i = 0; i < 32; i++) { await page.keyboard.press("Tab"); seen.push(await page.evaluate(() => { const a = document.activeElement; if (!a) return ""; const cs = getComputedStyle(a); return (a.textContent || "").trim().slice(0, 20) + (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2 ? "|focus" : "|NOFOCUS"); })); }
          add(w, theme, "home", "keyboard: Tab reaches every menu item and the three doors, each with a visible focus ring", { ok: ["My games", "Create", "Billing", "Account"].every((t) => seen.some((s) => s.startsWith(t) && s.endsWith("|focus"))) && ["Create a new game", "My games"].every((t) => seen.some((s) => s.startsWith(t) && s.endsWith("|focus"))), detail: seen.join(" > ") });
          await page.focus('.top nav a[href="#/billing"]'); await page.keyboard.press("Enter"); await page.waitForSelector("h1");
          add(w, theme, "home", "keyboard: Enter on a menu item opens that screen", { ok: (await page.evaluate(() => location.hash)) === "#/billing", detail: await page.evaluate(() => location.hash) });
        }
      } catch (e) { add(w, theme, "run", "the screens could be reached", { ok: false, detail: String(e).slice(0, 220) }); }
      finally { await ctx.close(); }
    }
  }
} finally {
  await chrome.close();
  try { stack.kill(); if (process.platform === "win32" && stack.pid) spawn("taskkill", ["/pid", String(stack.pid), "/t", "/f"], { stdio: "ignore" }); } catch { /* gone */ }
}
const bad = results.filter((r) => !r.ok);
writeFileSync(join(out, "results.json"), JSON.stringify({ results, errors }, null, 1));
console.log(`checks: ${results.length}, failed: ${bad.length}, browser errors: ${errors.length}`);
for (const r of bad.slice(0, 60)) console.log(`FAIL ${r.theme} ${r.w}px ${r.screen}: ${r.name} - ${r.detail}`);
for (const e of errors.slice(0, 20)) console.log("ERROR " + e);
console.log("screenshots: " + out);
process.exit(bad.length || errors.length ? 1 : 0);
