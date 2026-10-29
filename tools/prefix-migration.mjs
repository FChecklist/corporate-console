// bun tools/prefix-migration.mjs <prefix>     prints migrations/0001_console.sql with every table and index name carrying the prefix.
// Use it ONLY when the console's sign-in tables go into an existing database (set the same TABLE_PREFIX in wrangler.toml and in apps/cron/wrangler.toml).
// Prints SQL text; it creates nothing and talks to no database.
import { readFileSync } from "node:fs";
import { prefixSql, checkPrefix } from "../functions/_lib/tables.ts";

const prefix = checkPrefix(process.argv[2]);
if (!prefix) { console.error("usage: bun tools/prefix-migration.mjs <prefix>   (for example con_)"); process.exit(2); }
process.stdout.write(prefixSql(readFileSync(new URL("../migrations/0001_console.sql", import.meta.url), "utf8"), prefix));
