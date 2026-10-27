// FALSIFIED BY: guard-ignores-starting-soon, guard-ignores-unreachable, smoke-accepts-any-commit
import { test, expect } from "bun:test";
import { guard } from "../tools/deploy/guard.mjs";
import { smoke } from "../tools/deploy/smoke.mjs";

const answer = (map: Record<string, any>) => async (url: string) => {
  const host = Object.keys(map).find((h) => url.startsWith(h));
  if (!host || map[host] === "down") throw new Error("no connection");
  const m = map[host];
  return { ok: m.status ? m.status < 400 : true, status: m.status || 200, json: async () => m.body } as any;
};
const live = (playing: number, soon: number, extra: any = {}) => ({ body: { ok: true, game: "x", playing, startingWithin60: soon, ...extra } });
const ALL = { "https://housie.corporatetambola.com": live(0, 0), "https://bingo.corporatetambola.com": live(0, 0), "https://tictactoe.corporatetambola.com": live(0, 0, { tournamentsRunning: 0 }), "https://snakes.corporatetambola.com": live(0, 0), "https://luck.corporatetambola.com": live(0, 0), "https://lucky.corporatetambola.com": live(0, 0) };

test("guard: all six quiet = exit 0", async () => {
  const r = await guard({ fetchFn: answer(ALL) });
  expect(r.code).toBe(0); expect(r.lines.length).toBe(6); expect(r.lines.every((l: string) => l.endsWith("quiet"))).toBe(true);
});
test("guard: a game being played, or starting within the hour, or a running tournament = exit 1", async () => {
  expect((await guard({ fetchFn: answer({ ...ALL, "https://bingo.corporatetambola.com": live(1, 0) }) })).code).toBe(1);
  const soon = await guard({ fetchFn: answer({ ...ALL, "https://housie.corporatetambola.com": live(0, 1) }) });
  expect(soon.code).toBe(1); expect(soon.lines.find((l: string) => l.startsWith("tambola"))).toContain("BUSY");
  expect((await guard({ fetchFn: answer({ ...ALL, "https://tictactoe.corporatetambola.com": live(0, 0, { tournamentsRunning: 2 }) }) })).code).toBe(1);
});
test("guard: a game that cannot be asked (down, error, bridge dark) = exit 2, never 'quiet' by guessing", async () => {
  expect((await guard({ fetchFn: answer({ ...ALL, "https://luck.corporatetambola.com": "down" }) })).code).toBe(2);
  expect((await guard({ fetchFn: answer({ ...ALL, "https://snakes.corporatetambola.com": { status: 404, body: {} } }) })).code).toBe(2);
  expect((await guard({ games: ["nogame"], fetchFn: answer(ALL) })).code).toBe(2);
});
test("guard: --games asks only the named game", async () => {
  const r = await guard({ games: ["bingo"], fetchFn: answer({ "https://bingo.corporatetambola.com": live(0, 0) }) });
  expect(r.code).toBe(0); expect(r.lines.length).toBe(1);
});
test("smoke: the deployed game must show the deployed commit", async () => {
  const f = (commit: string) => answer({ "https://bingo.corporatetambola.com": { body: { commit, dirty: false } } });
  expect((await smoke({ game: "bingo", expectCommit: "a18be25c0d11", fetchFn: f("a18be25c0d11") })).ok).toBe(true);
  expect((await smoke({ game: "bingo", expectCommit: "a18be25c0d11", fetchFn: f("bd66d3c57f76") })).ok).toBe(false);
  expect((await smoke({ game: "bingo", expectCommit: "a18be25", fetchFn: answer({ "https://bingo.corporatetambola.com": "down" }) })).ok).toBe(false);
  expect((await smoke({ game: "bingo", fetchFn: f("a18be25c0d11") })).ok).toBe(false);
});
