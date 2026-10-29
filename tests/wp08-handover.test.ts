// FALSIFIED BY: bridge-handoff-pay-target-lost, screens-pay-opens-step-one, screens-draft-soon-hidden, screens-free-link-missing
// Gap-plan package WP-08, console side: MC-11 (Pay opens the payment step, Publish opens Check-and-publish), MC-16 (a draft that starts soon is on the attention strip),
// MC-22 (helper line on the Player's screen view), MC-29 (Try a free game). The game-side pages that read these words belong to each game's own package.
import { test, expect, setDefaultTimeout } from "bun:test";
import { Window } from "happy-dom";
import { makeHost, seed } from "./support/fake-host";
import { handleConsole } from "../packages/bridge/src/bridge";
import { makeCtx, buildAssertion } from "../packages/bridge/test-kit/kit.mjs";

setDefaultTimeout(60_000);
const win = new Window({ url: "http://localhost/" });
Object.assign(globalThis, { window: win, document: win.document, HashChangeEvent: win.HashChangeEvent, Event: win.Event, location: win.location, alert: () => {}, innerWidth: 1280 });
const { renderHome } = await import("../public/screens/home.js");
const { renderBilling } = await import("../public/screens/billing.js");
const { renderCreate } = await import("../public/screens/create.js");
const { renderPlayerView } = await import("../public/screens/playerview.js");

const fresh = () => { const o = document.createElement("div"); document.body.replaceChildren(o); return o; };
const until = async (f: () => boolean, ms = 20000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error("timed out waiting"); await new Promise((r) => setTimeout(r, 20)); } };
const click = (n: Element | null | undefined) => (n as any).click();
const byText = (root: ParentNode, sel: string, text: string) => [...root.querySelectorAll(sel)].find((n: any) => n.textContent.trim() === text) as any;
const row = (eid: string, o: any = {}) => ({ game: "bingo", eid, name: eid + " party", role: "organizer", status: "ready", startMs: Date.now() + 5 * 86400_000, cap: 10, nextAction: "none", payment: { state: "free" }, ...o });

test("MC-11 the bridge hands over to 'pay' and 'publish' (the address says which), and 'free' is only for a new game", async () => {
  const ctx = await makeCtx();
  const h = await makeHost(); seed(h);
  h.env.CONSOLE_PUBKEYS = "k1:" + ctx.publicB64u;
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: async (req) => (await handleConsole(h.adapter, req, h.env)) ?? new Response("{}", { status: 404 }) });
  h.origin = `http://127.0.0.1:${server.port}`; h.env.PUBLIC_ORIGIN = h.origin;
  try {
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(h.origin + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    const asr = async (spec: any) => (await buildAssertion(ctx, spec, h.origin, h.clock.ms)).token;
    const key = (await (await post("/api/console/session", { assertion: await asr({ act: "session", person: "alice" }) })).json()).organizer.key;
    for (const target of ["pay", "publish"]) {
      const j = await (await post("/api/console/handoff", { eid: "READY01", target }, { "x-organizer": key })).json();
      expect(j.url).toMatch(new RegExp(`&go=console&e=READY01&to=${target}$`));
    }
    const free = await (await post("/api/console/handoff", { target: "new", free: true }, { "x-organizer": key })).json();
    expect(free.url).toMatch(/&go=console&e=_new_&free=1$/);
    expect((await post("/api/console/handoff", { eid: "READY01", target: "pay", free: true }, { "x-organizer": key })).status).toBe(400); // free is for a new game only
    expect((await post("/api/console/handoff", { target: "new", free: false }, { "x-organizer": key })).status).toBe(400);
  } finally { server.stop(true); }
});

test("MC-11/16 Home: a draft that starts within a day is on the attention strip with Publish (opens the publish step), a waiting game has Pay (opens the payment step)", async () => {
  const seen: any[] = [];
  const api: any = { listGames: async () => ({ rows: [row("DRAFT001", { status: "draft", startMs: Date.now() + 3 * 3600_000, nextAction: "publish" }), row("WAIT0001", { status: "waiting_payment", nextAction: "pay" }), row("FAR00001", { status: "draft", startMs: Date.now() + 9 * 86400_000 })], failed: [], off: [] }), handoff: async (g: string, o: any) => { seen.push(o); return { ok: true, url: "https://bingo.test/signin.html?t=" + "0".repeat(48) + "&go=console&e=" + o.eid }; } };
  const o = fresh();
  await renderHome(o, { api, names: { bingo: "Bingo" }, colors: {}, email: "x@y.example", go: () => {} });
  expect([...o.querySelectorAll(".row")].map((r: any) => r.dataset.eid).sort()).toEqual(["DRAFT001", "WAIT0001"]); // the draft 9 days away is not nagging yet
  expect(o.querySelector('[data-eid="DRAFT001"]')!.textContent).toContain("Not published yet");
  click(byText(o.querySelector('[data-eid="DRAFT001"]')!, "button", "Publish"));
  click(byText(o.querySelector('[data-eid="WAIT0001"]')!, "button", "Pay"));
  await until(() => seen.length === 2);
  expect(seen.map((s) => s.target).sort()).toEqual(["pay", "publish"]);
});

test("MC-11 Billing: Pay opens the game's payment step (target pay), not step one", async () => {
  const seen: any[] = [];
  const api: any = { byId: {}, listGames: async () => ({ rows: [row("WAIT0001", { status: "waiting_payment", nextAction: "pay" })], failed: [], off: [] }), billing: async () => ({ rows: [], credits: [], failed: [], off: [] }), handoff: async (g: string, o: any) => { seen.push(o); return { ok: true, url: "https://bingo.test/signin.html?t=" + "0".repeat(48) + "&go=console&e=" + o.eid }; } };
  const o = fresh();
  await renderBilling(o, { api, names: { bingo: "Bingo" }, colors: {}, email: "x@y.example", go: () => {} });
  click(byText(o, "button", "Pay"));
  await until(() => seen.length === 1);
  expect(seen[0].target).toBe("pay");
});

test("MC-29 Create: every open game also has 'Try a free game' (a new game with the free 10-person size chosen)", async () => {
  const seen: any[] = [];
  const api: any = { ready: [{ id: "bingo" }], capabilities: async () => [], startNew: async (g: string, o: any) => { seen.push([g, o]); return { ok: true, url: "https://bingo.test/signin.html?t=" + "0".repeat(48) + "&go=console&e=_new_&free=1" }; } };
  const o = fresh();
  await renderCreate(o, { api, games: [{ id: "bingo", name: "Bingo", ready: true, status: "live" }, { id: "luckydraw", name: "Lucky Draw", ready: false, status: "planned" }], names: { bingo: "Bingo", luckydraw: "Lucky Draw" }, colors: {}, go: () => {} });
  click(byText(o, "button", "Try a free game"));
  await until(() => seen.length === 1);
  expect(seen[0]).toEqual(["bingo", { free: true }]);
  expect(o.querySelector('[data-game="luckydraw"] button')).toBe(null); // and nothing on a game that is not open
});

test("MC-22 Player's screen view: a helper line says what the page is, and that players pick Retro or Modern on their own phone", async () => {
  const api: any = { capabilities: async () => [{ game: "bingo", ok: true, caps: { features: { preview: true } } }], preview: async () => ({ ok: true, url: "https://bingo.test/screenview/ABCD1?t=" + "x".repeat(30) }) };
  const o = fresh();
  await renderPlayerView(o, { api, names: { bingo: "Bingo" } }, "bingo", "ABCD1");
  await until(() => !!o.querySelector("iframe"));
  expect(o.querySelector(".lead")!.textContent).toContain("built from the settings you saved");
  expect(o.querySelector(".lead")!.textContent).toContain("Retro or Modern look on their own phone");
});
