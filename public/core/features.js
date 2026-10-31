// What each game declares, read from the game list the build wrote from the game's manifest (see build.mjs, vendor/game-core). A screen shows a piece only when the game declares it:
// no Pause button where a game has no pause, no "Organizer has the final say" line where it has none, no "start from an earlier game" where the game cannot copy. Pure: no network.

/** the set of pieces a game declares (a game descriptor from games.config.js; anything else gives an empty set) */
export function featuresOf(game) {
  const s = new Set();
  if (!game || typeof game !== "object") return s;
  for (const f of game.features || []) s.add(f); // console pieces: report, clone, idKind
  if (game.pause && Array.isArray(game.pause.by) && game.pause.by.length) s.add("pause");
  if (game.organizerFinalSayPrizes === true) s.add("finalSay");
  if (game.goldenButton === "claim") s.add("claim");
  if ((game.roles || []).includes("cohost")) s.add("cohost");
  if ((game.roles || []).includes("family")) s.add("family");
  if ((game.startModes || []).some((m) => m.startsWith("manual"))) s.add("manualStart");
  if (Number.isInteger(game.rehearsalMax) && game.rehearsalMax > 0) s.add("rehearsal");
  return s;
}
export const has = (game, feature) => featuresOf(game).has(feature);

/** who may pause and resume this game (roles from the manifest), or [] when the game has no pause */
export const pauseRoles = (game) => (has(game, "pause") ? game.pause.by.filter((r) => r === "organizer" || r === "host") : []);
/** may this person (role in the game row) pause or resume it? Never a Co-host, never a participant. */
export const canPause = (game, role) => pauseRoles(game).includes(role);
/** may this person press Start (a game that starts by hand)? Organizer or Host only. */
export const canStart = (game, role) => has(game, "manualStart") && (role === "organizer" || role === "host");

const n = (x) => Number(x).toLocaleString("en-US");
/** plain one-line facts of a game, only for what it declares */
export function factLines(game) {
  const out = [], c = game && game.caps;
  if (c && Number.isInteger(c.auto)) out.push(`Up to ${n(c.auto)} people` + (Number.isInteger(c.manual) ? `, or ${n(c.manual)} when a Host calls the numbers.` : "."));
  if (has(game, "rehearsal")) out.push(`Try it first: up to ${game.rehearsalMax} people, no prizes, no payment.`);
  if (has(game, "claim")) out.push("Players press Claim when they have a winning line.");
  else if (game && game.goldenButton === "announce") out.push("The system claims for the players. The button says You won.");
  if (has(game, "finalSay")) out.push("The organizer has the final say on prizes after the game.");
  return out;
}
