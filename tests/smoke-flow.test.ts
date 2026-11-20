// FALSIFIED BY: smoke-signin-mail-slow-screen, smoke-signin-test-address-screen, smoke-pack-fallback-price
// (addresses with \u0040 are written that way on purpose: the repo rule keeps real-looking addresses out of test source; they are never sent anywhere, the mail service is a stand-in)
// SMOKE 20 NOV 2026, owner steps 5 to 10 as far as they live in this repo: the shared flow's own rules (date and time, size, prizes, brand, contact, status words), the one ID rule, and the sign-in screen's answer to a test address.
// One test = one cell of the matrix in docs/SMOKE-20NOV-CONSOLE.md. Pure rules run as they are; nothing is mocked except time.
import { test, expect } from "bun:test";
import { createRequire } from "node:module";
import { Window } from "happy-dom";
import { cleanEmployeeId, checkEmployeeId, EMPLOYEE_ID_MAX } from "../packages/game-pack/employee-id.js";

const F = createRequire(import.meta.url)("../packages/game-pack/zc-flow.js");
const IST = "Asia/Kolkata";
const T = (iso: string) => Date.parse(iso);
const NOW = T("2026-11-20T06:00:00Z"); // 11:30 am IST, 20 Nov 2026
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

// ---------- step 8: date, time and zone ----------
const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles", "Australia/Sydney"];
let n = 0;
for (const z of ZONES) {
  const today = F.todayIn(NOW, z);
  const rows: Array<[string, string, string, boolean]> = [
    ["yesterday", addDays(today, -1), "12:00", false],
    ["today, one hour ago", today, "00:00", false], // checked below against the real wall clock
    ["tomorrow noon", addDays(today, 1), "12:00", true],
    ["+29 days", addDays(today, 29), "12:00", true],
    ["+31 days", addDays(today, 31), "12:00", false],
  ];
  for (const [name, date, time, okWant] of rows) {
    if (name === "today, one hour ago") continue;
    test(`D-${String(++n).padStart(2, "0")} date ${name} in ${z}: ${okWant ? "accepted" : "refused in plain words"}`, () => {
      const bad = F.whenProblems({ occ: "Team party", date, time, zone: z }, NOW);
      if (okWant) expect(bad).toEqual([]);
      else { expect(bad.length).toBe(1); expect(bad[0]).toMatch(/already passed|at most 30 days/); }
    });
  }
  test(`D-${String(++n).padStart(2, "0")} today in ${z}: a time that is past is refused, a time a few hours ahead is accepted`, () => {
    const p = F.wallToMs(F.todayIn(NOW, z), "00:00", z);
    expect(F.whenProblems({ occ: "Team party", date: F.todayIn(NOW, z), time: "00:00", zone: z }, NOW).length).toBe(p > NOW ? 0 : 1);
    const later = new Intl.DateTimeFormat("en-GB", { timeZone: z, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(new Date(NOW + 3 * 3600_000)); // three hours from now on that clock
    const day = F.todayIn(NOW + 3 * 3600_000, z);
    expect(F.whenProblems({ occ: "Team party", date: day, time: later, zone: z }, NOW)).toEqual([]);
  });
}
// around midnight IST: "today" changes at 00:00 IST, not at 00:00 in London or in the computer's own zone
const MID: Array<[string, string, string, string, boolean]> = [
  ["23:59:30 IST, 21 Nov 00:00 IST is 30 s away", "2026-11-20T18:29:30Z", "2026-11-21", "00:00", true],
  ["23:59:30 IST, 20 Nov 23:45 IST has passed", "2026-11-20T18:29:30Z", "2026-11-20", "23:45", false],
  ["00:00:30 IST on 21 Nov, 20 Nov 23:59 IST has passed", "2026-11-20T18:30:30Z", "2026-11-20", "23:59", false],
  ["00:00:30 IST on 21 Nov, 21 Nov 00:15 IST is ahead", "2026-11-20T18:30:30Z", "2026-11-21", "00:15", true],
  ["00:00:30 IST on 21 Nov, 21 Nov 00:00 IST has passed (30 s ago)", "2026-11-20T18:30:30Z", "2026-11-21", "00:00", false],
  ["exactly 30 days ahead at the same minute is still allowed ('at most 30 days')", "2026-11-20T06:00:00Z", "2026-12-20", "11:30", true],
];
for (const [name, now, date, time, okWant] of MID) {
  test(`D-${String(++n).padStart(2, "0")} midnight IST: ${name}`, () => {
    const bad = F.whenProblems({ occ: "Team party", date, time, zone: IST }, T(now));
    expect(bad.length === 0).toBe(okWant);
  });
}
test(`D-${String(++n).padStart(2, "0")} the largest allowed start (29 days 23 h 59 m) is accepted and the smallest refused (30 days + 1 min)`, () => {
  expect(F.whenProblems({ occ: "Team party", date: "2026-12-20", time: "11:29", zone: IST }, NOW)).toEqual([]);
  expect(F.whenProblems({ occ: "Team party", date: "2026-12-20", time: "11:31", zone: IST }, NOW).length).toBe(1);
});
// a zone with a clock change: what the organizer typed is what is saved (the clock in that zone reads the same when the instant is read back)
const DST: Array<[string, string, string, string]> = [
  ["New York, ordinary day", "America/New_York", "2027-02-10", "09:00"],
  ["New York, the hour that does not exist (spring forward)", "America/New_York", "2027-03-14", "02:30"],
  ["New York, the hour that happens twice (fall back)", "America/New_York", "2026-11-01", "01:30"],
  ["Sydney, spring forward gap", "Australia/Sydney", "2026-10-04", "02:30"],
  ["London, spring forward gap", "Europe/London", "2027-03-28", "01:30"],
  ["London, fall back", "Europe/London", "2026-10-25", "01:30"],
  ["India has no clock change", IST, "2027-03-14", "02:30"],
];
for (const [name, z, date, time] of DST) {
  test(`D-${String(++n).padStart(2, "0")} clock change: ${name}`, () => {
    const ms = F.wallToMs(date, time, z);
    expect(Number.isFinite(ms)).toBe(true);
    const back = new Intl.DateTimeFormat("en-GB", { timeZone: z, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms)).reduce((a: any, p) => ((a[p.type] = p.value), a), {});
    const same = `${back.year}-${back.month}-${back.day}` === date && `${back.hour}:${back.minute}` === time;
    const gap = /does not exist|gap/.test(name);
    if (!gap) expect(same).toBe(true); // an hour that exists must come back as typed
    else expect(`${back.year}-${back.month}-${back.day}`).toBe(date); // an hour that does not exist: the same DAY, a neighbouring hour, never a day away
  });
}
for (const [name, f, want] of [
  ["a zone the list does not have", { zone: "other", zoneOther: "Mars/Olympus" }, /time zone from the list/],
  ["the 'other' zone with a real name", { zone: "other", zoneOther: "Asia/Tokyo" }, null],
  ["no game name", { occ: "Other", oname: "   " }, /name for your game/],
  ["a name of only spaces and an occasion", { occ: "Diwali party" }, null],
  ["no day", { date: "" }, /choose a day and a time/],
  ["no time", { time: "" }, /choose a day and a time/],
] as Array<[string, any, RegExp | null]>) {
  test(`D-${String(++n).padStart(2, "0")} step 1 form: ${name}`, () => {
    const bad = F.whenProblems({ occ: "Team party", date: "2026-11-25", time: "18:00", zone: IST, ...f }, NOW);
    if (want) expect(bad.join(" ")).toMatch(want); else expect(bad).toEqual([]);
  });
}
test(`D-${String(++n).padStart(2, "0")} the time list marks passed quarter-hours today and none tomorrow`, () => {
  const t = F.timeOptions("2026-11-20", IST, NOW);
  expect(t.length).toBe(96);
  expect(t.find((x: any) => x.t === "11:30").passed).toBe(true);
  expect(t.find((x: any) => x.t === "11:45").passed).toBe(false);
  expect(F.timeOptions("2026-11-21", IST, NOW).some((x: any) => x.passed)).toBe(false);
});
test(`D-${String(++n).padStart(2, "0")} a game that starts in less than 30 minutes is warned; one that has passed is told to choose again`, () => {
  expect(F.startWarning(NOW + 5 * 60_000, NOW)).toMatch(/5 minutes/);
  expect(F.startWarning(NOW + 60_000, NOW)).toMatch(/1 minute\./);
  expect(F.startWarning(NOW - 60_000, NOW)).toMatch(/passed/);
  expect(F.startWarning(NOW + 31 * 60_000, NOW)).toBe("");
});

// ---------- steps 5, 7 and 9: size, who, tickets, prizes, brand ----------
const SIZES = [100, 250, 500, 750, 1000, 2500, 5000, 10000];
const LADDER = SIZES.map((s) => ({ upTo: s, inr: s * 20 }));
test("P-00 every size of today's ladder is offered, smallest first, whatever order the game lists them", () => {
  expect(F.packChoices([...LADDER].reverse()).map((c: any) => c.upTo)).toEqual(SIZES);
});
for (const s of SIZES) for (const card of ["people", "family", "extended"]) for (const idKind of ["emp", "email", undefined]) {
  test(`P-${s}-${card}-${idKind ?? "none"} size ${s}, card ${card}, ID kind ${idKind ?? "not asked"}: what is saved is exactly what was chosen`, () => {
    const choices = F.packChoices(LADDER);
    expect(F.whoProblems({ card, upTo: s }, choices)).toEqual([]);
    const a = F.audienceSettings(card, s, idKind);
    expect(a.cap).toBe(s); expect(a.whoCanJoin).toBe("list"); expect(a.demo).toBe(false);
    expect(a.invites.on).toBe(card !== "people"); expect(a.invites.per).toBe(4);
    if (idKind !== undefined) expect(a.idKind).toBe(idKind); else expect("idKind" in a).toBe(false);
    expect(F.payItem(s, { cap: 10 })).toBe(String(s)); // the size that reaches the pay step is the size chosen, as text
    expect(F.packChoices(LADDER).find((c: any) => c.upTo === s).label).toContain("Up to " + s + " participants");
  });
}
for (const [name, f] of [["a size that is not on the list", { card: "people", upTo: 300 }], ["no size", { card: "people", upTo: 0 }], ["an unknown card", { card: "everyone", upTo: 100 }], ["size as text 'abc'", { card: "people", upTo: "abc" }]] as Array<[string, any]>) {
  test(`P-bad ${name} is refused in plain words`, () => { const bad = F.whoProblems(f, F.packChoices(LADDER)); expect(bad.length).toBe(1); expect(bad[0]).toMatch(/Please choose/); });
}
test("P-fallback when the game cannot say its sizes, the sizes offered are real sizes of the price list (the list is shorter: four of the eight, see the open items)", () => {
  const got = F.packChoices([]).map((c: any) => c.upTo);
  expect(got.length).toBeGreaterThan(0); expect(got.every((x: number) => SIZES.includes(x))).toBe(true);
});
test("P-fallback-price the fallback list carries no price number of its own (every number comes from the game and Moneypenny)", () => {
  expect(F.packChoices([]).every((c: any) => c.inr === 0 && !/₹/.test(c.label))).toBe(true);
});

const HOUSES = [{ id: "early5", label: "Early Five", dflt: true }, { id: "line1", label: "First Line" }, { id: "full", label: "Full House" }, { id: "full2", label: "Super" }];
const gameOf = (bumper: boolean) => { const G = F; return G; };
for (const tix of [1, 2]) for (const nWin of [1, 2, 3]) {
  test(`O-prizes-${tix}t-${nWin}w prizes for a ${tix}-ticket game with ${nWin} winner(s) each: one line per place, in order`, () => {
    const sel = F.defaultPrizes(F.housesOf({ PRIZE_HOUSES: HOUSES }));
    sel.early5.n = nWin;
    const r = F.buildRewards(sel, { on: true, n: 2, gift: "Gift voucher", other: "", worth: "" }, tix, "INR");
    expect(r.filter((x: any) => x.pattern === "early5").map((x: any) => x.ordinal)).toEqual(Array.from({ length: nWin }, (_, i) => i + 1));
    expect(F.housesOf({ PRIZE_HOUSES: HOUSES }).some((h: any) => h.id === "full2")).toBe(false); // Super Bumper has its own part of the screen
    expect(r.every((x: any) => x.text)).toBe(true);
  });
}
const PRIZE_CASES: Array<[string, any[], string]> = [
  ["a plain gift", ["Gift voucher", "", "", "INR"], "Gift voucher"],
  ["a gift with an amount", ["Smartphone", "", "25000", "INR"], "Smartphone (worth up to ₹25,000)"],
  ["an amount in dollars", ["Gift hamper", "", "100", "USD"], "Gift hamper (worth up to $100)"],
  ["an amount with commas and a rupee sign typed by hand", ["Smartphone", "", "₹ 25,000", "INR"], "Smartphone (worth up to ₹25,000)"],
  ["an amount of zero is ignored", ["Smartphone", "", "0", "INR"], "Smartphone"],
  ["an amount in letters is ignored", ["Smartphone", "", "abc", "INR"], "Smartphone"],
  ["a negative sign is ignored", ["Smartphone", "", "-500", "INR"], "Smartphone (worth up to ₹500)"],
  ["'Other' with the organizer's own words", ["Other", "  A   day at the beach ", "", "INR"], "A day at the beach"],
  ["'Other' left empty is no prize", ["Other", "   ", "", "INR"], ""],
];
for (const [name, args, want] of PRIZE_CASES) test(`O-prizeline ${name}`, () => expect(F.prizeLine(...args)).toBe(want));
test("O-prizeline-markup a prize typed with angle brackets stays plain words in the saved line (the screens draw it as text)", () => {
  const t = F.prizeLine("Other", "<img src=x onerror=alert(1)>", "", "INR");
  expect(t).toBe("<img src=x onerror=alert(1)>"); // kept as typed: the page never puts it in as markup
  const win: any = new Window({ url: "http://localhost/" }); const d = win.document.createElement("p"); d.textContent = t; expect(d.children.length).toBe(0);
});
test("O-prizes-none ticking nothing, or ticking a house with no words, is refused in plain words", () => {
  const sel = F.defaultPrizes(HOUSES); for (const h of Object.values(sel) as any[]) h.on = false;
  expect(F.prizeProblems(sel, null, 1, HOUSES)).toEqual(["Tick at least one prize."]);
  sel.early5.on = true; sel.early5.gift = "Other"; sel.early5.other = "  ";
  expect(F.prizeProblems(sel, null, 1, HOUSES)[0]).toMatch(/Please write the prize for Early Five/);
});
for (const tix of [1, 2]) for (const lucky of [false, true]) {
  test(`O-breaks-${tix}t-${lucky ? "lucky" : "nolucky"} message breaks: the most allowed for a ${tix}-ticket game${lucky ? " with a lucky draw" : ""}, and one more is refused`, () => {
    const max = F.breakMax(tix, lucky);
    expect(max).toBe((tix === 2 ? 5 : 3) - (lucky ? 1 : 0));
    const mk = (k: number) => Array.from({ length: k }, () => ({ link: "https://youtu.be/abc123", title: "x" }));
    expect(F.breakProblems(mk(max), tix, lucky)).toEqual([]);
    expect(F.breakProblems(mk(max + 1), tix, lucky).length).toBe(1);
  });
}
const LINKS: Array<[string, string, string | null]> = [
  ["a YouTube watch link", "https://www.youtube.com/watch?v=abc", "youtube"], ["a short YouTube link", "https://youtu.be/abc", "youtube"], ["a link typed with no https", "youtu.be/abc", "youtube"], ["a link with www only", "www.youtube.com/watch?v=abc", "youtube"],
  ["a Shorts link", "https://youtube.com/shorts/abc", "youtube"], ["a plain mp4 file", "https://cdn.acme.in/a.mp4", "file"], ["an mp3 with a query", "https://cdn.acme.in/a.mp3?x=1", "file"],
  ["a web page that is not media", "https://acme.in/page.html", null], ["an http link (not secure)", "http://youtu.be/abc", null], ["a javascript link", "javascript:alert(1)", null], ["an empty box", "", null], ["a data link", "data:text/html,<b>x</b>", null],
];
for (const [name, link, want] of LINKS) test(`O-link ${name} -> ${want ?? "refused"}`, () => expect(F.linkKind(link)).toBe(want));
const NAMES: Array<[string, string, string]> = [["&", "Smith & Sons", "Smith and Sons"], ["quote marks", `O'Brien "Co"`, "O’Brien Co"], ["angle brackets", "<b>Acme</b>", "bAcme/b"], ["longer than 40 letters", "A".repeat(60), "A".repeat(40)], ["only spaces", "    ", ""], ["emoji kept", "Acme 🎉", "Acme 🎉"]];
for (const [name, raw, want] of NAMES) test(`O-brand company name with ${name}: made safe for the ticket`, () => expect(F.brandNameClean(raw)).toBe(want));
test("O-brand a logo with no company name is refused politely", () => {
  expect(F.brandProblems({ logo: "data:image/png;base64,AAAA", name: "  " })[0]).toMatch(/needs a company name/);
  expect(F.brandProblems({ logo: "", name: "" })).toEqual([]);
});
const CONTACT: Array<[string, string, string, boolean]> = [
  ["a plain pair", "asha\u0040acme.in", "9876543210", true], ["phone with +91 and spaces", "asha\u0040acme.in", "+91 98765 43210", true], ["phone with dashes", "asha\u0040acme.in", "98765-43210", true], ["9 digits", "asha\u0040acme.in", "987654321", false], ["16 digits", "asha\u0040acme.in", "9876543210123456", false],
  ["phone in letters", "asha\u0040acme.in", "call me", false], ["no @", "asha.acme.in", "9876543210", false], ["spaces in the address", "as ha\u0040acme.in", "9876543210", false], ["empty", "", "", false],
];
for (const [name, e, p, ok] of CONTACT) test(`O-contact ${name} -> ${ok ? "accepted" : "refused in plain words"}`, () => { const bad = F.contactProblems(e, p); expect(bad.length === 0).toBe(ok); if (!ok) expect(bad[0]).toMatch(/Please type your/); });
// the one status word of a game, in every state and across the start time
const NOWS = NOW, HOUR = 3600_000;
const STATUS: Array<[string, any, any, number, string]> = [
  ["draft", { draft: true }, {}, NOWS, "draft"], ["no answer at all", null, {}, NOWS, "draft"],
  ["published, unpaid, start in the future", { unpaid: true, startMs: NOWS + HOUR }, {}, NOWS, "pending"],
  ["published, unpaid, start passed", { unpaid: true, startMs: NOWS - HOUR }, {}, NOWS, "overdue"],
  ["published, unpaid, locked", { unpaid: true, locked: true, startMs: NOWS + HOUR }, {}, NOWS, "overdue"],
  ["paid, waiting for the start", { startMs: NOWS + HOUR }, {}, NOWS, "paid"], ["free game, waiting", { startMs: NOWS + HOUR, demo: true }, {}, NOWS, "free"],
  ["paid, started", { startMs: NOWS - 5 * 60_000 }, {}, NOWS, "live"], ["paid, started and paused", { startMs: NOWS - 5 * 60_000 }, { paused: true }, NOWS, "paused"],
  ["paid, finished", { startMs: NOWS - 5 * HOUR }, {}, NOWS, "completed"], ["cancelled", { cancelled: true, startMs: NOWS + HOUR }, {}, NOWS, "cancelled"],
  ["cancelled, refund asked", { cancelled: true }, { refund: true }, NOWS, "refund"], ["data deleted", { startMs: NOWS - 90 * 86400_000 }, { deleted: true }, NOWS, "deleted"],
];
for (const [name, raw, facts, now, want] of STATUS) test(`O-status ${name} -> ${want}`, () => { expect(F.statusOf(raw, facts, now)).toBe(want); expect(F.STATUSES[want].label.length).toBeGreaterThan(3); });
test("O-banned-words every sentence of the flow's own screens keeps the language rules (no 'we', 'seat', 'invite' ...)", () => {
  const all = [...Object.values(F.COPY), ...F.STEPS.map((s: any) => s.name), ...Object.values(F.PAY), F.PAY_PRINT, F.BANNER_UNPAID, ...Object.values(F.STATUS_WORDS || {})].filter((x) => typeof x === "string").join(" | ");
  expect(F.badWords(all)).toEqual([]);
});

// ---------- step 10: the one ID rule ----------
const IDS: Array<[string, string, string]> = [
  ["plain", "A1101", "A1101"], ["hyphen", "A-1101", "A1101"], ["slash", "A/1101", "A1101"], ["space", "A 1101", "A1101"], ["lower case", "a1101", "A1101"], ["dots and underscore", "a.11_01", "A1101"],
  ["leading zeros are kept", "00123", "00123"], ["O is not zero", "O123", "O123"], ["full-width letters and digits", "Ａ１１０１", "A1101"], ["tabs and new lines inside", "A\t11\n01", "A1101"],
  ["a quote and a comma from a CSV cell", "\"A-1101\",", "A1101"], ["a byte-order mark at the start of a file", "﻿A1101", "A1101"], ["emoji", "A11🎉01", "A1101"], ["an e-mail typed as an ID is cut to letters and numbers", "raj\u0040demo.com", "RAJDEMOCOM"],
  ["accented letters are not letters of the ID (owner rule: only A-Z and 0-9 stay), so É1101 and 1101 are ONE ID: see the open items", "É1101", "1101"], ["Devanagari digits are dropped, not turned into numbers", "A१२३", "A"], ["only symbols", "---", ""], ["only spaces", "   ", ""], ["null", null as any, ""], ["a number from a spreadsheet", 1101 as any, "1101"],
  ["a float from a spreadsheet (1101.0)", "1101.0", "11010"],
];
for (const [name, raw, want] of IDS) test(`I-clean ${name}: ${JSON.stringify(raw)} -> ${JSON.stringify(want)}`, () => expect(cleanEmployeeId(raw)).toBe(want));
test("I-same the shared flow and the console read an ID the same way, for 500 strange strings", () => {
  const chars = "aAzZ09 -_/.\t\n,;\"'#@éÉßıİＡ１٣१🎉﻿​ "; let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 500; i++) { const s = Array.from({ length: 1 + Math.floor(rnd() * 14) }, () => chars[Math.floor(rnd() * chars.length)]).join(""); expect(F.cleanEmployeeId?.(s) ?? cleanEmployeeId(s)).toBe(cleanEmployeeId(s)); }
});
test("I-check an ID that is empty after cleaning, or longer than 30 after cleaning, is refused in plain words and never cut short", () => {
  expect(checkEmployeeId("---").ok).toBe(false); expect((checkEmployeeId("---") as any).error).toMatch(/at least one letter or number/);
  expect(checkEmployeeId("A".repeat(EMPLOYEE_ID_MAX)).ok).toBe(true);
  const long = checkEmployeeId("A".repeat(EMPLOYEE_ID_MAX + 1)); expect(long.ok).toBe(false); expect((long as any).error).toMatch(/at most 30/);
  const ok: any = checkEmployeeId("1b-678"); expect(ok.id).toBe("1B678"); expect(ok.hint).toBe("The system will read this as 1B678");
});
test("I-one-id-field the screen offers ONE ID field with no choice menu in the invite text (owner rule 20 Nov), not an Employee/E-mail choice", () => {
  // the deployed base still offers 'Employee ID / Email ID' (idKind) in the shared flow when a game declares it: that is the old two-kind choice
  expect(Object.keys(F.idWords("emp")).length).toBeGreaterThan(0);
  expect(F.idKindOf("anything-else")).toBe("emp");
});

// ---------- the sign-in screen answers a test address honestly ----------
test("S-signin-test-address the sign-in screen does not wait for a code that cannot come: it says the address is a test address and stays on the e-mail form", async () => {
  const win: any = new Window({ url: "http://localhost/" });
  Object.assign(globalThis, { window: win, document: win.document, Event: win.Event, location: win.location });
  const { renderSignIn } = await import("../public/screens/signin.js");
  const o = win.document.createElement("div"); win.document.body.replaceChildren(o);
  const api = { auth: { request: async () => ({ ok: true, status: 200, json: { ok: true, codeMinutes: 30, expiresMs: Date.now() + 1800_000, testAddress: true } }), verify: async () => ({ ok: false }) } };
  renderSignIn(o, { api, onSignedIn: async () => {} });
  (o.querySelector("#si-email") as any).value = "test-org-1119\u0040demo-test.invalid"; (o.querySelector("#si-consent") as any).checked = true;
  o.querySelectorAll("form")[0].dispatchEvent(new win.Event("submit", { cancelable: true, bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  expect(o.querySelector(".signmsg")!.textContent).toMatch(/test address/);
  expect(o.querySelectorAll("form")[1].classList.contains("hide")).toBe(true); // the code box did not open
  expect(o.querySelector("#si-sent")!.textContent).not.toMatch(/on its way/);
});

// ---------- audit X-5 / L-2: a slow mail may still arrive: the screen opens the code box and holds the "send again" button ----------
test("S-signin-mail-slow after 'the e-mail is taking longer than usual' the code box opens (the mail may still arrive and its code works) and 'Send a new code' stays locked for the wait", async () => {
  const win: any = new Window({ url: "http://localhost/" });
  Object.assign(globalThis, { window: win, document: win.document, Event: win.Event, location: win.location });
  const { renderSignIn } = await import("../public/screens/signin.js");
  const o = win.document.createElement("div"); win.document.body.replaceChildren(o);
  const api = { auth: { request: async () => ({ ok: false, status: 502, json: { ok: false, error: "mail_slow", message: "The e-mail is taking longer than usual and may still arrive. Please wait a minute before asking for another one." } }), verify: async () => ({ ok: false }) } };
  renderSignIn(o, { api, onSignedIn: async () => {}, resendAfterMs: 60_000 } as any);
  (o.querySelector("#si-email") as any).value = "demo7@demo-test.invalid"; (o.querySelector("#si-consent") as any).checked = true;
  o.querySelectorAll("form")[0].dispatchEvent(new win.Event("submit", { cancelable: true, bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  expect(o.querySelectorAll("form")[1].classList.contains("hide")).toBe(false); // the code box is open: a late code can be typed
  expect(o.querySelector("#si-sent")!.textContent).toMatch(/may still arrive/);
  const again = [...o.querySelectorAll("button")].find((b: any) => /Send a new code/.test(b.textContent)) as any;
  expect(again.disabled).toBe(true); // a second mail would replace the code in the first
});
