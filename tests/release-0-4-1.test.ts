// FALSIFIED BY: release41-version-not-bumped, release41-package-version-old, release41-changelog-missing, release41-knowledge-stale
// Release 0.4.1 "three games shown": the version is bumped everywhere the owner's rule names (releases.json that makes version.json, package.json, CHANGELOG.md, docs/KNOWLEDGE.md), and every page's footer shows it.
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { build } from "../build.mjs";

const root = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const releases = JSON.parse(read("releases.json"));

test("the newest release is 0.4.1, with a time, a technical note and a plain sentence that holds no internal word", () => {
  const r = releases[0];
  expect(r.version).toBe("0.4.1");
  expect(/^\d{4}-\d{2}-\d{2}T/.test(r.releasedAt)).toBe(true);
  expect(r.note.length).toBeGreaterThan(40);
  expect(r.userNote.length).toBeGreaterThan(40);
  expect(/audit|commit|rollback|bridge|re-vendor|token|secret|worker|cache|cookie|CORS|api/i.test(r.userNote)).toBe(false);
  expect(/\b(we|our|us)\b/i.test(r.userNote)).toBe(false);
  expect(r.userNote).toMatch(/\byou\b/i);
  expect(releases[1].version).toBe("0.4.0");
});

test("package.json carries the same version as the newest release", () => {
  expect(JSON.parse(read("package.json")).version).toBe(releases[0].version);
});

test("CHANGELOG.md has the 0.4.1 entry on top: the switch, what is hidden, what is kept, the live commit it is based on, tests, audit and rollback lines", () => {
  const c = read("CHANGELOG.md");
  expect(c.indexOf("## 0.4.1 ")).toBeGreaterThan(-1);
  expect(c.indexOf("## 0.4.1 ")).toBeLessThan(c.indexOf("## 0.4.0 "));
  const entry = c.slice(c.indexOf("## 0.4.1 "), c.indexOf("## 0.4.0 "));
  for (const w of ["hiddenGames", "visible-games.mjs", "910d202e4d8a", "tictactoe", "snakesladders", "luckbychance", "Tests", "Rollback", "Audit", "Kept on purpose", "Tambola, Bingo and Lucky Draw"]) expect([w, entry.includes(w)]).toEqual([w, true]);
  expect(entry).toMatch(/No money flag/);
});

test("docs/KNOWLEDGE.md says 0.4.1 and names the switch and the files", () => {
  const k = read("docs/KNOWLEDGE.md");
  expect(k).toContain("for version 0.4.1,");
  expect(k).toContain("## 2f. What 0.4.1 added");
  for (const w of ["hiddenGames", "visible-games.mjs", "api.startNew", "dist/gamesbar.js", "hidden-games"]) expect([w, k.includes(w)]).toEqual([w, true]);
});

test("a build carries 0.4.1 in version.json, and every page's footer shows it with the what's-new link", async () => {
  const out = mkdtempSync(join(tmpdir(), "rel41-"));
  build({ env: "live", out, version: releases[0].version, commit: "0123456789ab", releasedAt: releases[0].releasedAt });
  const v = JSON.parse(readFileSync(join(out, "version.json"), "utf8"));
  expect([v.version, v.consoleVersion, v.product]).toEqual(["0.4.1", "0.4.1", "corporate-console"]);
  expect(v.changes[0]).toMatchObject({ version: "0.4.1" });
  const { showVersion } = await import("../public/core/version.js");
  const doc: any = new Window({ url: "https://console.corporatetambola.com/" }).document;
  await showVersion(doc, async () => ({ json: async () => v }));
  expect(doc.getElementById("version-line").textContent).toBe(`Version 0.4.1, released ${v.releasedAtIST}`);
  expect(doc.getElementById("footer-changes").textContent).toBe("v0.4.1: what's new");
});
