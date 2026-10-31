// The end-of-game report, console side (owner decision 31 Oct 2026, spec 410 section 6).
//  POST /report/submit   a game posts its GameReport (signed with its own secret). The console draws the PDF in memory, e-mails it ONCE to ALL
//                        Organizers and Hosts together (never Co-hosts), within 3 hours of game over, and stores nothing.
//  POST /report/bounce   the mail service tells the console a recipient bounced (carries BOUNCE_TOKEN).
// A report that could not be delivered is HELD, encrypted and apart from game data, in report_hold, and sent again to that one recipient after
// 24, 36 and 72 hours (counted from the first failure). It is deleted on delivery, or after the last try, and in any case about 96 hours after the first failure.
// POST /report/tick  (x-tick-token) does due resends and the daily clean-up; a scheduled GitHub Actions workflow calls it every 15 minutes. The lazy driving stays as a backup.
// Each failure sends the owner a notice with NO names: the game, the reason and the attempt number.
import { buildReportPdf, reportProblems, SEND_WINDOW_MS, SEND_LAST_MS, istStamp, type GameReport } from "../../packages/report/src/report";
import { purgeExpired } from "./purge";
import { normEmail } from "../../packages/bridge/src/email";
import { b64uEncode } from "../../packages/bridge/src/assertion";
import { sendMailEx, sealText, unsealText, isTestAddress, type Env } from "./auth-core";
import { tables } from "./tables";

export const RETRY_AFTER_MS = [24 * 3600_000, 36 * 3600_000, 72 * 3600_000] as const; // after the FIRST failure
export const HOLD_MAX_MS = 96 * 3600_000;
export const WATCH_MS = 6 * 3600_000; // after a good send the PDF is kept encrypted this long, only so a bounce notice from the mail service can still be answered
export const MAX_BODY = 4 * 1024 * 1024;
const REPORT_FROM = "Corporate Games <hello@corporatetambola.com>"; // the same sender the Tambola mails already use (Resend, same domain)
const BOUNCE_DEFAULT = "hello@corporatetambola.com";
const enc = new TextEncoder();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const fail = (status: number, error: string, message: string) => json(status, { ok: false, error, message });

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function hmacHex(secret: string, body: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(body)));
}
const sameText = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
export const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

let ensured = false;
/** The table is created the first time it is needed, so the console works even before migration 0002 has been applied by hand. */
export async function ensureHoldTable(env: Env) {
  if (ensured) return;
  await tables(env).prepare("CREATE TABLE IF NOT EXISTS report_hold (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, game_name TEXT NOT NULL, recipient_sealed TEXT NOT NULL, pdf_sealed TEXT NOT NULL, first_fail_ms INTEGER NOT NULL, attempts INTEGER NOT NULL, next_ms INTEGER NOT NULL, last_reason TEXT NOT NULL)").run();
  await tables(env).prepare("CREATE INDEX IF NOT EXISTS report_hold_next ON report_hold(next_ms)").run();
  ensured = true;
}
export const resetEnsured = () => { ensured = false; };

/** the Organizers and Hosts, once each, as the system reads an address (Co-hosts are never in the report) */
export const recipientsOf = (r: GameReport): string[] => [...new Set([...r.organizers, ...r.hosts].map((p) => normEmail(p.email)))];

const ownerAddr = (env: Env) => env.OWNER_NOTICE_EMAIL || "raajat.agarwal@gmail.com";
const bounceAddr = (env: Env) => env.BOUNCE_ADDRESS || BOUNCE_DEFAULT;
const reportMail = (r: GameReport) => ({
  subject: `Your game report: ${r.game.name}, Game ID ${r.gameId}`,
  text: `Your game is over. The report is attached as a PDF.\n\nGame: ${r.game.name}\nGame ID: ${r.gameId}\nEnded: ${istStamp(r.endMs)}\n\nThe report has the winners, the statistics, how the game was played and the game log. It has no list of participants.\nThe system does not keep this PDF. Please save it now.\nAll participant information is deleted within 24 hours of the game.\n\nIf you did not expect this e-mail, you can ignore it.`,
});
const failNotice = (env: Env, r: { game_name: string; game_id: string }, reason: string, attempt: number) => sendMailEx(env, {
  to: [ownerAddr(env)], subject: `Report e-mail failed: ${r.game_name}, Game ID ${r.game_id}`,
  text: `The end-of-game report e-mail could not be delivered to one recipient.\n\nGame: ${r.game_name}\nGame ID: ${r.game_id}\nReason: ${reason}\nAttempt: ${attempt} of ${RETRY_AFTER_MS.length + 1}\n\nNo names are in this notice. The system will try again by itself (after 24, 36 and 72 hours) and then stop.\nReturn address for bounces: ${bounceAddr(env)}`,
}).catch(() => undefined); // a notice that cannot be sent must never stop the report path

async function holdFor(env: Env, r: { gameId: string; gameName: string }, recipient: string, pdfB64: string, reason: string, now: number, _bounced = false) {
  await ensureHoldTable(env);
  const id = b64uEncode(crypto.getRandomValues(new Uint8Array(16)));
  await tables(env).prepare("INSERT INTO report_hold(id,game_id,game_name,recipient_sealed,pdf_sealed,first_fail_ms,attempts,next_ms,last_reason) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(id, r.gameId, r.gameName, await sealText(env, recipient), await sealText(env, pdfB64), now, 1, now + RETRY_AFTER_MS[0], reason.slice(0, 120)).run();
  await failNotice(env, { game_name: r.gameName, game_id: r.gameId }, reason, 1);
}

export async function handleReport(req: Request, env: Env, now: number): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (req.method !== "POST") return fail(405, "method", "Use POST.");

  if (path === "/report/bounce") {
    if (!env.BOUNCE_TOKEN || !sameText(req.headers.get("x-bounce-token") || "", env.BOUNCE_TOKEN)) return fail(401, "auth", "Not allowed.");
    let b: any; try { b = JSON.parse(await req.text()); } catch { return fail(400, "bad", "Not understood."); }
    if (typeof b?.emailId !== "string" || typeof b?.to !== "string") return fail(400, "bad", "emailId and to are needed.");
    await ensureHoldTable(env);
    const w = await tables(env).prepare("SELECT game_id, game_name, pdf_sealed FROM report_hold WHERE id=?").bind("w:" + b.emailId.slice(0, 80)).first<any>();
    if (!w) return json(200, { ok: true, held: false }); // unknown or too old: nothing to resend
    await holdFor(env, { gameId: w.game_id, gameName: w.game_name }, normEmail(b.to), await unsealText(env, w.pdf_sealed), String(b.reason || "bounced").slice(0, 120), now, true);
    return json(200, { ok: true, held: true });
  }
  if (path === "/report/tick") { // the scheduled caller (GitHub Actions, every 15 minutes): due resends and the clean-up, whether or not anybody opens the console
    if (!env.TICK_SECRET || !sameText(req.headers.get("x-tick-token") || "", env.TICK_SECRET)) return fail(401, "auth", "Not allowed.");
    const reports = await retryHeldReports(env, now);
    let purge: unknown = null; try { purge = await purgeExpired(env, now, fetch, { maxEmails: 20 }); } catch { /* the clean-up is tried again at the next tick */ }
    return json(200, { ok: true, reports, purged: purge ? { ...(purge as object) } : null });
  }
  if (path !== "/report/submit") return fail(404, "not_found", "No such page.");

  const text = await req.text();
  if (text.length > MAX_BODY) return fail(413, "too_big", "The report is too big.");
  let secrets: Record<string, string> = {}; try { secrets = JSON.parse(env.REPORT_SECRETS || "{}"); } catch { /* none set */ }
  let r: GameReport; try { r = JSON.parse(text); } catch { return fail(400, "bad", "The report is not readable."); }
  const secret = secrets[String((r as any)?.game?.id)];
  if (!secret || !sameText(req.headers.get("x-report-sig") || "", await hmacHex(secret, text))) return fail(401, "auth", "The game is not allowed to send a report.");
  const bad = reportProblems(r);
  if (bad.length) return fail(400, "invalid", bad.join(" "));
  if (now < r.gameOverMs - 5 * 60_000) return fail(409, "early", "The game is not over yet.");
  const late = now - r.gameOverMs > SEND_WINDOW_MS; // past the 3-hour target: it still goes out (a refused report is a lost report), and is logged as late
  if (now - r.gameOverMs > SEND_LAST_MS) return fail(409, "too_late", "The game data has been erased, so the report can no longer be made.");
  if (late) console.log(`report late: game ${r.gameId}, ${Math.round((now - r.gameOverMs) / 60_000)} minutes after game over`); // no names, no addresses

  const pdf = buildReportPdf(r, now), pdfB64 = b64(pdf), to = recipientsOf(r);
  const filename = `game-report-${r.gameId}.pdf`, mail = reportMail(r);
  try {
    const mailId = await sendMailEx(env, { to, subject: mail.subject, text: mail.text, attachments: [{ filename, contentB64: pdfB64 }], replyTo: bounceAddr(env), from: REPORT_FROM });
    if (mailId) { // kept encrypted for WATCH_MS only, so a bounce notice can still be answered; deleted by the clean-up below
      await ensureHoldTable(env);
      await tables(env).prepare("INSERT OR REPLACE INTO report_hold(id,game_id,game_name,recipient_sealed,pdf_sealed,first_fail_ms,attempts,next_ms,last_reason) VALUES(?,?,?,?,?,?,?,?,?)")
        .bind("w:" + mailId, r.gameId, r.game.name, await sealText(env, to.join(",")), await sealText(env, pdfB64), now, 0, Number.MAX_SAFE_INTEGER, "watch").run();
    }
  } catch (e: any) {
    // the mail service refused the whole send: every recipient is held, encrypted, for the retry path
    for (const a of to.filter((x) => !isTestAddress(x))) await holdFor(env, { gameId: r.gameId, gameName: r.game.name }, a, pdfB64, String(e?.message || "send failed"), now);
    return json(202, { ok: true, sent: 0, held: to.filter((x) => !isTestAddress(x)).length, recipients: to.length, late });
  }
  return json(200, { ok: true, sent: to.length, held: 0, recipients: to.length, late, bytes: pdf.length }); // nothing of the PDF is kept
}

/** Resends what is due. Called from the console's own pages (at most once an hour, see lazyReportRetry) because the cron Worker cannot be deployed. */
export async function retryHeldReports(env: Env, now: number, limit = 10) {
  await ensureHoldTable(env);
  const out = { delivered: 0, retried: 0, dropped: 0 };
  // anything past the 96-hour cap goes, delivered or not
  await tables(env).prepare("DELETE FROM report_hold WHERE id LIKE 'w:%' AND first_fail_ms<=?").bind(now - WATCH_MS).run(); // the bounce-watch copies
  out.dropped += (await tables(env).prepare("DELETE FROM report_hold WHERE id NOT LIKE 'w:%' AND first_fail_ms<=?").bind(now - HOLD_MAX_MS).run()).meta.changes;
  const due = (await tables(env).prepare("SELECT id,game_id,game_name,recipient_sealed,pdf_sealed,first_fail_ms,attempts FROM report_hold WHERE next_ms<=? AND id NOT LIKE 'w:%' ORDER BY next_ms LIMIT ?").bind(now, limit).all<any>()).results || [];
  for (const h of due) {
    const to = await unsealText(env, h.recipient_sealed), pdfB64 = await unsealText(env, h.pdf_sealed), filename = `game-report-${h.game_id}.pdf`;
    const mail = { subject: `Your game report: ${h.game_name}, Game ID ${h.game_id}`, text: `Your game report is attached again, because the first e-mail did not reach you.\n\nGame: ${h.game_name}\nGame ID: ${h.game_id}\n\nThe system does not keep this PDF. Please save it now.` };
    try {
      await sendMailEx(env, { to: [to], subject: mail.subject, text: mail.text, attachments: [{ filename, contentB64: pdfB64 }], replyTo: bounceAddr(env), from: REPORT_FROM });
      await tables(env).prepare("DELETE FROM report_hold WHERE id=?").bind(h.id).run(); // delivered: gone at once
      out.delivered++;
    } catch (e: any) {
      const attempts = h.attempts + 1, nextGap = RETRY_AFTER_MS[h.attempts]; // attempts = sends so far; RETRY_AFTER_MS[1] is the 36 h try, [2] the 72 h try
      await failNotice(env, { game_name: h.game_name, game_id: h.game_id }, String(e?.message || "send failed"), attempts);
      if (nextGap === undefined) { await tables(env).prepare("DELETE FROM report_hold WHERE id=?").bind(h.id).run(); out.dropped++; } // the last try has been made
      else { await tables(env).prepare("UPDATE report_hold SET attempts=?, next_ms=?, last_reason=? WHERE id=?").bind(attempts, h.first_fail_ms + nextGap, String(e?.message || "send failed").slice(0, 120), h.id).run(); out.retried++; }
    }
  }
  return out;
}

export const REPORT_MARKER = "report:hourly";
/** Once an hour at most (one atomic write, like the daily clean-up); returns null when this hour was already claimed. */
export async function lazyReportRetry(env: Env, now: number) {
  const claim = await tables(env).prepare("INSERT INTO rate(k,n,win_start_ms) VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=n+1, win_start_ms=excluded.win_start_ms WHERE rate.win_start_ms<=?").bind(REPORT_MARKER, now + 3600_000, now).run();
  if (claim.meta.changes !== 1) return null;
  return retryHeldReports(env, now);
}
