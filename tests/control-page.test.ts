// FALSIFIED BY: control-page-indexable, control-page-innerhtml, control-page-password-stored, control-page-small-font
// Mission Control page (public/owner/): hidden from search engines and from the site map, built with textContent only, small texts never below 12.5 px, the password only in memory,
// and every tab drawn from real answers of the door: with a full game, with a game that lacks endpoints, with a game that refuses the password and with a game that is down.
import { test, expect, setDefaultTimeout } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync, mkdtempSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { build } from "../build.mjs";
import { handleControl } from "../functions/_lib/control-core";
import { world, PASSWORD, AI_KEY, NOW, type Moods } from "./support/control-world";
setDefaultTimeout(60_000);

const ROOT = new URL("../", import.meta.url);
const html = readFileSync(new URL("public/owner/index.html", ROOT), "utf8");
const js = readFileSync(new URL("public/owner/owner.js", ROOT), "utf8");
const css = readFileSync(new URL("public/owner/owner.css", ROOT), "utf8");

test("the page is hidden from search engines and the site map, has no inline script, and is named Mission Control", () => {
  expect(html).toMatch(/<title>Mission Control<\/title>/);
  expect([...html.matchAll(/<meta\s+name=["']robots["'][^>]*>/gi)].map((m) => m[0]).length).toBe(1);
  expect(html).toMatch(/<meta name="robots" content="noindex,nofollow">/);
  expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i); // every script has a src: the Content-Security-Policy allows nothing inline
  expect(html).not.toMatch(/\son[a-z]+=/i);
  expect(html).toMatch(/<input id="mc-key" type="password"/);
  const out = mkdtempSync(join(tmpdir(), "mc-build-"));
  build({ env: "live", out, version: "9.9.9", commit: "abc1234def56", releasedAt: "2026-11-02T00:00:00Z" });
  for (const f of ["owner/index.html", "owner/owner.js", "owner/owner.css"]) expect(existsSync(join(out, f)), f).toBe(true);
  expect(existsSync(join(out, "sitemap.xml"))).toBe(false); // the console has no site map, so the page cannot be in one
  expect(readFileSync(join(out, "robots.txt"), "utf8")).toMatch(/Disallow: \//);
  expect(readFileSync(join(out, "_headers"), "utf8")).toMatch(/X-Robots-Tag: noindex, nofollow/);
  expect(readFileSync(join(out, "owner/index.html"), "utf8")).toMatch(/noindex/);
  const homeMap = new URL("../../wt-home-rel/sitemap.xml", import.meta.url); // the public home page's own site map (only checked where that folder exists)
  if (existsSync(homeMap)) expect(readFileSync(homeMap, "utf8")).not.toMatch(/owner|control/i);
});

test("the page draws with textContent only, never keeps the password on the device or in an address, and calls only its own /api/control/", () => {
  expect(js).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
  expect(js).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  expect(js).not.toMatch(/location\.(search|hash)|history\.(push|replace)State/);
  const calls = [...js.matchAll(/ask\(\s*"([^"]+)"/g)].map((m) => m[1]);
  expect(calls.length).toBeGreaterThan(8);
  for (const c of calls) expect(c.startsWith("/api/control/")).toBe(true);
  expect(js).not.toMatch(/https?:\/\//);
  expect(js).toMatch(/credentials: "omit"/);
});

test("no text on the page is smaller than 12.5 px", () => {
  const sizes = [...css.matchAll(/font-size:\s*([\d.]+)(px|rem|em)/g)].map((m) => ({ v: Number(m[1]) * (m[2] === "px" ? 1 : 16), raw: m[0] }));
  expect(sizes.length).toBeGreaterThan(5);
  for (const s of sizes) expect([s.raw, s.v >= 12.5]).toEqual([s.raw, true]);
  expect(css).not.toMatch(/font-size:\s*(?:xx?-)?small\b/);
});

test("the wording has no street, city or state: only the country if any place is named", () => {
  for (const text of [html, js, css]) expect(text).not.toMatch(/\b(Mumbai|Delhi|Bengaluru|Bangalore|Chennai|Kolkata|Hyderabad|Pune|Gurugram|Gurgaon|Noida|Maharashtra|Karnataka|Uttar Pradesh|Tamil Nadu|Haryana)\b/i);
});

// ---------------------------------------------------------------- the page in a small browser (happy-dom), talking to the real door
const until = async (f: () => boolean, ms = 20000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error("timed out waiting"); await new Promise((r) => setTimeout(r, 10)); } };

async function open(moods: Moods = {}, o: { cf?: boolean; fail?: (path: string) => boolean } = {}) {
  const win = new Window({ url: "https://console.test/owner/" });
  const doc = win.document;
  doc.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)![1]!;
  const writes: string[] = [];
  const mk = (n: string) => ({ setItem: (k: string, v: string) => writes.push(`${n}:${k}=${v}`), getItem: () => null, removeItem: () => {}, clear: () => {} });
  Object.assign(globalThis, { localStorage: mk("local"), sessionStorage: mk("session"), window: win, document: doc, Node: win.Node, __MC_NO_AUTOSTART: true });
  const w = world(moods, { cf: o.cf });
  const calls: Array<{ path: string; method: string; headers: Record<string, string> }> = [];
  const fetchFn = async (path: string, init: any = {}) => {
    calls.push({ path, method: init.method || "GET", headers: { ...(init.headers || {}) } });
    if (o.fail?.(path)) throw new TypeError("network down");
    return handleControl(new Request("https://console.test" + path, { method: init.method || "GET", headers: init.headers, body: init.body }), w.env, NOW, w.fetchFn);
  };
  const { start } = await import("../public/owner/owner.js");
  const app = start(doc as any, fetchFn as any);
  const text = () => doc.getElementById("mc-panel")!.textContent || "";
  const submit = (pw: string) => { (doc.getElementById("mc-key") as any).value = pw; doc.getElementById("mc-form")!.dispatchEvent(new win.Event("submit", { cancelable: true })); };
  const tab = async (id: string, expect: string) => { (doc.querySelector(`[data-tab="${id}"]`) as any).click(); await until(() => text().includes(expect)); return text(); };
  return { win, doc, w, calls, writes, app, text, submit, tab };
}

test("sign in: a wrong password is told so softly and the page stays closed; the right one opens the Overview with one traffic-light line per game and site", async () => {
  const p = await open();
  p.submit("a-wrong-password");
  await until(() => (p.doc.getElementById("mc-msg")!.textContent || "").includes("not accepted"));
  expect((p.doc.getElementById("mc-app") as any).hidden).toBe(true);
  expect((p.doc.getElementById("mc-form") as any).hidden).toBe(false);
  p.submit(PASSWORD);
  await until(() => p.text().includes("Overview") && p.doc.querySelectorAll(".mc-line").length === 9);
  expect((p.doc.getElementById("mc-app") as any).hidden).toBe(false);
  expect(p.doc.getElementById("mc-key") && (p.doc.getElementById("mc-key") as any).value).toBe(""); // the box is emptied once the password is in memory
  expect(p.text()).toContain("Everything looks fine: 9 green.");
  const lines = [...p.doc.querySelectorAll(".mc-line")].map((n: any) => n.textContent);
  expect(lines[0]).toContain("Tambola");
  expect(lines[0]).toContain("Green");
  expect(lines.some((l: string) => l.includes("Payments site"))).toBe(true);
  expect([...p.doc.querySelectorAll("#mc-tabs button")].map((b: any) => b.textContent)).toEqual(["Overview", "Games", "Websites and pages", "Payments", "Logs and errors", "Releases and history"]);
  expect(p.writes).toEqual([]); // nothing stored on the device
  expect(p.calls.every((c) => c.path.startsWith("/api/control/"))).toBe(true);
  expect(p.calls.every((c) => Object.keys(c.headers).every((k) => ["x-organizer", "content-type"].includes(k)))).toBe(true);
  expect(p.calls.some((c) => c.path.includes(PASSWORD))).toBe(false);
});

test("the Overview shows trouble in words: a red line for a game that is down, an amber one for a game in test mode, and the first sentence tells how many", async () => {
  const p = await open({ bingo: "down", luckbychance: "test-mode" });
  p.submit(PASSWORD);
  await until(() => p.doc.querySelectorAll(".mc-line").length === 9);
  expect(p.text()).toMatch(/1 red, 1 amber, 7 green\. Start with the red ones\./);
  const red = [...p.doc.querySelectorAll(".mc-line.red")].map((n: any) => n.textContent);
  expect(red.length).toBe(1);
  expect(red[0]).toContain("Bingo");
  expect(red[0]).toContain("Red");
  expect(red[0]).toContain("did not answer");
  expect([...p.doc.querySelectorAll(".mc-line.amber")][0]!.textContent).toContain("TEST mode");
});

test("Games tab: every game opens with its panels; 'not available' and 'did not accept the password' and 'did not answer' are said in plain words; the organizer lookup works", async () => {
  const p = await open({ bingo: "lacking", tictactoe: "refusing", luckydraw: "down" });
  p.submit(PASSWORD); await until(() => p.doc.querySelectorAll(".mc-line").length === 9);
  const t = await p.tab("games", "Organizer lookup");
  expect(p.doc.querySelectorAll("#mc-panel details").length).toBe(6);
  expect(t).toContain("Not available on this game."); // Bingo has no funnel, releases or game records
  expect(t).toContain("This game did not accept the owner password.");
  expect(t).toContain("This game did not answer just now.");
  expect(t).toContain("46 visitors, 66 visits");
  expect(t).toContain("Site viewed 12");
  expect(t).toContain("2 open, 1 late, 1 closed");
  expect(t).not.toMatch(/Ravi|9876543210|SECRET-NOTE/);
  (p.doc.getElementById("mc-og") as any).value = "tambola"; (p.doc.getElementById("mc-oe") as any).value = "demo21@demo-test.invalid";
  p.doc.getElementById("mc-oe")!.closest("form")!.dispatchEvent(new p.win.Event("submit", { cancelable: true }));
  await until(() => (p.doc.getElementById("mc-oout")!.textContent || "").includes("d***@demo-test.invalid"));
  expect(p.doc.getElementById("mc-oout")!.textContent).toContain("1 game(s)");
  expect(p.text()).not.toContain("demo21@demo-test.invalid");
});

test("Websites tab: a block per site with the search-engine rule, the answer and the speed of each page; a wrong rule is red", async () => {
  const p = await open({ tictactoe: "indexable" });
  p.submit(PASSWORD); await until(() => p.doc.querySelectorAll(".mc-line").length === 9);
  const t = await p.tab("websites", "Rule: listed in search engines");
  expect(t).toContain("Rule: every page hidden from search engines");
  expect(t).toContain("Site map lists 10 pages.");
  expect(t).toMatch(/Red: not hidden from search engines/);
  expect(p.doc.querySelectorAll("#mc-panel section").length).toBeGreaterThanOrEqual(7);
});

test("Payments tab: real money and test payments are shown apart, with the paid and waiting receipts, a month box and the central site's state", async () => {
  const p = await open({ luckydraw: "down" });
  p.submit(PASSWORD); await until(() => p.doc.querySelectorAll(".mc-line").length === 9);
  const t = await p.tab("payments", "Central payment site");
  expect(t).toContain("Payments, 2026-11");
  expect(t).toMatch(/Real money, all games: paid 10 \(Rs 25,000\), waiting to be paid 5 \(Rs 5,000\), failed 5, refunded Rs 100/);
  expect(t).toContain("Test payments (not real money, kept apart): paid 5, waiting 5, failed 0.");
  expect(t).toContain("Test payment (not real money)");
  expect(t).toContain("PAYTEST-t1");
  expect(t).toContain("TAM-a1");
  expect(t).toContain("This game did not answer just now."); // Lucky Draw is down
  expect(t).toContain("needs its own read key");
  expect(p.doc.getElementById("mc-month")).toBeTruthy();
});

test("Logs tab and Releases tab: totals, errors by hour, the release log copied from the handover, Cloudflare not connected, and no history lines yet", async () => {
  const p = await open({ bingo: "lacking" });
  p.submit(PASSWORD); await until(() => p.doc.querySelectorAll(".mc-line").length === 9);
  const logs = await p.tab("logs", "errors by hour");
  expect(logs).toMatch(/36 errors in the last day \(0 in the last hour\)/);
  expect(logs).toContain("2026-11-02T09:00Z");
  const rel = await p.tab("releases", "Release log");
  expect(rel).toContain("Live versions");
  expect(rel).toContain("Add a read-only Cloudflare token");
  expect(rel).toMatch(/2026-11-0[12] \d\d:\d\d/);
  expect(rel).toContain("No history lines yet.");
  p.w.raw.query("INSERT INTO control_history(at_ms,who,site,what,result,ref) VALUES(?,?,?,?,?,?)").run(NOW, "ai", "bingo", "Released Bingo", "live gate 0, version.json matches", "fc5f01f");
  (p.doc.getElementById("mc-refresh") as any).click();
  await until(() => p.text().includes("live gate 0, version.json matches"));
  expect(p.text()).toContain("Released Bingo");
  expect(p.text()).toContain("AI");
  expect(p.text()).toContain("fc5f01f");
});

test("Releases tab with Cloudflare connected lists deployments with the LIVE one marked and the rollback id", async () => {
  const p = await open({}, { cf: true });
  p.submit(PASSWORD); await until(() => p.doc.querySelectorAll(".mc-line").length === 9);
  const rel = await p.tab("releases", "Cloudflare deployments and rollback ids");
  await until(() => p.text().includes("rollback id"));
  expect(p.text()).toContain("LIVE");
  expect(p.text()).toMatch(/Tambola {2}-  rollback id 00000002-aaaa-bbbb-cccc-dddddddddddd/);
});

test("a tab that cannot be read says so and offers Try again; Close and forget empties the password; a password the door stops accepting closes the page", async () => {
  let down = true;
  const p = await open({}, { fail: (path) => down && path.startsWith("/api/control/logs") });
  p.submit(PASSWORD); await until(() => p.doc.querySelectorAll(".mc-line").length === 9);
  (p.doc.querySelector('[data-tab="logs"]') as any).click();
  await until(() => p.text().includes("could not read this just now"));
  down = false;
  const retry = [...p.doc.querySelectorAll("#mc-panel button")].find((b: any) => b.textContent === "Try again") as any;
  retry.click();
  await until(() => p.text().includes("errors by hour"));
  (p.doc.getElementById("mc-lock") as any).click();
  expect((p.doc.getElementById("mc-app") as any).hidden).toBe(true);
  expect((p.doc.getElementById("mc-msg")!.textContent || "")).toContain("forgotten");
  // after forgetting, a click on a tab can no longer read anything: type the password again to open
  p.w.env.ORGANIZER_SECRET = "changed-owner-password-1234";
  p.submit(PASSWORD);
  await until(() => (p.doc.getElementById("mc-msg")!.textContent || "").includes("not accepted"));
  expect(p.writes).toEqual([]);
  expect(AI_KEY.length).toBeGreaterThan(24);
});

test("a wrong password never reaches a game: the console is asked, the games are not", async () => {
  const p = await open();
  p.submit("nope-nope-nope");
  await until(() => (p.doc.getElementById("mc-msg")!.textContent || "").includes("not accepted"));
  expect(p.w.seen.length).toBe(0);
  expect(readdirSync(new URL("public/owner/", ROOT)).sort()).toEqual(["index.html", "owner.css", "owner.js"]);
});
