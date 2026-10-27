// FALSIFIED BY: baseline-fail-count-off
import { test, expect } from "bun:test";
import { parseBunSummary } from "../tools/baseline.mjs";

const SAMPLE = `bun test v1.3.14 (0d9b296a)\n(fail) console: no refunds (credit) > Create a new game like this one [12.00ms]\n(fail) Rescheduling: a date more than 30 days ahead [3.00ms]\n\n 1928 pass\n 2 skip\n 1 fail\n 5555 expect() calls\nRan 1931 tests across 159 files. [599.12s]\n`;

test("the summary of a bun run is read: pass, fail, skip, files and the failing test names", () => {
  const s = parseBunSummary(SAMPLE);
  expect(s.pass).toBe(1928);
  expect(s.fail).toBe(1);
  expect(s.skip).toBe(2);
  expect(s.files).toBe(159);
  expect(s.failures.length).toBe(2);
  expect(s.failures[1]).toBe("Rescheduling: a date more than 30 days ahead");
});

test("a run without failures reads as 0 fail only when bun printed it, never as a guess", () => {
  const s = parseBunSummary("\n 12 pass\n 0 fail\nRan 12 tests across 3 files. [1.00s]\n");
  expect(s.fail).toBe(0);
  expect(parseBunSummary("crashed").fail).toBe(null);
});
