// FALSIFIED BY: contract-doc-code-missing
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";

const doc = readFileSync(new URL("../docs/CONTRACT_V1.md", import.meta.url), "utf8");
const schemas = JSON.parse(readFileSync(new URL("../contract/schemas.json", import.meta.url), "utf8"));
const fixtures = JSON.parse(readFileSync(new URL("../contract/fixtures.json", import.meta.url), "utf8"));

test("every route used by a fixture is described in the contract document", () => {
  const paths = new Set(fixtures.map((f: any) => f.route.split(" ")[1].split("?")[0].replace(/\/api\/z\/[A-Z0-9]+\//, "/api/z/{id}/")));
  for (const p of paths) expect([p, doc.includes(p as string)]).toEqual([p, true]);
});

test("every error code and every status word of the schema is in the document", () => {
  for (const c of schemas.$defs.Error.properties.error.enum) expect([c, doc.includes("`" + c + "`")]).toEqual([c, true]);
  for (const s of schemas.$defs.Status.enum) expect([s, doc.includes("`" + s + "`")]).toEqual([s, true]);
  for (const k of schemas.$defs.LogRow.properties.kind.enum) expect([k, doc.includes("`" + k + "`")]).toEqual([k, true]);
});

test("the version file matches the document title and the fixtures count is stated right", () => {
  expect(readFileSync(new URL("../contract/VERSION", import.meta.url), "utf8").trim()).toBe("1");
  expect(doc).toContain("# Console contract v1");
  expect(doc).toContain(`${fixtures.length} golden cases`);
});
