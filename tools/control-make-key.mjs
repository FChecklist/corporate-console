// node tools/control-make-key.mjs [--out <file>] [--rotate]
// Makes the AI read key of Mission Control (AI_CONTROL_KEY): 48 random hex characters, written as one line `AI_CONTROL_KEY=<key>` into a local secrets file (default C:/ct/tambola/config/mission-control-keys.txt,
// the same style as live-secrets.txt, so `python C:\ct\games-ops\putsecret.py corporate-console AI_CONTROL_KEY env:<file>:AI_CONTROL_KEY` can set it as the console's Pages secret).
// The key is NEVER printed. An existing key is kept unless --rotate is given. The file must stay out of every repository.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

export const DEFAULT_OUT = "C:/ct/tambola/config/mission-control-keys.txt";

/** returns { made, length }; never returns or prints the key itself */
export function makeKey(out = DEFAULT_OUT, rotate = false) {
  if (existsSync(out) && !rotate && /^AI_CONTROL_KEY=\S{24,}/m.test(readFileSync(out, "utf8"))) return { made: false, length: (readFileSync(out, "utf8").match(/^AI_CONTROL_KEY=(\S+)/m) || [])[1].length };
  const key = randomBytes(24).toString("hex");
  writeFileSync(out, `AI_CONTROL_KEY=${key}\n`, { flag: "w" });
  return { made: true, length: key.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), i = a.indexOf("--out"), out = i >= 0 ? a[i + 1] : DEFAULT_OUT;
  const r = makeKey(out, a.includes("--rotate"));
  console.log(r.made ? `new key written to ${out} (${r.length} characters; not shown)` : `a key already exists in ${out} (${r.length} characters; kept; use --rotate to replace it)`);
}
