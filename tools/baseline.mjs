// node tools/baseline.mjs [--repos tambola,bingo,...] [--out docs/BASELINES.json]
// Records how many tests pass and fail in each game repo BEFORE any console work, so old failures are never blamed on new work.
// Each repo's LAST COMMIT is copied to a temp folder (other sessions keep editing the working trees), then `bun test` runs there under the shared heavy lock, one repo at a time.
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { cleanCopy, GIT } from "./cleancopy.mjs";
import { takeLock, dropLock, freeMb, killTree, DEFAULT_LOCK } from "./heavy-run.mjs";

const ARGS = { tambola: ["packages", "apps", "tools/control-worker"], bingo: ["packages", "apps"], tictactoe: ["packages", "apps"], snakesladders: ["packages", "apps"], luckbychance: ["packages", "apps"] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function parseBunSummary(text) {
  const n = (re) => { const m = re.exec(text); return m ? Number(m[1]) : null; };
  return { pass: n(/^\s*(\d+) pass\s*$/m), fail: n(/^\s*(\d+) fail\s*$/m), skip: n(/^\s*(\d+) skip\s*$/m) ?? 0, files: n(/across (\d+) files?/), failures: [...text.matchAll(/^\(fail\) (.+?)(?: \[[\d.]+ms\])?$/gm)].map((m) => m[1]).slice(0, 40) };
}

async function runOne(root, repo, o) {
  const src = join(root, repo);
  const commit = execFileSync(GIT, ["-C", src, "rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim();
  const branch = execFileSync(GIT, ["-C", src, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = execFileSync(GIT, ["-C", src, "status", "--porcelain"], { encoding: "utf8" }).split("\n").filter(Boolean).length;
  const t0 = Date.now();
  // wait for the lock and enough RAM (never remove someone else's lock)
  while (true) {
    const l = takeLock(o.lock);
    if (l.ok) { if (freeMb() >= o.minFreeMb) break; dropLock(o.lock); }
    if (Date.now() - t0 > o.waitMin * 60_000) return { repo, commit, branch, status: "gave up waiting for the heavy lock or RAM" };
    await sleep(15_000);
  }
  const tmp = mkdtempSync(join(tmpdir(), "bl-"));
  try {
    const dir = cleanCopy(src, tmp);
    const started = Date.now();
    const out = await new Promise((resolve_) => {
      let buf = "";
      const c = spawn("bun", ["test", ...ARGS[repo], "--timeout", "120000"], { cwd: dir, windowsHide: true, env: { ...process.env, CI: "1", FORCE_COLOR: "0" } });
      const to = setTimeout(() => { killTree(c.pid); }, o.timeoutMin * 60_000);
      const take = (d) => { buf += d; if (buf.length > 8_000_000) buf = buf.slice(-4_000_000); };
      c.stdout.on("data", take); c.stderr.on("data", take);
      c.on("exit", (code) => { clearTimeout(to); killTree(c.pid); resolve_({ code, buf }); });
      c.on("error", () => { clearTimeout(to); resolve_({ code: 127, buf }); });
    });
    return { repo, commit, branch, dirtyFilesInWorkingTree: dirty, exit: out.code, minutes: Math.round((Date.now() - started) / 6000) / 10, ...parseBunSummary(out.buf), recordedAtNote: "clean copy of the last commit" };
  } finally { try { rmSync(tmp, { recursive: true, force: true, maxRetries: 3 }); } catch { /* temp */ } dropLock(o.lock); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), get = (n, d) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : d; };
  const repos = (get("--repos", Object.keys(ARGS).join(","))).split(",");
  const out = resolve(get("--out", "docs/BASELINES.json"));
  const results = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {};
  for (const r of repos) {
    console.log("baseline " + r + " ...");
    results[r] = await runOne(get("--root", "C:/ct/test-sites"), r, { lock: DEFAULT_LOCK, minFreeMb: Number(get("--min-free-mb", 900)), waitMin: Number(get("--wait-min", 240)), timeoutMin: Number(get("--timeout-min", 30)) });
    writeFileSync(out, JSON.stringify(results, null, 1));
    console.log(JSON.stringify(results[r]));
  }
}
