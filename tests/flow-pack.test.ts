// FALSIFIED BY: flow-pack-game-rule-leak, flow-pack-needs-descriptor, flow-pack-wait-column-always, flow-pack-share-no-gameid, flow-pack-board-title, flow-pack-no-board-flag, flow-pack-no-claims-flag, flow-pack-sample-flag, flow-pack-termsbox-ignored, flow-pack-pace-fixed, flow-pack-consent-load-ignored
// The shared new organizer flow (packages/game-pack/zc-flow.js, opened with ?flow=new in a game's console). The behaviour tests live in each game (it needs that game's own prize table and ticket maker);
// here: the pack stands on its own with no game descriptor, hands the game's descriptor words through, and keeps the language guide.
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";

const src = readFileSync(join(import.meta.dir, "../packages/game-pack/zc-flow.js"), "utf8");
function page(descriptor = "", search = "?flow=new") {
  const win: any = new Window({ url: "http://localhost/zc.html" + search });
  win.document.body.innerHTML = '<main id="app"></main>';
  new Function("window", "document", "location", "fetch", descriptor + "\n" + src)(win, win.document, win.location, async () => ({ ok: true, json: async () => ({}) }));
  return win;
}

test("with no game descriptor the flow still draws its five steps, the top strip and a locked dashboard, and says the prizes are not available", () => {
  const win = page();
  const d = win.document;
  expect(d.querySelectorAll(".zf-bar [data-step]").length).toBe(5);
  expect(d.querySelector(".zf-top").textContent).toContain("deleted within 24 hours of the game");
  expect(d.getElementById("zf-dash").hasAttribute("disabled")).toBe(true);
  expect(win.ZFLOW.housesOf(win)).toEqual([]);
});

test("the game's own descriptor is what the flow uses: its name in the tab, its tickets, its ticks, its Super Bumper switch", () => {
  const win = page('window.ZFLOW_GAME = { brand: "Game X", tickets: [1], bumper: false, popular: ["a"], recommended: ["a", "b"] };');
  expect(win.document.title).toBe("Organizer console | Game X");
  expect(win.ZFLOW.tagsOf("a")).toEqual(["(Popular)", "(Recommended)"]);
  expect(win.ZFLOW.tagsOf("b")).toEqual(["(Recommended)"]);
  const houses = [{ id: "a", label: "A", dflt: true }, { id: "b", label: "B" }];
  expect(Object.entries(win.ZFLOW.defaultPrizes(houses)).filter(([, v]: any) => v.on).map(([k]) => k)).toEqual(["a", "b"]);
  // a game with no Super Bumper never saves one, even if asked
  const sel = win.ZFLOW.defaultPrizes(houses);
  const r = win.ZFLOW.buildRewards(sel, { on: true, n: 3, gift: "Gift voucher", other: "", worth: "" }, 2, "INR");
  expect(r.some((x: any) => x.scope === "two_ticket")).toBe(false);
});

test("without a descriptor, a house flagged as a default by the game is ticked", () => {
  const win = page();
  const on = Object.entries(win.ZFLOW.defaultPrizes([{ id: "p", dflt: true }, { id: "q" }])).filter(([, v]: any) => v.on).map(([k]) => k);
  expect(on).toEqual(["p"]);
});

test("the pack holds no game name and no outside address in its code, and no banned word on its screens", () => {
  expect(/tambola|bingo|snakes|luck|housie/i.test(src)).toBe(false);
  expect(/https?:\/\/(?!localhost)/.test(src.replace(/\/\/ .*$/gm, ""))).toBe(false);
  const win = page();
  const F = win.ZFLOW;
  expect(F.badWords([...Object.values(F.COPY), ...F.STEPS.map((s: any) => s.name)].join(" | "))).toEqual([]);
  expect(src).not.toMatch(/private/i);
});

test("Dashboard v2 pure parts: the waiting table shows a column only when somebody gave that detail; the shared message carries the Game ID and link", () => {
  const F = page().ZFLOW;
  expect(F.waitColumns([{ id: "1" }]).map((c: any) => c.label)).toEqual(["Ticket number"]);
  const rows = [{ id: "1", firstName: "Asha", last4: "4321", via: "boss@acme.com" }, { id: "2", email: "x@y.com" }];
  expect(F.waitColumns(rows).map((c: any) => c.label)).toEqual(["Ticket number", "Name", "Email ID", "Mobile", "Referred by"]);
  const m = F.shareMessage("Team party", "http://x/z?e=E1", "E1");
  expect(m).toContain("Game ID: E1"); expect(m).toContain("http://x/z?e=E1");
  expect(F.PAY_PRINT).toContain("claim it back (recommended)");
  expect(F.PAY_PRINT).toContain("works for 7 days");
});

test("the retro board uses the game's own title and size from its descriptor", () => {
  const win = page('window.ZFLOW_GAME = { boardTitle: "XYZ", boardMax: 20, boardCols: 5, tickets: [1] };');
  const F = win.ZFLOW;
  F.state.eid = "E1"; F.state.raw = { startMs: Date.now() + 3600000 }; F.state.info = { published: true, paid: true, startMs: Date.now() + 3600000 }; F.state.view = "dash"; F.draw();
  expect(win.document.querySelector(".zf-retro-title").textContent).toContain("XYZ");
  expect(win.document.getElementById("zf-discs").children.length).toBe(20);
  expect(win.document.getElementById("zf-discs").getAttribute("style")).toContain("repeat(5, 1fr)");
});

test("a game with no numbered ticket, board or claims says so in its descriptor: no retro board, no claims count, and the preview waits (Coming soon); one ticket means no ticket choice", () => {
  const win = page('window.ZFLOW_GAME = { tickets: [1], sample: false, board: false, claims: false };');
  const F = win.ZFLOW; const d = win.document;
  F.state.eid = "E1"; F.state.raw = { startMs: Date.now() + 3600000 }; F.state.info = { published: true, paid: true, startMs: Date.now() + 3600000 }; F.state.view = "dash"; F.draw();
  expect(d.getElementById("zf-retro")).toBe(null);
  expect(d.getElementById("zf-claimed")).toBe(null);
  expect(d.getElementById("zf-sharecard")).not.toBe(null);
  F.state.view = "steps"; F.state.open = 5; for (const n of [1, 2, 3, 4]) F.state.done[n] = true; F.draw();
  expect(d.getElementById("zf-preview").textContent).toContain("Coming soon");
  F.state.open = 3; F.draw();
  expect(d.querySelector("[data-tix]")).toBe(null);
});

test("a game that has the TermsBox instead of CBConsent: Publish waits for its box, mounts kind K1, and sends the ticks it gives", async () => {
  const posted: any[] = [];
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=E1" });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.TermsBox = { mount: async (el: any, kind: string, o: any) => { posted.push(["mount", kind]); el.innerHTML = '<input type="checkbox" data-box="A">'; const c = el.querySelector("input"); c.addEventListener("change", () => { o.btn.disabled = !c.checked; }); o.btn.disabled = true; return { ok: () => c.checked, terms: () => ({ v: "7", boxes: c.checked ? ["A"] : [] }) }; } };
  win.sessionStorage.setItem("ctz-org", "x");
  const fetchFake = async (u: string, o: any = {}) => { if (o.method === "POST") posted.push(["post", u, JSON.parse(o.body)]); return { ok: true, json: async () => ({ ok: true, paid: false }) }; };
  new Function("window", "document", "location", "fetch", "sessionStorage", src)(win, win.document, win.location, fetchFake, win.sessionStorage);
  const F = win.ZFLOW, d = win.document;
  for (const n of [1, 2, 3, 4]) F.state.done[n] = true; F.state.open = 5; F.state.eid = "E1"; F.draw();
  await new Promise((r) => setTimeout(r, 20));
  expect(posted[0]).toEqual(["mount", "K1"]);
  expect(d.getElementById("zf-publish").disabled).toBe(true);
  const em = d.getElementById("zf-pemail"); em.value = "a@b.co"; em.dispatchEvent(new win.Event("input"));
  const ph = d.getElementById("zf-pphone"); ph.value = "98765 43210"; ph.dispatchEvent(new win.Event("input"));
  const box = d.querySelector("#zf-consent input"); box.checked = true; box.dispatchEvent(new win.Event("change"));
  expect(d.getElementById("zf-publish").disabled).toBe(false);
  d.getElementById("zf-publish").click(); await new Promise((r) => setTimeout(r, 30));
  const post = posted.find((x) => x[0] === "post");
  expect(post[2].consent).toEqual({ v: "7", boxes: ["A"] });
});

test("the game's own pace goes into the draft: 12 seconds unless its descriptor says another", async () => {
  const run = async (descriptor: string) => {
    const posted: any[] = [];
    const win: any = new Window({ url: "http://localhost/zc.html?flow=new" });
    win.document.body.innerHTML = '<main id="app"></main>';
    win.ZG = { roundAt: (ms: number) => Math.floor(ms / 3000) };
    win.sessionStorage.setItem("ctz-org", "x");
    const f = async (u: string, o: any = {}) => { if (o.method === "POST") posted.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ ok: true }) }; };
    new Function("window", "document", "location", "fetch", "sessionStorage", descriptor + "\n" + src)(win, win.document, win.location, f, win.sessionStorage);
    const d = win.document, set = (id: string, v: string) => { const n = d.getElementById(id); n.value = v; n.dispatchEvent(new win.Event("change")); };
    set("zf-date", new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)); set("zf-time", "18:00");
    d.getElementById("zf-save1").click(); await new Promise((r) => setTimeout(r, 30));
    return posted[0].callSeconds;
  };
  expect(await run("")).toBe(12);
  expect(await run("window.ZFLOW_GAME = { callSeconds: 20 };")).toBe(20);
});

test("a game whose CBConsent draws its boxes from loaded text (load / html / bind / payload): Publish waits, the ticks are sent", async () => {
  const posted: any[] = [];
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=E1" });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.CBConsent = {
    load: async (kind: string, get: any) => { posted.push(["load", kind, await get("/api/consent/" + kind)]); return { version: "v9", boxes: [{ id: "A" }, { id: "B" }] }; },
    html: (_i: any, _s: any) => '<input type="checkbox" class="cbc-tick" data-box="A"><input type="checkbox" class="cbc-tick" data-box="B">',
    bind: (root: any, info: any, state: any, btn: any) => { const sync = () => { btn.disabled = !(state.A && state.B); }; root.querySelectorAll("input").forEach((i: any) => { i.onchange = () => { state[i.dataset.box] = i.checked; sync(); }; }); sync(); },
    payload: (info: any, state: any) => (state.A && state.B ? { v: info.version, boxes: ["A", "B"] } : null),
  };
  win.sessionStorage.setItem("ctz-org", "x");
  const fetchFake = async (u: string, o: any = {}) => { if (o.method === "POST") posted.push(["post", u, JSON.parse(o.body)]); return { ok: true, json: async () => ({ ok: true, boxes: [] }) }; };
  new Function("window", "document", "location", "fetch", "sessionStorage", src)(win, win.document, win.location, fetchFake, win.sessionStorage);
  const F = win.ZFLOW, d = win.document;
  for (const n of [1, 2, 3, 4]) F.state.done[n] = true; F.state.open = 5; F.state.eid = "E1"; F.draw();
  await new Promise((r) => setTimeout(r, 30));
  expect(posted[0].slice(0, 2)).toEqual(["load", "K1"]);
  expect(d.getElementById("zf-publish").disabled).toBe(true);
  const em = d.getElementById("zf-pemail"); em.value = "a@b.co"; em.dispatchEvent(new win.Event("input"));
  const ph = d.getElementById("zf-pphone"); ph.value = "98765 43210"; ph.dispatchEvent(new win.Event("input"));
  for (const c of d.querySelectorAll("#zf-consent input")) { c.checked = true; c.dispatchEvent(new win.Event("change")); }
  expect(d.getElementById("zf-publish").disabled).toBe(false);
  d.getElementById("zf-publish").click(); await new Promise((r) => setTimeout(r, 30));
  expect(posted.find((x) => x[0] === "post")[2].consent).toEqual({ v: "v9", boxes: ["A", "B"] });
});
