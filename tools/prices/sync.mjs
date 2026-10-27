// node tools/prices/sync.mjs --game <dir> --to target|live [--write]
// Rewrites every price copy of ONE game folder from the price list (dry run unless --write). Run it for a second time and nothing changes (idempotent).
// It never touches pages/public (build copies) or test/sim files. The 50-person size is NOT added while the dollar price is pending (decision D3).
// Switching a live game to the new ladder changes what customers pay: only after the owner's go.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadList, PRICE_FILES, rewrite, checkGame } from "./lib.mjs";

export function syncGame(dir, to, o = {}) {
  const list = o.list || loadList();
  const from = to === "target" ? "live" : "target";
  const changes = [];
  for (const rel of PRICE_FILES) {
    const p = join(dir, rel);
    if (!existsSync(p)) continue;
    const before = readFileSync(p, "utf8");
    const { text, changed } = rewrite(before, list, from, to);
    if (changed) { changes.push(rel); if (o.write) writeFileSync(p, text); }
  }
  return { changes, problemsAfter: o.write ? checkGame(dir, list, to) : null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), get = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; };
  const dir = get("--game"), to = get("--to");
  if (!dir || !["target", "live"].includes(to)) { console.error("usage: --game <folder> --to target|live [--write]"); process.exit(2); }
  const r = syncGame(resolve(dir), to, { write: a.includes("--write") });
  console.log(`${a.includes("--write") ? "changed" : "would change"}: ${r.changes.join(", ") || "nothing"}`);
  if (r.problemsAfter && r.problemsAfter.length) { console.log("STILL WRONG:\n" + r.problemsAfter.join("\n")); process.exit(1); }
}
