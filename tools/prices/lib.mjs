// Price list helpers shared by sync.mjs and the parity test. Plain ES module, no packages.
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

/** 11799 -> "11,799" (Indian grouping used on the pages; the grouping of numbers below 100,000 equals the western one) */
export const withComma = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** a price written as 2399 or 2,399, not part of a longer number */
const asRe = (n) => new RegExp(`(?<![\\d,.])(?:${esc(withComma(n))}|${n})(?![\\d])`, "g");

export const ladderOf = (list, which) => Object.fromEntries(Object.entries(list[which].inr).map(([k, v]) => [Number(k), v]));
/** the INR numbers that exist in one ladder but not in the other (only these can tell the two ladders apart) */
export function onlyIn(list, which) {
  const other = which === "live" ? "target" : "live";
  const o = new Set(Object.values(ladderOf(list, other)));
  return Object.values(ladderOf(list, which)).filter((n) => !o.has(n));
}
export function hitsOf(text, nums) { return nums.filter((n) => asRe(n).test(text)); }

/** swap every price of ladder 'from' for the price of the same size in ladder 'to'; returns { text, changed } */
export function rewrite(text, list, from, to) {
  const a = ladderOf(list, from), b = ladderOf(list, to);
  let out = text;
  // two passes through placeholders so that a new price equal to another old price cannot be swapped twice
  const marks = [];
  for (const size of Object.keys(a)) {
    if (!(size in b) || a[size] === b[size]) continue;
    const tag = `\u0001P${marks.length}\u0001`;
    out = out.replace(asRe(a[size]), (m) => { marks.push([tag, m.includes(",") ? withComma(b[size]) : String(b[size])]); return tag; });
  }
  for (const [tag, val] of marks) out = out.split(tag).join(val);
  return { text: out, changed: out !== text };
}

/** [[participants, inr, usd], ...] read from the PACKS literal of a pricing.ts / common.js text */
export function parsePacks(text) {
  const m = /PACKS[^=]*=\s*(\[\s*(?:\[[^\]]*\]\s*,?\s*)+\])/.exec(text);
  if (!m) return null;
  return [...m[1].matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/g)].map((x) => [Number(x[1]), Number(x[2]), Number(x[3])]);
}

/** check one game folder against the list; 'expect' is "live" or "target"; returns a list of problems */
export function checkGame(dir, list, expect) {
  const problems = [];
  const want = ladderOf(list, expect), wantOther = expect === "live" ? "target" : "live";
  const wrong = onlyIn(list, wantOther);
  for (const rel of PRICE_FILES) {
    const p = join(dir, rel);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf8");
    if (/pricing\.ts$|common\.js$/.test(rel)) {
      const packs = parsePacks(text);
      if (!packs) { if (/pricing\.ts$/.test(rel)) problems.push(`${rel}: no PACKS list found`); }
      else {
        for (const [n, inr, usd] of packs) {
          if (want[n] !== inr) problems.push(`${rel}: size ${n} costs ${inr}, the price list says ${want[n]}`);
          const liveUsd = list.live.usd[String(n)];
          if (liveUsd !== undefined && usd !== liveUsd && list.target.usd === "USD_PRICE_PENDING") problems.push(`${rel}: size ${n} dollar price ${usd} differs from ${liveUsd} (dollar prices are pending, D3)`);
        }
      }
    }
    const stale = hitsOf(text, wrong);
    if (stale.length) problems.push(`${rel}: still shows ${wantOther} price(s) ${stale.join(", ")}`);
  }
  return problems;
}
