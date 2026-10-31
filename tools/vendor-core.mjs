// bun tools/vendor-core.mjs <path-to-corporate-game-core clone> [--expect 0.1.0]
// Copies the six game manifests of corporate-game-core into vendor/game-core/manifests.json and pins the core version and commit next to them (CORE_VERSION).
// The console build reads only that JSON (plain data), so it needs neither TypeScript nor the core repo. Refuses when --expect differs from the core's VERSION.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const [src, flag, expect] = process.argv.slice(2);
if (!src) { console.error("usage: bun tools/vendor-core.mjs <core clone> [--expect X.Y.Z]"); process.exit(1); }
const root = resolve(src), version = readFileSync(join(root, "VERSION"), "utf8").trim();
if (flag === "--expect" && expect !== version) { console.error(`core is ${version}, the console expects ${expect}`); process.exit(1); }
const dirty = execFileSync("git", ["status", "--porcelain", "--", "packages/manifest"], { cwd: root, encoding: "utf8" }).trim();
if (dirty) { console.error("the core manifest folder has uncommitted changes; vendor a committed state only"); process.exit(1); }
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const { MANIFESTS, checkManifest } = await import(pathToFileURL(join(root, "packages/manifest/src/index.ts")).href);
for (const m of Object.values(MANIFESTS)) { const bad = checkManifest(m); if (bad.length) { console.error(m.id + ": " + bad.join("; ")); process.exit(1); } }
const { ROLES } = await import(pathToFileURL(join(root, "packages/core/src/roles.ts")).href); // common engine facts: the same five roles in every game
const out = resolve(import.meta.dir, "..", "vendor", "game-core");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "manifests.json"), JSON.stringify({ version, commit, roles: ROLES, manifests: Object.fromEntries(Object.entries(MANIFESTS).map(([k, m]) => [k, { ...m, roles: ROLES }])) }, null, 1) + "\n");
writeFileSync(join(out, "CORE_VERSION"), `${version}\n${commit}\n`);
console.log(`vendored the manifests of game-core ${version} (${commit.slice(0, 7)})`);
