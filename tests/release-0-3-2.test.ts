// FALSIFIED BY: release32-version-not-bumped, release32-changelog-missing, release32-knowledge-stale
// Release 0.3.2 (still in the list below 0.5.0 and 0.4.0; the newest release is checked in release-0-5-0.test.ts): the version is bumped everywhere the owner's rule names (the release list that makes version.json, package.json, CHANGELOG.md, docs/KNOWLEDGE.md), and every page's footer shows it.
// (There is no hand-written version.json: the build makes it from releases.json.)
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { build } from "../build.mjs";

const root = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const releases = JSON.parse(read("releases.json"));

test("0.3.2 is in the release list (0.5.0 and 0.4.0 sit above it), with a time, a technical note and a plain sentence that holds no internal word", () => {
  const r = releases[2];
  expect(r.version).toBe("0.3.2");
  expect(/^\d{4}-\d{2}-\d{2}T/.test(r.releasedAt)).toBe(true);
  expect(r.note.length).toBeGreaterThan(40);
  expect(r.userNote.length).toBeGreaterThan(40);
  expect(/audit|commit|rollback|bridge|re-vendor|token|secret|worker|cache/i.test(r.userNote)).toBe(false); // what the public reads says it plainly
  expect(/\b(we|our|us)\b/i.test(r.userNote)).toBe(false);
  expect(releases[3].version).toBe("0.3.1");
});

test("CHANGELOG.md keeps the 0.3.2 entry (below 0.5.0 and 0.4.0), in plain words, with what changed, where, the tests, what is not changed and the rollback line; both money flags stay OFF", () => {
  const c = read("CHANGELOG.md");
  expect(c.indexOf("## 0.3.2 ")).toBeGreaterThan(-1);
  expect(c.indexOf("## 0.3.2 ")).toBeLessThan(c.indexOf("## 0.3.1 "));
  const entry = c.slice(c.indexOf("## 0.3.2 "), c.indexOf("## 0.3.1 "));
  for (const w of ["sign-in", "reload", "signin.js", "offline.js", "sw.js", "cookieStore", "/auth/me", "Firefox", "Safari", "Tests", "Rollback", "Audit", "pay", "bridge", "pack", "PAY_VIA_MONEYPENNY", "PAY_VIA_CONSOLE"]) expect([w, entry.toLowerCase().includes(w.toLowerCase())]).toEqual([w, true]);
  expect(entry).toMatch(/not touched|untouched|byte for byte/i); // the audited pay contract, bridge and pack
  expect(entry).toMatch(/stay OFF/);
});

test("docs/KNOWLEDGE.md keeps the 0.3.2 section and names the files and the rules of the two fixes", () => {
  const k = read("docs/KNOWLEDGE.md");
  expect(k).toContain("## 2d. What 0.3.2 added");
  for (const w of ["signin.js", "sessionConfirmed", "/auth/me", "HttpOnly", "holdsOneTimeInput", "console-shell-grant", "cookieStore", "signin-token-reload"]) expect([w, k.includes(w)]).toEqual([w, true]);
});

test("a build carries 0.3.2 in version.json, and every page's footer shows it with the what's-new link", async () => {
  const out = mkdtempSync(join(tmpdir(), "rel32-"));
  build({ env: "live", out, version: releases[2].version, commit: "0123456789ab", releasedAt: releases[2].releasedAt }); // the 0.3.2 build
  const v = JSON.parse(readFileSync(join(out, "version.json"), "utf8"));
  expect([v.version, v.consoleVersion, v.product]).toEqual(["0.3.2", "0.3.2", "corporate-console"]);
  expect(v.changes.map((c: any) => c.version).slice(0, 3)).toEqual(["0.5.0", "0.4.0", "0.3.2"]);
  const { showVersion } = await import("../public/core/version.js");
  const doc: any = new Window({ url: "https://console.corporatetambola.com/" }).document;
  await showVersion(doc, async () => ({ json: async () => v }));
  expect(doc.getElementById("version-line").textContent).toBe(`Version 0.3.2, released ${v.releasedAtIST}`);
  expect(doc.getElementById("footer-changes").textContent).toBe("v0.3.2: what's new");
  expect(doc.getElementById("footer-cookies").textContent).toBe("Cookie choices");
});
