// Owner rule R9 (spec 410 section 2): start a new game from an earlier one.
import { test, expect } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
// @ts-ignore plain browser module
import { cloneFrom, COPY_PARTS } from "../../public/core/clone.js";

const TYPES = ["tambola", "bingo", "tictactoe", "snakes", "luck", "luckydraw"];
const target = (id: string) => ({ id, startModes: ["auto-at-published-time", "manual-by-organizer-or-host"] });
const old = (type: string): any => ({
  gameType: type, gameName: "Old", settings: { cap: 50, idKind: "email", hostEmails: ["h@x.org"], startMs: 5, peopleList: ["a"] }, startMode: "manual-by-organizer-or-host",
  prizePlan: { rows: 3 }, roles: { hosts: 2, cohostsBring: true, hostEmails: ["h@x.org"] }, look: { brand: "Acme" },
  participants: [{ name: "Asha" }], people: ["Asha"], startMs: 99, time: "10:00", results: [1], winners: [{ name: "Asha" }], log: ["x"], moves: [1],
});

test("R9 copies settings, start mode, prize plan, roles and look", () => {
  const { copy } = cloneFrom(old("tambola"), target("tambola"));
  expect(copy.settings.cap).toBe(50);
  expect(copy.startMode).toBe("manual-by-organizer-or-host");
  expect(copy.prizePlan).toEqual({ rows: 3 });
  expect(copy.roles.hosts).toBe(2);
  expect(copy.look).toEqual({ brand: "Acme" });
  expect(COPY_PARTS.map((p: any) => p.key).sort()).toEqual(["look", "prizePlan", "roles", "settings", "startMode"]);
});
test("R9 NEVER copies people list, time, results or play data", () => {
  for (const t of TYPES) {
    const { copy } = cloneFrom(old(t), target(t));
    const s = JSON.stringify(copy);
    for (const bad of ["Asha", "h@x.org", "peopleList", "startMs", "participants", "winners", "results", "moves", "10:00"]) expect(s.includes(bad), `${t}: copy leaks ${bad}`).toBe(false);
    for (const k of ["participants", "people", "startMs", "time", "results", "winners", "log", "moves"]) expect(k in copy, `${t}: copy has ${k}`).toBe(false);
  }
});
test("R9 works across all 6 types (every source to every target)", () => {
  for (const a of TYPES) for (const b of TYPES) {
    const r = cloneFrom(old(a), target(b));
    expect(r.copy.look, `${a}->${b}`).toEqual({ brand: "Acme" });
    expect(r.copy.roles, `${a}->${b}`).toBeTruthy();
  }
});
test("R9 steps that do not apply are skipped when the type changes", () => {
  const r = cloneFrom(old("tambola"), { id: "luckydraw", startModes: ["auto-at-published-time"] });
  expect(r.copy.startMode).toBeUndefined();
  expect(r.skipped).toContain("Date and time");
  expect(r.copy.prizePlan).toBeUndefined(); // another type chooses its own prizes
  expect(r.skipped).toContain("Tickets and prizes");
});
test("R9 there is NO saved people list anywhere (no code stores or reads one)", () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { if (["node_modules", ".git", "tests", "tools"].includes(e.name)) continue; const p = join(d, e.name); e.isDirectory() ? walk(p) : /\.(js|ts|mjs|sql|json)$/.test(e.name) && files.push(p); } };
  const root = new URL("../../", import.meta.url).pathname; walk(root);
  const hits = files.filter((f) => /saved[_ ]?(people|list|participants)|people_?list\s*(table|\()|CREATE TABLE[^;]*(people|participant)/i.test(readFileSync(f, "utf8")) && !f.endsWith("retention.ts") && !f.endsWith("clone.js"));
  expect(hits).toEqual([]);
  expect(existsSync(join(root, "migrations"))).toBe(true);
  for (const m of readdirSync(join(root, "migrations"))) expect(/people|participant/i.test(readFileSync(join(root, "migrations", m), "utf8").replace(/--.*$/gm, "").match(/CREATE TABLE[^;]*/gi)?.join(" ") || ""), m).toBe(false);
});
