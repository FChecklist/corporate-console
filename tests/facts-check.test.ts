// FALSIFIED BY: facts-check-always-ok
import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { checkFacts, FACTS } from "../tools/facts-check.mjs";

const ROOT = process.env.GAMES_ROOT || "C:/ct/test-sites";

test("every symbol the build plan relies on exists in the real game repos (155 checks)", () => {
  if (!existsSync(join(ROOT, "bingo"))) return;
  const bad = checkFacts(ROOT).filter((r: any) => !r.ok);
  expect(bad).toEqual([]);
});

/** copy just the files the facts look at, for one game, into a temp root */
function copyOne(game: string) {
  const root = mkdtempSync(join(tmpdir(), "fc-"));
  for (const f of FACTS) { if (!f.repos.includes(game)) continue; const s = join(ROOT, game, f.file); if (!existsSync(s)) continue; const d = join(root, game, f.file); mkdirSync(dirname(d), { recursive: true }); copyFileSync(s, d); }
  return root;
}

test("renaming a symbol in a copy makes the check fail for exactly that fact", () => {
  if (!existsSync(join(ROOT, "bingo"))) return;
  const root = copyOne("bingo");
  expect(checkFacts(root, FACTS, ["bingo"]).filter((r: any) => !r.ok)).toEqual([]);
  const w = join(root, "bingo/apps/edge/src/worker.ts");
  writeFileSync(w, readFileSync(w, "utf8").replace("async function authOfKey(", "async function authOfKeyRenamed("));
  const bad = checkFacts(root, FACTS, ["bingo"]).filter((r: any) => !r.ok);
  expect(bad.map((r: any) => r.id)).toEqual(["authOfKey"]);
});

test("a thing the plan says is absent turns the check red when it appears (game_role)", () => {
  if (!existsSync(join(ROOT, "bingo"))) return;
  const root = copyOne("bingo");
  const w = join(root, "bingo/apps/edge/src/worker.ts");
  writeFileSync(w, readFileSync(w, "utf8") + "\n// game_role\n");
  expect(checkFacts(root, FACTS, ["bingo"]).filter((r: any) => !r.ok).map((r: any) => r.id)).toEqual(["no game_role yet"]);
});

test("a missing file counts as a miss, except where absence is the expected state", () => {
  const root = mkdtempSync(join(tmpdir(), "fc-"));
  const res = checkFacts(root, FACTS, ["luckbychance"]);
  expect(res.find((r: any) => r.id === "authOfKey")!.ok).toBe(false);
  expect(res.find((r: any) => r.id === "Luck has no releases.json")!.ok).toBe(true);
});
