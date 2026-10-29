// Pure helpers that merge what the six games answered. Nothing here talks to the network and nothing is stored.

/** the answer of a game whose console bridge is not switched on yet */
export const OFF = "not-on-console";

/** a game row needs the person's attention: waiting for payment, or an invitation to accept */
export const needsAttention = (g) => g.nextAction === "accept" || g.status === "waiting_payment";

const IST = 19_800_000, DAY = 86_400_000;
/** a game that is ready and starts on today's date (India time) */
export const startsToday = (g, now = Date.now()) => g.status === "ready" && g.startMs != null && Math.floor((g.startMs + IST) / DAY) === Math.floor((now + IST) / DAY);

/** a draft of the person's own that starts within a day and has not been published: nobody else will remind them */
export const draftStartsSoon = (g, now = Date.now()) => g.role === "organizer" && g.status === "draft" && g.startMs != null && g.startMs - now < 86_400_000 && g.startMs > now - 3_600_000;

/** order: needs attention first, then playing now, then by start time (soonest first, no start time last), then by name */
export function sortGames(rows) {
  const rank = (g) => (needsAttention(g) ? 0 : g.status === "playing" ? 1 : g.status === "ready" ? 2 : g.status === "draft" ? 3 : 4);
  return [...rows].sort((a, b) => rank(a) - rank(b) || (a.startMs ?? Infinity) - (b.startMs ?? Infinity) || String(a.name || "").localeCompare(String(b.name || "")) || String(a.eid).localeCompare(String(b.eid)));
}

/** results: [{ game, ok, rows?, error? }] -> { rows (sorted), failed: [game ids] } */
export function mergeGames(results) {
  const rows = results.filter((r) => r.ok).flatMap((r) => r.rows);
  return { rows: sortGames(rows), failed: results.filter((r) => !r.ok && r.error !== OFF).map((r) => r.game), off: results.filter((r) => !r.ok && r.error === OFF).map((r) => r.game) };
}

/** totals PER currency; rupees and dollars are never added together */
export function totalsByCurrency(rows) {
  const t = {};
  for (const r of rows) if (r.status === "paid") t[r.currency] = (t[r.currency] || 0) + r.amountMinor;
  return t;
}
export function mergeBilling(results) {
  const rows = results.filter((r) => r.ok).flatMap((r) => r.rows).sort((a, b) => b.tsMs - a.tsMs);
  const credits = results.filter((r) => r.ok && r.credit).map((r) => ({ game: r.game, ...r.credit }));
  return { rows, credits, totals: totalsByCurrency(rows), failed: results.filter((r) => !r.ok && r.error !== OFF).map((r) => r.game), off: results.filter((r) => !r.ok && r.error === OFF).map((r) => r.game) };
}
