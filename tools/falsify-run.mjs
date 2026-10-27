// node tools/falsify-run.mjs --store tools/mutations (--id <mutation id> ... | --all) [--json out.json] [--timeout-min 5]
// node tools/falsify-run.mjs --lint-tests <dir> --store tools/mutations      (every test file must start with 'FALSIFIED BY: <mutation id>' and that id must exist)
//
// A test is only worth something if it goes RED when the code is broken. For each stored mutation this tool:
//   1. takes a clean copy of the repo's last commit into a temp folder (git archive; nothing is written into the repo, node_modules are linked, not copied),
//   2. runs the ONE named test file on the clean copy: it must be GREEN (otherwise 'baseline red': the proof means nothing),
//   3. applies the mutation (exact text swap, the text must occur exactly once) and runs the same file again: it must be RED = 'caught'; GREEN = 'mutation not caught',
//   4. proves the real working tree is untouched (git status and the mutated file's hash are the same before and after).
// A mutation file (tools/mutations/<id>.json): { id, repo (relative to --root, default the current folder), file, find, replace, test, cmd? (default ["bun","test","{file}"]), note? }
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync, existsSync, statSync, symlinkSync, mkdirSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { killTree } from "./heavy-run.mjs";

const GIT = existsSync("C:/Program Files/Git/mingw64/bin/git.exe") ? "C:/Program Files/Git/mingw64/bin/git.exe" : "git";
const git = (repo, args, o = {}) => execFileSync(GIT, ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 1 << 28, ...o });
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

export function loadMutations(store) {
  const out = {};
  for (const f of readdirSync(store)) if (f.endsWith(".json")) { const m = JSON.parse(readFileSync(join(store, f), "utf8")); if (!m.id) m.id = f.replace(/\.json$/, ""); out[m.id] = m; }
  return out;
}

/** snapshot that must be identical before and after a run */
function snapshot(repo, file) {
  return { head: git(repo, ["rev-parse", "HEAD"]).trim(), status: git(repo, ["status", "--porcelain"]), fileHash: existsSync(join(repo, file)) ? sha(join(repo, file)) : "(absent)" };
}

function findNodeModules(root, depth = 0, acc = []) {
  if (depth > 3) return acc;
  for (const name of readdirSync(root)) {
    if (name === ".git") continue;
    const p = join(root, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (!st.isDirectory()) continue;
    if (name === "node_modules") acc.push(p); else findNodeModules(p, depth + 1, acc);
  }
  return acc;
}

function runCmd(cmd, cwd, timeoutMs) {
  return new Promise((resolve) => {
    let out = "", timedOut = false;
    const c = spawn(cmd[0], cmd.slice(1), { cwd, shell: false, windowsHide: true, env: { ...process.env, FORCE_COLOR: "0", CI: "1" } });
    const t = setTimeout(() => { timedOut = true; killTree(c.pid); }, timeoutMs);
    const take = (d) => { out += d; if (out.length > 60000) out = out.slice(-30000); };
    c.stdout.on("data", take); c.stderr.on("data", take);
    c.on("error", () => { clearTimeout(t); resolve({ code: 127, out, timedOut }); });
    c.on("exit", (code) => { clearTimeout(t); killTree(c.pid); resolve({ code: code === null ? 1 : code, out, timedOut }); });
  });
}

export async function runMutation(m, o = {}) {
  const repo = resolve(o.root || ".", m.repo), timeoutMs = (o.timeoutMin ?? 5) * 60_000;
  const res = { id: m.id, test: m.test, file: m.file, status: "", detail: "" };
  const before = snapshot(repo, m.file);
  const tmp = mkdtempSync(join(tmpdir(), "falsify-"));
  try {
    // 1. a clean copy of the last commit (tar extraction; the repo itself is only read)
    const tar = join(tmp, "src.tar");
    execFileSync(GIT, ["-C", repo, "archive", "--format=tar", "-o", tar, "HEAD"]);
    const dir = join(tmp, "copy"); mkdirSync(dir);
    execFileSync("tar", ["-xf", "src.tar", "-C", "copy"], { cwd: tmp }); // relative names: GNU tar reads "C:" as a host name
    for (const nm of findNodeModules(repo)) { const rel = relative(repo, nm); const dest = join(dir, rel); mkdirSync(dirname(dest), { recursive: true }); try { symlinkSync(nm, dest, "junction"); } catch { /* best effort */ } }
    const cmd = (m.cmd || ["bun", "test", "{file}"]).map((x) => x.replace("{file}", m.test));
    // 2. baseline must be green
    const base = await runCmd(cmd, dir, timeoutMs);
    if (base.code !== 0) { res.status = "baseline red"; res.detail = `the test is not green on the clean copy (exit ${base.code}); ${base.out.slice(-600)}`; return res; }
    // 3. apply the mutation
    const target = join(dir, m.file);
    if (!existsSync(target)) { res.status = "mutation not applicable"; res.detail = `file ${m.file} is not in the last commit`; return res; }
    const src = readFileSync(target, "utf8");
    const n = m.find === "" ? 0 : src.split(m.find).length - 1;
    if (n !== 1) { res.status = "mutation not applicable"; res.detail = `the text to change occurs ${n} times in ${m.file} (must be exactly 1)`; return res; }
    writeFileSync(target, src.replace(m.find, () => m.replace));
    const mut = await runCmd(cmd, dir, timeoutMs);
    if (mut.code === 0) { res.status = "mutation not caught"; res.detail = "the test stayed GREEN with the code broken: it proves nothing about this change"; }
    else { res.status = "caught"; res.detail = `went RED (exit ${mut.code}${mut.timedOut ? ", timed out" : ""})`; res.redTail = mut.out.slice(-400); }
    return res;
  } finally {
    try { rmSync(tmp, { recursive: true, force: true, maxRetries: 3 }); } catch { /* temp is not important */ }
    const after = snapshot(repo, m.file);
    res.treeUntouched = JSON.stringify(before) === JSON.stringify(after);
    if (!res.treeUntouched) { res.status = "TREE CHANGED"; res.detail = "the working tree differs after the run: something else is editing it, or this tool is broken"; }
  }
}

/** every test file in dir must name a mutation that exists */
export function lintTests(dir, store) {
  const muts = loadMutations(store), problems = [], seen = [];
  const walk = (d) => { for (const n of readdirSync(d)) { if (n === "node_modules" || n.startsWith(".")) continue; const p = join(d, n); const st = statSync(p); if (st.isDirectory()) walk(p); else if (/\.(test|spec)\.(ts|mjs|js)$/.test(n)) seen.push(p); } };
  walk(dir);
  for (const f of seen) {
    const head = readFileSync(f, "utf8").split(/\r?\n/).slice(0, 3).join("\n");
    const m = head.match(/FALSIFIED BY:\s*([A-Za-z0-9_.\-, ]+)/);
    if (!m) { problems.push(`${f}: first lines do not say 'FALSIFIED BY: <mutation id>'`); continue; }
    for (const id of m[1].split(",").map((s) => s.trim()).filter(Boolean)) if (!muts[id]) problems.push(`${f}: mutation '${id}' is not in the store`);
  }
  return { files: seen.length, problems };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2);
  const get = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; };
  const many = (n) => a.flatMap((x, i) => (x === n ? [a[i + 1]] : []));
  const store = resolve(get("--store") || "tools/mutations");
  if (get("--lint-tests")) {
    const r = lintTests(resolve(get("--lint-tests")), store);
    for (const p of r.problems) console.log("LINT " + p);
    console.log(`${r.files} test files checked, ${r.problems.length} problems`);
    process.exit(r.problems.length ? 1 : 0);
  }
  const all = loadMutations(store);
  const ids = a.includes("--all") ? Object.keys(all) : many("--id");
  if (!ids.length) { console.error("usage: --store <dir> (--id <id> ... | --all) | --lint-tests <dir> --store <dir>"); process.exit(2); }
  const results = [];
  for (const id of ids) {
    if (!all[id]) { results.push({ id, status: "unknown mutation", detail: "not in the store" }); continue; }
    const r = await runMutation(all[id], { timeoutMin: Number(get("--timeout-min") || 5), root: get("--root") || "." });
    results.push(r); console.log(`${r.status.toUpperCase().padEnd(24)} ${r.id}  ${r.detail.split("\n")[0].slice(0, 140)}`);
  }
  if (get("--json")) writeFileSync(get("--json"), JSON.stringify(results, null, 1));
  const bad = results.filter((r) => r.status !== "caught");
  console.log(`${results.length - bad.length} of ${results.length} mutations caught`);
  process.exit(bad.length ? 1 : 0);
}
