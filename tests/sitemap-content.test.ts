// FALSIFIED BY: sitemap3-private-page-listed, sitemap3-no-lastmod, sitemap3-wrong-origin, sitemap3-robots-no-sitemap, sitemap3-preview-open, sitemap3-404-listed
// The content of sitemap.xml and robots.txt (0.3.0), read from a real build: exactly the public pages, each address equal to that page's own canonical address,
// dates that are true, nothing private, and robots.txt pointing at the sitemap with its full address.
import { test, expect } from "bun:test";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { build } from "../build.mjs";

const root = join(import.meta.dir, "..");
const releases = JSON.parse(readFileSync(join(root, "releases.json"), "utf8"));
const LIVE = "https://console.corporatetambola.com";
const live = mkdtempSync(join(tmpdir(), "sm-live-")), prev = mkdtempSync(join(tmpdir(), "sm-prev-"));
build({ env: "live", out: live, version: releases[0].version, commit: "0123456789ab", releasedAt: releases[0].releasedAt });
build({ env: "preview", out: prev, version: releases[0].version, commit: "0123456789ab", releasedAt: releases[0].releasedAt });
const rd = (d: string, p: string) => readFileSync(join(d, p), "utf8");
const rows = (xml: string) => [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({ loc: /<loc>([^<]*)<\/loc>/.exec(m[1])![1], lastmod: /<lastmod>([^<]*)<\/lastmod>/.exec(m[1])?.[1] }));
const PAGES: Record<string, string> = { "/": "index.html", "/games/": "games/index.html", "/changes": "changes.html" };

test("the live sitemap lists exactly the three public pages, once each, on the live address, and nothing else", () => {
  const xml = rd(live, "sitemap.xml");
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  const r = rows(xml);
  expect(r.map((x) => x.loc)).toEqual([LIVE + "/", LIVE + "/games/", LIVE + "/changes"]);
  expect(new Set(r.map((x) => x.loc)).size).toBe(r.length);
  for (const x of r) expect([x.loc, x.loc.startsWith(LIVE + "/"), /[?#\s]/.test(x.loc)]).toEqual([x.loc, true, false]);
  expect(r.map((x) => x.loc).join(" ")).not.toMatch(/pages\.dev|localhost|http:\/\//);
});

test("every address in the sitemap is the canonical address of a page that says 'index', and no private page, 404 or sign-in address is in it", () => {
  for (const x of rows(rd(live, "sitemap.xml"))) {
    const path = x.loc.slice(LIVE.length), html = rd(live, PAGES[path]);
    expect([path, new RegExp(`<link rel="canonical" href="${x.loc}">`).test(html)]).toEqual([path, true]);
    expect([path, /<meta name="robots" content="index,follow/.test(html)]).toEqual([path, true]);
  }
  const xml = rd(live, "sitemap.xml");
  for (const bad of ["/signin.html", "/pay-link.html", "/pay/", "/owner-funnel", "/auth/", "/report/", "/stats/", "/404", "#/"]) expect([bad, xml.includes(bad)]).toEqual([bad, false]);
});

test("lastmod is given only where it is true: What's new carries the date of the newest release (0.4.0), the other pages carry none", () => {
  const r = rows(rd(live, "sitemap.xml"));
  const newest = String(releases[0].releasedAt).slice(0, 10);
  expect(r.find((x) => x.loc.endsWith("/changes"))!.lastmod).toBe(newest);
  expect(r.filter((x) => !x.loc.endsWith("/changes")).every((x) => x.lastmod === undefined)).toBe(true);
  expect(/^\d{4}-\d{2}-\d{2}$/.test(newest)).toBe(true);
  expect(releases[0].version).toBe("0.4.0");
});

test("robots.txt: public pages open, private paths closed, training crawlers told no, and the sitemap named with its full live address", () => {
  const t = rd(live, "robots.txt");
  expect(t).toContain(`Sitemap: ${LIVE}/sitemap.xml`);
  for (const a of ["Allow: /$", "Allow: /games/", "Allow: /changes"]) expect([a, t.includes(a)]).toEqual([a, true]);
  for (const d of ["/auth/", "/pay/", "/pay-link.html", "/signin.html", "/report/", "/stats/", "/owner-funnel/"]) expect([d, t.includes("Disallow: " + d)]).toEqual([d, true]);
  expect(t).toMatch(/User-agent: GPTBot\nDisallow: \//);
  expect(t.split("\n").filter((l) => l.startsWith("Sitemap:")).length).toBe(1);
  for (const r of rows(rd(live, "sitemap.xml"))) { const p = r.loc.slice(LIVE.length); expect([p, /Disallow: \/(\s|$)/.test(t.split("User-agent: *")[1].split("User-agent:")[0])]).toEqual([p, false]); }
});

test("a trial build (pages.dev) is closed to search entirely and its sitemap does not point at the live site", () => {
  const t = rd(prev, "robots.txt");
  expect(t).toMatch(/User-agent: \*\nDisallow: \/\n/);
  expect(t).not.toContain("Sitemap: https://console.corporatetambola.com");
  for (const f of ["index.html", "games/index.html", "changes.html"]) expect([f, rd(prev, f).includes('content="noindex,nofollow"')]).toEqual([f, true]);
});
