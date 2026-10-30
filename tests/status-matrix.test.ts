// FALSIFIED BY: status-tap-too-small, status-short-name, status-pill-same-colours, status-theme-contrast, status-helper-gets-pay, status-late-reads-pending, status-banner-we, status-cohost-approves, status-approval-everywhere, status-family-unlimited, status-pill-class
// Master console rows (2026-10-30): Game ID, ONE status pill with its plain banner, the role line (who lets whom in, for what each game's engine does), the buttons a person may press, and the wording rules.
// Logic tests, a wire test (the built config), regression of the console's own words, and a STREAMED scenario matrix over games x roles x row status x payment x next action x start time x preview x link type x device x theme x answered
// (1,451,520 scenarios, none stored: each is checked and forgotten). What a scenario really asserts: its row's status, banner, buttons and approval line (rows, preview, link type), the answer of the game (answered), the REAL designFor of the console at that width (device),
// and the WCAG contrast of that status's pill, the banner and the role line in that theme read from the css (theme). Tap sizes are NOT a per-scenario check: they are one fact per control and design, asserted once each in 'tap sizes' below and not counted.
import { test, expect } from "bun:test";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { build } from "../build.mjs";
import { contrastRatio } from "../tools/browser-tests/viewport-kit.mjs";
import { STATUSES, rowStatus, bannerFor, roleLine, rowActions, approverFor, approvalNote, supports, LINK_TYPES, ROLE_LINE } from "../public/core/status.js";
import { mergeGames, OFF } from "../public/core/merge.js";
import { gamesFailedLine } from "../public/core/errors.js";

const read = (f: string) => readFileSync(join(import.meta.dir, "..", f), "utf8");
const cfg = JSON.parse(read("config/games.json"));
const GAMES = cfg.games.map((g: any) => ({ id: g.id, name: g.name, status: g.status, approvals: g.approvals || [], origin: g.live }));
const TAMBOLA = GAMES.find((g: any) => g.id === "tambola");
const ROLES = ["organizer", "host", "cohost"];
const ROW_STATUS = ["draft", "waiting_payment", "ready", "playing", "finished", "cancelled", "not_started"];
const PAY = ["free", "waiting", "paid", "credit"];
const NEXT = ["none", "accept", "pay", "publish"];
const NOW = Date.UTC(2026, 9, 30, 6, 30), HOUR = 3600000;
const STARTS = [NOW - 2 * HOUR, NOW + 10 * 60000, NOW + 3 * 86400000, null];
const WIDTHS = [360, 768, 1280], THEMES = ["light", "dark"], ANSWERED = ["ok", "failed", "off"];
// a FRESH build for this run (never a stale dist/): the config the browser gets, and the real designFor of boot.js
const OUT = mkdtempSync(join(tmpdir(), "mc-matrix-"));
build({ env: "preview", out: OUT, version: "0.0.0-test", releasedAt: "2026-10-30T00:00:00.000Z" });
const boot = await import(join(OUT, "core/boot.js").replace(/\\/g, "/"));
// the colours the pills, banner and role line really get, in each theme, read from the css files
const appCss = read("public/core/app.css"), tokCss = read("public/core/tokens.css");
const tokVars = (b: string) => Object.fromEntries([...b.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{3,6})/g)].map((m) => [m[1], m[2]]));
const TOK = { light: tokVars(/:root \{([^}]*)\}/.exec(tokCss)![1]), dark: {} as any }; TOK.dark = { ...TOK.light, ...tokVars(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/.exec(tokCss)![1]) };
const pillPair = (cls: string, theme: string) => { const re = theme === "dark" ? new RegExp(String.raw`:root\[data-theme="dark"\] \.chip\.${cls}\s*\{\s*background:\s*(#[0-9A-Fa-f]{6});\s*color:\s*(#[0-9A-Fa-f]{6});`) : new RegExp(String.raw`^\.chip\.${cls}\s*\{\s*background:\s*(#[0-9A-Fa-f]{6});\s*color:\s*(#[0-9A-Fa-f]{6});`, "m"); const m = re.exec(appCss)!; return contrastRatio(m[2], m[1]); };
const PILL: any = { light: {}, dark: {} };
for (const th of THEMES) for (const cls of new Set(Object.values(STATUSES).map((s: any) => s.cls))) PILL[th][cls as string] = pillPair(cls as string, th);
const TEXT_RATIO: any = { light: Math.min(contrastRatio(TOK.light["ink"], TOK.light["soft"]), contrastRatio(TOK.light["ink2"], TOK.light["card"])), dark: Math.min(contrastRatio(TOK.dark["ink"], TOK.dark["soft"]), contrastRatio(TOK.dark["ink2"], TOK.dark["card"])) };
const tapPx = Number(/--tap:\s*(\d+)px/.exec(tokCss)![1]);
const BANNED = [/\bwe\b/i, /\bour\b/i, /\bprivate\b/i, /\bRs\.?\s?\d/, /\bseats?\b/i, /in the office/i, /\bcash\b/i, /coming soon/i];
const PAYEE = /Razorpay|IT Services|Projexa|Corporate Tambola Pvt|Stripe|PayPal/i;
const HELPER_BANNED_ACTIONS = ["pay", "publish", "copy", "delete-draft"];
const row = (o: any = {}) => ({ game: "tambola", eid: "EABCDEF", name: "Diwali party", role: "organizer", status: "ready", startMs: NOW + 3 * 86400000, cap: 100, nextAction: "none", payment: { state: "paid" }, ...o });

test("rowStatus: the one status of a row, from its word, its payment and its start time", () => {
  expect(rowStatus(row({ status: "draft" }), NOW)).toBe("draft");
  expect(rowStatus(row({ status: "waiting_payment", startMs: NOW + HOUR }), NOW)).toBe("pending");
  expect(rowStatus(row({ status: "waiting_payment", startMs: NOW - HOUR }), NOW)).toBe("overdue");
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

test("who lets whom in: organizer and Host links everywhere; Co-host, family and open links only for a game whose engine does them (Corporate Tambola today)", () => {
  expect(approverFor("organizer-link", GAMES[2])).toContain("organizer or a Host");
  expect(approverFor("host-link", GAMES[2])).toBe(approverFor("organizer-link", GAMES[2]));
  expect(TAMBOLA.approvals).toEqual(["cohost-link", "family-link", "open-link"]);
  expect(approverFor("cohost-link", TAMBOLA)).toContain("that Co-host, a Host or the organizer");
  expect(approverFor("family-link", TAMBOLA)).toContain("up to 15 minutes before the game begins");
  expect(approverFor("open-link", TAMBOLA)).toContain("nobody needs to let anyone in");
  for (const g of GAMES.filter((x: any) => x.id !== "tambola")) for (const t of ["cohost-link", "family-link", "open-link"]) expect(approverFor(t, g)).toBe(null);
  expect(roleLine("cohost", TAMBOLA)).toContain("let in the people who came with your link");
  expect(roleLine("cohost", GAMES[1])).toBe(ROLE_LINE.cohost);
  expect(roleLine("cohost", GAMES[1])).not.toMatch(/you (let|approve)/i);
  expect(approvalNote(GAMES).join(" ")).toContain("Corporate Tambola: A person who came with a Co-host");
  expect(approvalNote(GAMES.filter((g: any) => g.id !== "tambola")).length).toBe(2);
});

test("wire: the built config carries each game's own approvals, every game has its full name, the Try-it entry is gone (the new screens are the default)", () => {
  const built = readFileSync(join(OUT, "core/games.config.js"), "utf8"); // built fresh for this run: never a stale dist/
  const exported = JSON.parse(/Object\.freeze\(([\s\S]*)\);\s*$/.exec(built)![1]);
  expect(exported.map((g: any) => g.id)).toEqual(GAMES.map((g: any) => g.id));
  for (const g of exported) {
    expect(Object.keys(g).sort()).toEqual(["accent", "approvals", "freeCap", "id", "name", "origin", "ready", "status"]); // no short name, no new-screens entry
    expect(g.name).toMatch(/^Corporate /);
    expect(g.approvals).toEqual(GAMES.find((x: any) => x.id === g.id).approvals);
    // every string the browser is given follows the wording rules
    for (const v of Object.values(g).flat()) if (typeof v === "string") for (const re of BANNED) expect([g.id, v, re.test(v)]).toEqual([g.id, v, false]);
  }
  expect(built).not.toContain("newScreens");
  expect(read("public/screens/create.js")).not.toMatch(/Try the new organizer/);
});

test("tap sizes: every control a person presses is at least 44 px, one rule per control and design (a fact about the css, not counted as scenarios)", () => {
  expect(tapPx).toBeGreaterThanOrEqual(44);
  expect(appCss).toMatch(/\.btn \{[^}]*min-height: 4[89]px/);                      // every button
  expect(appCss).toMatch(/\.btn\.sm \{ min-height: 44px/);                        // the small buttons on a game card
  expect(appCss).toMatch(/\.seg label span \{[^}]*min-height: var\(--tap\)/);   // the filter chips (radio buttons)
  expect(appCss).toMatch(/\.tabbar a \{[^}]*min-height: 5\d+px/);                 // phone: the bottom menu
  expect(appCss).toMatch(/\.top nav a \{[^}]*min-height: var\(--tap\)/);        // laptop: the top menu
});

test("the pill colours exist in light and in dark for every status", () => {
  const css = read("public/core/app.css");
  for (const cls of new Set(Object.values(STATUSES).map((s: any) => s.cls))) {
    expect(css).toContain(".chip." + cls);
    expect(css).toMatch(new RegExp(`\\[data-theme="dark"\\] \\.chip\\.${cls}|:root\\[data-theme="dark"\\] \\.chip\\.${cls}|\\.chip\\.${cls}[^{]*\\{[^}]*\\}`));
  }
  for (const cls of ["s-pending", "s-paid", "s-overdue", "s-done"]) expect(css).toContain(`:root[data-theme="dark"] .chip.${cls}`);
});

test("scenario matrix, streamed: 1,451,520 scenarios keep every rule", () => {
  const fails: string[] = [];
  const must = (ok: boolean, what: string) => { if (!ok && fails.length < 20) fails.push(what); };
  const STATUS_KEYS = new Set(Object.keys(STATUSES)), CLS = new Set(Object.values(STATUSES).map((s: any) => s.cls));
  let scen = 0;
  for (const game of GAMES) for (const role of ROLES) for (const st of ROW_STATUS) for (const pay of PAY) for (const next of NEXT) for (const startMs of STARTS) {
    const g: any = row({ game: game.id, role, status: st, nextAction: next, startMs, payment: { state: pay }, roleId: next === "accept" ? "r1" : undefined });
    const tag = [game.id, role, st, pay, next, startMs].join("/");
    const s = rowStatus(g, NOW), when = startMs == null ? "Not scheduled yet" : "Sat 18:00 IST";
    must(STATUS_KEYS.has(s), "status " + tag);
    if (st === "waiting_payment") must(s === (startMs != null && startMs <= NOW ? "overdue" : "pending"), "late " + tag);
    if (s === "paid" || s === "free") must(st === "ready", "paid only when ready " + tag);
    if (s === "free") must(pay === "free", "free " + tag);
    const b = bannerFor(s, g, when);
    must(b.length > 10, "banner " + tag);
    for (const re of BANNED) must(!re.test(b), "banner words " + tag);
    must(!PAYEE.test(b), "payee " + tag);
    must(CLS.has(STATUSES[s as keyof typeof STATUSES].cls), "pill " + tag);
    const rl = roleLine(role, game);
    must(rl.length > 20, "role line " + tag);
    for (const re of BANNED) must(!re.test(rl), "role words " + tag);
    if (role === "cohost") must(supports(game, "cohost-link") === /let in the people who came with your link/.test(rl), "cohost line follows the engine " + tag);
    const actsBy: any = {};
    for (const preview of [false, true]) {
      const acts = rowActions(g, preview ? { features: { preview: true } } : {}, s), ids = acts.map((a: any) => a.id);
      actsBy[String(preview)] = ids;
      if (next === "accept") must(ids.every((i: string) => ["accept", "decline", "open-in-game"].includes(i)), "accept " + tag);
      else {
        must(ids.filter((i: string) => i === "open").length === 1 && acts.filter((a: any) => a.main).length === 1, "one open " + tag);
        must(ids.includes("preview") === preview, "preview " + tag);
        if (role !== "organizer") for (const bad of HELPER_BANNED_ACTIONS) must(!ids.includes(bad), "helper " + bad + " " + tag);
        else { must(ids.includes("publish") === (s === "draft"), "publish " + tag); must(ids.includes("pay") === (s === "pending" || s === "overdue"), "pay " + tag); must(ids.includes("delete-draft") === (s === "draft"), "delete " + tag); must(ids.includes("copy") === (s !== "deleted"), "copy " + tag); }
      }
      for (const lt of LINK_TYPES) {
        const a = approverFor(lt, game);
        if (lt === "organizer-link" || lt === "host-link") must(!!a && a.includes("organizer"), "approver base " + tag);
        else must((a !== null) === supports(game, lt), "approver follows the engine " + lt + " " + tag);
        if (a) for (const re of BANNED) must(!re.test(a), "approver words " + tag);
        for (const w of WIDTHS) for (const theme of THEMES) for (const ans of ANSWERED) {
          scen++;
          // the answer of the game: a row is listed once; a slow one is named in full; one that is not on the console yet is not an error
          const m = mergeGames([{ game: game.id, ok: ans === "ok", rows: ans === "ok" ? [g] : undefined, error: ans === "off" ? OFF : ans === "failed" ? "slow" : undefined }]);
          must(m.rows.length === (ans === "ok" ? 1 : 0) && m.failed.length === (ans === "failed" ? 1 : 0) && m.off.length === (ans === "off" ? 1 : 0), "merge " + ans + " " + tag);
          // the device: the real designFor of the console, and the controls of that design are tappable (44 px or more)
          const design = boot.designFor(w);
          must(design === (w >= 900 ? "laptop" : "phone"), "design " + w + " " + tag);
          // the theme: this status's pill, the banner and the role line read well (WCAG AA) in light and in dark
          must(PILL[theme][STATUSES[s as keyof typeof STATUSES].cls] >= 4.5 && TEXT_RATIO[theme] >= 4.5, "contrast " + theme + " " + tag);
        }
      }
    }
    must(actsBy["true"].length === actsBy["false"].length + (next === "accept" ? 0 : 1), "preview adds exactly one " + tag);
  }
  expect(fails).toEqual([]);
  expect(scen).toBe(1451520);
  expect(gamesFailedLine(["Corporate Tambola"])).toContain("Corporate Tambola");
});

test("the words on the console screens follow the rules: 'the system' not 'we', never 'private', English only, one payee", () => {
  const files = ["public/core/status.js", "public/core/errors.js", "public/screens/account.js", "public/screens/billing.js", "public/screens/mygames.js", "public/screens/signin.js", "public/screens/create.js", "public/screens/home.js", "public/signin.js", "public/copy/en.json"];
  for (const f of files) {
    const t = read(f).replace(/\/\/ .*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const strings = [...t.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1]).filter((s) => /\s/.test(s) && /[A-Za-z]{3}/.test(s));
    for (const s of strings) { expect([f, /\bwe\b/i.test(s), s.slice(0, 50)]).toEqual([f, false, s.slice(0, 50)]); expect([f, /\bprivate\b/i.test(s)]).toEqual([f, false]); }
  }
});
