// Price list helpers used by the parity test. Plain ES module, no packages. One ladder only: today's prices.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const LIST_PATH = fileURLToPath(new URL("./price-list.json", import.meta.url));
export const loadList = (p = LIST_PATH) => JSON.parse(readFileSync(p, "utf8"));
export const GAMES = ["tambola", "bingo", "tictactoe", "snakesladders", "luckbychance"];

/** Files inside a game repo that carry a price. pages/public holds build copies and is NOT edited by hand: a rebuild refreshes it. */
export const PRICE_FILES = [
  "packages/shared/src/pricing.ts",
  "apps/web/public/common.js",
  "apps/web/public/pricing.html",
  "apps/web/public/index.html",
  "apps/web/public/partner.html",
  "apps/web/public/brochure.html",
  "apps/web/public/zc.js",
  "site/pricing.html",
];

/** 11799 -> "11,799" (the grouping of numbers below 100,000 is the same in Indian and western style) */
export const withComma = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** [[participants, inr, usd], ...] read from the PACKS literal of a pricing.ts / common.js text */
export function parsePacks(text) {
  const m = /PACKS[^=]*=\s*(\[\s*(?:\[[^\]]*\]\s*,?\s*)+\])/.exec(text);
  if (!m) return null;
  return [...m[1].matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/g)].map((x) => [Number(x[1]), Number(x[2]), Number(x[3])]);
}

/** check one game folder against the list; returns a list of problems (empty = the game charges exactly the list) */
export function checkGame(dir, list) {
  const problems = [];
  for (const rel of PRICE_FILES) {
    const p = join(dir, rel);
    if (!existsSync(p) || !/pricing\.ts$|common\.js$/.test(rel)) continue;
    const packs = parsePacks(readFileSync(p, "utf8"));
    if (!packs) { if (/pricing\.ts$/.test(rel)) problems.push(`${rel}: no PACKS list found`); continue; }
    for (const [n, inr, usd] of packs) {
      if (list.inr[n] !== inr) problems.push(`${rel}: size ${n} costs ${inr}, the price list says ${list.inr[n]}`);
      if (list.usd[n] !== usd) problems.push(`${rel}: size ${n} costs US$${usd}, the price list says ${list.usd[n]}`);
    }
    if (packs.length !== list.sizes.length) problems.push(`${rel}: ${packs.length} sizes, the price list has ${list.sizes.length}`);
  }
  return problems;
}
