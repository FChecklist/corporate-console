// FALSIFIED BY: decisions-row-missing
import { test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";

const doc = readFileSync(new URL("../docs/CONSOLE_DECISIONS.md", import.meta.url), "utf8");
const PLAN = "C:/ct/test-sites/docs-games/MASTER_CONSOLE_BUILD_PLAN.md";
const rows = doc.split("\n").filter((l) => /^\| D\d+ \|/.test(l));

test("D1 to D20 each appear exactly once as a table row", () => {
  for (let n = 1; n <= 20; n++) expect(rows.filter((r) => r.startsWith(`| D${n} |`)).length).toBe(1);
  expect(rows.length).toBe(20);
});

test("every row names the work packages that depend on it", () => {
  for (const r of rows) expect(/\bW\d+/.test(r.split("|").slice(-2)[0])).toBe(true);
});

test("every decision of the build plan is in the sheet (when the plan file is present)", () => {
  if (!existsSync(PLAN)) return;
  const plan = readFileSync(PLAN, "utf8");
  const ids = [...plan.matchAll(/^- (?:BLOCKING|DEFAULT) (D\d+)/gm)].map((m) => m[1]);
  expect(ids.length).toBe(20);
  for (const id of ids) expect(doc.includes(`| ${id} |`)).toBe(true);
});

test("D3 is marked open with a placeholder and no invented dollar price", () => {
  const d3 = rows.find((r) => r.startsWith("| D3 |"))!;
  expect(d3).toContain("USD_PRICE_PENDING");
  expect(/\$\s?\d|US\$\s?\d/.test(doc)).toBe(false);
});
