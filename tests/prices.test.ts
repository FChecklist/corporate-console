// FALSIFIED BY: prices-live-number-changed, prices-sync-skips-html
import { test, expect } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, copyFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { loadList, withComma, rewrite, parsePacks, checkGame, onlyIn, ladderOf, GAMES } from "../tools/prices/lib.mjs";
import { syncGame } from "../tools/prices/sync.mjs";

const ROOT = process.env.GAMES_ROOT || "C:/ct/test-sites";
const list = loadList();
// the files a game really has that carry a price (listed here on purpose, NOT taken from the tool, so a tool that forgets a file is caught)
const COPIES = ["packages/shared/src/pricing.ts", "apps/web/public/common.js", "apps/web/public/pricing.html", "apps/web/public/index.html", "apps/web/public/partner.html", "apps/web/public/brochure.html"];

test("the price list is complete: nine sizes, rupee prices for every size, dollar prices not invented", () => {
  expect(list.sizes).toEqual([50, 100, 250, 500, 750, 1000, 2500, 5000, 10000]);
  expect(Object.keys(list.target.inr).map(Number)).toEqual(list.sizes);
  expect(list.target.usd).toBe("USD_PRICE_PENDING");
  expect(Object.keys(list.live.inr).length).toBe(8);
  expect(list.target.inr["50"]).toBe(1493);
});

test("numbers are written the way the pages write them", () => {
  expect(withComma(1493)).toBe("1,493");
  expect(withComma(29477)).toBe("29,477");
  expect(withComma(100)).toBe("100");
});

test("rewrite swaps both spellings, ignores longer numbers, and is idempotent", () => {
  const src = "Up to 100 players: &#8377;2,399 and 7099 and 17,699; id 127099 stays; 1.2399 stays";
  const t = rewrite(src, list, "live", "target");
  expect(t.text).toBe("Up to 100 players: &#8377;2,387 and 7083 and 17,683; id 127099 stays; 1.2399 stays");
  expect(rewrite(t.text, list, "live", "target").changed).toBe(false);
  expect(rewrite(t.text, list, "target", "live").text).toBe(src);
});

test("PACKS lists are read from pricing.ts and from common.js", () => {
  const ts = "export const PACKS: ReadonlyArray<readonly [number, number, number]> = [\n  [100, 2399, 34], [250, 3499, 51],\n];";
  expect(parsePacks(ts)).toEqual([[100, 2399, 34], [250, 3499, 51]]);
  expect(parsePacks("TB.PACKS = [[100, 2399, 34], [250, 3499, 51]];")).toEqual([[100, 2399, 34], [250, 3499, 51]]);
});

for (const g of GAMES) {
  const dir = join(ROOT, g);
  test(`parity: ${g} shows the ${list.applied[g] ? "target" : "live"} ladder in every price copy`, () => {
    if (!existsSync(dir)) return; // that game is not on this laptop
    const want = list.applied[g] ? "target" : "live";
    expect(checkGame(dir, list, want)).toEqual([]);
    const ts = readFileSync(join(dir, "packages/shared/src/pricing.ts"), "utf8");
    const packs = parsePacks(ts)!;
    expect(packs.length).toBeGreaterThanOrEqual(8);
    const w = ladderOf(list, want);
    for (const [n, inr] of packs) expect(inr).toBe(w[n]);
  });
}

/** copy the price-bearing files of one real game into a temp folder */
function fixtureFrom(game: string) {
  const src = join(ROOT, game);
  const d = mkdtempSync(join(tmpdir(), "pr-"));
  for (const rel of COPIES) { if (!existsSync(join(src, rel))) continue; mkdirSync(dirname(join(d, rel)), { recursive: true }); copyFileSync(join(src, rel), join(d, rel)); }
  return d;
}
const allText = (dir: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : (out[p] = readFileSync(p, "utf8")); } };
  walk(dir); return out;
};

test("sync to the target ladder leaves NO live-only price in any copy, a second run changes nothing, and going back restores the files exactly", () => {
  const game = GAMES.find((g) => existsSync(join(ROOT, g, "packages/shared/src/pricing.ts")));
  if (!game) return;
  const d = fixtureFrom(game);
  const original = allText(d);
  const live = onlyIn(list, "live");
  const first = syncGame(d, "target", { write: true, list });
  expect(first.changes.length).toBeGreaterThanOrEqual(3);
  expect(first.problemsAfter).toEqual([]);
  // independent scan: every file in the fixture, not only the ones the tool knows
  for (const [p, t] of Object.entries(allText(d))) for (const n of live) expect([p, new RegExp(`(?<![\\d,.])(${withComma(n)}|${n})(?!\\d)`).test(t)]).toEqual([p, false]);
  const second = syncGame(d, "target", { write: true, list });
  expect(second.changes).toEqual([]);
  syncGame(d, "live", { write: true, list });
  expect(allText(d)).toEqual(original);
});
