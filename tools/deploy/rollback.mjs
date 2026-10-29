// node tools/deploy/rollback.mjs --config <a COPY of a game's settings file (wrangler.toml or a .json/.vars file)> [--write]
// Switches the console bridge of ONE game off again: the plain setting CONSOLE_PUBKEYS becomes empty, so every /api/console/* address of that game answers its ordinary 404.
// Dry run by default: it prints what would change and touches nothing. With --write it writes the result to "<file>.rolled-back" (never in place).
// It deploys nothing and talks to no server. After this, the owner redeploys the game's previous build (the runbook says how) and runs the Verify line of the step.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const LINE = /^(\s*"?CONSOLE_PUBKEYS"?\s*[=:]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*')(\s*,?\s*(?:[#;].*)?)$/m;

/** returns { text, changed, found }: found = the setting exists in the file; changed = it had a value that is now empty */
export function unsetPubkeys(text) {
  const m = LINE.exec(text);
  if (!m) return { text, changed: false, found: false };
  const was = /["']([^"']*)["']/.exec(m[0].slice(m[1].length))[1];
  const q = m[0].includes("'") && !m[0].includes('"') ? "''" : '""';
  return { text: text.replace(LINE, (_all, a, b) => a + q + b), changed: was !== "", found: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), get = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; };
  const file = get("--config");
  if (!file) { console.error("usage: node tools/deploy/rollback.mjs --config <copy of the game's settings file> [--write]"); process.exit(2); }
  const r = unsetPubkeys(readFileSync(file, "utf8"));
  if (!r.found) { console.log("CONSOLE_PUBKEYS is not set in this file: the bridge is already dark here. Check the setting in the Cloudflare dashboard too."); process.exit(1); }
  console.log(r.changed ? "CONSOLE_PUBKEYS will be emptied (the bridge goes dark)." : "CONSOLE_PUBKEYS is already empty.");
  if (a.includes("--write")) { writeFileSync(file + ".rolled-back", r.text); console.log("written: " + file + ".rolled-back (a copy; the original is untouched)"); }
  else console.log("dry run: nothing written. Add --write to write the copy.");
  console.log("Then: redeploy the game's PREVIOUS build, and check that /api/console/capabilities answers 404.");
}
