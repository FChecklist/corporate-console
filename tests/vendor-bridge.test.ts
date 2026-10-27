// FALSIFIED BY: vendor-hash-ignores-content, vendor-drift-unchecked
import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { vendor, drift, DEST_REL, KIT_DEST_REL, hashText, sourceFiles, SRC_DIR } from "../tools/vendor-bridge.mjs";

const game = () => mkdtempSync(join(tmpdir(), "vb-"));

test("the vendored copy is the source, byte for byte, and the manifest has one hash per file", () => {
  const g = game();
  const m = vendor(g);
  expect(Object.keys(m.files).sort()).toEqual(sourceFiles());
  for (const f of sourceFiles()) expect(readFileSync(join(g, DEST_REL, f), "utf8")).toBe(readFileSync(SRC_DIR + f, "utf8").replace(/\r\n/g, "\n"));
  expect(drift(g)).toEqual([]);
});

test("changing ONE byte in ONE vendored file turns the drift check red and names the file", () => {
  const g = game();
  vendor(g);
  const f = join(g, DEST_REL, "bridge.ts");
  writeFileSync(f, readFileSync(f, "utf8").replace("export const KEY_LIFE_MS = 2 * 3600_000;", "export const KEY_LIFE_MS = 3 * 3600_000;"));
  const p = drift(g);
  expect(p.length).toBe(1);
  expect(p[0]).toContain("bridge.ts differs");
});

test("the contract tests travel with the bridge: kit, schemas and fixtures are copied too, with their one import path rewritten", () => {
  const g = game();
  vendor(g);
  const kit = join(g, KIT_DEST_REL);
  for (const f of ["kit.mjs", "schema-check.mjs", "schemas.json", "fixtures.json", "MANIFEST.json"]) expect(readFileSync(join(kit, f), "utf8").length).toBeGreaterThan(10);
  expect(readFileSync(join(kit, "kit.mjs"), "utf8")).toContain('"../../src/console-bridge/assertion.ts"');
  expect(readFileSync(join(kit, "kit.mjs"), "utf8")).not.toContain('"../src/assertion.ts"');
  expect(drift(g)).toEqual([]);
  writeFileSync(join(kit, "fixtures.json"), readFileSync(join(kit, "fixtures.json"), "utf8").replace('"status": 200', '"status": 201'));
  expect(drift(g).some((x: string) => x.includes("fixtures.json differs"))).toBe(true);
});

test("a file removed, an extra file added, a stale manifest: each is drift", () => {
  const g = game();
  vendor(g);
  writeFileSync(join(g, DEST_REL, "extra.ts"), "export {}\n");
  expect(drift(g).some((x: string) => x.includes("extra.ts is not part of the bridge"))).toBe(true);
  const g2 = game(); vendor(g2);
  const mf = join(g2, DEST_REL, "MANIFEST.json");
  const j = JSON.parse(readFileSync(mf, "utf8")); j.files["assertion.ts"] = "0".repeat(64); writeFileSync(mf, JSON.stringify(j));
  expect(drift(g2).some((x: string) => x.includes("manifest does not match"))).toBe(true);
  expect(drift(game())[0]).toContain("does not exist");
});

test("Windows line ends are not drift (a game checked out on Windows has CRLF), a changed letter is", () => {
  const g = game();
  vendor(g);
  for (const f of readdirSync(join(g, DEST_REL)).filter((x) => x.endsWith(".ts"))) { const p = join(g, DEST_REL, f); writeFileSync(p, readFileSync(p, "utf8").replace(/\n/g, "\r\n")); }
  expect(drift(g)).toEqual([]);
  expect(hashText(Buffer.from("a\r\nb"))).toBe(hashText(Buffer.from("a\nb")));
  expect(hashText(Buffer.from("a\nb"))).not.toBe(hashText(Buffer.from("a\nc")));
});

test("the bridge in the console repo is itself in step with its own manifest of the vendored files already living in game repos (when present)", () => {
  for (const game of ["tambola", "bingo", "tictactoe", "snakesladders", "luckbychance"]) {
    const dir = join("C:/ct/test-sites", game);
    try { readFileSync(join(dir, DEST_REL, "MANIFEST.json")); } catch { continue; } // not vendored yet
    expect([game, drift(dir)]).toEqual([game, []]);
  }
});
