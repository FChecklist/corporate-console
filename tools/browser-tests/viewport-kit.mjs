// Shared kit for the console's real-browser tests (Playwright + the installed Chrome, the same stack as the game repos' tools/browser-tests).
//  - WIDTHS: the ten widths of the owner's standing rule, plus the 899/900 switch pair and the phone landscape size.
//  - launchChrome(): refuses to start a SECOND Chrome while one started by this kit is alive (the laptop has little RAM).
//  - checks that run inside a page: no sideways scroll, tap targets >= 44 px.
//  - contrastRatio(): WCAG contrast from two colours, used on design tokens (no browser needed).
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";

export const WIDTHS = [320, 360, 390, 414, 600, 768, 1024, 1280, 1440, 1920];
export const SWITCH_WIDTHS = [899, 900];
export const LANDSCAPE = { w: 667, h: 375 };
export const heightFor = (w) => (w < 700 ? 800 : w < 1100 ? 900 : 1000);

export const CHROME_LOCK = "C:/ct/chrome-console.lock";
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return !!e && e.code === "EPERM"; } };
/** write our pid into the lock; throws if a live process already holds it */
export function acquireChromeLock(path = CHROME_LOCK, pid = process.pid) {
  if (existsSync(path)) {
    const other = Number(readFileSync(path, "utf8").trim());
    if (other && other !== pid && alive(other)) throw new Error(`another Chrome test is running (pid ${other}): one at a time`);
  }
  writeFileSync(path, String(pid));
}
export function releaseChromeLock(path = CHROME_LOCK, pid = process.pid) {
  try { if (Number(readFileSync(path, "utf8").trim()) === pid) rmSync(path); } catch { /* gone */ }
}

const CHROME_EXE = "C:/Program Files/Google/Chrome/Application/chrome.exe";
/** { browser, close } - one Chrome at a time */
export async function launchChrome(o = {}) {
  acquireChromeLock(o.lock);
  try {
    const pw = createRequire("C:/ct/ct/dpdp-app/package.json")("playwright");
    const browser = await pw.chromium.launch({ headless: true, ...(existsSync(CHROME_EXE) ? { executablePath: CHROME_EXE } : {}), args: ["--no-sandbox", "--disable-gpu", "--disable-extensions", "--no-first-run"] });
    return { browser, close: async () => { try { await browser.close(); } finally { releaseChromeLock(o.lock); } } };
  } catch (e) { releaseChromeLock(o.lock); throw e; }
}

/** open url at each width; fn(page, w, h) returns { name: boolean | {ok, detail} }; resolves to [{ w, name, ok, detail }] */
export async function sweep(browser, url, fn, widths = WIDTHS, o = {}) {
  const out = [];
  for (const w of widths) {
    const h = o.height || heightFor(w);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...(w < 768 ? { hasTouch: true } : {}) });
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: "load" });
      const res = await fn(page, w, h);
      for (const [name, v] of Object.entries(res)) out.push({ w, name, ok: typeof v === "object" && v !== null ? !!v.ok : !!v, detail: typeof v === "object" && v !== null ? v.detail || "" : "" });
    } finally { await ctx.close(); }
  }
  return out;
}

/** inside the page: the document must not be wider than the screen */
export const noSidewaysScroll = (page) => page.evaluate(() => {
  const de = document.documentElement, iw = window.innerWidth;
  const wide = [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > iw + 1 && getComputedStyle(e).position !== "fixed"; }).slice(0, 5).map((e) => (e.id ? "#" + e.id : e.tagName.toLowerCase()));
  return { ok: de.scrollWidth <= iw + 1 && document.body.scrollWidth <= iw + 1, detail: `scrollWidth ${de.scrollWidth} vs screen ${iw}; too wide: ${wide.join(", ")}` };
});
/** every visible button / link / input matched by selector must be at least min px in both directions */
export const tapTargets = (page, selector = "button, a[href], input:not([type=hidden]), select, [role=button]", min = 44) => page.evaluate(([sel, min]) => {
  const bad = [...document.querySelectorAll(sel)]
    .filter((e) => e.offsetParent !== null || getComputedStyle(e).position === "fixed")
    .map((e) => ({ e, r: e.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0 && (r.height < min - 0.5 || r.width < min - 0.5))
    .slice(0, 6);
  return { ok: bad.length === 0, detail: bad.map(({ e, r }) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""} ${Math.round(r.width)}x${Math.round(r.height)} '${(e.textContent || e.value || "").trim().slice(0, 18)}'`).join("; ") };
}, [selector, min]);

/** WCAG 2.x contrast ratio between two #rrggbb / #rgb colours */
export function contrastRatio(a, b) {
  const lum = (hex) => {
    let h = hex.replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
/** pairs: [[name, fg, bg, min?]] -> list of failures */
export const contrastFailures = (pairs, min = 4.5) => pairs.map(([n, f, b, m]) => ({ n, f, b, ratio: contrastRatio(f, b), min: m ?? min })).filter((x) => x.ratio < x.min);
