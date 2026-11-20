// FALSIFIED BY: smoke-mail-failure-keeps-old-code
// (addresses with \u0040 are written that way on purpose: the repo rule keeps real-looking addresses out of test source; they are never sent anywhere, the mail service is a stand-in)
// SMOKE 20 NOV 2026, owner steps 18 and 19 (e-mails to the organizer, the data sent to the organizer): the end-of-game report for all six games, every recipient shape, the wording of every mail the console sends, and what happens when the mail service fails.
// Resend is a stand-in; the database is the real schema. One test = one cell of docs/SMOKE-20NOV-CONSOLE.md.
import { test, expect, setDefaultTimeout } from "bun:test";
import { makeD1 } from "./support/d1-sqlite";
import { handleReport, retryHeldReports, resetEnsured, RETRY_AFTER_MS } from "../functions/_lib/report-core";
import { handleAuth, recordedMail, type Env } from "../functions/_lib/auth-core";
import { buildReportPdf, reportProblems } from "../packages/report/src/report";

setDefaultTimeout(60_000);
const H = 3600_000, OVER = Date.UTC(2026, 10, 20, 12, 0, 0), ORIGIN = "https://console.corporatetambola.com";
const GAMES: Array<[string, string]> = [["tambola", "Corporate Tambola"], ["bingo", "Corporate Bingo"], ["tictactoe", "Corporate Tic Tac Toe"], ["snakesladders", "Corporate Snakes and Ladders"], ["luckbychance", "Corporate Luck by Chance"], ["luckydraw", "Corporate Lucky Draw"]];
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sign = async (secret: string, body: string) => hex(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), new TextEncoder().encode(body)));
const WINNER = { prize: "Full House", name: "Asha Rao", empId: "E1101", email: "winner.one\u0040acme-corp.in", mobile: "9876543210", ticket: "17" };
const report = (id: string, name: string, over: any = {}): any => ({ v: 1, game: { id, name }, gameId: "G" + id.slice(0, 3).toUpperCase() + "1", organizers: [{ email: "org\u0040acme-corp.in" }], hosts: [], startMs: OVER - H, endMs: OVER, gameOverMs: OVER, winners: [WINNER], stats: { joined: 40 }, log: [{ atMs: OVER - 10, text: "Game ended" }], ...over });

async function world() {
  resetEnsured();
  const { db, raw } = makeD1(["migrations/0001_console.sql", "migrations/0002_report_hold.sql"]);
  const secrets = Object.fromEntries(GAMES.map(([id]) => [id, "sec-" + id]));
  const env = { DB: db, SESSION_PEPPER: "pepper", CONSOLE_ORIGIN: ORIGIN, GAME_ORIGINS: "{}", RESEND_API_KEY: "re_test_not_real", REPORT_SECRETS: JSON.stringify(secrets), BOUNCE_TOKEN: "bt" } as any as Env;
  const sent: any[] = []; let mode = 200, n = 0;
  const saved = globalThis.fetch, savedLog = console.log, savedErr = console.error;
  (globalThis as any).fetch = async (u: any, init: any) => { if (!String(u).includes("api.resend.com")) return saved(u, init); sent.push(JSON.parse(init.body)); return mode === 200 ? new Response(JSON.stringify({ id: "em" + ++n }), { status: 200 }) : new Response("{}", { status: mode }); };
  console.log = () => {}; console.error = () => {};
  const done = () => { (globalThis as any).fetch = saved; console.log = savedLog; console.error = savedErr; };
  const submit = async (id: string, r: any, now = OVER + H) => { const body = JSON.stringify(r); return handleReport(new Request(ORIGIN + "/report/submit", { method: "POST", body, headers: { "x-report-sig": await sign(secrets[id], body) } }), env, now); };
  return { env, raw, sent, submit, done, setMode: (m: number) => { mode = m; } };
}
const withAttach = (sent: any[]) => sent.filter((m) => (m.attachments || []).length);

// ---------- step 19: the report data goes to the organizer, in every game, for every recipient shape ----------
const SHAPES: Array<[string, any, string[]]> = [
  ["one organizer", {}, ["org\u0040acme-corp.in"]],
  ["organizer and a host", { hosts: [{ email: "host\u0040acme-corp.in" }] }, ["host\u0040acme-corp.in", "org\u0040acme-corp.in"]],
  ["the organizer is also typed as a host in capitals: one mail, once", { hosts: [{ email: "ORG\u0040Acme-Corp.in" }] }, ["org\u0040acme-corp.in"]],
  ["two organizers, two hosts, a duplicate", { organizers: [{ email: "org\u0040acme-corp.in" }, { email: "org2\u0040acme-corp.in" }], hosts: [{ email: "h1\u0040acme-corp.in" }, { email: "h2\u0040acme-corp.in" }, { email: "H1\u0040acme-corp.in" }] }, ["h1\u0040acme-corp.in", "h2\u0040acme-corp.in", "org2\u0040acme-corp.in", "org\u0040acme-corp.in"]],
];
for (const [id, name] of GAMES) for (const [shape, over, want] of SHAPES) {
  test(`M-report-${id} ${shape}: ONE mail to ${want.length} address(es) with the PDF, from the Corporate Games sender, no participant data in the words`, async () => {
    const w = await world();
    try {
      const r = await w.submit(id, report(id, name, over)); expect(r.status).toBe(200);
      const mails = withAttach(w.sent); expect(mails.length).toBe(1);
      expect([...mails[0].to].sort()).toEqual(want);
      expect(mails[0].subject).toBe(`Your game report: ${name}, Game ID G${id.slice(0, 3).toUpperCase()}1`);
      expect(mails[0].attachments[0].filename).toMatch(/^game-report-G[A-Z]{3}1\.pdf$/);
      expect(mails[0].from).toMatch(/^Corporate Games <hello@corporatetambola\.com>$/);
      const t = mails[0].text; expect(t).toContain(name); expect(t).toContain("Please save it now"); expect(t).toContain("deleted within 24 hours of the game"); expect(t).toContain("If you did not expect this e-mail");
      expect(t).not.toMatch(/Asha|E1101|winner\.one|9876543210/); // the words of the mail carry no winner, no ID, no mobile
      expect(t).not.toMatch(/\b(we|our|us)\b|moneypenny|razorpay|api\b|error/i);
    } finally { w.done(); }
  });
}
test("M-report-pdf the PDF holds what the owner decided: game, winners (with their details, the audit record), counts, how it was played, the log; and NOT a list of participants", () => {
  const r = report("bingo", "Corporate Bingo", { played: { settings: [["Tickets", "2"]] } });
  const pdf = new TextDecoder("latin1").decode(buildReportPdf(r)); const strings = [...pdf.matchAll(/\((.*)\) Tj/g)].map((m) => m[1]);
  for (const v of ["Corporate Bingo", "Full House", "Asha Rao", "E1101", "9876543210"]) expect(strings.some((s) => s.includes(v)), v).toBe(true);
  expect(strings.join("").includes("winner.one\u0040acme-corp.in")).toBe(true); // a long e-mail wraps inside its narrow column (winner.one@acme-corp.i / n): all letters are there, one line break inside (open item, Low)
  expect(reportProblems({ ...r, participants: [{ name: "x" }] }).length).toBeGreaterThan(0);
});
const BAD: Array<[string, (r: any) => any, number]> = [
  ["a Co-host is in the report", (r) => ({ ...r, cohosts: [{ email: "c\u0040acme-corp.in" }] }), 400], ["no organizer", (r) => ({ ...r, organizers: [] }), 400], ["an organizer with a bad address", (r) => ({ ...r, organizers: [{ email: "nonsense" }] }), 400],
  ["a winner field that is not allowed (a password)", (r) => ({ ...r, winners: [{ prize: "x", password: "p" }] }), 400], ["version 2", (r) => ({ ...r, v: 2 }), 400],
];
for (const [name, mut, status] of BAD) test(`M-report-bad ${name}: refused with plain words, nobody is mailed`, async () => {
  const w = await world(); try { const r = await w.submit("tambola", mut(report("tambola", "Corporate Tambola"))); expect(r.status).toBe(status); expect(w.sent.length).toBe(0); } finally { w.done(); }
});
test("M-report-signature a report signed with another game's secret, or not signed, is refused", async () => {
  const w = await world();
  try {
    const body = JSON.stringify(report("tambola", "Corporate Tambola"));
    expect((await handleReport(new Request(ORIGIN + "/report/submit", { method: "POST", body, headers: { "x-report-sig": await sign("sec-bingo", body) } }), w.env, OVER + H)).status).toBe(401);
    expect((await handleReport(new Request(ORIGIN + "/report/submit", { method: "POST", body }), w.env, OVER + H)).status).toBe(401);
    expect(w.sent.length).toBe(0);
  } finally { w.done(); }
});
test("M-report-timing before the game is over it waits (409), at 2 h it is on time, at 5 h it still goes and is marked late, after 20 h it is refused", async () => {
  const w = await world();
  try {
    const r = report("tambola", "Corporate Tambola");
    expect((await w.submit("tambola", r, OVER - 30 * 60_000)).status).toBe(409);
    expect(((await (await w.submit("tambola", r, OVER + 2 * H)).json()) as any).late).toBe(false);
    expect(((await (await w.submit("tambola", r, OVER + 5 * H)).json()) as any).late).toBe(true);
    expect((await w.submit("tambola", r, OVER + 21 * H)).status).toBe(409);
  } finally { w.done(); }
});
test("M-report-test-address a report whose only recipients are test addresses (.invalid) is accepted and nothing leaves", async () => {
  const w = await world();
  try { const r = await w.submit("tambola", report("tambola", "Corporate Tambola", { organizers: [{ email: "demo102@demo-test.invalid" }] })); expect(r.status).toBe(200); expect(w.sent.length).toBe(0); } finally { w.done(); }
});
test("M-report-fail the mail service is down: nothing is lost (held, encrypted), the owner gets a notice with NO names, and a retry after 24 hours delivers it", async () => {
  const w = await world();
  try {
    w.setMode(500);
    const r = await w.submit("tambola", report("tambola", "Corporate Tambola", { hosts: [{ email: "host\u0040acme-corp.in" }] }));
    expect(r.status).toBe(202); expect(((await r.json()) as any).held).toBe(2);
    const notices = w.sent.filter((m) => !(m.attachments || []).length);
    expect(notices.length).toBeGreaterThan(0);
    for (const m of notices) { expect(m.subject).toMatch(/^Report e-mail failed: /); expect(m.text).not.toMatch(/acme-corp|Asha|winner/); expect(m.text).toMatch(/Reason: mail 500/); }
    expect(JSON.stringify(w.raw.query("SELECT * FROM report_hold").all())).not.toMatch(/acme-corp|Asha/); // held encrypted
    w.setMode(200);
    const out = await retryHeldReports(w.env, OVER + H + RETRY_AFTER_MS[0] + 60_000);
    expect(out.delivered).toBe(2); expect(w.raw.query("SELECT COUNT(*) c FROM report_hold").get()).toEqual({ c: 0 });
    const again = withAttach(w.sent).slice(-2); expect(again.every((m) => /attached again/.test(m.text))).toBe(true);
  } finally { w.done(); }
});
test("M-report-fail-status the failure notice names the mail service's own error (a name, never an address): a domain that is not verified reads as such", async () => {
  const w = await world();
  try { w.setMode(403); await w.submit("tambola", report("tambola", "Corporate Tambola")); const n = w.sent.filter((m) => !(m.attachments || []).length)[0]; expect(n.text).toMatch(/Reason: mail 403/); } finally { w.done(); }
});

// ---------- step 18: every mail the console sends, its subject and tone ----------
test("M-inventory the console sends exactly three kinds of mail to a person: the sign-in code, the end-of-game report (and its resend), and a no-names notice to the owner; none after create, publish or pay", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const files: string[] = []; const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) { if (!/node_modules/.test(e.name)) walk(p); } else if (/\.(ts|js|mjs)$/.test(e.name)) files.push(p); } };
  for (const d of ["functions", "public", "packages/bridge/src", "packages/game-pack", "apps"]) walk(new URL("../" + d, import.meta.url).pathname);
  const senders = files.filter((f) => /sendMail\(|sendMailEx\(|api\.resend\.com/.test(readFileSync(f, "utf8"))).map((f) => f.split("/").slice(-2).join("/")).sort();
  expect(senders).toEqual(["_lib/auth-core.ts", "_lib/report-core.ts"]);
});
test("M-signin-wording the sign-in mail and the screen text around it are in the console's voice: 'you', calm, simple, no backend names", async () => {
  const { db } = makeD1(); const mails: string[] = [];
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const env = { DB: db, SESSION_PEPPER: "p", CONSOLE_SIGNING_KEY: btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey)))), CONSOLE_ORIGIN: ORIGIN, GAME_ORIGINS: "{}", MAILER: async (_t: string, s: string, t: string) => { mails.push(s + "\n" + t); } } as any as Env;
  recordedMail.length = 0;
  const r = await handleAuth(new Request(ORIGIN + "/auth/request", { method: "POST", headers: { "x-console": "1", origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ email: "asha\u0040acme-corp.in", consent: true }) }), env, OVER);
  expect(r.status).toBe(200);
  const m = mails[0]; expect(m).toMatch(/^Your sign-in code is \d{6}\nYour code is \d{6}\. It works for 30 minutes\./); expect(m).not.toMatch(/\b(we|our|us)\b/i);
  expect((await r.clone().json() as any).message).toMatch(/^If that address can receive mail, a code is on its way\./);
});
