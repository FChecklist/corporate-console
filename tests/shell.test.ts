// FALSIFIED BY: shell-brand-in-menu, shell-wildcard-connect, shell-sw-caches-auth, shell-breakpoint-901, shell-csp-inline-script
import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { build, lintHeaders, headersFile } from "../build.mjs";

const cfg = JSON.parse(readFileSync(new URL("../config/games.json", import.meta.url), "utf8"));
const out = mkdtempSync(join(tmpdir(), "dist-"));
const built = build({ env: "preview", out });
const read = (p: string) => readFileSync(join(out, p), "utf8");
const copy = JSON.parse(read("copy/en.json"));

test("the generated _headers keeps every rule: nothing wildcard, no inline scripts, no framing", () => {
  expect(lintHeaders(built.headers)).toEqual([]);
  expect(built.headers).toContain("frame-ancestors 'none'");
  expect(built.headers).toContain("X-Frame-Options: DENY");
});

test("connect-src lists the console and exactly the six games, in both environments", () => {
  for (const env of ["preview", "live"]) {
    const h = headersFile(cfg, env);
    const connect = /connect-src ([^;]+);/.exec(h)![1].split(" ");
    expect(connect).toEqual(["'self'", ...cfg.games.map((g: any) => g[env])]);
    expect(connect.length).toBe(7);
  }
});

test("the header checker refuses a wildcard, an inline-script allowance, framing and a missing policy", () => {
  const good = headersFile(cfg, "live");
  expect(lintHeaders(good)).toEqual([]);
  expect(lintHeaders(good.replace("connect-src 'self'", "connect-src * 'self'")).join()).toContain("wildcard");
  expect(lintHeaders(good.replace("connect-src 'self'", "connect-src https://*.example.com 'self'")).join()).toContain("wildcard");
  expect(lintHeaders(good.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")).join()).toContain("inline");
  expect(lintHeaders(good.replace("frame-ancestors 'none'", "frame-ancestors 'self'")).join()).toContain("framed");
  expect(lintHeaders("X-Frame-Options: DENY")).toEqual(["no Content-Security-Policy"]);
});

test("the page itself has no inline script, no inline style and no inline event handler", () => {
  for (const f of ["index.html", "signin.html"]) {
    const html = read(f);
    expect([f, /<script(?![^>]*\bsrc=)[^>]*>/i.test(html)]).toEqual([f, false]);
    expect([f, /\sstyle\s*=/i.test(html)]).toEqual([f, false]);
    expect([f, /\son[a-z]+\s*=/i.test(html)]).toEqual([f, false]);
  }
  for (const f of ["core/dom.js", "core/boot.js", "view-laptop/shell.js", "view-mobile/shell.js"]) expect([f, /["'`]\s*style\s*=/.test(read(f))]).toEqual([f, false]);
});

test("the menu is exactly Home, My games, Create, Billing, Account (no game names), and no brand word appears in it, the page title or the app name", async () => {
  const boot = await import(join(out, "core/boot.js").replace(/\\/g, "/"));
  const labels = boot.menuItems(copy).map((i: any) => i.label);
  expect(labels).toEqual(["Home", "My games", "Create", "Billing", "Account"]);
  expect(copy.mobileBar).toEqual({ home: "Home", mygames: "My games", create: "Create", billing: "Billing", account: "Account" });
  for (const l of labels) expect(/corporate|console/i.test(l)).toBe(false);
  expect(/<title>([^<]*)<\/title>/.exec(read("index.html"))![1]).toBe("Console");
});

test("the privacy strip has the five phrases of the owner's brief", () => {
  const text = copy.privacy.phrases.join(" ");
  for (const p of ["100% data deletion of player data", "DPDP Act", "GDPR", "US privacy law", "global data policy", "close-group online games"]) expect([p, text.includes(p)]).toEqual([p, true]);
  expect(/invoices/i.test(copy.privacy.more)).toBe(true);
  expect(/invoice[^.]*delet/i.test(text + copy.privacy.more)).toBe(false); // never claims invoices are deleted
});

test("the design switches exactly at 900: 899 is the phone, 900 is the laptop, and a person's choice wins", async () => {
  const boot = await import(join(out, "core/boot.js").replace(/\\/g, "/"));
  expect(boot.BREAKPOINT).toBe(900);
  expect(boot.designFor(899)).toBe("phone");
  expect(boot.designFor(900)).toBe("laptop");
  expect(boot.designFor(320)).toBe("phone");
  expect(boot.designFor(1920)).toBe("laptop");
  expect(boot.designFor(1200, "phone")).toBe("phone");
  expect(boot.designFor(400, "laptop")).toBe("laptop");
  expect(boot.designFor(400, "junk")).toBe("phone");
});

test("the install manifest is valid: starts at /?source=pwa, standalone, three real PNG icons of the right size", () => {
  const m = JSON.parse(read("manifest.webmanifest"));
  expect(m.start_url).toBe("/?source=pwa");
  expect(m.display).toBe("standalone");
  expect(m.name.length).toBeGreaterThan(3);
  expect(m.short_name.length).toBeLessThanOrEqual(12);
  expect(/^#[0-9A-Fa-f]{6}$/.test(m.theme_color) && /^#[0-9A-Fa-f]{6}$/.test(m.background_color)).toBe(true);
  const sizes = m.icons.map((i: any) => i.sizes + ":" + (i.purpose || "any"));
  expect(sizes).toEqual(["192x192:any", "512x512:any", "512x512:maskable"]);
  for (const i of m.icons) {
    const p = join(out, i.src.replace(/^\//, ""));
    expect(existsSync(p)).toBe(true);
    const b = readFileSync(p);
    expect([...b.subarray(1, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("PNG");
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    expect(`${w}x${h}`).toBe(i.sizes);
  }
});

/** run sw.js against fake browser parts and report which requests it chose to answer itself */
function swAnswers(requests: Array<[string, string]>) {
  const src = read("sw.js");
  const handlers: Record<string, Function> = {};
  const self: any = { location: { origin: "https://console.test" }, addEventListener: (t: string, f: Function) => { handlers[t] = f; }, registration: { unregister: async () => {} }, clients: { claim: async () => {} }, skipWaiting: () => {} };
  new Function("self", "caches", "fetch", src)(self, { match: async () => undefined, open: async () => ({ put: async () => {}, addAll: async () => {} }), keys: async () => [] }, async () => new Response("x"));
  return requests.map(([method, url]) => { let answered = false; handlers.fetch({ request: { method, url }, respondWith: () => { answered = true; } }); return { method, url, answered }; });
}

test("the offline worker keeps only the app's own pages: never /auth, /api, another address (the games), a POST, the version file or itself", () => {
  const r = swAnswers([["GET", "https://console.test/core/boot.js"], ["GET", "https://console.test/"], ["GET", "https://console.test/auth/me"], ["POST", "https://console.test/auth/request"], ["GET", "https://console.test/api/anything"], ["GET", "https://bingo.corporatetambola.com/api/console/games"], ["GET", "https://console.test/version.json"], ["GET", "https://console.test/sw.js"], ["GET", "https://console.test/sw-config.json"]]);
  expect(r.filter((x) => x.answered).map((x) => x.url)).toEqual(["https://console.test/core/boot.js", "https://console.test/"]);
});

test("the offline worker has a kill switch: sw-config.json can switch it off, and it is never cached", () => {
  const sw = read("sw.js");
  expect(sw).toContain("/sw-config.json");
  expect(sw).toContain("unregister()");
  expect(JSON.parse(read("sw-config.json"))).toEqual({ enabled: true });
  expect(built.headers).toMatch(/\/sw-config\.json\n  Cache-Control: no-store/);
  expect(built.headers).toMatch(/\/sw\.js\n  Cache-Control: no-cache/);
});

test("games.config.js is generated from config/games.json: six games, Lucky Draw not yet ready, addresses for the chosen environment", async () => {
  const c = await import(join(out, "core/games.config.js").replace(/\\/g, "/"));
  expect(c.GAMES.map((g: any) => g.id)).toEqual(["tambola", "bingo", "tictactoe", "snakesladders", "luckbychance", "luckydraw"]);
  expect(c.GAMES.map((g: any) => g.freeCap)).toEqual([10, 10, 10, 10, 10, 10]); // boss ruling 29 Oct: free demo of 10 people everywhere
  expect(c.GAMES.map((g: any) => [g.id, g.status, g.ready])).toEqual([["tambola", "live", true], ["bingo", "live", true], ["tictactoe", "opening", false], ["snakesladders", "opening", false], ["luckbychance", "opening", false], ["luckydraw", "planned", false]]);
  expect(c.GAMES[0].origin).toBe("https://corporate-tambola.pages.dev");
  expect(c.ENV).toBe("preview");
});
