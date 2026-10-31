// Owner rule R12: how the report is sent, retried and cleaned up. The mail service (Resend) is faked; the database is the real schema in memory.
import { test, expect, setDefaultTimeout } from "bun:test";
import { makeD1 } from "../support/d1-sqlite";
import { handleReport, retryHeldReports, RETRY_AFTER_MS, HOLD_MAX_MS } from "../../functions/_lib/report-core";
import { resetEnsured } from "../../functions/_lib/report-core";
import type { Env } from "../../functions/_lib/auth-core";

setDefaultTimeout(60_000);
const H = 3600_000, OVER = Date.UTC(2026, 9, 30, 6, 0, 0), ORIGIN = "https://console.test", SECRET = "s3cret";
const NAMES = ["Asha Rao", "asha.winner@example.org"], OWNER = "raajat.agarwal@gmail.com";
const report = (): any => ({
  v: 1, game: { id: "tambola", name: "Corporate Tambola" }, gameId: "G1", organizers: [{ email: "org1@example.org" }, { email: "org2@example.org" }], hosts: [{ email: "host1@example.org" }],
  startMs: OVER - H, endMs: OVER, gameOverMs: OVER, winners: [{ prize: "Full House", name: NAMES[0], email: NAMES[1] }], stats: { joined: 5 }, log: [{ atMs: OVER - 10, text: "Game ended" }],
});
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sign(body: string) { const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body))); }

async function world() {
  resetEnsured();
  const { db, raw } = makeD1(["migrations/0001_console.sql", "migrations/0002_report_hold.sql"]);
  const env = { DB: db, SESSION_PEPPER: "pepper", CONSOLE_ORIGIN: ORIGIN, GAME_ORIGINS: "{}", RESEND_API_KEY: "test-key-not-real", REPORT_SECRETS: JSON.stringify({ tambola: SECRET }), BOUNCE_TOKEN: "bt", TICK_SECRET: "tk" } as any as Env;
  const sent: any[] = [], logs: string[] = [];
  let mode: "ok" | "fail" = "ok", n = 0;
  const savedFetch = globalThis.fetch, savedLog = console.log;
  (globalThis as any).fetch = async (u: any, init: any) => { if (!String(u).includes("api.resend.com")) return savedFetch(u, init); const body = JSON.parse(init.body); sent.push(body); return mode === "ok" ? new Response(JSON.stringify({ id: "em" + ++n }), { status: 200 }) : new Response("no", { status: 500 }); };
  console.log = (...a: any[]) => { logs.push(a.join(" ")); };
  const done = () => { (globalThis as any).fetch = savedFetch; console.log = savedLog; };
  const submit = async (now: number, r = report()) => { const body = JSON.stringify(r); return handleReport(new Request(ORIGIN + "/report/submit", { method: "POST", body, headers: { "x-report-sig": await sign(body) } }), env, now); };
  const bounce = (now: number, to: string, id = "em1") => handleReport(new Request(ORIGIN + "/report/bounce", { method: "POST", body: JSON.stringify({ emailId: id, to, reason: "mailbox full" }), headers: { "x-bounce-token": "bt" } }), env, now);
  const tick = (now: number) => handleReport(new Request(ORIGIN + "/report/tick", { method: "POST", headers: { "x-tick-token": "tk" } }), env, now);
  return { env, raw, sent, logs, submit, bounce, tick, setMode: (m: "ok" | "fail") => { mode = m; }, done };
}
const holds = (raw: any) => raw.query("SELECT * FROM report_hold WHERE id NOT LIKE 'w:%'").all() as any[];
const reportMails = (sent: any[]) => sent.filter((m) => (m.attachments || []).length);
const noticeMails = (sent: any[]) => sent.filter((m) => !(m.attachments || []).length);

test("R12 sent within 3 hours of game over to ALL Organizers and Hosts at once, in ONE mail", async () => {
  const w = await world();
  try {
    const res = await w.submit(OVER + 2 * H);
    expect(res.status).toBe(200);
    const mails = reportMails(w.sent);
    expect(mails.length).toBe(1);
    expect([...mails[0].to].sort()).toEqual(["host1@example.org", "org1@example.org", "org2@example.org"]);
    expect((await res.json() as any).late).toBe(false);
    expect(mails[0].attachments[0].filename).toMatch(/\.pdf$/);
  } finally { w.done(); }
});
test("R12 Co-hosts are excluded: a report that carries Co-hosts is refused and none receive it", async () => {
  const w = await world();
  try {
    const r = report(); r.cohosts = [{ email: "cohost@example.org" }];
    const res = await w.submit(OVER + H, r);
    expect(res.status).toBe(400);
    expect(w.sent.length).toBe(0);
    const ok = await w.submit(OVER + H);
    expect(JSON.stringify(w.sent)).not.toContain("cohost@example.org");
    expect(ok.status).toBe(200);
  } finally { w.done(); }
});
test("R12 sender and return address is hello@corporatetambola.com, never bounce@", async () => {
  const w = await world();
  try {
    await w.submit(OVER + H);
    const m = reportMails(w.sent)[0];
    expect(m.from).toContain("hello@corporatetambola.com");
    expect(m.reply_to).toBe("hello@corporatetambola.com");
    expect(JSON.stringify(w.sent)).not.toMatch(/bounce@/i);
    const src = await Bun.file(new URL("../../functions/_lib/report-core.ts", import.meta.url)).text();
    expect(src).not.toMatch(/["'`][^"'`\s]*bounce@[^"'`\s]*/i);
  } finally { w.done(); }
});
test("R12 no PDF is stored after delivery", async () => {
  const w = await world();
  try {
    await w.submit(OVER + H);
    expect((w.raw.query("SELECT COUNT(*) AS n FROM report_hold").get() as any).n, "report_hold still holds an encrypted PDF after a good delivery").toBe(0);
  } finally { w.done(); }
});
test("R12 on bounce only the failed recipient is retried, at 24, 36 and 72 hours", async () => {
  const w = await world();
  try {
    const t0 = OVER + H;
    await w.submit(t0);
    w.sent.length = 0;
    expect(RETRY_AFTER_MS).toEqual([24 * H, 36 * H, 72 * H]);
    expect((await w.bounce(t0 + 60_000, "org2@example.org")).status).toBe(200);
    expect(holds(w.raw).length).toBe(1);
    w.sent.length = 0; w.setMode("fail");
    const first = holds(w.raw)[0].first_fail_ms;
    await w.tick(first + 24 * H - 60_000); expect(reportMails(w.sent).length).toBe(0); // not before 24 h
    await w.tick(first + 24 * H); expect(reportMails(w.sent).length).toBe(1);
    expect(reportMails(w.sent)[0].to).toEqual(["org2@example.org"]); // that recipient only
    await w.tick(first + 36 * H - 60_000); expect(reportMails(w.sent).length).toBe(1);
    await w.tick(first + 36 * H); expect(reportMails(w.sent).length).toBe(2);
    await w.tick(first + 72 * H - 60_000); expect(reportMails(w.sent).length).toBe(2);
    await w.tick(first + 72 * H); expect(reportMails(w.sent).length).toBe(3);
    expect(reportMails(w.sent).every((m) => m.to.length === 1 && m.to[0] === "org2@example.org")).toBe(true);
    expect(holds(w.raw).length, "held PDF must be deleted after the last attempt").toBe(0);
    await w.tick(first + 96 * H); expect(reportMails(w.sent).length).toBe(3); // no fourth attempt
  } finally { w.done(); }
});
test("R12 the held PDF is deleted on delivery", async () => {
  const w = await world();
  try {
    const t0 = OVER + H;
    await w.submit(t0); await w.bounce(t0 + 1000, "host1@example.org");
    const first = holds(w.raw)[0].first_fail_ms;
    expect(holds(w.raw).length).toBe(1);
    await w.tick(first + 24 * H); // mail service is fine again
    expect(holds(w.raw).length).toBe(0);
  } finally { w.done(); }
});
test("R12 the held PDF is gone by about 96 hours at the latest", async () => {
  expect(HOLD_MAX_MS).toBe(96 * H);
  const w = await world();
  try {
    const t0 = OVER + H;
    await w.submit(t0); await w.bounce(t0 + 1000, "host1@example.org");
    const first = holds(w.raw)[0].first_fail_ms;
    await retryHeldReports(w.env, first + 96 * H);
    expect(holds(w.raw).length).toBe(0);
  } finally { w.done(); }
});
test("R12 a no-names notice per failure goes to raajat.agarwal@gmail.com with no participant names or e-mails", async () => {
  const w = await world();
  try {
    const t0 = OVER + H;
    await w.submit(t0); w.sent.length = 0;
    await w.bounce(t0 + 1000, "org2@example.org");
    let notes = noticeMails(w.sent);
    expect(notes.length).toBe(1);
    expect(notes[0].to).toEqual([OWNER]);
    const first = holds(w.raw)[0].first_fail_ms;
    w.setMode("fail");
    await w.tick(first + 24 * H);
    await w.tick(first + 36 * H);
    notes = noticeMails(w.sent);
    expect(notes.length).toBe(3); // one per failure
    for (const n of notes) {
      expect(n.to).toEqual([OWNER]);
      const all = n.subject + " " + n.text;
      for (const bad of [...NAMES, "Asha", "org1@", "org2@", "host1@", "@example.org"]) expect(all.includes(bad), "notice leaks " + bad).toBe(false);
    }
  } finally { w.done(); }
});
test("R12 a late send (after 3 h) still goes out until 20 h and is logged as late", async () => {
  const w = await world();
  try {
    const res = await w.submit(OVER + 10 * H);
    expect(res.status).toBe(200);
    expect(reportMails(w.sent).length).toBe(1);
    expect((await res.json() as any).late).toBe(true);
    expect(w.logs.some((l) => /late/i.test(l))).toBe(true);
    const w2 = await world();
    try { const r2 = await w2.submit(OVER + 19.9 * H); expect(r2.status).toBe(200); expect(reportMails(w2.sent).length).toBe(1); const r3 = await w2.submit(OVER + 20 * H + 1000); expect(r3.status).toBe(409); } finally { w2.done(); }
  } finally { w.done(); }
});
