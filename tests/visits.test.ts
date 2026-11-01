// Visitor statistics: switched off by default, GPC/DNT/test-run respected, nothing personal kept, owner-only numbers, CSV.
import { test, expect } from "bun:test";
import { makeD1 } from "./support/d1-sqlite";
import { handleStats } from "../functions/_lib/stats-core";
import { cleanVisit, resetVisitsEnsured } from "../functions/_lib/visits-core";

const NOW = Date.UTC(2026, 10, 1, 6, 0, 0);
const KEY = "owner-key-123456";
const mk = (extra: any = {}) => { resetVisitsEnsured(); return { DB: makeD1(["migrations/0001_console.sql"]).db, STATS_OWNER_KEY: KEY, SESSION_PEPPER: "p", CONSOLE_ORIGIN: "https://console.example", ...extra } as any; };
const post = (env: any, body: any, headers: any = {}) => handleStats(new Request("https://console.example/stats/v", { method: "POST", headers: { "content-type": "text/plain", "user-agent": "Mozilla/5.0 (iPhone) Safari/604.1 Mobi", "cf-ipcountry": "IN", ...headers }, body: JSON.stringify(body) }), env, NOW);
const owner = (env: any, path = "/stats/visits", now = NOW) => handleStats(new Request("https://console.example" + path, { headers: { "x-owner-key": KEY } }), env, now);
const page = (o: any = {}) => ({ kind: "page", visit: "abc123def", game: "home", path: "/", ref: "https://www.google.com/search?q=x", utm: { s: "mail", m: "email", c: "launch" }, w: 390, lang: "en-IN", ...o });

test("off by default: answered, nothing kept", async () => {
  const env = mk();
  expect((await post(env, page())).status).toBe(202);
  expect((await (await owner(env)).json()).visitors).toBe(0);
});
test("on: counts visitors, pages, sources, device, country, language; time and scroll on leave", async () => {
  const env = mk({ VISITS_ON: "1" });
  await post(env, page()); await post(env, page({ kind: "leave", ms: 42000, scroll: 80 }));
  await post(env, page({ visit: "xyz456abc", path: "/pricing.html", utm: undefined, ref: "" }));
  await post(env, page({ kind: "click", target: "Create your closed-group game" }));
  await post(env, page({ kind: "share", target: "WhatsApp" }));
  const s = await (await owner(env)).json();
  expect(s.visitors).toBe(2); expect(s.pageViews).toBe(2); expect(s.live).toBe(2);
  expect(s.games).toEqual([{ game: "home", visitors: 2, views: 2 }]);
  const home = s.pages.find((p: any) => p.path === "/");
  expect(home.avgMs).toBe(42000); expect(home.avgScroll).toBe(80);
  expect(s.sources.map((x: any) => x.source).sort()).toEqual(["direct", "mail"]);
  expect(s.devices[0].device).toBe("mobile"); expect(s.countries[0].country).toBe("IN"); expect(s.languages[0].lang).toBe("en-IN");
  expect(s.presses.map((p: any) => p.kind).sort()).toEqual(["click", "share"]);
});
test("Global Privacy Control, Do Not Track and x-test-run are answered but never counted", async () => {
  const env = mk({ VISITS_ON: "1" });
  for (const h of [{ "sec-gpc": "1" }, { dnt: "1" }, { "x-test-run": "1" }]) expect((await post(env, page(), h)).status).toBe(202);
  expect((await (await owner(env)).json()).visitors).toBe(0);
});
test("nothing personal is kept: query dropped, referrer host only, e-mail-like and long numbers refused", () => {
  const r = cleanVisit({ ...page({ path: "/join?name=Ravi&mobile=9822233344#x", ref: "https://x.example/a/b?c=d" }) }, "", "IN", NOW)!;
  expect(r.path).toBe("/join"); expect(r.ref).toBe("x.example");
  expect(cleanVisit(page({ path: "/u/raj@acme.com" }), "", "IN", NOW)!.path).toBe(null);
  expect(cleanVisit(page({ path: "/p/9822233344" }), "", "IN", NOW)!.path).toBe(null);
  expect(cleanVisit(page({ target: "raj@acme.com", kind: "click" }), "", "IN", NOW)!.target).toBe(null);
  expect(cleanVisit(page({ kind: "bogus" }), "", "IN", NOW)).toBe(null);
  expect(cleanVisit(page({ visit: "no" }), "", "IN", NOW)).toBe(null);
});
test("only the owner key reads; the CSV has the same numbers; a bad date is refused", async () => {
  const env = mk({ VISITS_ON: "1" });
  await post(env, page());
  expect((await handleStats(new Request("https://console.example/stats/visits"), env, NOW)).status).toBe(401);
  expect((await handleStats(new Request("https://console.example/stats/visits.csv", { headers: { "x-owner-key": "wrong-key-1234567" } }), env, NOW)).status).toBe(401);
  const csv = await (await owner(env, "/stats/visits.csv")).text();
  expect(csv.split("\n")[0]).toBe("section,game,key,visitors_or_count,views,avg_seconds,avg_scroll");
  expect(csv).toContain("page,home,/,1,1");
  expect((await owner(env, "/stats/visits?from=x")).status).toBe(400);
});
test("live visitors count only the last five minutes", async () => {
  const env = mk({ VISITS_ON: "1" });
  await post(env, page());
  expect((await (await owner(env, "/stats/visits", NOW + 6 * 60_000)).json()).live).toBe(0);
});
test("a foreign origin may not report", async () => {
  const env = mk({ VISITS_ON: "1", GAME_ORIGINS: "{}" });
  expect((await post(env, page(), { origin: "https://evil.example" })).status).toBe(403);
});
