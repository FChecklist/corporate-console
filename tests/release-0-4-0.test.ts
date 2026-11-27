// FALSIFIED BY: release40-version-not-bumped, release40-changelog-missing, release40-knowledge-stale
// Release 0.4.0 "stay signed in": the version is bumped everywhere the owner's rule names (the release list that makes version.json, package.json, CHANGELOG.md, docs/KNOWLEDGE.md), and every page's footer shows it.
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

test("0.4.0 is in the release list (0.4.1 sits above it), with a time, a technical note and a plain sentence that holds no internal word", () => {
  const r = releases[1];
  expect(r.version).toBe("0.4.0");
  expect(/^\d{4}-\d{2}-\d{2}T/.test(r.releasedAt)).toBe(true);
  expect(r.note.length).toBeGreaterThan(40);
  expect(r.userNote.length).toBeGreaterThan(40);
  expect(/audit|commit|rollback|bridge|re-vendor|token|secret|worker|cache|cookie|CORS|api/i.test(r.userNote)).toBe(false); // what the public reads says it plainly
  expect(/\b(we|our|us)\b/i.test(r.userNote)).toBe(false);
  expect(r.userNote).toMatch(/\byou\b/i); // spoken to "you"
  expect(releases[2].version).toBe("0.3.2");
});

test("CHANGELOG.md has the 0.4.0 entry on top, in plain words, with what changed, where, the tests, what is not changed, the audit line and the rollback line; both money flags stay OFF", () => {
  const c = read("CHANGELOG.md");
  expect(c.indexOf("## 0.4.0 ")).toBeGreaterThan(-1);
  expect(c.indexOf("## 0.4.0 ")).toBeLessThan(c.indexOf("## 0.3.2 "));
  const entry = c.slice(c.indexOf("## 0.4.0 "), c.indexOf("## 0.3.2 "));
  for (const w of ["/api/me", "signedIn", "me-core.ts", "functions/api/me.ts", "CORS", "Access-Control-Allow-Credentials", "HOME_ORIGIN", "GAME_ORIGINS", "cbsess", "HttpOnly", "SameSite", "Tests", "Rollback", "Audit", "pay", "bridge", "pack", "PAY_VIA_MONEYPENNY", "PAY_VIA_CONSOLE", "me-api"]) expect([w, entry.toLowerCase().includes(w.toLowerCase())]).toEqual([w, true]);
  expect(entry).toMatch(/not touched|untouched|byte for byte/i);
  expect(entry).toMatch(/stay OFF/);
});

test("docs/KNOWLEDGE.md says 0.4.0 and names the route, the files and the rules of /api/me", () => {
  const k = read("docs/KNOWLEDGE.md");
  expect(k).toContain("## 2e. What 0.4.0 added");
  for (const w of ["/api/me", "me-core.ts", "functions/api/me.ts", "cbsess", "HttpOnly", "SameSite=Lax", "HOME_ORIGIN", "GAME_ORIGINS", "me-api", "organizerIdOf", "displayNameOf"]) expect([w, k.includes(w)]).toEqual([w, true]);
});

test("a build carries 0.4.0 in version.json, and every page's footer shows it with the what's-new link", async () => {
  const out = mkdtempSync(join(tmpdir(), "rel40-"));
  build({ env: "live", out, version: releases[1].version, commit: "0123456789ab", releasedAt: releases[1].releasedAt });
  const v = JSON.parse(readFileSync(join(out, "version.json"), "utf8"));
  expect([v.version, v.consoleVersion, v.product]).toEqual(["0.4.0", "0.4.0", "corporate-console"]);
  expect(v.changes.slice(0, 2).map((c: any) => c.version)).toEqual(["0.4.1", "0.4.0"]);
  const { showVersion } = await import("../public/core/version.js");
  const doc: any = new Window({ url: "https://console.corporatetambola.com/" }).document;
  await showVersion(doc, async () => ({ json: async () => v }));
  expect(doc.getElementById("version-line").textContent).toBe(`Version 0.4.0, released ${v.releasedAtIST}`);
  expect(doc.getElementById("footer-changes").textContent).toBe("v0.4.0: what's new");
  expect(doc.getElementById("footer-cookies").textContent).toBe("Cookie choices");
});
