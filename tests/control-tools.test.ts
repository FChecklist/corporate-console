// FALSIFIED BY: control-history-accepts-email, control-key-printed, control-secret-unlisted
// The helpers around Mission Control: the history writer (checks, quoting, append-only), the release-log mirror, the AI key maker (never prints the key) and the list of secret names.
import { test, expect } from "bun:test";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
// @ts-ignore plain .mjs tools
import { buildRow, insertSql } from "../tools/control-history.mjs";
// @ts-ignore
import { parseReleaseLog } from "../tools/control-release-log.mjs";
// @ts-ignore
import { makeKey } from "../tools/control-make-key.mjs";
import { makeD1 } from "./support/d1-sqlite";

const NOW = Date.UTC(2026, 10, 2, 11, 0, 0);

test("history writer: a good line passes; a wrong writer, a bad site, empty or long text, an e-mail address, a long number and a strange id are all refused with a reason", () => {
  const ok = buildRow({ who: "ai", site: "bingo", what: "Released Bingo fc5f01f", result: "live gate 0, version.json matches", ref: "27fc8e5a-9d3b" }, NOW);
  expect(ok).toMatchObject({ ok: true, errors: [], row: { at_ms: NOW, who: "ai", site: "bingo", ref: "27fc8e5a-9d3b" } });
  const bad = (o: object) => buildRow({ who: "owner", site: "home", what: "w", result: "r", ...o }, NOW);
  expect(bad({ who: "robot" }).errors[0]).toMatch(/owner or ai/);
  expect(bad({ site: "Bad Site!" }).errors[0]).toMatch(/--site/);
  expect(bad({ what: "" }).ok).toBe(false);
  expect(bad({ result: "x".repeat(501) }).ok).toBe(false);
  expect(bad({ what: "asked ravi@example.com to pay" }).errors.join()).toMatch(/person's details/);
  expect(bad({ result: "phone 9876543210" }).errors.join()).toMatch(/person's details/);
  expect(bad({ ref: "no spaces allowed" }).ok).toBe(false);
  expect(bad({ at: "not a time" }).ok).toBe(false);
  expect(bad({ at: "2026-11-02T05:30:00Z" }).row.at_ms).toBe(Date.UTC(2026, 10, 2, 5, 30));
});

test("history writer: the statement is quoted (a quote or SQL in the text is only text), lands in the real table, and the table refuses a change or a delete", () => {
  const { raw } = makeD1(["migrations/0001_console.sql", "migrations/0005_control_history.sql"]);
  const nasty = "Rolled back'); DROP TABLE control_history; --";
  const b = buildRow({ who: "ai", site: "luckydraw", what: nasty, result: "it's fine", ref: null }, NOW);
  raw.exec(insertSql(b.row));
  const rows = raw.query("SELECT who, site, what, result, ref FROM control_history").all();
  expect(rows).toEqual([{ who: "ai", site: "luckydraw", what: nasty, result: "it's fine", ref: null }]);
  expect(() => raw.exec("UPDATE control_history SET result='x'")).toThrow(/append-only/);
  expect(() => raw.exec("DELETE FROM control_history")).toThrow(/append-only/);
});

test("history writer, command line: without --sqlite or --remote it only prints; a refused line exits with 2 and writes nothing", () => {
  const run = (...a: string[]) => spawnSync(process.execPath, [new URL("../tools/control-history.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), ...a], { encoding: "utf8" });
  const dry = run("--who", "ai", "--site", "home", "--what", "Home released", "--result", "ok");
  expect(dry.status).toBe(0);
  expect(dry.stdout).toMatch(/^INSERT INTO control_history/);
  expect(dry.stdout).toContain("printed only");
  const refused = run("--who", "ai", "--site", "home", "--what", "mail to a@b.co", "--result", "ok", "--remote");
  expect(refused.status).toBe(2);
  expect(refused.stderr).toContain("Not written");
});

test("release log mirror: release lines become entries with the ids cut out; other lines are left out; e-mail addresses are removed; newest first", () => {
  const md = [
    "# x", "## 10. Release log (append one line per release)",
    "- 23:08 IST **Tambola** (corporate-tambola) e3d93e3 -> 88fa696 (boss session). Rollback id 21dc251c-2182-40c9-927a-844c5c0f9f39. New deployment 5a0429d6-667d-4e4e-b550-8f75696e24ae. Contact sneha@example.com",
    "- Disclosed differences from the rules: (1) something",
    "### Status snapshot 21:10 IST (exact)", "- Tambola a128674 (older claim-hold head): 3859 pass",
    "**2 Nov 2026 releases (boss session):**",
    "- 01:40 IST Bingo d5156bf -> fabd9a9, deployment 27fc8e5a, rollback c33752f8. Full run 2090 pass.",
    "- 2 Nov 10:51 to 10:59 IST (times from the list) SAME-BUILD redeploys of six games. Tic Tac Toe 4b37bf3 deployment 05f7a0e0",
    "## 11. Open owner items", "- 09:00 IST Home should not be read",
  ].join("\n");
  const e = parseReleaseLog(md);
  expect(e.map((x: any) => x.day + " " + x.time + " " + x.site)).toEqual(["2026-11-02 10:51 tictactoe", "2026-11-02 01:40 bingo", "2026-11-01 23:08 tambola"]);
  expect(e[2]).toMatchObject({ from: "e3d93e3", to: "88fa696", rollback: "21dc251c-2182-40c9-927a-844c5c0f9f39", deployment: "5a0429d6-667d-4e4e-b550-8f75696e24ae" });
  expect(e[2].text).toContain("(address removed)");
  expect(e[2].text).not.toContain("sneha@");
  expect(e[1]).toMatchObject({ from: "d5156bf", to: "fabd9a9", rollback: "c33752f8", deployment: "27fc8e5a" });
});

test("AI key maker: writes one line of 48 hex characters, keeps an existing key unless --rotate, and the command never prints the key", () => {
  const dir = mkdtempSync(join(tmpdir(), "mc-key-")), file = join(dir, "keys.txt");
  const r1 = makeKey(file);
  expect(r1).toEqual({ made: true, length: 48 });
  const line = readFileSync(file, "utf8");
  expect(line).toMatch(/^AI_CONTROL_KEY=[0-9a-f]{48}\n$/);
  expect(makeKey(file)).toEqual({ made: false, length: 48 });
  expect(readFileSync(file, "utf8")).toBe(line);
  const key = line.split("=")[1]!.trim();
  const cli = spawnSync(process.execPath, [new URL("../tools/control-make-key.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "--out", file, "--rotate"], { encoding: "utf8" });
  expect(cli.status).toBe(0);
  expect(cli.stdout + cli.stderr).not.toContain(key);
  expect(cli.stdout + cli.stderr).not.toMatch(/[0-9a-f]{32}/);
  expect(readFileSync(file, "utf8")).not.toBe(line); // rotated
});

test("every secret the Mission Control code reads is listed by name in config/SECRETS_NAMES.md, and no value is written there", () => {
  const src = readFileSync(new URL("../functions/_lib/control-core.ts", import.meta.url), "utf8");
  const names = [...new Set([...src.matchAll(/\benv\??\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]))];
  expect(names.sort()).toEqual(["AI_CONTROL_KEY", "CF_ACCOUNT_ID", "CF_API_TOKEN", "LEDGER_KEY", "ORGANIZER_SECRET"].sort());
  const list = readFileSync(new URL("../config/SECRETS_NAMES.md", import.meta.url), "utf8");
  for (const n of names) expect(list).toContain("`" + n + "`");
  expect(list).not.toMatch(/AI_CONTROL_KEY\s*=\s*[0-9a-f]{16,}/);
});

test("no secret value is written in any file of this change", () => {
  const files = ["functions/_lib/control-core.ts", "functions/api/control/[[path]].ts", "public/owner/index.html", "public/owner/owner.js", "public/owner/owner.css", "migrations/0005_control_history.sql", "config/control.json", "config/release-log.json", "tools/control-history.mjs", "tools/control-make-key.mjs", "tools/control-release-log.mjs", "docs/MISSION_CONTROL.md"];
  for (const f of files) {
    let text = ""; try { text = readFileSync(new URL("../" + f, import.meta.url), "utf8"); } catch { continue; }
    expect([f, /(?:SECRET|KEY|TOKEN|PASSWORD)\s*[=:]\s*["']?[A-Za-z0-9_\-]{24,}/.test(text)]).toEqual([f, false]);
  }
});
