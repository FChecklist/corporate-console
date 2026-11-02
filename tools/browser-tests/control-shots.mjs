// FALSIFIED BY: control-page-sideways, control-page-small-font, control-page-wrong-password-opens
// Real Chrome: node tools/browser-tests/control-shots.mjs [--mode sample|real] [--out dir]   (run it through tools/heavy-run.mjs: one Chrome at a time)
// Starts the local Mission Control (tools/browser-tests/control-stack.ts), opens /owner/ on a laptop-wide and a phone-wide screen, signs in, visits the six tabs and takes a picture of the sign-in page and of each tab.
// For every picture it also checks: no sideways scroll | the smallest letter on the page is at least 12.5 px | the tap targets of the buttons are at least 44 px | no browser errors (a CSP mistake is one).
// It also proves in the real browser that a wrong password opens nothing. The owner password is only typed into the box; it is never printed or written anywhere (in real mode it is read from
// live-secrets.txt at run time). Real mode asks the real sites (GET only); its pictures show real, masked data: keep them out of the repository.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { launchChrome, noSidewaysScroll, tapTargets } from "./viewport-kit.mjs";
import { killTree } from "../heavy-run.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const mode = arg("--mode", "sample"), out = arg("--out", join(tmpdir(), "mission-control-shots-" + mode));
const BUN = process.env.BUN_EXE || "C:/Users/Dell/AppData/Roaming/npm/node_modules/bun/bin/bun.exe";
mkdirSync(out, { recursive: true });

const stack = spawn(BUN, ["tools/browser-tests/control-stack.ts", "--mode", mode], { cwd: new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
let info = null, stackErr = "";
stack.stderr.on("data", (d) => { stackErr += d; });
await new Promise((ok, no) => {
  let buf = "";
  const t = setTimeout(() => no(new Error("the local Mission Control did not start: " + stackErr.slice(0, 300))), 90_000);
  stack.stdout.on("data", (d) => { buf += d; const m = /STACK (\{.*\})/.exec(buf); if (m) { clearTimeout(t); info = JSON.parse(m[1]); ok(); } });
  stack.on("exit", (c) => { clearTimeout(t); no(new Error("the local Mission Control stopped (" + c + "): " + stackErr.slice(0, 300))); });
});
const password = mode === "sample" ? info.password : ((/^ORGANIZER_SECRET=(.*)$/m.exec(readFileSync("C:/ct/tambola/config/live-secrets.txt", "utf8")) || [])[1] || "").trim();
if (!password) { killTree(stack.pid); console.error("no owner password found for this mode"); process.exit(2); }

const VIEWS = [{ name: "laptop", width: 1280, height: 800 }, { name: "phone", width: 390, height: 844, touch: true }];
const TABS = ["overview", "games", "websites", "payments", "logs", "releases"];
const rows = [], errors = [];
const chrome = await launchChrome();
try {
  for (const v of VIEWS) {
    const ctx = await chrome.browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1, ...(v.touch ? { hasTouch: true } : {}) });
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push(`${v.name}: ${m.text().slice(0, 160)}`); });
    page.on("pageerror", (e) => errors.push(`${v.name}: ${String(e.message).slice(0, 160)}`));
    await page.goto(info.origin + "/owner/", { waitUntil: "load" });
    const smallest = () => page.evaluate(() => { let min = 99, who = ""; for (const el of document.querySelectorAll("body *")) { if (el.hidden || !el.offsetParent && getComputedStyle(el).position !== "fixed") continue; if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue; const s = parseFloat(getComputedStyle(el).fontSize); if (s < min) { min = s; who = el.tagName.toLowerCase() + "." + el.className; } } return { min, who }; });
    const record = async (label, extraChecks = {}) => {
      const f = await smallest();
      const taps = await tapTargets(page, "#mc-tabs button, .mc-bar button, #mc-form button, #mc-form input");
      const sw = await noSidewaysScroll(page);
      const r = { view: v.name, page: label, "no sideways scroll": !!sw.ok, "smallest letter >= 12.5px": f.min >= 12.5, "tap targets >= 44px": !!taps.ok, smallestPx: f.min, ...extraChecks };
      if (!sw.ok) errors.push(`${v.name}/${label}: ${sw.detail}`);
      if (!taps.ok) errors.push(`${v.name}/${label}: small tap targets: ${taps.detail}`);
      if (f.min < 12.5) errors.push(`${v.name}/${label}: smallest letter ${f.min}px in ${f.who}`);
      rows.push(r);
      await page.screenshot({ path: join(out, `${mode}-${v.name}-${label}.png`), fullPage: true });
    };
    await record("sign-in");
    // a wrong password must open nothing
    await page.fill("#mc-key", "this-is-not-the-password");
    await page.click("#mc-form button[type=submit]");
    await page.waitForFunction(() => /not accepted/i.test(document.getElementById("mc-msg").textContent), null, { timeout: 15000 });
    const stayedShut = await page.evaluate(() => document.getElementById("mc-app").hidden === true);
    rows.push({ view: v.name, page: "wrong password", "wrong password opens nothing": stayedShut });
    // the real password
    await page.fill("#mc-key", password);
    await page.click("#mc-form button[type=submit]");
    await page.waitForFunction(() => !document.getElementById("mc-app").hidden && !document.getElementById("mc-panel").textContent.includes("One moment."), null, { timeout: 90000 });
    for (const t of TABS) {
      if (t !== "overview") {
        await page.click(`#mc-tabs [data-tab=${t}]`);
        await page.waitForFunction(() => !document.getElementById("mc-panel").textContent.includes("One moment."), null, { timeout: 90000 });
      }
      const text = await page.evaluate(() => document.getElementById("mc-panel").textContent.trim());
      await record(t, { "panel has content": text.length > 40, "no read failure": !/could not read this just now/i.test(text) });
    }
    // the password must not be anywhere in the page after sign-in
    const leaked = await page.evaluate((pw) => document.documentElement.outerHTML.includes(pw) || document.getElementById("mc-key").value.includes(pw), password);
    rows.push({ view: v.name, page: "after sign-in", "password not in the page": !leaked });
    await ctx.close();
  }
} finally { await chrome.close(); killTree(stack.pid); }

const bad = rows.flatMap((r) => Object.entries(r).filter(([k, val]) => val === false).map(([k]) => `${r.view} / ${r.page}: ${k}`));
writeFileSync(join(out, "results.json"), JSON.stringify({ mode, rows, errors, bad }, null, 2));
console.log(`${mode}: ${rows.length} pages and steps checked, ${bad.length} problem(s), ${errors.length} browser error(s). Pictures in ${out}`);
for (const r of rows) console.log(`  ${r.view.padEnd(6)} ${String(r.page).padEnd(15)} ${Object.entries(r).filter(([k, val]) => typeof val === "boolean").map(([k, val]) => (val ? "ok " : "FAIL ") + k).join(" | ")}${r.smallestPx ? " | smallest " + r.smallestPx + "px" : ""}`);
for (const b of bad) console.log("PROBLEM " + b);
for (const e of errors) console.log("BROWSER ERROR " + e);
process.exit(bad.length || errors.length ? 1 : 0);
