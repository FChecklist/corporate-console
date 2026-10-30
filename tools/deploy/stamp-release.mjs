// node tools/deploy/stamp-release.mjs
// Sets the release time of the newest row of releases.json to NOW, for a deploy: every screen then shows the true date and time (IST) of this release.
// Then commit releases.json, run `node build.mjs --env <env>` (it stamps the real git commit) and `node tools/deploy/check-dist.mjs --deploy`.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { istText } from "../../build.mjs";

const FILE = fileURLToPath(new URL("../../releases.json", import.meta.url));

/** returns the new first row; only releasedAt changes (the version and the note stay) */
export function stampRelease(file = FILE, now = new Date()) {
  const rows = JSON.parse(readFileSync(file, "utf8"));
  rows[0] = { ...rows[0], releasedAt: now.toISOString() };
  writeFileSync(file, JSON.stringify(rows, null, 1) + "\n");
  return rows[0];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = stampRelease();
  console.log(`release ${r.version} stamped ${r.releasedAt} = ${istText(r.releasedAt)}. Commit releases.json, then build.`);
}
