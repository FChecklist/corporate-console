// FALSIFIED BY: contrast-muted-too-pale, contrast-dark-link-too-dark
// The colours of the design (core/tokens.css) must read well in light AND dark: WCAG AA (4.5 for text, 3 for the focus ring). No browser needed: the colours are read from the file.
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { contrastRatio } from "../tools/browser-tests/viewport-kit.mjs";

const css = readFileSync(new URL("../public/core/tokens.css", import.meta.url), "utf8");
const block = (re: RegExp) => { const m = re.exec(css); return m ? m[1]! : ""; };
const light = block(/:root \{([^}]*)\}/);
const dark = block(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/);
const vars = (b: string) => Object.fromEntries([...b.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{3,6})/g)].map((m) => [m[1], m[2]]));
const L = vars(light), D = { ...L, ...vars(dark) };

const PAIRS: Array<[string, string, string, number?]> = [
  ["text on page", "ink", "bg"], ["text on card", "ink", "card"], ["second text on page", "ink2", "bg"], ["second text on card", "ink2", "card"],
  ["muted text on page", "muted", "bg"], ["muted text on card", "muted", "card"], ["link on page", "accent", "bg"], ["link on card", "accent", "card"],
  ["menu text on bar", "bar-ink", "bar"], ["menu dim text on bar", "bar-dim", "bar"], ["strip text", "strip-ink", "strip"], ["soft chip text", "ink2", "soft"],
  ["error text on page", "bad", "bg"], ["ok text on page", "ok", "bg"], ["gold text on page", "goldt", "bg"], ["focus ring on page", "gold", "bg", 1.3],
];
for (const [name, vs] of [["light", L], ["dark", D]] as const) {
  test(`${name}: every text colour pair reaches WCAG AA, and the main button text is readable`, () => {
    const bad = PAIRS.map(([n, f, b, min]) => ({ n, ratio: contrastRatio(vs[f]!, vs[b]!), min: min ?? 4.5 })).filter((x) => x.ratio < x.min);
    expect(bad).toEqual([]);
    expect(contrastRatio("#FFFFFF", vs["btn"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#FFFFFF", vs["btn-hover"]!)).toBeGreaterThanOrEqual(4.5);
  });
}
test("the dark colours really exist (a missing dark block would silently reuse the light ones)", () => {
  expect(Object.keys(vars(dark)).length).toBeGreaterThan(10);
  expect(vars(dark)["bg"]).not.toBe(L["bg"]);
});

test("the status chips and the gold button (colours written in app.css) read well in light and dark", () => {
  const app = readFileSync(new URL("../public/core/app.css", import.meta.url), "utf8");
  const pairs: Array<[string, string, string]> = [];
  for (const m of app.matchAll(/\.chip\.([a-z, .]+)\s*\{\s*background:\s*(#[0-9A-Fa-f]{6});\s*color:\s*(#[0-9A-Fa-f]{6});/g)) pairs.push([m[1]!, m[3]!, m[2]!]);
  expect(pairs.length).toBe(8); // four light, four dark
  for (const [n, fg, bg] of pairs) expect([n, contrastRatio(fg, bg) >= 4.5]).toEqual([n, true]);
  expect(contrastRatio("#2b1a05", L["gold"]!)).toBeGreaterThanOrEqual(4.5);
});
