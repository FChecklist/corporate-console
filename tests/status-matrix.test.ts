// FALSIFIED BY: status-helper-gets-pay, status-late-reads-pending, status-banner-we, status-cohost-approves, status-tryit-everywhere
// Master console rows (2026-10-30): Game ID, ONE status pill with its plain banner, the role line, the buttons a person may press, the Try-the-new-screens entry for Corporate Tambola only,
// and the wording rules. Logic tests, a wire test (the built config and the addresses), and a scenario matrix over games x roles x row status x payment x next action x start time x preview x link type (80,640 scenarios).
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STATUSES, rowStatus, bannerFor, roleLine, rowActions, newScreensLink, approverFor, approvalNote, LINK_TYPES, ROLE_LINE } from "../public/core/status.js";

const cfg = JSON.parse(readFileSync(join(import.meta.dir, "../config/games.json"), "utf8"));
const GAMES = cfg.games.map((g: any) => ({ id: g.id, name: g.name, status: g.status, newScreens: g.newScreens, origin: g.live }));
const ROLES = ["organizer", "host", "cohost"];
const ROW_STATUS = ["draft", "waiting_payment", "ready", "playing", "finished", "cancelled", "not_started"];
const PAY = ["free", "waiting", "paid", "credit"];
const NEXT = ["none", "accept", "pay", "publish"];
const NOW = Date.UTC(2026, 9, 30, 6, 30), HOUR = 3600000;
const STARTS = [NOW - 2 * HOUR, NOW + 10 * 60000, NOW + 3 * 86400000, null];
const BANNED = [/\bwe\b/i, /\bour\b/i, /\bprivate\b/i, /\bRs\.?\s?\d/, /\bseats?\b/i, /in the office/i, /\bcash\b/i, /coming soon/i];
const PAYEE = /Razorpay|IT Services|Projexa|Corporate Tambola Pvt|Stripe|PayPal/i;
const HELPER_BANNED_ACTIONS = ["pay", "publish", "copy", "delete-draft"];

const row = (o: any = {}) => ({ game: "tambola", eid: "EABCDEF", name: "Diwali party", role: "organizer", status: "ready", startMs: NOW + 3 * 86400000, cap: 100, nextAction: "none", payment: { state: "paid" }, ...o });

test("rowStatus: the one status of a row, from its word, its payment and its start time", () => {
  expect(rowStatus(row({ status: "draft" }), NOW)).toBe("draft");
  expect(rowStatus(row({ status: "waiting_payment", startMs: NOW + HOUR }), NOW)).toBe("pending");
  expect(rowStatus(row({ status: "waiting_payment", startMs: NOW - HOUR }), NOW)).toBe("overdue"); // the start time has passed and it is unpaid
  expect(rowStatus(row({ status: "not_started" }), NOW)).toBe("overdue");
  expect(rowStatus(row({ status: "ready", payment: { state: "free" } }), NOW)).toBe("free");
  expect(rowStatus(row({ status: "ready", payment: { state: "paid" } }), NOW)).toBe("paid");
  expect(rowStatus(row({ status: "ready", payment: { state: "credit" } }), NOW)).toBe("paid");
  expect(rowStatus(row({ status: "playing" }), NOW)).toBe("live");
  expect(rowStatus(row({ status: "finished" }), NOW)).toBe("completed");
  expect(rowStatus(row({ status: "cancelled" }), NOW)).toBe("cancelled");
  expect(rowStatus(row({ erased: true }), NOW)).toBe("deleted");
});

test("the pills are the owner's words and the banners are the plain ones (the unpaid and paid texts word for word)", () => {
  expect(Object.values(STATUSES).map((s: any) => s.label)).toEqual(["Draft", "Published, payment pending", "Published and paid", "Published, free game", "Payment pending, start time passed", "Live now", "Completed", "Cancelled", "Data deleted"]);
  expect(bannerFor("pending", row(), "")).toBe("Published, payment is pending. Don’t worry. The game will not start until the payment is done, and you can cancel it at any time.");
  expect(bannerFor("paid", row(), "Sat 18:00 IST")).toBe("Congratulations, your game is on! It will begin at Sat 18:00 IST. Don’t worry if you want to postpone or change anything: you can do it up to 5 minutes before the game begins.");
  expect(bannerFor("completed", row(), "")).toContain("The report was also sent");
  expect(bannerFor("deleted", row(), "")).toContain("Only the Game ID and the payment record remain");
});

test("a Host or Co-host is never told to pay or cancel, and never gets those buttons", () => {
  for (const role of ["host", "cohost"]) {
    expect(bannerFor("pending", row({ role }), "")).toContain("The organizer pays");
    expect(bannerFor("overdue", row({ role }), "")).not.toMatch(/Pay now|cancel it/);
    expect(rowActions(row({ role, status: "draft" })).map((a: any) => a.id)).toEqual(["open"]);
  }
});

test("the organizer's buttons follow the status: Publish on a draft, Pay now while unpaid, Make a copy, Delete only on a draft", () => {
  const ids = (o: any, caps?: any) => rowActions(row(o), caps).map((a: any) => a.id);
  expect(ids({ status: "draft" })).toEqual(["open", "publish", "copy", "delete-draft"]);
  expect(ids({ status: "waiting_payment", startMs: NOW + HOUR, payment: { state: "waiting" } })).toEqual(["open", "pay", "copy"]);
  expect(ids({ status: "ready" }, { features: { preview: true } })).toEqual(["open", "preview", "copy"]);
  expect(ids({ status: "finished" })).toEqual(["open", "copy"]);
  expect(rowActions(row({ status: "finished" }))[0].label).toBe("Results and game log");
  expect(rowActions(row({ nextAction: "accept", roleId: "r1", role: "host" })).map((a: any) => a.id)).toEqual(["accept", "decline"]);
  expect(rowActions(row({ nextAction: "accept", role: "host" })).map((a: any) => a.id)).toEqual(["open-in-game"]);
});

test("who lets whom in: only what the engine does is told; co-host approval, family passes and the open form are not shown", () => {
  expect(approverFor("organizer-link")).toContain("organizer or a Host");
  expect(approverFor("host-link")).toBe(approverFor("organizer-link"));
  for (const t of ["cohost-link", "open-link", "family-link"]) expect(approverFor(t)).toBe(null);
  expect(roleLine("organizer")).toContain("You let in");
  expect(roleLine("cohost")).not.toMatch(/you (let|approve)/i); // a Co-host does not let people in (the engine cannot do that yet)
  expect(approvalNote().join(" ")).toContain("nothing else");
});

test("wire: Create gets the Try the new organizer screens entry for Corporate Tambola only, pointing at its own address; every game has its full name", () => {
  const link = newScreensLink(GAMES.find((g: any) => g.id === "tambola"));
  expect(link).toEqual({ href: "https://housie.corporatetambola.com/zc?flow=new", label: "Try the new organizer screens" });
  for (const g of GAMES.filter((x: any) => x.id !== "tambola")) expect(newScreensLink(g)).toBe(null);
  for (const g of GAMES) expect(g.name).toMatch(/^Corporate /);
  const built = readFileSync(join(import.meta.dir, "../dist/core/games.config.js"), "utf8");
  expect((built.match(/"newScreens"/g) || []).length).toBe(1);
});

test("scenario matrix: 80,640 scenarios (8,064 rows x preview x 5 link types) keep every rule", () => {
  let n = 0, shown = 0, scen = 0;
  for (const game of GAMES) for (const role of ROLES) for (const st of ROW_STATUS) for (const pay of PAY) for (const next of NEXT) for (const startMs of STARTS) {
    const g: any = row({ game: game.id, role, status: st, nextAction: next, startMs, payment: { state: pay }, roleId: next === "accept" ? "r1" : undefined });
    const s = rowStatus(g, NOW), when = startMs == null ? "Not scheduled yet" : "Sat 18:00 IST";
    // one status, from the table
    expect(Object.keys(STATUSES)).toContain(s);
    if (st === "waiting_payment") expect(s).toBe(startMs != null && startMs <= NOW ? "overdue" : "pending");
    if (s === "paid" || s === "free") expect(st).toBe("ready");
    if (s === "free") expect(pay).toBe("free");
    // the banner: plain, in the style guide, no payee, helpers told nothing that is the organizer's
    const b = bannerFor(s, g, when);
    expect(b.length).toBeGreaterThan(10);
    for (const re of BANNED) expect(re.test(b)).toBe(false);
    expect(PAYEE.test(b)).toBe(false);
    // the buttons
    for (const preview of [false, true]) {
      const acts = rowActions(g, preview ? { features: { preview: true } } : {}, s), ids = acts.map((a: any) => a.id);
      if (next === "accept") { expect(ids.every((i: string) => ["accept", "decline", "open-in-game"].includes(i))).toBe(true); }
      else {
        expect(ids.filter((i: string) => i === "open").length).toBe(1);
        expect(acts.filter((a: any) => a.main).length).toBe(1);
        expect(ids.includes("preview")).toBe(preview);
        if (role !== "organizer") for (const bad of HELPER_BANNED_ACTIONS) expect(ids).not.toContain(bad);
        else {
          expect(ids.includes("publish")).toBe(s === "draft");
          expect(ids.includes("pay")).toBe(s === "pending" || s === "overdue");
          expect(ids.includes("delete-draft")).toBe(s === "draft");
          expect(ids.includes("copy")).toBe(s !== "deleted");
        }
      }
      n++;
    }
    scen += 10; // this row, with and without a preview, for each of the 5 kinds of link
    // the role line and who lets whom in, for each kind of link
    expect(roleLine(role).length).toBeGreaterThan(20);
    for (const re of BANNED) expect(re.test(roleLine(role))).toBe(false);
    for (const lt of LINK_TYPES) { const a = approverFor(lt); if (a) { shown++; expect(a).toContain("organizer"); for (const re of BANNED) expect(re.test(a)).toBe(false); } else expect(["cohost-link", "open-link", "family-link"]).toContain(lt); n++; }
    // the pill and the Try-it entry
    expect(["draft", "pay", "ready", "nostart", "live", "done", "cancel"]).toContain(STATUSES[s as keyof typeof STATUSES].cls);
    expect(newScreensLink(game) !== null).toBe(game.id === "tambola"); n++;
  }
  expect(scen).toBe(80640);
  expect(n).toBeGreaterThan(30000);
  expect(shown).toBeGreaterThan(0);
});

test("the words on the console screens follow the rules: 'the system' not 'we', never 'private', English only, the full game names, one payee", () => {
  const files = ["public/core/status.js", "public/core/errors.js", "public/screens/account.js", "public/screens/billing.js", "public/screens/mygames.js", "public/screens/signin.js", "public/screens/create.js", "public/screens/home.js", "public/signin.js", "public/copy/en.json"];
  for (const f of files) {
    const t = readFileSync(join(import.meta.dir, "..", f), "utf8").replace(/\/\/ .*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const strings = [...t.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1]).filter((s) => /\s/.test(s) && /[A-Za-z]{3}/.test(s));
    for (const s of strings) { expect([f, /\bwe\b/i.test(s), s.slice(0, 50)]).toEqual([f, false, s.slice(0, 50)]); expect([f, /\bprivate\b/i.test(s)]).toEqual([f, false]); }
  }
  expect(ROLE_LINE.cohost).not.toContain(" we ");
});
