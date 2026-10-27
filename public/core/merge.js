// Pure helpers that merge what the six games answered. Nothing here talks to the network and nothing is stored.

/** a game row needs the person's attention: waiting for payment, or an invitation to accept */
export const needsAttention = (g) => g.nextAction === "accept" || g.status === "waiting_payment";

/** order: needs attention first, then playing now, then by start time (soonest first, no start time last), then by name */
export function sortGames(rows) {
  const rank = (g) => (needsAttention(g) ? 0 : g.status === "playing" ? 1 : g.status === "ready" ? 2 : g.status === "draft" ? 3 : 4);
  return [...rows].sort((a, b) => rank(a) - rank(b) || (a.startMs ?? Infinity) - (b.startMs ?? Infinity) || a.name.localeCompare(b.name) || a.eid.localeCompare(b.eid));
}

/** results: [{ game, ok, rows?, error? }] -> { rows (sorted), failed: [game ids] } */
export function mergeGames(results) {
  const rows = results.filter((r) => r.ok).flatMap((r) => r.rows);
  return { rows: sortGames(rows), failed: results.filter((r) => !r.ok).map((r) => r.game) };
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
  return { rows, credits, totals: totalsByCurrency(rows), failed: results.filter((r) => !r.ok).map((r) => r.game) };
}
