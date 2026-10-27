// The keys the console holds for the games. MEMORY ONLY: never in localStorage, sessionStorage, a cookie or a web address (a page reload simply asks the console for new ones).
export function createVault() {
  const keys = new Map(); // "game|kind|eid" -> { game, kind, eid, key, expiresMs }
  const id = (game, kind, eid) => `${game}|${kind}|${eid || ""}`;
  return {
    put(game, kind, eid, key, expiresMs) { keys.set(id(game, kind, eid), { game, kind, eid: eid || null, key, expiresMs }); },
    /** the best key for a game: the organizer key, or the one tied to this game; never one that has run out */
    keyFor(game, eid, now = Date.now()) {
      const live = [...keys.values()].filter((k) => k.game === game && k.expiresMs > now);
      return (eid && live.find((k) => k.eid === eid)) || live.find((k) => k.kind === "master" && !k.eid) || null;
    },
    all() { return [...keys.values()]; },
    forget(game, kind, eid) { keys.delete(id(game, kind, eid)); },
    clear() { keys.clear(); },
    get size() { return keys.size; },
  };
}
