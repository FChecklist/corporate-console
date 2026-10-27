// FALSIFIED BY: a 340 px element is added on purpose at 320 px every run and the sweep must report it (see the 'falsify' lines).
// node tools/browser-tests/mockup-sweep.mjs [--laptop path] [--mobile path] [--out dir]    (run through tools/heavy-run.mjs: one Chrome at a time)
// W6: the two design mockups in real Chrome at the ten widths + 899/900 + phone landscape. Every screen is opened and checked for:
//   no sideways scroll | tap targets >= 44 px on the phone design | no script error | text contrast >= 4.5:1 computed from the mockup's own colour tokens.
// Looks (taste) are the owner's sign-off, not a test: screenshots of the main screens are saved for the owner.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { launchChrome, WIDTHS, SWITCH_WIDTHS, LANDSCAPE, heightFor, noSidewaysScroll, tapTargets, contrastFailures } from "./viewport-kit.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const LAPTOP = arg("--laptop", "C:/ct/test-sites/data/console-mockup-v3-laptop/index.html");
const MOBILE = arg("--mobile", "C:/ct/test-sites/data/console-mobile-mockup/index.html");
const out = arg("--out", "C:/ct/test-sites/data/ui/mockup-sweep");
mkdirSync(out, { recursive: true });

// ---- contrast from the tokens of each file (pairs the design really uses) ----
function tokens(file) { const css = readFileSync(file, "utf8"); const t = {}; for (const m of css.matchAll(/--([a-z0-9]+):\s*(#[0-9A-Fa-f]{3,6})\b/g)) if (!(m[1] in t)) t[m[1]] = m[2]; return t; }
function contrast(file) {
  const t = tokens(file), P = [
    ["ink on page", t.ink, t.bg], ["ink2 on page", t.ink2, t.bg], ["muted on page", t.muted, t.bg], ["muted on ivory", t.muted, t.ivory],
    ["gold text on page", t.goldt, t.bg], ["gold text on ivory", t.goldt, t.ivory], ["wine on page", t.wine2, t.bg], ["wine on ivory", t.wine2, t.ivory], ["blue on page", t.blue, t.bg],
    ["white on blue", "#ffffff", t.blue], ["white on navy", "#ffffff", t.navy], ["gold on navy", t.gold, t.navy], ["pale blue on navy", "#C4D2EE", t.navy],
    ["ok on page", t.ok, t.bg], ["warn on page", t.warn, t.bg], ["bad on page", t.bad, t.bg], ["dark on gold button", "#2b1a05", t.gold],
  ].filter((p) => p[1] && p[2]);
  return { pairs: P.length, fails: contrastFailures(P, 4.5) };
}

const results = [];
const errors = [];
const note = (file, w, screen, name, ok, detail = "") => results.push({ file, w, screen, name, ok: !!ok, detail });

async function sweepFile(browser, label, file, screens, goto, widths, opts = {}) {
  for (const w of widths) {
    const h = opts.landscape ? LANDSCAPE.h : heightFor(w);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 768 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${label} ${w}px: ${String(e).slice(0, 200)}`));
    page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|net::ERR_/.test(m.text())) errors.push(`${label} ${w}px: ${m.text().slice(0, 200)}`); });
    await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
    await page.waitForTimeout(250);
    for (const s of screens) {
      try {
        await goto(page, s);
        await page.waitForTimeout(60);
        const sw = await noSidewaysScroll(page);
        note(label, w, s.name, "no sideways scroll", sw.ok, sw.detail);
        const phone = label === "mobile" || w <= 860;
        if (phone) { const tt = await tapTargets(page, "main button, main a[href], #tabbar a, .tabbar a, .mtop button, main label.opt, main select, main input[type=text], main input[type=email]", 44); note(label, w, s.name, "tap targets 44 px", tt.ok, tt.detail); }
        if ((w === 390 || w === 1280) && s.shot) await page.screenshot({ path: join(out, `${label}-${s.name.replace(/[^a-z0-9]+/gi, "_")}-${w}.png`), fullPage: true });
      } catch (e) { note(label, w, s.name, "screen opens", false, String(e).slice(0, 160)); }
    }
    await ctx.close();
  }
}

const laptopScreens = [
  { name: "home", shot: true, go: "go('home')" }, { name: "mygames", shot: true, go: "go('mine')" }, { name: "create-pick", shot: true, go: "go('create')" },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ name: "create-step" + n, shot: n === 3 || n === 6, go: `S.picked=true;S.g=0;S.step=${n};go('create');S.step=${n};wzRender()` })),
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ name: "gamehome" + i, go: `go('game',${i})` })),
  ...["ov", "ppl", "pay", "log", "pv", "new"].map((t) => ({ name: "gamepage-" + t, shot: t === "pv" || t === "pay", go: `go('gp',1);GP.tab='${t}';refresh()` })),
  { name: "billing", shot: true, go: "go('billing')" }, { name: "pricing", go: "go('pricing')" }, { name: "participant", go: "go('play')" }, { name: "help", go: "go('help')" }, { name: "account", go: "go('account')" }, { name: "versions", shot: true, go: "go('versions')" },
];
const mobileScreens = [
  { name: "home", shot: true, go: "go('home')" }, { name: "mygames", shot: true, go: "go('mine')" }, { name: "billing", shot: true, go: "go('billing')" }, { name: "more", shot: true, go: "go('more')" },
  { name: "participant", go: "go('play')" }, { name: "versions", go: "go('versions')" }, { name: "help", go: "go('help')" }, { name: "account", go: "go('account')" }, { name: "create-pick", shot: true, go: "go('create')" },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ name: "create-step" + n, shot: n === 3 || n === 6, go: `S.picked=true;S.g=0;S.step=${n};go('create');S.step=${n};wzRender()` })),
  ...["ov", "ppl", "pay", "log", "pv", "new"].map((t) => ({ name: "gamepage-" + t, shot: t === "pv" || t === "ov", go: `go('gp',1);GP.tab='${t}';refresh()` })),
];
const runGo = async (page, s) => { await page.evaluate((code) => { (0, eval)(code); }, s.go); };

const chrome = await launchChrome();
try {
  const all = [...WIDTHS, ...SWITCH_WIDTHS];
  await sweepFile(chrome.browser, "laptop", LAPTOP, laptopScreens, runGo, all);
  await sweepFile(chrome.browser, "mobile", MOBILE, mobileScreens, runGo, all);
  await sweepFile(chrome.browser, "mobile", MOBILE, mobileScreens.filter((s) => ["home", "mygames", "create-step3", "gamepage-ov"].includes(s.name)), runGo, [LANDSCAPE.w], { landscape: true });
  // FALSIFICATION: the same check must fail when a 340 px element is added at 320 px
  for (const [label, file, home] of [["laptop", LAPTOP, "go('home')"], ["mobile", MOBILE, "go('home')"]]) {
    const ctx = await chrome.browser.newContext({ viewport: { width: 320, height: 800 }, hasTouch: true }); const page = await ctx.newPage();
    await page.goto(pathToFileURL(file).href); await page.waitForTimeout(250); await page.evaluate((c) => (0, eval)(c), home);
    await page.evaluate(() => { const d = document.createElement("div"); d.style.cssText = "width:340px;height:4px;background:red"; document.querySelector("#main").append(d); });
    const sw = await noSidewaysScroll(page); note(label, 320, "falsify", "a 340 px element is caught", sw.ok === false, sw.detail); await ctx.close();
  }
} finally { await chrome.close(); }

const c1 = contrast(LAPTOP), c2 = contrast(MOBILE);
note("laptop", 0, "tokens", `contrast of ${c1.pairs} colour pairs >= 4.5:1`, c1.fails.length === 0, c1.fails.map((f) => `${f.n} ${f.f} on ${f.b} = ${f.ratio.toFixed(2)}`).join("; "));
note("mobile", 0, "tokens", `contrast of ${c2.pairs} colour pairs >= 4.5:1`, c2.fails.length === 0, c2.fails.map((f) => `${f.n} ${f.f} on ${f.b} = ${f.ratio.toFixed(2)}`).join("; "));
for (const e of errors.slice(0, 40)) note("page", 0, "errors", "script error: " + e, false);

const bad = results.filter((r) => !r.ok);
writeFileSync(join(out, "mockup-sweep-result.json"), JSON.stringify({ checks: results.length, failed: bad.length, bad }, null, 1));
const seen = new Set();
for (const b of bad) { const k = `${b.file} ${b.screen} ${b.name} ${b.detail}`.slice(0, 200); if (seen.has(k)) continue; seen.add(k); if (seen.size <= 60) console.log(`FAIL ${b.file} ${b.w}px ${b.screen}: ${b.name} ${b.detail}`); }
console.log(`${results.length} checks, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
