// node tools/vendor-bridge.mjs --game <game repo folder> [--check]
// Copies the bridge into a game, byte for byte:
//   packages/bridge/src/*.ts            -> <game>/apps/edge/src/console-bridge/
//   packages/bridge/test-kit/* + contract/schemas.json + contract/fixtures.json -> <game>/apps/edge/test/console-contract/   (the contract tests every game runs; one import path is rewritten)
// and writes a MANIFEST.json (a hash of every file) into each folder. --check only compares (exit 1 on any difference): the drift test of this repo and of every game uses it.
// Hashes ignore the difference between Windows and Unix line ends (a game repo checked out on Windows has CRLF), nothing else.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const SRC_DIR = join(ROOT, "packages/bridge/src/");
export const KIT_DIR = join(ROOT, "packages/bridge/test-kit/");
export const CONTRACT_DIR = join(ROOT, "contract/");
export const DEST_REL = "apps/edge/src/console-bridge";
export const KIT_DEST_REL = "apps/edge/test/console-contract";
const KIT_REWRITE = [['"../src/assertion.ts"', '"../../src/console-bridge/assertion.ts"']]; // the kit sits in a different place inside a game
const NOTE = "Copied from the console repo (packages/bridge). Do not edit here: change it there, then run tools/vendor-bridge.mjs --game <this game>.";

export const norm = (text) => text.replace(/\r\n/g, "\n");
export const hashText = (buf) => createHash("sha256").update(norm(buf.toString("utf8"))).digest("hex");
export const sourceFiles = (src = SRC_DIR) => readdirSync(src).filter((f) => f.endsWith(".ts")).sort();

/** [{ dir: DEST_REL | KIT_DEST_REL, file, text }] what a game should contain */
export function plan(o = {}) {
  const src = o.src || SRC_DIR, kit = o.kit || KIT_DIR, contract = o.contract || CONTRACT_DIR;
  const out = [];
  for (const f of sourceFiles(src)) out.push({ dir: DEST_REL, file: f, text: norm(readFileSync(join(src, f), "utf8")) });
  if (existsSync(kit)) {
    for (const f of readdirSync(kit).sort()) { let t = norm(readFileSync(join(kit, f), "utf8")); for (const [a, b] of KIT_REWRITE) t = t.split(a).join(b); out.push({ dir: KIT_DEST_REL, file: f, text: t }); }
    for (const f of ["schemas.json", "fixtures.json"]) if (existsSync(join(contract, f))) out.push({ dir: KIT_DEST_REL, file: f, text: norm(readFileSync(join(contract, f), "utf8")) });
  }
  return out;
}
export function manifestFor(items, dir) {
  const files = {};
  for (const it of items.filter((x) => x.dir === dir)) files[it.file] = hashText(Buffer.from(it.text));
  return { note: NOTE, files };
}

export function vendor(gameDir, o = {}) {
  const items = plan(o), dirs = [...new Set(items.map((i) => i.dir))];
  for (const d of dirs) {
    mkdirSync(join(gameDir, d), { recursive: true });
    for (const it of items.filter((x) => x.dir === d)) writeFileSync(join(gameDir, d, it.file), it.text);
    writeFileSync(join(gameDir, d, "MANIFEST.json"), JSON.stringify(manifestFor(items, d), null, 1) + "\n");
  }
  return manifestFor(items, DEST_REL);
}

/** list of problems between a game's vendored files and the console source ([] = identical) */
export function drift(gameDir, o = {}) {
  const items = plan(o), problems = [];
  for (const d of [DEST_REL, KIT_DEST_REL]) {
    const want = manifestFor(items, d).files;
    if (!Object.keys(want).length) continue;
    const dest = join(gameDir, d);
    if (!existsSync(dest)) { problems.push(`${d} does not exist`); continue; }
    let have = {};
    try { have = JSON.parse(readFileSync(join(dest, "MANIFEST.json"), "utf8")).files || {}; } catch { problems.push(`${d}/MANIFEST.json is missing or unreadable`); }
    for (const [f, h] of Object.entries(want)) {
      if (!existsSync(join(dest, f))) { problems.push(`${d}/${f} is missing`); continue; }
      if (hashText(readFileSync(join(dest, f))) !== h) problems.push(`${d}/${f} differs from the console source`);
      if (have[f] !== h) problems.push(`${d}/${f}: the manifest does not match the console source`);
    }
    for (const f of readdirSync(dest)) if (f !== "MANIFEST.json" && !(f in want)) problems.push(`${d}/${f} is not part of the bridge`);
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), g = a.indexOf("--game");
  if (g < 0) { console.error("usage: --game <folder> [--check]"); process.exit(2); }
  const game = resolve(a[g + 1]);
  if (a.includes("--check")) { const p = drift(game); for (const x of p) console.log("DRIFT " + x); console.log(p.length ? `${p.length} problems` : "identical"); process.exit(p.length ? 1 : 0); }
  const m = vendor(game); console.log(`copied ${Object.keys(m.files).length} bridge files and the contract kit into ${game}`);
}
