// FALSIFIED BY: runbook-rollback-missing
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";

const doc = readFileSync(new URL("../docs/GO_LIVE_RUNBOOK.md", import.meta.url), "utf8");
const steps = doc.split(/^## /m).slice(1).filter((s) => /^Step \d/.test(s));

test("the runbook has nine steps and every one says how to check it and how to undo it", () => {
  expect(steps.length).toBe(9);
  for (const s of steps) { const title = s.split("\n")[0]; expect([title, /Verify/.test(s)]).toEqual([title, true]); expect([title, /Rollback|Nothing was done/.test(s)]).toEqual([title, true]); }
});
test("the runbook holds no secret value (only names) and no deploy without the owner's go", () => {
  expect(/(rzp_(live|test)_\w+|sk_(live|test)_\w+|re_[A-Za-z0-9]{20,}|whsec_\w+|eyJ[A-Za-z0-9_-]{20,}|[A-Fa-f0-9]{40,})/.test(doc)).toBe(false);
  expect(doc).toContain("explicit \"go\"");
  expect(doc).toContain("node tools/deploy/guard.mjs");
});
