// THE one place that decides which games are shown (boss decision 27 Nov 2026).
// config/games.json holds the switch: "hiddenGames": [ids]. Nothing is deleted; a hidden game stays in the config, the CSP, the API fan-out and the code,
// so a game that already exists stays reachable. Everything that SHOWS games as a choice (Create screen, public chooser, sitemap, llms.txt, structured data,
// search text, the games bar) reads this file. Set "hiddenGames" to [] and every page is built exactly as before.

/** the ids of the hidden games (unknown ids are ignored; none = []) */
export function hiddenIds(cfg) {
  const h = Array.isArray(cfg && cfg.hiddenGames) ? cfg.hiddenGames : [];
  const known = new Set(((cfg && cfg.games) || []).map((g) => g.id));
  return h.filter((id) => known.has(id));
}
/** the games people are shown as a choice: every game of the file that is not hidden, in the order of the file */
export const shownGames = (cfg) => cfg.games.filter((g) => !hiddenIds(cfg).includes(g.id));
/** "Tambola, Bingo and Lucky Draw" - the shown games' short names for search text */
export function shownNamesText(cfg) {
  const n = shownGames(cfg).map((g) => String(g.name).replace(/^Corporate /, ""));
  return n.length < 2 ? n.join("") : n.slice(0, -1).join(", ") + " and " + n[n.length - 1];
}
/** the names used in search text: with nothing hidden the wording is exactly the one used before the switch existed */
export const searchNamesText = (cfg) => (hiddenIds(cfg).length ? shownNamesText(cfg) : "Tambola, Bingo, Tic Tac Toe and more");
/** the id the shared games bar uses for a game of the config */
const BAR_ID = { snakesladders: "snakes", luckbychance: "luck", luckydraw: "draw" };
export const barId = (id) => BAR_ID[id] || id;
/** the shared games bar (canonical source, never edited) without the hidden games; the built copy only. No hidden game = the same text back. */
export function hideInGamesBar(src, hidden) {
  let s = src;
  for (const id of hidden) {
    const re = new RegExp('^[ \t]*\{ id: "' + barId(id) + '",[^\n]*\},?\r?\n', "m");
    if (!re.test(s)) throw new Error('games bar: no entry for hidden game "' + id + '"');
    s = s.replace(re, "");
  }
  return s.replace(/,(\s*\n\s*\];)/, "$1"); // no comma left before the closing bracket
}
