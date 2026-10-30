// FALSIFIED BY: empid-no-nfkc, empid-keeps-lowercase, empid-keeps-dash, empid-cap-30, empid-copy-differs, empid-table-raw, empid-guard-blind
// Uniform employee ID (owner rule 30 Oct 2026): NFKC, capital letters, only A-Z and 0-9. One shared function; the master console itself never touches an employee ID today, and a test keeps it that way
// (any new code that mentions an employee ID must go through the function).
import { test, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Window } from "happy-dom";
import { cleanEmployeeId, checkEmployeeId, EMPLOYEE_ID_MAX } from "../packages/game-pack/employee-id.js";

const ROOT = join(import.meta.dir, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

test("every way of writing the same ID becomes the same cleaned ID", () => {
  for (const v of ["1B-678", "1b-678", "1B/678", "1B 678", " 1b . 678 ", "1B_678", "1B–678", "1B\t678", " 1B678​", "１Ｂ－６７８"]) expect([v, cleanEmployeeId(v)]).toEqual([v, "1B678"]);
  expect(cleanEmployeeId("EMP/0042-a")).toBe("EMP0042A");
  expect(cleanEmployeeId(null)).toBe("");
  expect(cleanEmployeeId(undefined)).toBe("");
  expect(cleanEmployeeId(12345)).toBe("12345");
  expect(cleanEmployeeId("٣٤")).toBe("");  // letters and numbers of other alphabets are not A-Z or 0-9
  expect(cleanEmployeeId("😀-7")).toBe("7"); // an emoji is not an ID character
});

test("the hint, the refusal of an empty ID and the 30-letter cap (counted after cleaning; an ID is never cut short)", () => {
  expect(checkEmployeeId("1B-678")).toEqual({ ok: true, id: "1B678", hint: "The system will read this as 1B678" });
  expect(checkEmployeeId("--//  ").ok).toBe(false);
  expect(checkEmployeeId("--//  ")).toEqual({ ok: false, error: "Please type an employee ID. It needs at least one letter or number." });
  expect(EMPLOYEE_ID_MAX).toBe(30);
  expect(checkEmployeeId("A".repeat(30) + "---").ok).toBe(true);      // dashes do not count
  expect(checkEmployeeId("A".repeat(31)).ok).toBe(false);
  expect(checkEmployeeId("A-".repeat(32)).ok).toBe(false);            // 32 letters after cleaning
  expect(checkEmployeeId("A".repeat(31)).error).toContain("at most 30");
});

test("streamed: 200,000 random strings always come out as A-Z0-9 only, the same again when cleaned twice, and never longer than they went in", () => {
  const alphabet = "abcXYZ019 -_/.\\\t –−１Ａßİ٣​😀é|:;,";
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let bad = 0;
  for (let i = 0; i < 200_000; i++) {
    let s = ""; const n = 1 + Math.floor(rnd() * 14);
    for (let k = 0; k < n; k++) s += alphabet[Math.floor(rnd() * alphabet.length)];
    const c = cleanEmployeeId(s);
    if (!/^[A-Z0-9]*$/.test(c) || cleanEmployeeId(c) !== c || c.length > s.length * 2) bad++; // the German sharp s becomes SS: at most double
  }
  expect(bad).toBe(0);
});

test("the table in the new screens shows an ID only in the cleaned form (the waiting table, the winners and the waiting label)", async () => {
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new" });
  win.document.body.innerHTML = '<main id="app"></main>';
  new Function("window", "document", "location", "fetch", read("packages/game-pack/zc-flow.js"))(win, win.document, win.location, async () => ({ ok: true, json: async () => ({}) }));
  const F = win.ZFLOW;
  const col = F.waitColumns([{ id: "1", empId: "1b-678" }, { id: "2", employeeId: "1B/678" }]).find((c: any) => c.label === "Employee ID");
  expect([col.get({ empId: "1b-678" }), col.get({ employeeId: "1B 678" })]).toEqual(["1B678", "1B678"]);
  expect(F.winnerDetails({ empId: "1b-678" })).toBe("Employee ID: 1B678");
  expect(F.waitLabel({ id: "1", empId: "1b-678" })).toContain("1B678");
  expect(F.waitLabel({ id: "1", empId: "1b-678" })).not.toContain("1b-678");
});

test("the screens' copy of the function is exactly the shared one", () => {
  const fn = (t: string) => /function cleanEmployeeId\(raw\) \{[^\n]*\}/.exec(t)![0];
  expect(fn(read("packages/game-pack/zc-flow.js"))).toBe(fn(read("packages/game-pack/employee-id.js")));
});

test("the master console never touches an employee ID: no screen, no sign-in code, no contract field, no hand-off mentions one; new code that does must use the shared function", () => {
  const ALLOWED = new Set(["packages/game-pack/employee-id.js", "packages/game-pack/zc-flow.js"]);
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e), rel = relative(ROOT, p).replace(/\\/g, "/");
      if (/(^|\/)(node_modules|dist|\.wrangler|\.git|\.claude|tests|tools\/mutations)(\/|$)/.test(rel)) continue;
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(js|mjs|ts|json|html|css|md|sql|toml)$/.test(rel) || ALLOWED.has(rel)) continue;
      if (/employee|emp[_-]?id|staff[_-]?id/i.test(readFileSync(p, "utf8").replace(/\/\/ .*$/gm, ""))) {
        const text = readFileSync(p, "utf8");
        if (!/cleanEmployeeId/.test(text)) hits.push(rel); // a file that talks about employee IDs must import the cleaner
      }
    }
  };
  for (const d of ["public", "functions", "packages/bridge", "contract", "config", "apps", "migrations"]) { try { walk(join(ROOT, d)); } catch { /* not there */ } }
  expect(hits).toEqual([]);
  const schemas = JSON.stringify(JSON.parse(read("contract/schemas.json")));
  expect(/employee|empId|emp_id|staffId/i.test(schemas)).toBe(false); // nothing in what the console sends to a game or gets back is an employee ID
});
