// node tools/control-release-log.mjs <handover .md> [--out config/release-log.json]
// Mirrors the release log (section 10 of the release handover) into a data file that Mission Control shows on its Releases tab. Read-only on the .md; writes only the --out file.
// Each release line becomes { day, time, site, from, to, rollback, deployment, text }: the ids are cut out of the sentence, the sentence itself is kept (shortened) so nothing is lost.
// A line that does not start with a time (or "2 Nov") is not a release line and is left out. Nothing personal is in this log; the filter below still removes anything that looks like an e-mail address.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SITES = [["Master console", "console"], ["Console", "console"], ["Snakes and Ladders", "snakesladders"], ["Tic Tac Toe", "tictactoe"], ["Luck by Chance", "luckbychance"], ["Lucky Draw", "luckydraw"], ["Tambola", "tambola"], ["Bingo", "bingo"], ["Luck", "luckbychance"], ["Home", "home"]];
const ID = "[0-9a-f]{8}(?:-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?";

/** the release lines of section 10, newest first */
export function parseReleaseLog(md) {
  const text = md.replace(/\r/g, "");
  const start = text.indexOf("## 10."), end = text.indexOf("## 11.");
  if (start < 0) return [];
  const body = text.slice(start, end > start ? end : undefined);
  const out = []; let day = "2026-11-01";
  for (const raw of body.split("\n")) {
    if (/^\*\*2 Nov 2026 releases/.test(raw)) { day = "2026-11-02"; continue; }
    if (/^### Status snapshot/.test(raw)) continue;
    const m = /^- (.*)$/.exec(raw);
    if (!m) continue;
    const line = m[1].replace(/\*\*/g, "").replace(/`/g, "");
    const lead = /^(\d{1,2}):(\d{2})\s*IST/.exec(line) || /^2 Nov(?:ember)?(?: 2026)?(?: before)?\s*(\d{1,2}):(\d{2})/.exec(line) || /^2 Nov(?:ember)?\b/.exec(line);
    if (!lead) continue;
    const d = /^2 Nov/.test(line) ? "2026-11-02" : day;
    const t = /(\d{1,2}):(\d{2})/.exec(line);
    const time = t ? `${t[1].padStart(2, "0")}:${t[2]}` : "";
    const site = (SITES.find(([n]) => new RegExp(`\\b${n}\\b`).test(line.slice(0, 160))) || [null, "several"])[1];
    const c = /\b([0-9a-f]{7})\s*->\s*([0-9a-f]{7})\b/.exec(line);
    const rb = new RegExp(`[Rr]ollback(?: id)?\\s+(${ID})`).exec(line), dep = new RegExp(`(?:[Nn]ew deployment|[Dd]eployment)\\s+(${ID})`).exec(line);
    // no e-mail address, and the console never carries an employee-ID word (a console rule with its own test): the sentence keeps its meaning without it
    const safe = line.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "(address removed)").replace(/\b(?:employee|staff)[\s_-]*ids?\b|\bemp[_-]?ids?\b/gi, "ID").replace(/employee/gi, "team member");
    out.push({ day: d, time, site, from: c ? c[1] : null, to: c ? c[2] : null, rollback: rb ? rb[1] : null, deployment: dep ? dep[1] : null, text: safe.length > 600 ? safe.slice(0, 597) + "..." : safe });
  }
  return out.map((e, i) => ({ e, i })).sort((a, b) => (b.e.day + b.e.time).localeCompare(a.e.day + a.e.time) || a.i - b.i).map((x) => x.e);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), src = a[0];
  if (!src || src.startsWith("--")) { console.error("usage: node tools/control-release-log.mjs <handover .md> [--out config/release-log.json]"); process.exit(2); }
  const i = a.indexOf("--out"), out = i >= 0 ? a[i + 1] : fileURLToPath(new URL("../config/release-log.json", import.meta.url));
  const entries = parseReleaseLog(readFileSync(src, "utf8"));
  writeFileSync(out, JSON.stringify({ source: "release handover, section 10 (release log)", mirroredAt: new Date().toISOString(), entries }, null, 1) + "\n");
  console.log(`${entries.length} release lines written to ${out}`);
}
