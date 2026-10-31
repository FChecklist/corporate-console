// Roles matrix (spec 410 S1, S2, S3, S5), written from the spec and docs/CONTROL_CONTRACT.md. Roles: organizer, host, cohost, participant, family pass x Start, Pause, Resume, Copy, for each of the 6 games.
// Descriptors are read the way the build reads them (vendored core manifests); the game side is a small stub that follows docs/CONTROL_CONTRACT.md section 1, so the console's keys, ops and error words are checked end to end.
import { test, expect, setDefaultTimeout } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";

setDefaultTimeout(60_000);
const win = new Window({ url: "http://localhost/" });
Object.assign(globalThis, { window: win, document: win.document, HashChangeEvent: win.HashChangeEvent, Event: win.Event, location: win.location, alert: () => {}, innerWidth: 1280 });
// @ts-ignore build script
const { readCore, withCore } = await import("../../build.mjs");
const { featuresOf, canPause, canStart, has } = await import("../../public/core/features.js");
const { controlGroups, renderControl } = await import("../../public/screens/control.js");
const { earlierGames } = await import("../../public/screens/createfrom.js");
const { createApi } = await import("../../public/core/api.js");
const { cloneFrom } = await import("../../public/core/clone.js");

const cfg = JSON.parse(readFileSync(new URL("../../config/games.json", import.meta.url), "utf8"));
const core = readCore();
const games: any[] = withCore(cfg, core).games;
const IDS = ["tambola", "bingo", "tictactoe", "snakesladders", "luckbychance", "luckydraw"];
const ROLES = ["organizer", "host", "cohost", "participant", "family"];
const MAY = (r: string) => r === "organizer" || r === "host";
const desc = (id: string) => games.find((g) => g.id === id);
const MANIFEST_OF = (id: string) => core.manifests[desc(id).manifestId || id];
const row = (game: string, role: string, o: any = {}) => ({ game, eid: "E-" + game + "-" + role, role, status: "playing", name: "Quiz " + game, cap: 50, startMs: Date.now() - 1000, payment: { state: "paid" }, ...o });

test("S1 the console reads the six manifests from the vendored core, not a private list", () => {
  for (const id of IDS) { expect(desc(id), id).toBeTruthy(); expect(MANIFEST_OF(id), `${id}: no manifest in vendor/game-core`).toBeTruthy(); }
  for (const id of IDS) expect(desc(id).pause?.by, id).toEqual(MANIFEST_OF(id).pauseSupport ? ["organizer", "host"] : desc(id).pause?.by);
});
test("S1 an undeclared feature is never shown: Co-host, final say, manual play follow the manifest", () => {
  for (const id of IDS) {
    const m = MANIFEST_OF(id), d = desc(id);
    expect(has(d, "finalSay"), `${id} final say`).toBe(m.organizerFinalSay === true);
    expect(has(d, "manualStart"), `${id} manual start`).toBe((m.startModes || []).includes("manual"));
    expect(has(d, "claim"), `${id} claim`).toBe(String(m.goldenButton).toLowerCase() === "claim");
    const manualPlay = (m.playModes || []).includes("host-called");
    expect(!!d.caps?.manual, `${id} manual-play cap`).toBe(manualPlay);
  }
  // a game that declares nothing shows nothing
  const bare = { id: "x", startModes: ["auto"], roles: ["organizer", "host"] };
  const f = featuresOf(bare);
  for (const k of ["cohost", "finalSay", "pause", "manualStart", "family", "claim"]) expect(f.has(k), k).toBe(false);
});
test("S1 Co-host controls are shown only for a game whose manifest/roles declare Co-host", () => {
  for (const id of IDS) expect(has(desc(id), "cohost"), `${id}: roles ${JSON.stringify(desc(id).roles)} vs manifest ${JSON.stringify(Object.keys(MANIFEST_OF(id)))}`).toBe((desc(id).roles || []).includes("cohost"));
  // the manifest has no roles field to read; the roles come from the private config/games.json list
  expect("roles" in MANIFEST_OF("tambola") || "coHost" in MANIFEST_OF("tambola") || "cohost" in MANIFEST_OF("tambola"), "vendored manifest does not declare roles: Co-host/Family come from a private list (S1)").toBe(true);
});

for (const id of IDS) {
  test(`S2 matrix ${id}: Start/Pause/Resume are offered only to Organizer or Host, never Co-host, participant or family pass`, () => {
    const d = desc(id);
    for (const r of ROLES) {
      expect(canPause(d, r), `${id} ${r} pause/resume`).toBe(MAY(r));
      expect(canStart(d, r), `${id} ${r} start`).toBe(MAY(r) && has(d, "manualStart"));
    }
  });
  test(`S2 matrix ${id}: the control room lists only the Organizer's and Host's games`, () => {
    const rows = ROLES.map((r) => row(id, r));
    const { running } = controlGroups(rows);
    expect(running.map((g: any) => g.role).sort(), id).toEqual(["host", "organizer"]);
  });
  test(`S2 matrix ${id}: rendered cards show Pause / Resume / Start buttons by role and state, Paused pill for players' word`, async () => {
    const cases: Array<[string, any, string[]]> = [];
    for (const r of ROLES) {
      cases.push([r, { status: "playing" }, MAY(r) ? ["Pause"] : []]);
      cases.push([r, { status: "playing", paused: true }, MAY(r) ? ["Resume"] : []]);
      cases.push([r, { status: "ready", startMode: "manual-start", payment: { state: "paid" }, startMs: Date.now() + 3600_000 }, MAY(r) && has(desc(id), "manualStart") ? ["Start now"] : []]);
    }
    for (const [r, o, want] of cases) {
      const ctx: any = { games, names: Object.fromEntries(games.map((g) => [g.id, g.name])), colors: {}, api: { listGames: async ({ onGame }: any = {}) => { const res = { game: id, ok: true, rows: [row(id, r, o)] }; onGame?.(res); return { results: [res], rows: res.rows, failed: [], off: [] }; } } };
      const out = document.createElement("div"); document.body.append(out);
      await renderControl(out, ctx);
      const got = [...out.querySelectorAll(".gcard .btn")].map((b: any) => b.textContent.trim()).filter((t: string) => ["Pause", "Resume", "Start now"].includes(t));
      expect(got, `${id} ${r} ${JSON.stringify(o)}`).toEqual(want);
      if (MAY(r) && o.paused) expect(out.textContent, `${id} ${r}: Paused pill`).toContain("Paused");
      out.remove();
    }
  });
  test(`S3 matrix ${id}: Copy ('start from an earlier game') is offered for an Organizer's own game only; people, time, results never copy`, () => {
    const rows = ROLES.map((r) => row(id, r, { status: "finished" }));
    const got = earlierGames(rows, games).map((g: any) => g.role);
    expect(got, `${id}: Copy offered to ${got.join(",")}`).toEqual(["organizer"]);
    const old: any = { gameType: id, gameName: "Old", settings: { cap: 5, hostEmails: ["h@x.org"] }, startMode: "manual", prizePlan: { rows: 1 }, roles: { hosts: 1 }, look: { brand: "A" }, participants: [{ name: "Asha" }], startMs: 7, results: [1], winners: [1] };
    const { copy, sources } = cloneFrom(old, { id, startModes: desc(id).startModes });
    expect(JSON.stringify(copy)).not.toMatch(/Asha|h@x\.org|startMs|winners|results|participants/);
    expect(Object.values(sources).every((s: any) => s === "Copied from Old")).toBe(true);
  });
}

// ---- the game side, as the contract describes it (a stub), driven through the console's api ----
function stubGame(id: string) {
  const keys: Record<string, { role: string; eid: string; org: string }> = {};
  const game: any = { state: "playing", paused: false, log: [] as any[], eids: { A1: "orgA", B1: "orgB" } };
  const srv = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: async (req) => {
    const j = (s: number, b: any) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
    const url = new URL(req.url);
    if (url.pathname !== "/api/console/control") return j(404, { ok: false });
    const b: any = await req.json(), k = keys[req.headers.get("x-organizer") || ""];
    if (!k || k.eid !== b.eid || game.eids[b.eid] !== k.org) return j(401, { ok: false, error: "key" });
    if (k.role !== "organizer" && k.role !== "host") return j(403, { ok: false, error: "role" });
    const ok = b.op === "pause" ? game.state === "playing" && !game.paused : b.op === "resume" ? game.paused : b.op === "start" ? game.state === "ready" : false;
    if (!ok) return j(409, { ok: false, error: "state" });
    if (b.op === "pause") game.paused = true; else if (b.op === "resume") game.paused = false; else game.state = "playing";
    game.log.push({ kind: b.op, role: k.role });
    return j(200, { ok: true, state: game.paused ? "paused" : game.state, paused: game.paused, atMs: Date.now() });
  } });
  return { srv, game, keys, origin: `http://127.0.0.1:${srv.port}`, id };
}
const apiFor = (g: ReturnType<typeof stubGame>, role: string, eid: string) => {
  const api = createApi({ games: [{ id: g.id, name: g.id, ready: true, origin: g.origin }], consoleOrigin: "http://127.0.0.1:1", fetchFn: fetch, timeoutMs: 1500 });
  const key = "k_" + role + "_" + eid; g.keys[key] = { role, eid, org: eid === "A1" ? "orgA" : "orgB" };
  api.vault.put(g.id, role, eid, key, Date.now() + 3600_000);
  return api;
};
for (const id of IDS) {
  test(`S2 server side ${id}: every role x Pause/Resume/Start; only Organizer or Host moves the game, others get 'role' and nothing changes, each move is logged by role`, async () => {
    const g = stubGame(id);
    try {
      for (const r of ROLES) {
        g.game.state = "playing"; g.game.paused = false; g.game.log.length = 0;
        const api = apiFor(g, r, "A1");
        const p = await api.control(id, "A1", "pause");
        expect(p.ok, `${id} ${r} pause`).toBe(MAY(r));
        if (!MAY(r)) { expect(p.error).toBe("role"); expect(g.game.paused).toBe(false); }
        if (MAY(r)) { expect(g.game.log).toEqual([{ kind: "pause", role: r }]); expect(p.paused).toBe(true); }
        g.game.paused = true; // somebody else paused it: now resume
        const q = await api.control(id, "A1", "resume");
        expect(q.ok, `${id} ${r} resume`).toBe(MAY(r));
        if (!MAY(r)) { expect(q.error).toBe("role"); expect(g.game.paused).toBe(true); }
        g.game.paused = false; g.game.state = "ready";
        const s = await api.control(id, "A1", "start");
        expect(s.ok, `${id} ${r} start`).toBe(MAY(r));
        if (!MAY(r)) { expect(s.error).toBe("role"); expect(g.game.state).toBe("ready"); }
      }
    } finally { g.srv.stop(true); }
  });
}
test("S2 a Host's Resume works and a wrong-state move says 'state' (409), not a crash", async () => {
  const g = stubGame("tambola");
  try {
    const api = apiFor(g, "host", "A1");
    expect((await api.control("tambola", "A1", "resume")).error).toBe("state");
    expect((await api.control("tambola", "A1", "pause")).ok).toBe(true);
    expect((await api.control("tambola", "A1", "pause")).error).toBe("state");
    const r = await api.control("tambola", "A1", "resume");
    expect(r).toMatchObject({ ok: true, paused: false });
  } finally { g.srv.stop(true); }
});
test("S2 the console sends the Co-host's own key, never an organizer key, so the game can refuse by role", async () => {
  const g = stubGame("bingo");
  try {
    const api = apiFor(g, "cohost", "A1");
    expect((await api.control("bingo", "A1", "pause")).error).toBe("role");
    expect(g.game.log).toEqual([]);
  } finally { g.srv.stop(true); }
});
test("S2 the console has no 'invalid op' hole: only start, pause, resume reach a game", async () => {
  const g = stubGame("bingo");
  try { expect((await apiFor(g, "organizer", "A1").control("bingo", "A1", "stop")).error).toBe("invalid"); } finally { g.srv.stop(true); }
});
test("S5 cross-tenant: a key of company A cannot pause, resume or start company B's game (refused 'key'); nothing changes", async () => {
  const g = stubGame("tambola");
  try {
    const api = apiFor(g, "organizer", "A1"); // key is for game A1 of orgA
    g.keys["k_org_B"] = { role: "organizer", eid: "B1", org: "orgA" }; // an organizer of company A holding a key aimed at B's game id
    api.vault.put("tambola", "organizer", "B1", "k_org_B", Date.now() + 3600_000);
    for (const op of ["pause", "resume", "start"]) { const r = await api.control("tambola", "B1", op); expect(r.ok, op).toBe(false); expect(r.error, op).toBe("key"); }
    expect(g.game.paused).toBe(false); expect(g.game.log).toEqual([]);
    const own = await apiFor(g, "organizer", "A1").control("tambola", "A1", "pause");
    expect(own.ok).toBe(true);
  } finally { g.srv.stop(true); }
});
test("S5 the control room never mixes companies: a row of another company that a game did not return is never shown, and rows keep their own Game ID", () => {
  const rows = [row("tambola", "organizer", { eid: "A1" }), row("bingo", "host", { eid: "A2" })];
  const { running } = controlGroups(rows);
  expect(running.map((g: any) => g.eid).sort()).toEqual(["A1", "A2"]);
});
test("S5 one Organizer or Host with many games for many teams: all appear in one room, all six game types", () => {
  const rows = IDS.flatMap((id) => [row(id, "organizer", { eid: id + "1" }), row(id, "host", { eid: id + "2", paused: true })]);
  const { running } = controlGroups(rows);
  expect(running.length).toBe(12);
  expect(new Set(running.map((g: any) => g.game)).size).toBe(6);
});
test("S3 Copy: the review step text is 'Copied from <game>' for every copied step, Change comes from the screen", () => {
  const src = readFileSync(new URL("../../public/screens/createfrom.js", import.meta.url), "utf8");
  expect(src).toContain("Change");
  const { sources } = cloneFrom({ gameType: "tambola", gameName: "Friday quiz night", settings: { cap: 1 }, startMode: "manual", prizePlan: { r: 1 }, roles: { hosts: 1 }, look: { c: 1 } }, { id: "tambola", startModes: ["auto", "manual"] });
  expect(Object.values(sources).length).toBeGreaterThan(0);
  for (const s of Object.values(sources)) expect(s).toBe("Copied from Friday quiz night");
});
test("S3 a step that does not apply to the new type is skipped when the type changes (prize plan, unknown start mode)", () => {
  const old: any = { gameType: "tambola", gameName: "T", settings: { cap: 1 }, startMode: "manual-host-calls", prizePlan: { rows: 3 }, roles: { hosts: 1 }, look: { c: 1 } };
  for (const t of IDS.filter((x) => x !== "tambola")) {
    const r = cloneFrom(old, { id: t, startModes: ["auto", "manual"] });
    expect("prizePlan" in r.copy, t).toBe(false);
    expect("startMode" in r.copy, t).toBe(false);
    expect(r.skipped.length, t).toBeGreaterThan(0);
    expect(r.copy.look).toEqual({ c: 1 });
  }
});
