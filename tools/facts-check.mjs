// node tools/facts-check.mjs [--root C:/ct/test-sites] [--repos tambola,bingo,...]
// W1: every symbol the build plan relies on must really exist in the game repos (the plan once cited things that were not there).
// Each fact says: in which file (relative to a game repo) a pattern must be PRESENT (or ABSENT). Line numbers are not checked because live code moves; the file and the symbol are.
// Exit code 1 when a fact is missing. Reads files only.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const GAMES = ["tambola", "bingo", "tictactoe", "snakesladders", "luckbychance"];
const all = GAMES;
/** present: the regex must match in the file in every repo of 'repos'. absent: it must NOT match. note: where the plan was wrong */
export const FACTS = [
  { id: "authOfKey", file: "apps/edge/src/worker.ts", re: /async function authOfKey\(/, repos: all },
  { id: "can", file: "apps/edge/src/worker.ts", re: /const can = \(a/, repos: all },
  { id: "mayPay", file: "apps/edge/src/worker.ts", re: /const mayPay = \(a/, repos: all },
  { id: "signInResult", file: "apps/edge/src/worker.ts", re: /async function signInResult\(/, repos: all },
  { id: "history route", file: "apps/edge/src/worker.ts", re: /\/api\/history/, repos: all },
  { id: "CORS const", file: "apps/edge/src/worker.ts", re: /const CORS = \{/, repos: all, note: "one constant per game; the plan's lines 359/425 are wrong" },
  { id: "x-console not yet allowed by CORS", file: "apps/edge/src/worker.ts", re: /x-console/, repos: all, absent: true, note: "flips when the bridge adds the header (W11)" },
  { id: "hostForEmail LIMIT 1", file: "apps/edge/src/hostsetup.ts", re: /ORDER BY l\.created_ms DESC LIMIT 1/, repos: all },
  { id: "emailHashOf", file: "apps/edge/src/hostsetup.ts", re: /emailHashOf = \(email[^)]*\) => sha\(["']email\|["'] \+ email\.trim\(\)\.toLowerCase\(\)\)/, repos: all },
  { id: "host_login", file: "apps/edge/src/hostsetup.ts", re: /host_login/, repos: all },
  { id: "FREE_CAP / MAX_DRAFTS", file: "apps/edge/src/pay.ts", re: /FREE_CAP = 100, MAX_DRAFTS = 10/, repos: all },
  { id: "freeLaunch", file: "apps/edge/src/pay.ts", re: /FREE_LAUNCH/, repos: all },
  { id: "PACKS", file: "packages/shared/src/pricing.ts", re: /export const PACKS/, repos: all },
  { id: "PAY_HOP_URL", file: "pages/wrangler.toml", re: /PAY_HOP_URL/, repos: all },
  { id: "erasePersonal", file: "apps/edge/src/lifecycle.ts", re: /export async function erasePersonal\(/, repos: all },
  { id: "PURGE_AFTER_MS 20 h", file: "apps/edge/src/lifecycle.ts", re: /PURGE_AFTER_MS = 20 \* 3_600_000/, repos: ["tambola", "bingo", "tictactoe", "snakesladders"] },
  { id: "Luck still on 23 h", file: "apps/edge/src/lifecycle.ts", re: /PURGE_AFTER_MS = 23/, repos: ["luckbychance"], note: "Luck has not had the 20 h clock yet" },
  { id: "organizerLookup", file: "apps/edge/src/admin.ts", re: /organizerLookup/, repos: all },
  { id: "paylink route", file: "apps/edge/src/worker.ts", re: /\/paylink/, repos: all },
  { id: "invoice route", file: "apps/edge/src/pay.ts", re: /\/api\/invoice\//, repos: all },
  { id: "fulfil lease", file: "apps/edge/src/pay.ts", re: /async function fulfilInner\(|fulfilInner = async/, repos: ["tambola", "bingo", "tictactoe", "snakesladders"] },
  { id: "Luck has no fulfil lease", file: "apps/edge/src/pay.ts", re: /fulfilInner/, repos: ["luckbychance"], absent: true, note: "billing study: Luck lacks the 2-minute lease" },
  { id: "creditExpiryMs", file: "apps/edge/src/credit.ts", re: /creditExpiryMs/, repos: all },
  { id: "cancelGame", file: "apps/edge/src/cancel.ts", re: /cancelGame/, repos: all },
  { id: "ledgerc txnIdOf", file: "apps/edge/src/ledgerc.ts", re: /txnIdOf/, repos: all },
  { id: "FREE_GAME_CAP only in tictactoe", file: "apps/edge/src/pay.ts", re: /FREE_GAME_CAP = 10/, repos: ["tictactoe"] },
  { id: "no FREE_GAME_CAP elsewhere", file: "apps/edge/src/pay.ts", re: /FREE_GAME_CAP/, repos: ["tambola", "bingo", "snakesladders", "luckbychance"], absent: true },
  { id: "DEMO_CAP = 10 (Tambola, Bingo)", file: "packages/beacon/src/config.ts", re: /export const DEMO_CAP = 10/, repos: ["tambola", "bingo"], note: "a Rs 0 game for 10 people already exists there" },
  { id: "draft count ignores cancelled", file: "apps/edge/src/clone.ts", re: /pack=0 AND NOT EXISTS/, repos: ["tambola", "bingo", "tictactoe", "snakesladders"], note: "the cancelled-draft trap (W18)" },
  { id: "Luck draft count also counts published-but-unpaid games", file: "apps/edge/src/clone.ts", re: /AND pack=0"/, repos: ["luckbychance"], note: "Luck lacks the Bingo 1.3.2 fix as well" },
  { id: "releases.json (owner only)", file: "apps/edge/src/releases.json", re: /"version"/, repos: ["tambola", "bingo", "tictactoe", "snakesladders"] },
  { id: "Luck has no releases.json", file: "apps/edge/src/releases.json", re: /./, repos: ["luckbychance"], absent: true },
  { id: "version stamp", file: "pages/version.mjs", re: /versionStamp/, repos: all },
  { id: "X-Frame-Options DENY in build", file: "pages/build.mjs", re: /X-Frame-Options: DENY/, repos: all },
  { id: "no game_role yet", file: "apps/edge/src/worker.ts", re: /game_role/, repos: all, absent: true, note: "flips in W11/W24/W26/W28/W30" },
  { id: "no CONSOLE_PUBKEYS yet", file: "apps/edge/src/worker.ts", re: /CONSOLE_PUBKEYS/, repos: all, absent: true, note: "flips in W11/W24/W26/W28/W30" },
  { id: "TTT tournament states", file: "apps/edge/src/tournament.ts", re: /'open' \| 'starting' \| 'running' \| 'done'|"open" \| "starting" \| "running" \| "done"/, repos: ["tictactoe"] },
  { id: "Snakes game types", file: "packages/beacon/src/config.ts", re: /GAME_FIELDS/, repos: ["snakesladders"] },
  { id: "Luck press windows 6/10/15", file: "packages/luck/src/settings.ts", re: /WINDOWS = \[6, 10, 15\]/, repos: ["luckbychance"] },
];

/** returns [{ id, repo, ok, detail }] */
export function checkFacts(root = "C:/ct/test-sites", facts = FACTS, only = null) {
  const out = [];
  for (const f of facts) for (const repo of f.repos) {
    if (only && !only.includes(repo)) continue;
    const p = join(root, repo, f.file);
    const exists = existsSync(p);
    if (!exists) { const ok = !!f.absent; out.push({ id: f.id, repo, ok, detail: ok ? "" : `file ${f.file} is missing` }); continue; }
    const hit = f.re.test(readFileSync(p, "utf8"));
    const ok = f.absent ? !hit : hit;
    out.push({ id: f.id, repo, ok, detail: ok ? "" : f.absent ? `found, but the plan says it is absent (${f.note || ""})` : `pattern ${f.re} not found in ${f.file}` });
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), get = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; };
  const res = checkFacts(get("--root") || "C:/ct/test-sites", FACTS, get("--repos") ? get("--repos").split(",") : null);
  const bad = res.filter((r) => !r.ok);
  for (const b of bad) console.log(`MISSING ${b.repo}: ${b.id} - ${b.detail}`);
  console.log(`${res.length - bad.length} of ${res.length} facts confirmed`);
  process.exit(bad.length ? 1 : 0);
}
