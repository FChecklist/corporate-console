// FALSIFIED BY: falsify-noop-accepted
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { runMutation, lintTests } from "../tools/falsify-run.mjs";

const GIT = "C:/Program Files/Git/mingw64/bin/git.exe";
const g = (cwd: string, ...a: string[]) => execFileSync(GIT, ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd, encoding: "utf8" });

/** a tiny repo: lib.mjs has limit 5, strong.test.ts checks it, weak.test.ts does not */
function fixture() {
  const d = mkdtempSync(join(tmpdir(), "fx-"));
  g(d, "init", "-q", "-b", "main");
  writeFileSync(join(d, "lib.mjs"), "export const limit = 5;\nexport const ok = (n) => n <= limit;\n");
  writeFileSync(join(d, "strong.test.ts"), 'import { test, expect } from "bun:test";\nimport { ok } from "./lib.mjs";\ntest("six is refused", () => { expect(ok(5)).toBe(true); expect(ok(6)).toBe(false); });\n');
  writeFileSync(join(d, "weak.test.ts"), 'import { test, expect } from "bun:test";\nimport { ok } from "./lib.mjs";\ntest("five is fine", () => { expect(ok(5)).toBe(true); });\n');
  writeFileSync(join(d, "red.test.ts"), 'import { test, expect } from "bun:test";\ntest("always red", () => { expect(1).toBe(2); });\n');
  g(d, "add", "-A"); g(d, "commit", "-q", "-m", "fx");
  return d;
}
const mut = (d: string, o: any) => ({ id: "m", repo: d, file: "lib.mjs", find: "export const limit = 5;", replace: "export const limit = 500;", test: "strong.test.ts", ...o });

test("a mutation that a good test notices is reported 'caught'", async () => {
  const d = fixture();
  const r = await runMutation(mut(d, {}));
  expect(r.status).toBe("caught");
  expect(r.treeUntouched).toBe(true);
}, 60000);

test("a no-op mutation is reported 'mutation not caught'", async () => {
  const d = fixture();
  const r = await runMutation(mut(d, { replace: "export const limit = 5;" }));
  expect(r.status).toBe("mutation not caught");
}, 60000);

test("a weak test that stays green with the code broken is 'mutation not caught'", async () => {
  const d = fixture();
  const r = await runMutation(mut(d, { test: "weak.test.ts" }));
  expect(r.status).toBe("mutation not caught");
}, 60000);

test("a test that is already red on the clean copy proves nothing: 'baseline red'", async () => {
  const d = fixture();
  const r = await runMutation(mut(d, { test: "red.test.ts" }));
  expect(r.status).toBe("baseline red");
}, 60000);

test("text that is not there (or there twice) is 'mutation not applicable'", async () => {
  const d = fixture();
  expect((await runMutation(mut(d, { find: "nothing like this" }))).status).toBe("mutation not applicable");
  expect((await runMutation(mut(d, { find: "limit" }))).status).toBe("mutation not applicable");
}, 60000);

test("the real files are not changed by a run (same file, same git status, nothing added)", async () => {
  const d = fixture();
  const before = readFileSync(join(d, "lib.mjs"), "utf8");
  const r = await runMutation(mut(d, {}));
  expect(readFileSync(join(d, "lib.mjs"), "utf8")).toBe(before);
  expect(g(d, "status", "--porcelain").trim()).toBe("");
  expect(r.treeUntouched).toBe(true);
}, 60000);

test("lint: a test file without 'FALSIFIED BY' or with an unknown mutation id is listed", () => {
  const root = mkdtempSync(join(tmpdir(), "lint-"));
  const store = join(root, "store"); mkdirSync(store);
  writeFileSync(join(store, "known.json"), JSON.stringify({ id: "known" }));
  mkdirSync(join(root, "t"));
  writeFileSync(join(root, "t", "a.test.ts"), "// FALSIFIED BY: known\n");
  writeFileSync(join(root, "t", "b.test.ts"), "// nothing here\n");
  writeFileSync(join(root, "t", "c.test.ts"), "// FALSIFIED BY: nope\n");
  const r = lintTests(join(root, "t"), store);
  expect(r.files).toBe(3);
  expect(r.problems.length).toBe(2);
});
