// node tools/vendor-pack.mjs --game <game repo folder> [--check]
// Copies the GAME PACK (packages/game-pack/*: the live control bar, the Yes/No panel, the safety nets, the printable game log) into a game, byte for byte:
//   packages/game-pack/*  ->  <game>/apps/web/public/pack/        plus a MANIFEST.json (a hash of every file).
// --check only compares (exit 1 on any difference): the drift test of this repo and of every game uses it. Hashes ignore Windows/Unix line ends, nothing else.
// The pack holds NO game rules. A game supplies its own small `live-game.js` that says what the game can do.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { hashText, norm } from "./vendor-bridge.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const PACK_DIR = join(ROOT, "packages/game-pack/");
export const PACK_DEST_REL = "apps/web/public/pack";
const NOTE = "Copied from the console repo (packages/game-pack). Do not edit here: change it there, then run tools/vendor-pack.mjs --game <this game>.";

export const packFiles = (src = PACK_DIR) => readdirSync(src).filter((f) => /\.(js|css|html)$/.test(f)).sort();
export function plan(src = PACK_DIR) { return packFiles(src).map((f) => ({ file: f, text: norm(readFileSync(join(src, f), "utf8")) })); }
export const manifestOf = (items) => ({ note: NOTE, files: Object.fromEntries(items.map((i) => [i.file, hashText(Buffer.from(i.text))])) });

export function vendorPack(gameDir, src = PACK_DIR) {
  const items = plan(src), dest = join(gameDir, PACK_DEST_REL);
  mkdirSync(dest, { recursive: true });
  for (const it of items) writeFileSync(join(dest, it.file), it.text);
  writeFileSync(join(dest, "MANIFEST.json"), JSON.stringify(manifestOf(items), null, 1) + "\n");
  return manifestOf(items);
}

/** problems between a game's pack folder and the console source ([] = identical) */
export function packDrift(gameDir, src = PACK_DIR) {
  const items = plan(src), want = manifestOf(items).files, dest = join(gameDir, PACK_DEST_REL), problems = [];
  if (!existsSync(dest)) return [`${PACK_DEST_REL} does not exist`];
  let have = {};
  try { have = JSON.parse(readFileSync(join(dest, "MANIFEST.json"), "utf8")).files || {}; } catch { problems.push("MANIFEST.json is missing or unreadable"); }
  for (const [f, h] of Object.entries(want)) {
    if (!existsSync(join(dest, f))) { problems.push(`${f} is missing`); continue; }
    if (hashText(readFileSync(join(dest, f))) !== h) problems.push(`${f} differs from the console source`);
    if (have[f] !== h) problems.push(`${f}: the manifest does not match the console source`);
  }
  for (const f of readdirSync(dest)) if (f !== "MANIFEST.json" && !(f in want)) problems.push(`${f} is not part of the game pack`);
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), get = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; };
  const game = get("--game");
  if (!game) { console.error("usage: node tools/vendor-pack.mjs --game <game repo folder> [--check]"); process.exit(2); }
  if (a.includes("--check")) { const p = packDrift(resolve(game)); p.forEach((x) => console.log(x)); console.log(p.length ? "DRIFT" : "in step"); process.exit(p.length ? 1 : 0); }
  const m = vendorPack(resolve(game)); console.log("copied " + Object.keys(m.files).length + " files into " + join(resolve(game), PACK_DEST_REL));
}
