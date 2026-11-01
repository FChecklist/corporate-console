// Traffic flagged x-test-run (the scenario runners) is answered but never counted in the visitor statistics.
import { test, expect } from "bun:test";
import { makeD1 } from "./support/d1-sqlite";
import { handleStats } from "../functions/_lib/stats-core";

const NOW = Date.UTC(2026, 10, 1, 6, 0, 0);
const mk = () => { const d = makeD1(["migrations/0001_console.sql"]); return { DB: d.db, STATS_OWNER_KEY: "owner-key-123456", SESSION_PEPPER: "p", CONSOLE_ORIGIN: "https://console.example" } as any; };
const post = (env: any, body: any, headers: any = {}) => handleStats(new Request("https://console.example/stats/e", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }), env, NOW);
const summary = async (env: any) => (await handleStats(new Request("https://console.example/stats/summary", { headers: { "x-owner-key": "owner-key-123456" } }), env, NOW)).json();

test("a flagged event gets 202 and leaves the summary as it was; an unflagged one is counted", async () => {
  const env = mk();
  const ev = { game: "tambola", event: "viewed", visit: "vaaaaaaaa1" };
  expect((await post(env, ev, { "x-test-run": "1" })).status).toBe(202);
  expect((await summary(env)).rows).toEqual([]);
  expect((await post(env, { ...ev, visit: "vbbbbbbbb2" })).status).toBe(202);
  expect((await summary(env)).rows.length).toBe(1);
});
