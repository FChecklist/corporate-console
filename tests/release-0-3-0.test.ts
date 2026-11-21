// FALSIFIED BY: release3-version-not-bumped, release3-changelog-missing, release3-knowledge-stale, release3-footer-no-version, release3-version-json-old
// Release 0.3.0: the version is bumped everywhere the owner's rule names (the release list that makes version.json, CHANGELOG.md, docs/KNOWLEDGE.md), and every page's footer shows it.
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { build } from "../build.mjs";

const root = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const releases = JSON.parse(read("releases.json"));

test("the newest release is 0.3.0, with a time, a technical note and a plain sentence that holds no internal word", () => {
  const r = releases[0];
  expect(r.version).toBe("0.3.0");
  expect(/^\d{4}-\d{2}-\d{2}T/.test(r.releasedAt)).toBe(true);
  expect(r.note.length).toBeGreaterThan(40);
  expect(r.userNote.length).toBeGreaterThan(40);
  expect(/audit|commit|rollback|bridge|re-vendor|token|secret|worker|cache/i.test(r.userNote)).toBe(false); // what the public reads says it plainly
  expect(/\b(we|our|us)\b/i.test(r.userNote)).toBe(false);
  expect(releases[1].version).toBe("0.2.2");
});

test("CHANGELOG.md has the 0.3.0 entry on top, in plain words, with what changed, where, the tests, what is not changed, and the rollback line", () => {
  const c = read("CHANGELOG.md");
  expect(c.indexOf("## 0.3.0 ")).toBeGreaterThan(-1);
  expect(c.indexOf("## 0.3.0 ")).toBeLessThan(c.indexOf("## 0.2.2 "));
  const entry = c.slice(c.indexOf("## 0.3.0 "), c.indexOf("## 0.2.2 "));
  for (const w of ["cookie", "Step N of", "example", "double", "confirm", "404", "noindex", "sitemap", "offline.js", "forms.js", "page-seo.js", "Rollback", "Audit", "pay", "bridge", "pack", "Tests"]) expect([w, entry.toLowerCase().includes(w.toLowerCase())]).toEqual([w, true]);
  expect(entry).toMatch(/not touched|untouched|byte for byte/i); // the audited pay contract, bridge and pack
});

test("docs/KNOWLEDGE.md says 0.3.0 and names the files that make it", () => {
  const k = read("docs/KNOWLEDGE.md");
  expect(k).toContain("for version 0.3.0,");
  expect(k).toContain("## 2b. What 0.3.0 added");
  for (const w of ["offline.js", "forms.js", "page-seo.js", "404.html", "X-Robots-Tag", "cg-consent-changed", "Step N of"]) expect([w, k.includes(w)]).toEqual([w, true]);
});

test("a build carries 0.3.0 in version.json, and every page's footer shows it with the what's-new link", async () => {
  const out = mkdtempSync(join(tmpdir(), "rel3-"));
  build({ env: "live", out, version: releases[0].version, commit: "0123456789ab", releasedAt: releases[0].releasedAt });
  const v = JSON.parse(readFileSync(join(out, "version.json"), "utf8"));
  expect([v.version, v.consoleVersion, v.product]).toEqual(["0.3.0", "0.3.0", "corporate-console"]);
  expect(v.changes[0]).toMatchObject({ version: "0.3.0" });
  expect(v.releasedAtIST).toMatch(/^\d{2} \w{3} \d{4}, \d{2}:\d{2} IST$/);
  const { showVersion } = await import("../public/core/version.js");
  const doc: any = new Window({ url: "https://console.corporatetambola.com/" }).document;
  await showVersion(doc, async () => ({ json: async () => v }));
  expect(doc.getElementById("version-line").textContent).toBe(`Version 0.3.0, released ${v.releasedAtIST}`);
  expect(doc.getElementById("footer-changes").textContent).toBe("v0.3.0: what's new");
  expect(doc.getElementById("footer-cookies").textContent).toBe("Cookie choices");
  for (const f of ["index.html", "signin.html", "pay-link.html", "changes.html", "404.html", "games/index.html", "owner-funnel/index.html"]) {
    const h = readFileSync(join(out, f), "utf8"); // every page loads either the app (which shows the footer) or the footer script
    expect([f, /core\/boot\.js|core\/page-version\.js|owner-funnel\/funnel\.js|\/signin\.js|\/pay-link\.js/.test(h)]).toEqual([f, true]);
  }
});
