// node tools/vendor-bridge.mjs --game <game repo folder> [--check]
// Copies packages/bridge/src/*.ts byte for byte into <game>/apps/edge/src/console-bridge/ and writes MANIFEST.json (a hash of every file).
// --check only compares (exit 1 on any difference): used by the drift test in every game and in this repo.
// Hashes ignore the difference between Windows and Unix line ends (a game repo checked out on Windows has CRLF), nothing else.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

export const SRC_DIR = fileURLToPath(new URL("../packages/bridge/src/", import.meta.url));
export const DEST_REL = "apps/edge/src/console-bridge";
export const hashText = (buf) => createHash("sha256").update(buf.toString("utf8").replace(/\r\n/g, "\n")).digest("hex");
export const sourceFiles = (src = SRC_DIR) => readdirSync(src).filter((f) => f.endsWith(".ts")).sort();

export function manifestOf(dir) {
  const files = {};
  for (const f of sourceFiles(dir)) files[f] = hashText(readFileSync(join(dir, f)));
  return { note: "Copied from the console repo (packages/bridge). Do not edit here: change it there, then run tools/vendor-bridge.mjs.", files };
}

/** copy; returns the manifest */
export function vendor(gameDir, src = SRC_DIR) {
  const dest = join(gameDir, DEST_REL);
  mkdirSync(dest, { recursive: true });
  for (const f of sourceFiles(src)) writeFileSync(join(dest, f), readFileSync(src + f, "utf8").replace(/\r\n/g, "\n"));
  const m = manifestOf(src);
  writeFileSync(join(dest, "MANIFEST.json"), JSON.stringify(m, null, 1) + "\n");
  return m;
}

/** list of problems between the vendored copy and the source ([] = identical) */
export function drift(gameDir, src = SRC_DIR) {
  const dest = join(gameDir, DEST_REL), problems = [];
  if (!existsSync(dest)) return [`${DEST_REL} does not exist`];
  const want = manifestOf(src).files;
  let have = {};
  try { have = JSON.parse(readFileSync(join(dest, "MANIFEST.json"), "utf8")).files || {}; } catch { problems.push("MANIFEST.json is missing or unreadable"); }
  for (const [f, h] of Object.entries(want)) {
    if (!existsSync(join(dest, f))) { problems.push(`${f} is missing`); continue; }
    if (hashText(readFileSync(join(dest, f))) !== h) problems.push(`${f} differs from the console source`);
    if (have[f] !== h) problems.push(`${f}: the manifest does not match the console source`);
  }
  for (const f of sourceFiles(dest)) if (!(f in want)) problems.push(`${f} is not part of the bridge`);
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), g = a.indexOf("--game");
  if (g < 0) { console.error("usage: --game <folder> [--check]"); process.exit(2); }
  const game = resolve(a[g + 1]);
  if (a.includes("--check")) { const p = drift(game); for (const x of p) console.log("DRIFT " + x); console.log(p.length ? `${p.length} problems` : "identical"); process.exit(p.length ? 1 : 0); }
  const m = vendor(game); console.log(`copied ${Object.keys(m.files).length} files into ${join(game, DEST_REL)}`);
}
