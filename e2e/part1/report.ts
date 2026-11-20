// bun e2e/part1/report.ts   -> writes e2e/part1/RESULTS.md from the last runs (e2e/part1/.results/*.jsonl) plus the hand-written notes in e2e/part1/findings.md
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = new URL(".", import.meta.url).pathname, rdir = join(dir, ".results");
type Row = { step: number; perm: string; name: string; status: "pass" | "fail" | "blocked" | "skipped-live"; why: string; at: string };
const load = (f: string): Row[] => (existsSync(join(rdir, f)) ? readFileSync(join(rdir, f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
// the LAST result of each (step, perm, name) wins, so a re-run replaces an older one
const latest = (rows: Row[]) => [...new Map(rows.map((r) => [r.step + "|" + r.perm + "|" + r.name, r])).values()];
const local = latest(load("local.jsonl")), live = latest(load("live.jsonl"));

const STEPS: Record<number, string> = { 1: "First-time landing (home + console)", 2: "Console login", 3: "Repeat visit", 4: "Auto login / session", 5: "Create game", 6: "Manage", 7: "Edit", 8: "Date", 9: "Options", 10: "Upload IDs", 11: "Publish link", 12: "Moneypenny credit", 13: "Payment", 14: "Payment confirmation", 15: "Start", 16: "Play (all 4 start formats)", 17: "Complete", 18: "E-mails after each step", 19: "Data to organizer", 20: "Deletion within 24 h" };
const PERMS = ["new", "returning", "desktop", "mobile", "slow", "refresh", "back", "expired", "dblclick", "wrong", "badids", "fmt"];
const has = (p: string, key: string) => (key === "fmt" ? p.startsWith("fmt:") : key === "new" ? p.startsWith("new") : key === "returning" ? p.startsWith("returning") : key === "badids" ? p.startsWith("badids") : p === key || p.split("+").includes(key));
const cell = (rows: Row[]) => {
  if (!rows.length) return "-";
  const f = rows.filter((r) => r.status === "fail").length, p = rows.filter((r) => r.status === "pass").length, b = rows.filter((r) => r.status === "blocked").length;
  if (f) return `FAIL ${f}/${rows.length - b || rows.length}`;
  if (p) return b ? `pass ${p} (+${b} blocked)` : `pass ${p}`;
  return b ? "blocked" : "-";
};

const out: string[] = [];
out.push("# Part 1 results: organizer journey, local build\n");
const n = (s: string) => local.filter((r) => r.status === s).length;
out.push(`Run of ${new Date(Math.max(...local.map((r) => +new Date(r.at)), 0) || Date.now()).toISOString()} against the **local build of this repository** (console + real sign-in service + fake games + test mailbox + payment stand-in). Scenarios: **${local.length}** = ${n("pass")} pass, ${n("fail")} fail, ${n("blocked")} blocked (cannot be tested from this repository, reason given).\n`);
out.push("Legend: `pass N` = N scenarios passed; `FAIL a/b` = a of b failed; `(+k blocked)` = k scenarios in that cell cannot run here; `-` = no scenario for that combination.\n");
out.push("## Step x permutation table\n");
out.push("| # | Step | " + PERMS.join(" | ") + " |"); out.push("|---|---|" + PERMS.map(() => "---").join("|") + "|");
for (const s of Object.keys(STEPS).map(Number)) {
  const rows = local.filter((r) => r.step === s);
  out.push(`| ${s} | ${STEPS[s]} | ` + PERMS.map((p) => cell(rows.filter((r) => has(r.perm, p)))).join(" | ") + " |");
}
out.push("\nPermutation words: new = first-time organizer (no account, no games), returning = organizer who has signed in before and has games; desktop 1280x800, mobile 390x844 touch; slow = 400 ms delay and 400 kbit/s; refresh = page reloaded mid-step; back = browser Back/Forward; expired = session or code that has run out; dblclick = double click; wrong = wrong or hostile input, game down, bad data; badids = ID list with bad rows; fmt = the four start formats.\n");

const fails = local.filter((r) => r.status === "fail");
out.push("## Failures in the last run\n");
if (!fails.length) out.push("None. (Failures found earlier and fixed are listed under Findings.)\n");
else { out.push("| Step | Permutation | Scenario | Why |", "|---|---|---|---|"); for (const r of fails) out.push(`| ${r.step} | ${r.perm} | ${r.name.replace(/\|/g, "/")} | ${r.why.replace(/\|/g, "/")} |`); out.push(""); }

out.push("## Blocked (cannot be tested from this repository)\n", "| Step | Permutation | What | Why |", "|---|---|---|---|");
for (const r of local.filter((x) => x.status === "blocked").sort((a, b) => a.step - b.step)) out.push(`| ${r.step} | ${r.perm} | ${r.name} | ${r.why} |`);
out.push("");

if (live.length) {
  out.push("## Live run (read-only scenarios only)\n", "| Step | Permutation | Scenario | Result | Note |", "|---|---|---|---|---|");
  for (const r of live.sort((a, b) => a.step - b.step)) out.push(`| ${r.step} | ${r.perm} | ${r.name.replace(/\|/g, "/")} | ${r.status} | ${r.why.replace(/\|/g, "/")} |`);
  out.push("");
} else out.push("## Live run\n\nNot run yet. See `e2e/README.md` for how (read-only steps only; anything that signs in, creates or pays is skipped and flagged `skipped-live`).\n");

const notes = join(dir, "findings.md");
if (existsSync(notes)) out.push(readFileSync(notes, "utf8").trim() + "\n");
writeFileSync(join(dir, "RESULTS.md"), out.join("\n"));
console.log("wrote RESULTS.md: " + local.length + " local scenarios, " + live.length + " live");
