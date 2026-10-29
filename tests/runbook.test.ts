// FALSIFIED BY: runbook-rollback-missing
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";

const doc = readFileSync(new URL("../docs/GO_LIVE_RUNBOOK.md", import.meta.url), "utf8");
const steps = doc.split(/^## /m).slice(1).filter((s) => /^Step \d/.test(s));
const title = (s: string) => s.split("\n")[0]!;

test("the runbook has ten steps (0 to 9) in the spec order and every one says how to check it and how to undo it", () => {
  expect(steps.length).toBe(10);
  expect(steps.map((s) => /^Step (\d)/.exec(s)![1]).join("")).toBe("0123456789");
  const order = ["questions", "it services", "own pages.dev", "dark", "bingo only", "tic tac toe", "snakes", "luck", "tambola last", "custom address"];
  steps.forEach((s, i) => expect([i, title(s).toLowerCase().includes(order[i]!)]).toEqual([i, true]));
  for (const s of steps) { expect([title(s), /Verify/.test(s)]).toEqual([title(s), true]); expect([title(s), /Rollback|Nothing was done/.test(s)]).toEqual([title(s), true]); }
});
test("the runbook holds no secret value (only names) and no deploy without the owner's go", () => {
  expect(/(rzp_(live|test)_\w+|sk_(live|test)_\w+|re_[A-Za-z0-9]{20,}|whsec_\w+|eyJ[A-Za-z0-9_-]{20,}|[A-Fa-f0-9]{40,})/.test(doc)).toBe(false);
  expect(doc).toContain("explicit \"go\"");
  expect(doc).toContain("node tools/deploy/guard.mjs");
});
test("the rollback tool, the prefixed-table option and the rule about links to the console are written down", () => {
  expect(doc).toContain("tools/deploy/rollback.mjs");
  expect(doc).toContain("TABLE_PREFIX");
  expect(doc).toContain("tools/prefix-migration.mjs");
  expect(doc).toContain("live_games_now.py 3");
  expect(doc).toContain("No other site links to `console.corporatetambola.com` until the last step is done.");
  const nine = steps.find((s) => s.startsWith("Step 9"))!;
  expect(nine).toContain("console.corporatetambola.com");
});
