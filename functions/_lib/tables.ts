// Where the console keeps its sign-in tables. By default they have their own names in their own database.
// If the Cloudflare account has no free database left, the same four tables can live inside an EXISTING database under a prefix
// (TABLE_PREFIX = "con_" gives con_console_email, con_login_code, con_session, con_rate). One setting, no other change.
import type { D1 } from "../../packages/bridge/src/d1";

export const TABLES = ["console_email", "login_code", "session", "rate"] as const;
/** a prefix is lower-case letters, digits and underscores only, starting with a letter (it is put into SQL text, so nothing else is allowed) */
export const PREFIX_RE = /^[a-z][a-z0-9_]{0,15}$/;

export function checkPrefix(prefix: string | undefined): string {
  const p = (prefix ?? "").trim();
  if (p === "") return "";
  if (!PREFIX_RE.test(p)) throw new Error("TABLE_PREFIX must be 1 to 16 lower-case letters, digits or _, starting with a letter");
  return p;
}

const NAMES = TABLES.join("|");
const TABLE_REF = new RegExp(`\\b(FROM|INTO|UPDATE|JOIN|TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?|ON)(\\s+)(${NAMES})\\b`, "gi");
const QUALIFIED = new RegExp(`\\b(${NAMES})\\.(?=[a-z_])`, "gi");
const INDEX_DEF = /\b(CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+))([a-z_]+)/gi;

/** the same SQL with every console table (and index) name carrying the prefix; "" leaves the SQL untouched */
export function prefixSql(sql: string, prefix: string): string {
  const p = checkPrefix(prefix);
  if (!p) return sql;
  return sql.replace(INDEX_DEF, (_m, a, name) => a + p + name).replace(TABLE_REF, (_m, kw, sp, name) => kw + sp + p + name).replace(QUALIFIED, (_m, name) => p + name + ".");
}

/** the database as the console code must use it: every statement is rewritten for the prefix. Throws at once on a bad prefix. */
export function tables(env: { DB: D1; TABLE_PREFIX?: string }): D1 {
  const p = checkPrefix(env.TABLE_PREFIX);
  if (!p) return env.DB;
  return { prepare: (sql: string) => env.DB.prepare(prefixSql(sql, p)), batch: (s) => env.DB.batch(s) };
}
