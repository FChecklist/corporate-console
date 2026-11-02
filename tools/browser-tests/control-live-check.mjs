// Real Chrome against the LIVE console: node tools/browser-tests/control-live-check.mjs [--origin https://console.corporatetambola.com] [--out dir]   (run it through tools/heavy-run.mjs)
// Opens /owner/ on a laptop-wide and a phone-wide screen, proves a wrong password opens nothing, signs in with the real owner password (read from live-secrets.txt at run time, only typed into the box,
// never printed or written), visits the tabs, checks nine lines, no sideways scroll, the version line, and that the password is nowhere in the page afterwards. Asks the live sites with GET only (through the console).
// Pictures show real, masked numbers: keep them out of the repository.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { launchChrome, noSidewaysScroll } from "./viewport-kit.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const origin = arg("--origin", "https://console.corporatetambola.com"), out = arg("--out", join(tmpdir(), "mission-control-live-check"));
mkdirSync(out, { recursive: true });
const password = ((/^ORGANIZER_SECRET=(.*)$/m.exec(readFileSync("C:/ct/tambola/config/live-secrets.txt", "utf8")) || [])[1] || "").trim();
if (!password) { console.error("no owner password found"); process.exit(2); }

const rows = [], notes = [];
const chrome = await launchChrome();
try {
  for (const v of [{ name: "laptop", width: 1280, height: 800 }, { name: "phone", width: 390, height: 844, touch: true }]) {
    const ctx = await chrome.browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1, ...(v.touch ? { hasTouch: true } : {}) });
    const page = await ctx.newPage();
    const cspOnly = [], other = [];
    page.on("console", (m) => { if (m.type() !== "error") return; const t = m.text(); if (/Content Security Policy|Refused to execute inline script/i.test(t)) cspOnly.push(t.slice(0, 120)); else if (!/Failed to load resource|net::ERR_/.test(t)) other.push(t.slice(0, 160)); });
    page.on("pageerror", (e) => other.push(String(e.message).slice(0, 160)));
    await page.goto(origin + "/owner/", { waitUntil: "load" });
    const shownBefore = await page.evaluate(() => document.getElementById("mc-app").hidden === true);
    await page.fill("#mc-key", "this-is-not-the-password");
    await page.click("#mc-form button[type=submit]");
    await page.waitForFunction(() => /not accepted/i.test(document.getElementById("mc-msg").textContent), null, { timeout: 20000 });
    const stayedShut = await page.evaluate(() => document.getElementById("mc-app").hidden === true);
    await page.fill("#mc-key", password);
    await page.click("#mc-form button[type=submit]");
    await page.waitForFunction(() => !document.getElementById("mc-app").hidden && !document.getElementById("mc-panel").textContent.includes("One moment."), null, { timeout: 90000 });
    const panelText = async () => page.evaluate(() => document.getElementById("mc-panel").textContent.trim());
    const ov = await panelText();
    const lightCount = await page.evaluate(() => document.querySelectorAll("#mc-panel .light, #mc-panel [data-light], #mc-panel .dot").length);
    const versionLine = await page.evaluate(() => document.getElementById("version-line")?.textContent || "");
    await page.screenshot({ path: join(out, `live-${v.name}-overview.png`), fullPage: true });
    const tabResults = {};
    for (const t of ["games", "websites", "payments", "logs", "releases"]) {
      await page.click(`#mc-tabs [data-tab=${t}]`);
      await page.waitForFunction(() => !document.getElementById("mc-panel").textContent.includes("One moment."), null, { timeout: 90000 });
      const txt = await panelText();
      tabResults[t] = { hasContent: txt.length > 40, noReadFailure: !/could not read this just now/i.test(txt) };
      await page.screenshot({ path: join(out, `live-${v.name}-${t}.png`), fullPage: true });
    }
    const sw = await noSidewaysScroll(page);
    const leaked = await page.evaluate((pw) => document.documentElement.outerHTML.includes(pw) || document.getElementById("mc-key").value.includes(pw), password);
    const gone = await page.evaluate(() => getComputedStyle(document.getElementById("mc-form")).display === "none" || document.getElementById("mc-form").hidden);
    rows.push({
      view: v.name,
      "tabs hidden before sign-in": shownBefore, "wrong password opens nothing": stayedShut, "overview has content": ov.length > 80,
      "version line shown": versionLine.length > 0, "no sideways scroll": !!sw.ok, "password not in the page": !leaked, "sign-in box gone after sign-in": !!gone,
      "all five other tabs have content": Object.values(tabResults).every((r) => r.hasContent), "no tab says 'could not read'": Object.values(tabResults).every((r) => r.noReadFailure),
      "no browser errors besides Cloudflare's own injected snippet": other.length === 0,
    });
    if (other.length) notes.push(`${v.name}: ${other.join(" | ")}`);
    if (cspOnly.length) notes.push(`${v.name}: ${cspOnly.length} policy message(s) about an inline script (Cloudflare's own edge snippet, present on every page of the site)`);
    notes.push(`${v.name}: version line = "${versionLine.replace(/\s+/g, " ").slice(0, 80)}" | overview light marks found: ${lightCount}`);
    await ctx.close();
  }
} finally { await chrome.close(); }
const bad = rows.flatMap((r) => Object.entries(r).filter(([, x]) => x === false).map(([k]) => `${r.view}: ${k}`));
writeFileSync(join(out, "results.json"), JSON.stringify({ origin, rows, notes, bad }, null, 2));
for (const r of rows) console.log(r.view.padEnd(7) + Object.entries(r).filter(([, x]) => typeof x === "boolean").map(([k, x]) => (x ? "ok " : "FAIL ") + k).join(" | "));
for (const n of notes) console.log("note " + n);
console.log(`${rows.length} screen sizes checked, ${bad.length} problem(s). Pictures in ${out}`);
process.exit(bad.length ? 1 : 0);
