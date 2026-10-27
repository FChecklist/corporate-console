// Test stand-in for Cloudflare D1 (same prepare / bind / run / all / first / batch shape), backed by bun:sqlite. Loads the migration files you name.
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import type { D1, D1Stmt } from "../../packages/bridge/src/d1";

export function makeD1(migrations: string[] = ["migrations/0001_console.sql"]): { db: D1; raw: Database } {
  const raw = new Database(":memory:");
  for (const m of migrations) raw.exec(readFileSync(new URL("../../" + m, import.meta.url), "utf8"));
  const stmt = (sql: string, vals: unknown[] = []): D1Stmt => ({
    bind: (...v) => stmt(sql, v),
    run: async () => { const r = raw.query(sql).run(...(vals as any[])); return { meta: { changes: r.changes } }; },
    all: async () => ({ results: raw.query(sql).all(...(vals as any[])) as any[] }),
    first: async () => (raw.query(sql).get(...(vals as any[])) as any) ?? null,
  });
  return { db: { prepare: (s) => stmt(s), batch: async (xs) => Promise.all(xs.map((x) => x.run())) }, raw };
}
