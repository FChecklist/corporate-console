// FALSIFIED BY: rollback-keeps-keys, rollback-writes-in-place
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { unsetPubkeys } from "../tools/deploy/rollback.mjs";

const TOML = 'name = "corporate-bingo"\n[vars]\nPUBLIC_ORIGIN = "https://bingo.corporatetambola.com"\nCONSOLE_PUBKEYS = "k1:AbCdEfGh,k2:XyZ"  # console keys\nOTHER = "keep me"\n';

test("the setting is emptied, every other line stays exactly as it was, and a second run changes nothing", () => {
  const r = unsetPubkeys(TOML);
  expect(r.found).toBe(true); expect(r.changed).toBe(true);
  expect(r.text).toBe(TOML.replace('"k1:AbCdEfGh,k2:XyZ"', '""'));
  expect(r.text).not.toContain("k1:");
  const again = unsetPubkeys(r.text);
  expect(again.changed).toBe(false); expect(again.text).toBe(r.text);
});

test("JSON style settings work too, and a file without the setting is reported as not found", () => {
  expect(unsetPubkeys('{\n  "CONSOLE_PUBKEYS": "k1:abc",\n  "X": "1"\n}').text).toContain('"CONSOLE_PUBKEYS": ""');
  expect(unsetPubkeys("OTHER = 1\n").found).toBe(false);
});

test("the command is a dry run by default; --write makes a COPY next to the file and never edits the original", () => {
  const d = mkdtempSync(join(tmpdir(), "rb-"));
  const f = join(d, "wrangler.toml"); writeFileSync(f, TOML);
  const dry = spawnSync(process.execPath, ["tools/deploy/rollback.mjs", "--config", f], { encoding: "utf8", cwd: join(import.meta.dir, "..") });
  expect(dry.stdout).toContain("dry run");
  expect(existsSync(f + ".rolled-back")).toBe(false);
  const wr = spawnSync(process.execPath, ["tools/deploy/rollback.mjs", "--config", f, "--write"], { encoding: "utf8", cwd: join(import.meta.dir, "..") });
  expect(wr.status).toBe(0);
  expect(readFileSync(f, "utf8")).toBe(TOML); // the original is untouched
  expect(readFileSync(f + ".rolled-back", "utf8")).toContain('CONSOLE_PUBKEYS = ""');
});
