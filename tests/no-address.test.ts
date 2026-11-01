// Owner rule 1 Nov 2026: no city, state or street address anywhere in what ships. Only "India".
import { test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const BANNED = new RegExp(["ghazia" + "bad", "uttar" + " ?pra" + "desh", "pin" + " ?code", "noi" + "da\b"].join("|"), "i");
function walk(d: string, out: string[] = []) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (!["node_modules", ".git", "dist", "tests", "docs"].includes(n)) walk(p, out); }
    else if (/\.(js|mjs|ts|html|json|css|md|toml)$/.test(n)) out.push(p);
  }
  return out;
}
test("no city, state or address words in any shipped file", () => {
  const hits = walk(root).filter((f) => BANNED.test(readFileSync(f, "utf8")));
  expect(hits).toEqual([]);
});
