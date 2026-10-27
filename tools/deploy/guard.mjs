// node tools/deploy/guard.mjs [--games bingo,tictactoe,...] [--env live|preview]
// The deploy guard: before ANY game is deployed, ask every game (public counts only, no names) whether a game is being played or about to start.
// Exit 0 = quiet, safe to deploy ONE game. Exit 1 = something is playing or starts within the hour: do not deploy. Exit 2 = a game could not be asked: do not guess, do not deploy.
// Needs the bridge to be switched on in each game (/api/console/live). A game whose bridge is still dark is reported as 'cannot be asked' (use tools/live_games_now_game.py for it).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const cfg = JSON.parse(readFileSync(new URL("../../config/games.json", import.meta.url), "utf8"));

/** returns { ok, quiet, lines, code } ; fetchFn is injectable for tests */
export async function guard({ games = cfg.games.map((g) => g.id), env = "live", fetchFn = fetch, timeoutMs = 8000 } = {}) {
  const lines = []; let quiet = true, ok = true;
  for (const id of games) {
    const g = cfg.games.find((x) => x.id === id);
    if (!g) { lines.push(`${id}: unknown game`); ok = false; continue; }
    try {
      const r = await fetchFn(g[env] + "/api/console/live", { signal: AbortSignal.timeout(timeoutMs) });
      const j = r.ok ? await r.json() : null;
      if (!j || j.ok !== true) { lines.push(`${id}: could not be asked (answer ${r.status}); do not deploy until it can`); ok = false; continue; }
      const soon = j.startingWithin60; // the game counts the next 60 minutes
      if (j.playing > 0 || soon > 0 || (j.tournamentsRunning || 0) > 0) { quiet = false; lines.push(`${id}: BUSY (playing ${j.playing}, starting within 60 min ${j.startingWithin60}${j.tournamentsRunning ? ", tournaments running " + j.tournamentsRunning : ""})`); }
      else lines.push(`${id}: quiet`);
    } catch (e) { lines.push(`${id}: could not be asked (${e && e.name === "TimeoutError" ? "no answer in time" : "no connection"}); do not deploy until it can`); ok = false; }
  }
  return { ok, quiet, lines, code: !ok ? 2 : quiet ? 0 : 1 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), get = (n, d) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : d; };
  const r = await guard({ games: get("--games") ? get("--games").split(",") : undefined, env: get("--env", "live") });
  for (const l of r.lines) console.log(l);
  console.log(r.code === 0 ? "QUIET: you may deploy one game." : r.code === 1 ? "NOT NOW: a game is being played or starts within the hour." : "UNKNOWN: a game could not be asked. Do not deploy.");
  process.exit(r.code);
}
