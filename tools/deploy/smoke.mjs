// node tools/deploy/smoke.mjs --game bingo --expect-commit <hex> [--env live|preview]
// After deploying ONE game: its /version.json must show the commit that was deployed, and its site must still answer. Exit 0 = fine, 1 = wrong version or unreachable.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const cfg = JSON.parse(readFileSync(new URL("../../config/games.json", import.meta.url), "utf8"));

export async function smoke({ game, expectCommit, env = "live", fetchFn = fetch }) {
  const g = cfg.games.find((x) => x.id === game);
  if (!g) return { ok: false, line: `${game}: unknown game` };
  try {
    const r = await fetchFn(g[env] + "/version.json", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || typeof j.commit !== "string") return { ok: false, line: `${game}: version.json gave ${r.status}` };
    const same = !!expectCommit && (j.commit.startsWith(expectCommit.slice(0, 7)) || expectCommit.startsWith(j.commit.slice(0, 7)));
    if (!same) return { ok: false, line: `${game}: shows commit ${j.commit}, expected ${expectCommit || "(none given)"}` };
    return { ok: true, line: `${game}: version.json shows ${j.commit}` };
  } catch { return { ok: false, line: `${game}: could not be reached` }; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), get = (n, d) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : d; };
  const r = await smoke({ game: get("--game"), expectCommit: get("--expect-commit"), env: get("--env", "live") });
  console.log(r.line); process.exit(r.ok ? 0 : 1);
}
