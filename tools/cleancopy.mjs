// cleanCopy(repo, tmpDir): a copy of the repo's LAST COMMIT in tmpDir/copy, with every node_modules folder linked (not copied). The repo itself is only read.
import { readdirSync, statSync, symlinkSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { execFileSync } from "node:child_process";

export const GIT = existsSync("C:/Program Files/Git/mingw64/bin/git.exe") ? "C:/Program Files/Git/mingw64/bin/git.exe" : "git";

export function findNodeModules(root, depth = 0, acc = []) {
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

export function cleanCopy(repo, tmp) {
  execFileSync(GIT, ["-C", repo, "archive", "--format=tar", "-o", join(tmp, "src.tar"), "HEAD"]);
  const dir = join(tmp, "copy"); mkdirSync(dir);
  execFileSync("tar", ["-xf", "src.tar", "-C", "copy"], { cwd: tmp }); // relative names: GNU tar reads "C:" as a host name
  for (const nm of findNodeModules(repo)) { const dest = join(dir, relative(repo, nm)); mkdirSync(dirname(dest), { recursive: true }); try { symlinkSync(nm, dest, "junction"); } catch { /* best effort */ } }
  return dir;
}
