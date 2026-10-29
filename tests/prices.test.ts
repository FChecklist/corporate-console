// FALSIFIED BY: prices-live-number-changed, prices-games-check-skips-usd
import { test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadList, withComma, parsePacks, checkGame, GAMES } from "../tools/prices/lib.mjs";

const ROOT = process.env.GAMES_ROOT || "C:/ct/test-sites";
const list = loadList();

test("the price list is TODAY'S prices: eight sizes, no 50-person size, no second ladder", () => {
  expect(list.sizes).toEqual([100, 250, 500, 750, 1000, 2500, 5000, 10000]);
  expect(Object.values(list.inr)).toEqual([2399, 3499, 4699, 5899, 7099, 11799, 17699, 29499]);
  expect(Object.values(list.usd)).toEqual([34, 51, 67, 84, 101, 169, 253, 421]);
  expect(Object.keys(list.inr).map(Number)).toEqual(list.sizes);
  expect(Object.keys(list.usd).map(Number)).toEqual(list.sizes);
  expect("target" in list).toBe(false);
  expect("live" in list).toBe(false);
  expect(JSON.stringify(list)).not.toMatch(/1493|1,493|USD_PRICE_PENDING/);
});

test("numbers are written the way the pages write them", () => {
  expect(withComma(2399)).toBe("2,399");
  expect(withComma(29499)).toBe("29,499");
  expect(withComma(100)).toBe("100");
});

test("PACKS lists are read from pricing.ts and from common.js", () => {
  const ts = "export const PACKS: ReadonlyArray<readonly [number, number, number]> = [\n  [100, 2399, 34], [250, 3499, 51],\n];";
  expect(parsePacks(ts)).toEqual([[100, 2399, 34], [250, 3499, 51]]);
  expect(parsePacks("TB.PACKS = [[100, 2399, 34], [250, 3499, 51]];")).toEqual([[100, 2399, 34], [250, 3499, 51]]);
});

test("the checker names a wrong rupee price, a wrong dollar price and a missing size", () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
  const { tmpdir } = require("node:os");
  const d = mkdtempSync(join(tmpdir(), "pr-"));
  mkdirSync(join(d, "packages/shared/src"), { recursive: true });
  const row = (n: number, inr: number, usd: number) => `[${n}, ${inr}, ${usd}]`;
  const all = list.sizes.map((n: number) => [n, list.inr[n], list.usd[n]]);
  const write = (rows: number[][]) => writeFileSync(join(d, "packages/shared/src/pricing.ts"), `export const PACKS = [${rows.map((r) => row(r[0], r[1], r[2])).join(", ")}];`);
  write(all);
  expect(checkGame(d, list)).toEqual([]);
  write(all.map((r: number[], i: number) => (i === 0 ? [r[0], 2387, r[2]] : r)));
  expect(checkGame(d, list).join("|")).toContain("size 100 costs 2387");
  write(all.map((r: number[], i: number) => (i === 1 ? [r[0], r[1], 52] : r)));
  expect(checkGame(d, list).join("|")).toContain("size 250 costs US$52");
  write(all.slice(1));
  expect(checkGame(d, list).join("|")).toContain("7 sizes");
});

for (const g of GAMES) {
  test(`parity: ${g} charges exactly the price list (rupees and dollars)`, () => {
    const dir = join(ROOT, g);
    if (!existsSync(dir)) return; // that game is not on this laptop
    expect(checkGame(dir, list)).toEqual([]);
    const packs = parsePacks(readFileSync(join(dir, "packages/shared/src/pricing.ts"), "utf8"))!;
    expect(packs.length).toBe(8);
  });
}
