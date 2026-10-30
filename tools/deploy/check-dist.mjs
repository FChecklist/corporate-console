// node tools/deploy/check-dist.mjs [--deploy]      (--deploy = the strict check for deploy day: the commit is the one checked out and the release time is today's; exit 0 = dist/ is fresh and carries the version; exit 1 = stale, missing or wrong: rebuild with `node build.mjs --env <env>`)
// Run it RIGHT BEFORE a deploy. dist/ is what Cloudflare Pages serves; if anything the console is made of changed after dist/ was built, the deploy would ship an old console.
// Fresh = nothing in public/, config/games.json, releases.json or build.mjs is newer than dist/version.json (the last file the build writes), and version.json carries the version and the release date and time of releases.json.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const newest = (path) => {
  const st = statSync(path);
  if (!st.isDirectory()) return { ms: st.mtimeMs, path };
  let best = { ms: 0, path };
  for (const e of readdirSync(path)) { const b = newest(join(path, e)); if (b.ms > best.ms) best = b; }
  return best;
};

/** what is wrong with dist/ ([] = fine). `root` is the console folder, `dist` its build folder. */
export function distProblems(root = ROOT, dist = join(root, "dist"), opts = {}) {
  if (!existsSync(dist)) return ["dist/ does not exist: run node build.mjs --env <env> first"];
  const vfile = join(dist, "version.json");
  if (!existsSync(vfile)) return ["dist/version.json is missing: the build did not finish, run node build.mjs --env <env>"];
  const problems = [], built = statSync(vfile).mtimeMs;
  for (const src of ["public", "config/games.json", "releases.json", "build.mjs"]) {
    const p = join(root, src);
    if (!existsSync(p)) continue;
    const n = newest(p);
    if (n.ms > built + 1) problems.push(`dist/ is older than ${n.path.slice(root.length).replace(/\\/g, "/")}: rebuild with node build.mjs --env <env>`);
  }
  let v = null;
  try { v = JSON.parse(readFileSync(vfile, "utf8")); } catch { problems.push("dist/version.json is not readable"); }
  const rf = join(root, "releases.json");
  if (v && existsSync(rf)) {
    const rel = JSON.parse(readFileSync(rf, "utf8"))[0];
    if (v.version !== rel.version) problems.push(`dist/version.json says version ${v.version}, releases.json says ${rel.version}`);
    if (v.releasedAt !== rel.releasedAt) problems.push("dist/version.json has another release time than releases.json");
    if (!/^\d{2} \w{3} \d{4}, \d{2}:\d{2} IST$/.test(String(v.releasedAtIST || ""))) problems.push("dist/version.json has no release date and time in IST");
  }
  if (v) {
    if (!/^[0-9a-f]{7,40}$/.test(String(v.commit || ""))) problems.push(`dist/version.json carries no real git commit (it says "${v.commit}"): build with node build.mjs, which reads it from git`);
    if (opts.deploy) { // the strict check for deploy day
      let head = "";
      try { head = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { problems.push("git could not be asked which commit is checked out"); }
      if (head && v.commit !== head) problems.push(`dist/ was built from commit ${v.commit}, but ${head} is checked out: rebuild`);
      const rel = Date.parse(v.releasedAt), built = Date.parse(v.builtAt);
      if (!(rel <= built + 60_000)) problems.push("the release time is in the future compared with the build");
      if (built - rel > 30 * 60_000) problems.push("the release time is more than 30 minutes older than this build: run node tools/deploy/stamp-release.mjs, commit releases.json and rebuild");
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const p = distProblems(ROOT, join(ROOT, "dist"), { deploy: process.argv.includes("--deploy") });
  for (const x of p) console.log(x);
  console.log(p.length ? "STALE OR WRONG: do not deploy" : "dist/ is fresh and carries the version");
  process.exit(p.length ? 1 : 0);
}
