// FALSIFIED BY: dist-stale-passes, dist-version-ignored, secrets-pepper-short, secrets-key-unusable, runbook-step2-command-missing
// The deploy-day guards (2026-10-30): dist/ must be fresh and carry the version (check-dist), the two secrets that can be made are made well (make-secrets), and step 2 of the runbook is a copy-paste list.
import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { distProblems } from "../tools/deploy/check-dist.mjs";
import { makeSecrets } from "../tools/deploy/make-secrets.mjs";

const REL = { version: "0.1.0", releasedAt: "2026-10-29T10:45:00.000Z" };
function tree(over: any = {}) {
  const root = mkdtempSync(join(tmpdir(), "dist-")), dist = join(root, "dist");
  mkdirSync(join(root, "public"), { recursive: true }); mkdirSync(dist, { recursive: true }); mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(join(root, "public", "index.html"), "x"); writeFileSync(join(root, "config", "games.json"), "{}"); writeFileSync(join(root, "build.mjs"), "//");
  writeFileSync(join(root, "releases.json"), JSON.stringify([REL]));
  const t = Date.now() / 1000;
  for (const f of ["public/index.html", "config/games.json", "build.mjs", "releases.json"]) utimesSync(join(root, f), t - 100, t - 100);
  if (over.version !== null) { writeFileSync(join(dist, "version.json"), JSON.stringify({ version: "0.1.0", releasedAt: REL.releasedAt, releasedAtIST: "29 Oct 2026, 16:15 IST", ...(over.version || {}) })); utimesSync(join(dist, "version.json"), t - 10, t - 10); }
  return { root, dist, t };
}

test("check-dist: a fresh build that carries the version passes", () => {
  const { root, dist } = tree();
  expect(distProblems(root, dist)).toEqual([]);
});

test("check-dist: a file in public/ (or the config, the releases, the build) changed after the build = stale", () => {
  for (const f of ["public/index.html", "config/games.json", "releases.json", "build.mjs"]) {
    const { root, dist, t } = tree();
    utimesSync(join(root, f), t + 5, t + 5);
    const p = distProblems(root, dist);
    expect([f, p.length, /older than/.test(p[0] || "")]).toEqual([f, 1, true]);
  }
  const { root, dist, t } = tree(); mkdirSync(join(root, "public", "core"), { recursive: true }); writeFileSync(join(root, "public", "core", "new.js"), "x"); utimesSync(join(root, "public", "core", "new.js"), t + 5, t + 5);
  expect(distProblems(root, dist)[0]).toContain("public/core/new.js");   // also a new file deep inside public/
});

test("check-dist: no dist, no version.json, another version, another release time or no IST text are all refused", () => {
  const none = mkdtempSync(join(tmpdir(), "dist-")); expect(distProblems(none, join(none, "dist"))[0]).toContain("does not exist");
  const a = tree({ version: null }); expect(distProblems(a.root, a.dist)[0]).toContain("version.json is missing");
  const b = tree({ version: { version: "9.9.9" } }); expect(distProblems(b.root, b.dist).join(" ")).toContain("says version 9.9.9");
  const c = tree({ version: { releasedAt: "2020-01-01T00:00:00.000Z" } }); expect(distProblems(c.root, c.dist).join(" ")).toContain("another release time");
  const d = tree({ version: { releasedAtIST: "yesterday" } }); expect(distProblems(d.root, d.dist).join(" ")).toContain("no release date and time in IST");
});

test("the real dist/ of this console, when there is one, is fresh and carries the version and the release date and time (rebuild with node build.mjs before a deploy)", () => {
  const root = join(import.meta.dir, "..");
  if (!existsSync(join(root, "dist"))) return; // a fresh checkout has no build yet: nothing can be stale
  expect(distProblems(root)).toEqual([]);
  const v = JSON.parse(readFileSync(join(root, "dist", "version.json"), "utf8"));
  expect(v.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(v.releasedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(v.releasedAtIST).toMatch(/^\d{2} \w{3} \d{4}, \d{2}:\d{2} IST$/);
});

test("make-secrets: a signing key the console can really sign with, a 64-hex pepper, and a public half that verifies; two runs never give the same values", async () => {
  const a = await makeSecrets(), b = await makeSecrets();
  expect(a.SESSION_PEPPER).toMatch(/^[0-9a-f]{64}$/);
  expect(a.CONSOLE_SIGNING_KEY).not.toBe(b.CONSOLE_SIGNING_KEY);
  expect(a.SESSION_PEPPER).not.toBe(b.SESSION_PEPPER);
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(a.CONSOLE_SIGNING_KEY), (c) => c.charCodeAt(0)), { name: "Ed25519" }, false, ["sign"]);
  const msg = new TextEncoder().encode("hello");
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, msg);
  expect(a.publicKeyForGames.startsWith("k1:")).toBe(true);
  const b64u = a.publicKeyForGames.slice(3).replace(/-/g, "+").replace(/_/g, "/");
  const raw = Uint8Array.from(atob(b64u + "=".repeat((4 - (b64u.length % 4)) % 4)), (c) => c.charCodeAt(0));
  expect(raw.length).toBe(32);
  const pub = await crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, false, ["verify"]);
  expect(await crypto.subtle.verify({ name: "Ed25519" }, pub, sig, msg)).toBe(true);
});

test("runbook step 2 is a copy-paste list: every command, in order, with who gives which secret", () => {
  const doc = readFileSync(join(import.meta.dir, "../docs/GO_LIVE_RUNBOOK.md"), "utf8");
  const step = doc.slice(doc.indexOf("## Step 2."), doc.indexOf("## Step 3."));
  const order = ["$W d1 create corporate-console", "sed -i \"s/REPLACE_AFTER_THE_DATABASE_EXISTS/$ID/\" wrangler.toml apps/cron/wrangler.toml", "$W d1 execute corporate-console --remote --file=migrations/0001_console.sql", "CONSOLE_ORIGIN = \"https://corporate-console.pages.dev\"", "node tools/deploy/make-secrets.mjs", "node build.mjs --env preview", "node tools/deploy/check-dist.mjs", "$W pages project create corporate-console", "$W pages secret put CONSOLE_SIGNING_KEY --project-name corporate-console", "$W pages secret put SESSION_PEPPER --project-name corporate-console", "$W pages secret put RESEND_API_KEY --project-name corporate-console", "$W pages deploy dist --project-name corporate-console --branch main --commit-dirty=true", "cd apps/cron", "$W deploy", "$W secret put CONSOLE_SIGNING_KEY", "$W secret put SESSION_PEPPER", "TEST_MODE"];
  let at = -1;
  for (const c of order) { const i = step.indexOf(c, at + 1); expect([c, i > at]).toEqual([c, true]); at = i; }
  expect(step).toContain("The owner gives ONE thing");
  expect(step).toContain("`RESEND_API_KEY`");
  expect(/(re_[A-Za-z0-9]{20,}|[A-Fa-f0-9]{40,})/.test(step)).toBe(false); // no secret value
});
