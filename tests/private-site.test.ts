// Written from the owner's order (1 Nov 2026), not from the build code:
//   "The game sites and the console are private; home.corporatetambola.com is the one public face. No search engine lists them; sign-in, report,
//    e-mail and game links keep working."
// Builds the console into a temporary folder and reads what would be uploaded.
import { test, expect, setDefaultTimeout } from "bun:test";
import { mkdtempSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { build } from "../build.mjs";
setDefaultTimeout(60_000);

const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

test("the console is private: noindex meta on every page, robots.txt disallows all, no sitemap, every X-Robots-Tag says noindex, and the pages people use are still shipped", () => {
  const out = mkdtempSync(join(tmpdir(), "console-private-"));
  build({ env: "live", out, version: "9.9.9", commit: "abc1234def56", releasedAt: "2026-11-01T00:00:00Z" });
  const pages = walk(out).filter((f) => f.endsWith(".html"));
  expect(pages.length).toBeGreaterThanOrEqual(3);
  const bad = pages.filter((f) => { const m = [...readFileSync(f, "utf8").matchAll(/<meta\s+name=["']robots["'][^>]*>/gi)].map((x) => x[0]); return !(m.length === 1 && /noindex/.test(m[0]!)); }).map((f) => relative(out, f));
  expect(bad).toEqual([]);
  const robots = readFileSync(join(out, "robots.txt"), "utf8").replace(/\r/g, "");
  expect(robots).toMatch(/^User-agent: \*\nDisallow: \/$/m);
  expect(robots).not.toMatch(/^Allow:/m);
  expect(robots).not.toMatch(/^Sitemap:/mi);
  expect(existsSync(join(out, "sitemap.xml"))).toBe(false);
  const headers = readFileSync(join(out, "_headers"), "utf8").replace(/\r/g, "");
  expect(headers).toMatch(/^\/\*\n(  [^\n]+\n)*  X-Robots-Tag: noindex, nofollow/m);
  for (const l of headers.split("\n").filter((x) => /X-Robots-Tag:/.test(x))) expect(l).toMatch(/noindex/);
  for (const f of ["index.html", "signin.html", "signin.js", "version.json", "sw.js", "manifest.webmanifest", "games/index.html"]) expect(existsSync(join(out, f)), f).toBe(true);
});
