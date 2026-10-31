// Owner rules R10 (retention) and R13 (wording guard).
import { test, expect } from "bun:test";
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RETENTION, COPY_LINE, HOUR_MS, DAY_MS, participantDataDueMs, winnersRecordDueMs } from "../../functions/_lib/retention";
import { build } from "../../build.mjs";

const LINE = "No personal details needed. All participant information is deleted within 24 hours of the game.";
const root = new URL("../../", import.meta.url).pathname;

test("R10 all participant data is deleted within 24 hours of game over (promise 24, code 20)", () => {
  expect(RETENTION.participantDataHours).toBe(24);
  expect(RETENTION.participantDataCodeHours).toBe(20);
  expect(participantDataDueMs(0)).toBe(20 * HOUR_MS);
  expect(participantDataDueMs(0)).toBeLessThanOrEqual(24 * HOUR_MS);
});
test("R10 game details and winners audit record kept 365 days then auto-deleted", () => {
  expect(RETENTION.gameDetailsDays).toBe(365);
  expect(RETENTION.winnersRecordDays).toBe(365);
  expect(winnersRecordDueMs(0)).toBe(365 * DAY_MS);
  expect(readFileSync(join(root, "functions/_lib/purge.ts"), "utf8")).toMatch(/365/); // an automatic purge exists
});
test("R10 organizer and host e-mails are kept for invoices", () => { expect(RETENTION.organizerHostEmails).toBe("for invoices"); });
test("R10 tax records are not deleted by us", () => { expect(RETENTION.taxRecords).toBe("never deleted by us"); });
test("R10 no saved people list", () => { expect(RETENTION.savedPeopleList).toBe(false); });

test("R13 the on-screen retention line is exactly the owner's words", () => {
  expect(COPY_LINE).toBe(LINE);
  expect(readFileSync(join(root, "packages/game-pack/zc-flow.js"), "utf8")).toContain(`"${LINE}"`);
});
test("R13 the word 'private' never appears in customer text; 'close group' is used", () => {
  const out = mkdtempSync(join(tmpdir(), "dist-"));
  build({ env: "preview", out });
  const bad: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(html|json|js|webmanifest)$/.test(e.name) && /\bprivate\b/i.test(readFileSync(p, "utf8"))) bad.push(p.replace(out, "")); } };
  walk(out);
  expect(bad, "customer-facing built files containing 'private'").toEqual([]);
  expect(readFileSync(join(root, "docs/DRAFT_TERMS_WORDING.md"), "utf8")).not.toMatch(/\bprivate\b/i);
  const en = readFileSync(join(out, "copy/en.json"), "utf8");
  expect(/\bprivate\b/i.test(en)).toBe(false);
});
test("R13 English only: the copy file has one language and its text is ASCII/Latin-1", () => {
  expect(readdirSync(join(root, "public/copy"))).toEqual(["en.json"]);
  expect(/[\u0900-\u097F\u0600-\u06FF\u4e00-\u9fff]/.test(readFileSync(join(root, "public/copy/en.json"), "utf8"))).toBe(false);
});
