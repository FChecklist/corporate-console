// FALSIFIED BY: release-version-not-bumped, release-footer-no-changes-link, release-footer-no-cookie-button, release-changelog-missing, release-knowledge-stale
// Release 0.2.2: version everywhere, releases.json, CHANGELOG, KNOWLEDGE, /changes, footer standard.
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const releases = JSON.parse(read("releases.json"));
const win: any = new Window({ url: "https://console.corporatetambola.com/" });
Object.assign(globalThis, { window: win, document: win.document, CustomEvent: win.CustomEvent });

test("0.2.2 is still in the release list (0.3.0 and 0.3.1 sit above it) and every row has a version, a time, a technical note and a plain-words sentence for /changes", () => {
  expect(releases.map((r: any) => r.version)).toEqual(["0.3.1", "0.3.0", "0.2.2", "0.2.1", "0.2.0", "0.1.0"]);
  for (const r of releases) {
    expect([r.version, /^\d+\.\d+\.\d+$/.test(r.version), /^\d{4}-\d{2}-\d{2}T/.test(r.releasedAt), r.note.length > 20, r.userNote.length > 20]).toEqual([r.version, true, true, true, true]);
    expect([r.version, /audit|commit|rollback|bridge|re-vendor|token|secret/i.test(r.userNote)]).toEqual([r.version, false]); // no security detail or internal word in what the public reads
  }
});

test("CHANGELOG has the 0.2.2 entry on top with what changed, where, the tests, the open items and the rollback line; KNOWLEDGE says 0.2.2 and the new files", () => {
  const c = read("CHANGELOG.md");
  expect(c.indexOf("## 0.2.2 ")).toBeGreaterThan(-1);
  expect(c.indexOf("## 0.2.2 ")).toBeLessThan(c.indexOf("## 0.2.1 "));
  const entry = c.slice(c.indexOf("## 0.2.2 "), c.indexOf("## 0.2.1 "));
  for (const w of ["cookie banner", "step banner", "SEO", "llms.txt", "/changes", "footer", "Rollback", "Audit", "public/core/consent.js", "seo.mjs"]) expect([w, entry.toLowerCase().includes(w.toLowerCase())]).toEqual([w, true]);
  const k = read("docs/KNOWLEDGE.md");
  expect(k).toContain("0.2.2");
  for (const w of ["consent.js", "steps.js", "seo.mjs", "/changes", "llms.txt", "cg_consent"]) expect([w, k.includes(w)]).toEqual([w, true]);
});

test("the footer standard: one version line (the owner's exact words) and one links line with vX.Y.Z: what's new -> /changes, Cookie choices, and the help address; shown once, even if called twice, even if the version cannot be read", async () => {
  const { showVersion, versionText } = await import("../public/core/version.js");
  const doc: any = new Window({ url: "https://console.corporatetambola.com/" }).document;
  const ok = async () => ({ json: async () => ({ version: "0.2.2", releasedAtIST: "21 Nov 2026, 10:00 IST" }) });
  await showVersion(doc, ok); await showVersion(doc, ok);
  expect(doc.querySelectorAll("#version-line").length).toBe(1);
  expect(doc.querySelectorAll("#footer-links").length).toBe(1);
  expect(doc.getElementById("version-line").textContent).toBe("Version 0.2.2, released 21 Nov 2026, 10:00 IST");
  const a = doc.getElementById("footer-changes");
  expect([a.getAttribute("href"), a.textContent]).toEqual(["/changes", "v0.2.2: what's new"]);
  expect(doc.getElementById("footer-help").getAttribute("href")).toBe("mailto:hello@corporatetambola.com");
  expect(doc.getElementById("footer-cookies").textContent).toBe("Cookie choices");
  expect(doc.querySelector("link[data-footer-css]")).toBeTruthy();
  const bare: any = new Window({ url: "https://console.corporatetambola.com/" }).document;
  await showVersion(bare, async () => { throw new Error("offline"); });
  expect(bare.getElementById("version-line").textContent).toBe("");
  expect(bare.getElementById("footer-changes").textContent).toBe("What's new"); // no version known: still a way to the page
  expect(versionText({ version: "1.2.3" })).toBe("");
});

test("the footer's 'Cookie choices' button opens the cookie banner on the same page (the footer and the banner only share one event name)", async () => {
  const { showVersion } = await import("../public/core/version.js");
  const C = await import("../public/core/consent.js");
  const w: any = new Window({ url: "https://console.corporatetambola.com/" });
  Object.assign(globalThis, { window: w, document: w.document, CustomEvent: w.CustomEvent });
  w.document.cookie = C.answerCookie("needed", true);
  C.startConsent({ doc: w.document, win: w, nav: {}, store: w.localStorage });
  expect(w.document.getElementById("cookie-banner")).toBeNull(); // answered earlier: quiet
  await showVersion(w.document, async () => ({ json: async () => ({ version: "0.2.2", releasedAtIST: "21 Nov 2026, 10:00 IST" }) }));
  w.document.getElementById("footer-cookies").click();
  expect(w.document.getElementById("cookie-banner")).toBeTruthy();
});

test("every page of the built site ends with the footer: each shipped html page loads a script that calls showVersion() (the owner's rule), including the new What's new page", async () => {
  const { build } = await import("../build.mjs");
  const out = mkdtempSync(join(tmpdir(), "rel-"));
  build({ env: "live", out, version: "0.2.2", commit: "0123456789ab", releasedAt: "2026-11-21T04:30:00.000Z" });
  const html = readFileSync(join(out, "changes.html"), "utf8");
  expect(html).toContain("/core/page-version.js");
  const v = JSON.parse(readFileSync(join(out, "version.json"), "utf8"));
  expect([v.version, v.consoleVersion, v.releasedAtIST]).toEqual(["0.2.2", "0.2.2", "21 Nov 2026, 10:00 IST"]);
});
