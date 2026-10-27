// FALSIFIED BY: screens-home-has-input, screens-mislabel-status, screens-delete-hidden, screens-signin-no-consent
// The first three screens (sign in, Home, My games) run in a DOM against the real sign-in service and five fake games.
import { test, expect, setDefaultTimeout } from "bun:test";
import { Window } from "happy-dom";
import { world, spies } from "./support/world";

setDefaultTimeout(30_000);
const win = new Window({ url: "http://localhost/" });
Object.assign(globalThis, { window: win, document: win.document, HashChangeEvent: win.HashChangeEvent, Event: win.Event, location: win.location, alert: () => {} });
const { renderSignIn } = await import("../public/screens/signin.js");
const { renderHome } = await import("../public/screens/home.js");
const { renderMyGames, sectionsOf } = await import("../public/screens/mygames.js");
const { STATUS_TEXT } = await import("../public/screens/ui.js");

const ctxOf = (w: any, extra: any = {}) => ({ api: w.api, names: Object.fromEntries(w.games.map((g: any) => [g.id, g.name])), colors: Object.fromEntries(w.games.map((g: any) => [g.id, g.accent])), email: "alice@acme.example", ...extra });
const fresh = () => { const o = document.createElement("div"); document.body.replaceChildren(o); return o; };
const until = async (f: () => boolean, ms = 20000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) throw new Error("timed out waiting"); await new Promise((r) => setTimeout(r, 30)); } };

test("signed out: only the sign-in form; the consent box is required; the code form appears after the mail is sent; a right code signs in", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    const o = fresh(); let signed = 0;
    renderSignIn(o, ctxOf(w, { onSignedIn: async () => { signed++; } }));
    expect(o.querySelector("nav,.top,.tabbar")).toBe(null);
    const email = o.querySelector("#si-email") as any, consent = o.querySelector("#si-consent") as any;
    const submit = (f: Element) => f.dispatchEvent(new win.Event("submit", { cancelable: true, bubbles: true }));
    const forms = o.querySelectorAll("form"); const form = forms[0]!, codeForm = forms[1]!;
    email.value = "alice@acme.example";
    submit(form);
    expect(o.querySelector(".signmsg")!.textContent).toContain("tick the box");
    expect(w.mails.length).toBe(0);
    consent.checked = true; submit(form);
    await until(() => !codeForm.classList.contains("hide"));
    expect(w.mails.length).toBe(1);
    expect(o.querySelector("#si-sent")!.textContent).toContain("alice@acme.example");
    (o.querySelector("#si-code") as any).value = "000000"; submit(codeForm);
    await until(() => /not right|run out/.test(o.querySelector(".signmsg")!.textContent || ""));
    expect(signed).toBe(0);
    (o.querySelector("#si-code") as any).value = /code is (\d{6})/.exec(w.mails[0]!)![1]; submit(codeForm);
    await until(() => signed === 1);
  } finally { w.stop(); }
});

test("Home: exactly three doors and NO input of any kind; what needs attention and what is playing come from the games", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect();
    const o = fresh();
    await renderHome(o, ctxOf(w));
    expect([...o.querySelectorAll(".tiles3 .tile")].map((t: any) => t.querySelector("b").textContent)).toEqual(["Create a new game", "My games", "Play as a participant"]);
    expect(o.querySelectorAll("input, textarea, select").length).toBe(0);
    const rows = [...o.querySelectorAll(".arow")].map((r: any) => r.textContent);
    expect(rows.some((t: string) => /Waiting for payment/.test(t))).toBe(true);
    expect(rows.some((t: string) => /Invitation/.test(t))).toBe(true);
    expect(o.querySelector(".nowside")!.textContent).toContain("PLAY001");
    expect(o.textContent).toContain("Could not reach Tic-Tac-Toe"); // the one game that is down is named; the rest still show
  } finally { w.stop(); }
});

test("My games: the seven status words are exactly the console's, each card has a role chip, drafts always show Delete draft, others show Clone", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect();
    const o = fresh();
    await renderMyGames(o, ctxOf(w));
    const cards = [...o.querySelectorAll(".gcard")] as any[];
    expect(cards.length).toBeGreaterThan(9);
    const tam = cards.filter((c) => c.dataset.game === "tambola");
    const statusOf = (eid: string) => tam.find((c) => c.dataset.eid === eid).querySelector(".chip").textContent;
    expect(statusOf("DRAFT01")).toBe("Draft"); expect(statusOf("WAIT001")).toBe("Waiting for payment"); expect(statusOf("READY01")).toBe("Ready"); expect(statusOf("PLAY001")).toBe("Playing now");
    expect(statusOf("DONE001")).toBe("Finished"); expect(statusOf("CANC001")).toBe("Cancelled"); expect(statusOf("NOST001")).toBe("Did not start");
    expect(Object.values(STATUS_TEXT)).toEqual(["Draft", "Waiting for payment", "Ready", "Playing now", "Finished", "Cancelled", "Did not start"]);
    for (const c of cards) expect(c.querySelector(".role")!.textContent).toMatch(/^(Organizer|Host|Co-host)$/);
    const draft = tam.find((c) => c.dataset.eid === "DRAFT01");
    expect([...draft.querySelectorAll("button")].map((b: any) => b.textContent)).toEqual(["Clone", "Delete draft"]);
    expect([...tam.find((c) => c.dataset.eid === "READY01").querySelectorAll("button")].map((b: any) => b.textContent)).toEqual(["Clone"]);
    expect(tam.find((c) => c.dataset.eid === "BOBS001").querySelector(".role")!.textContent).toBe("Host");
    expect(tam.find((c) => c.dataset.eid === "BOBS001").textContent).toContain("Invited by Bob Industries");
    const heads = [...o.querySelectorAll("h2.sechead")].map((h: any) => h.textContent);
    expect(heads[0]).toBe("Needs your attention"); expect(heads).toContain("Playing now");
  } finally { w.stop(); }
});

test("My games: Delete draft frees the card; the filter shows only that role; sections are ordered", async () => {
  const w = await world({ slowMs: 0 }); spies();
  try {
    await w.signIn(); await w.api.connect();
    const o = fresh();
    await renderMyGames(o, ctxOf(w));
    const eids = () => [...o.querySelectorAll(".gcard")].map((c: any) => c.dataset.game + "/" + c.dataset.eid);
    expect(eids()).toContain("tambola/DRAFT01");
    const btn = [...(o.querySelector('[data-eid="DRAFT01"][data-game="tambola"]') as any).querySelectorAll("button")].find((b: any) => b.textContent === "Delete draft");
    btn.click();
    await until(() => !eids().includes("tambola/DRAFT01"));
    expect(w.states.tambola.games.some((g: any) => g.eid === "DRAFT01")).toBe(false); // really gone in the game
    const host = [...o.querySelectorAll('input[name="mf"]')].find((i: any) => i.value === "host") as any;
    host.checked = true; host.dispatchEvent(new win.Event("change", { bubbles: true }));
    await until(() => [...o.querySelectorAll(".gcard")].every((c: any) => c.querySelector(".role").textContent === "Host"));
    expect([...o.querySelectorAll(".gcard")].length).toBeGreaterThan(0);
  } finally { w.stop(); }
});

test("sections: attention first, then playing now, the rest ready, draft, finished, cancelled, did-not-start", () => {
  const g = (eid: string, status: string, o: any = {}) => ({ game: "x", eid, name: eid, role: "organizer", status, startMs: 1, nextAction: "none", ...o });
  const s = sectionsOf([g("A", "finished"), g("B", "cancelled"), g("C", "waiting_payment"), g("D", "playing"), g("E", "draft"), g("F", "ready"), g("G", "not_started"), g("H", "ready", { nextAction: "accept", role: "host" })], "all");
  expect(s.attn.map((x: any) => x.eid).sort()).toEqual(["C", "H"]);
  expect(s.live.map((x: any) => x.eid)).toEqual(["D"]);
  expect(s.rest.map((x: any) => x.eid)).toEqual(["F", "E", "A", "B", "G"]);
  expect(sectionsOf([g("A", "finished", { role: "host" }), g("B", "draft")], "organizer").rest.map((x: any) => x.eid)).toEqual(["B"]);
});
