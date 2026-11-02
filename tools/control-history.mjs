// node tools/control-history.mjs --who ai|owner --site <game|home|console|payments|all> --what "<what was done>" --result "<what happened>" [--ref <commit or deployment id>] [--at <ISO time>]
//        [--sqlite <file> | --remote] [--dry-run]
// Adds ONE line to the append-only history table of Mission Control (migration 0005): time, who (owner or ai), site, what, result, an optional id. It is the only way a line is written in step 1;
// Mission Control itself has no write address. Without --sqlite or --remote it only PRINTS the statement (same as --dry-run), so nothing is written by accident.
//   --sqlite <file>  writes into a local database file that already has the table (for tests and rehearsals)
//   --remote         writes into the console's live D1 database (corporate-games-master-console) through wrangler; use it only when the boss or the owner has said go
// A line says what was done to the sites. It never holds a person's details: text with an e-mail address or a run of 9 or more digits is refused.
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const SITE = /^[a-z0-9_-]{1,40}$/, REF = /^[A-Za-z0-9._:-]{1,80}$/;

/** { ok, errors, row } for the given options; `now` is a number of milliseconds */
export function buildRow(o, now = Date.now()) {
  const errors = [];
  const who = String(o.who ?? ""), site = String(o.site ?? ""), what = String(o.what ?? "").trim(), result = String(o.result ?? "").trim(), ref = o.ref == null || o.ref === "" ? null : String(o.ref);
  if (who !== "owner" && who !== "ai") errors.push("--who must be owner or ai");
  if (!SITE.test(site)) errors.push("--site must be a short lower-case name such as bingo, home, console or all");
  for (const [name, v] of [["--what", what], ["--result", result]]) {
    if (v.length < 1 || v.length > 500) errors.push(`${name} must be 1 to 500 characters`);
    if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(v) || /\d{9,}/.test(v)) errors.push(`${name} looks like it holds a person's details (an e-mail address or a long number); leave those out`);
  }
  if (ref !== null && !REF.test(ref)) errors.push("--ref may hold only letters, digits and . _ : - (up to 80)");
  let at = now;
  if (o.at != null && o.at !== "") { at = Date.parse(String(o.at)); if (!Number.isFinite(at)) errors.push("--at is not a time"); }
  return { ok: errors.length === 0, errors, row: { at_ms: at, who, site, what, result, ref } };
}

const lit = (v) => (v === null ? "NULL" : typeof v === "number" ? String(Math.trunc(v)) : "'" + String(v).replace(/'/g, "''") + "'");
/** the INSERT statement for a checked row (every value is quoted; the row has already passed buildRow) */
export const insertSql = (r) => `INSERT INTO control_history(at_ms,who,site,what,result,ref) VALUES(${lit(r.at_ms)},${lit(r.who)},${lit(r.site)},${lit(r.what)},${lit(r.result)},${lit(r.ref)});`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), get = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
  const b = buildRow({ who: get("--who"), site: get("--site"), what: get("--what"), result: get("--result"), ref: get("--ref"), at: get("--at") });
  if (!b.ok) { console.error("Not written:\n- " + b.errors.join("\n- ")); process.exit(2); }
  const sql = insertSql(b.row);
  if (a.includes("--dry-run") || (!get("--sqlite") && !a.includes("--remote"))) { console.log(sql); console.log("(printed only; add --sqlite <file> or --remote to write it)"); process.exit(0); }
  if (get("--sqlite")) {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(get("--sqlite"));
    try { db.exec(sql); console.log("written to " + get("--sqlite")); } finally { db.close(); }
  } else {
    const wr = process.env.WRANGLER_JS || "C:/ct/tools/wrangler3/node_modules/wrangler/bin/wrangler.js";
    const r = spawnSync(process.execPath, [wr, "d1", "execute", "corporate-games-master-console", "--remote", "--command", sql], { stdio: "inherit", env: process.env });
    process.exit(r.status ?? 1);
  }
}
