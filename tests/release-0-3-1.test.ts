// FALSIFIED BY: release31-version-not-bumped, release31-changelog-missing, release31-knowledge-stale, release31-version-json-old
// Release 0.3.1 (still in the list below 0.3.2; the newest release is checked in release-0-3-2.test.ts): the version is in the release list that makes version.json, CHANGELOG.md and docs/KNOWLEDGE.md, and a build of it shows 0.3.1 in every page's footer.
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { build } from "../build.mjs";

const root = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const releases = JSON.parse(read("releases.json"));

test("0.3.1 is in the release list (0.5.0, 0.4.0 and 0.3.2 sit above it), with a time, a technical note and a plain sentence that holds no internal word", () => {
  const r = releases[3];
  expect(r.version).toBe("0.3.1");
  expect(/^\d{4}-\d{2}-\d{2}T/.test(r.releasedAt)).toBe(true);
  expect(r.note.length).toBeGreaterThan(40);
  expect(r.userNote.length).toBeGreaterThan(40);
  expect(/audit|commit|rollback|bridge|re-vendor|token|secret|worker|cache/i.test(r.userNote)).toBe(false); // what the public reads says it plainly
  expect(/\b(we|our|us)\b/i.test(r.userNote)).toBe(false);
  expect(releases[4].version).toBe("0.3.0");
  expect(releases[4].userNote).toMatch(/console's own screens/); // the double-press rule is for the console screens, and the public note says so
});

test("CHANGELOG.md keeps the 0.3.1 entry (below 0.3.2), in plain words, with what changed, where, the tests, what is not changed, the deploy note and the rollback line", () => {
  const c = read("CHANGELOG.md");
  expect(c.indexOf("## 0.3.1 ")).toBeGreaterThan(-1);
  expect(c.indexOf("## 0.3.1 ")).toBeLessThan(c.indexOf("## 0.3.0 "));
  const entry = c.slice(c.indexOf("## 0.3.1 "), c.indexOf("## 0.3.0 "));
  for (const w of ["decline", "sw.js", "offline.js", "page-consent.js", "stop", "Step", "My games", "Rollback", "Audit", "Tests", "pay", "bridge", "pack", "0.2.2", "decline-everywhere"]) expect([w, entry.toLowerCase().includes(w.toLowerCase())]).toEqual([w, true]);
  expect(entry).toMatch(/not touched|untouched|byte for byte/i); // the audited pay contract, bridge and pack
});

test("docs/KNOWLEDGE.md keeps the 0.3.1 part and names the files that make the decline work", () => {
  const k = read("docs/KNOWLEDGE.md");
    expect(k).toContain("## 2c. What 0.3.1 added");
  for (const w of ["sw.js", "offline.js", "page-consent.js", "removeWorker", "stopped", "cookieStore", "decline-everywhere"]) expect([w, k.includes(w)]).toEqual([w, true]);
});

test("a build carries 0.3.1 in version.json, and every page's footer shows it with the what's-new link", async () => {
  const out = mkdtempSync(join(tmpdir(), "rel31-"));
  build({ env: "live", out, version: releases[3].version, commit: "0123456789ab", releasedAt: releases[3].releasedAt }); // the 0.3.1 build
  const v = JSON.parse(readFileSync(join(out, "version.json"), "utf8"));
  expect([v.version, v.consoleVersion, v.product]).toEqual(["0.3.1", "0.3.1", "corporate-console"]);
  expect(v.changes.map((c: any) => c.version).slice(0, 4)).toEqual(["0.5.0", "0.4.0", "0.3.2", "0.3.1"]);
  const { showVersion } = await import("../public/core/version.js");
  const doc: any = new Window({ url: "https://console.corporatetambola.com/" }).document;
  await showVersion(doc, async () => ({ json: async () => v }));
  expect(doc.getElementById("version-line").textContent).toBe(`Version 0.3.1, released ${v.releasedAtIST}`);
  expect(doc.getElementById("footer-changes").textContent).toBe("v0.3.1: what's new");
  expect(doc.getElementById("footer-cookies").textContent).toBe("Cookie choices");
  expect(read("public/core/page-consent.js")).toContain("syncOffline"); // the pages that show the footer all follow the answer
});
