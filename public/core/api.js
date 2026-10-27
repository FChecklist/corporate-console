// The console's way of talking: to its own sign-in service (/auth/*, with the session cookie) and, in parallel, to each game directly (keys in the header, never a cookie).
// Rules: every game call has its own 6 second limit and its own failure; the other games always render. Only these headers go to a game: content-type, x-organizer, x-console-step.
// Nothing is written to any storage or address bar; the keys live in the vault (memory).
import { createVault } from "./session.js";
import { mergeGames, mergeBilling } from "./merge.js";

export const GAME_TIMEOUT_MS = 6000;

export function createApi({ games, consoleOrigin = "", fetchFn = (...a) => fetch(...a), timeoutMs = GAME_TIMEOUT_MS, now = () => Date.now() } = {}) {
  const vault = createVault();
  const ready = games.filter((g) => g.ready);
  const byId = Object.fromEntries(games.map((g) => [g.id, g]));

  /** one request with its own time limit; never throws: { ok, status, json } or { ok:false, unreachable:true } */
  async function call(url, init = {}) {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const r = await Promise.race([fetchFn(url, { ...init, signal: ctl && ctl.signal }), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs + 50))]);
      let json = null; try { json = await r.json(); } catch { /* not json */ }
      return { ok: r.ok && !(json && json.ok === false), unreachable: r.status >= 500, status: r.status, json }; // a game that answers 5xx is as good as unreachable
    } catch { return { ok: false, unreachable: true, status: 0, json: null }; } finally { if (timer) clearTimeout(timer); }
  }

  // ---- the console's own sign-in service ----
  const own = (path, body, method = "POST") => call(consoleOrigin + path, { method, credentials: "include", headers: { "content-type": "application/json", ...(method === "POST" ? { "x-console": "1" } : {}) }, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined });
  const auth = {
    request: (email, consent) => own("/auth/request", { email, consent }),
    verify: (email, code) => own("/auth/verify", { email, code }),
    me: () => own("/auth/me", undefined, "GET"),
  };

  /** one signed note per request, from the console; the plain e-mail only when asked for (an account is made / an invitation is matched) */
  async function assertions(requests) {
    const r = await own("/auth/assert", { requests });
    if (!r.ok) return { ok: false, notes: [], status: r.status };
    return { ok: true, notes: r.json.assertions };
  }
  const noteFor = (notes, game) => notes.find((n) => n.game === game && n.assertion)?.assertion || null;

  /** header values for a game call: the key, plus a fresh one-time confirmation when the action is a high-impact one */
  async function headersFor(game, eid, stepAction) {
    const k = vault.keyFor(game, eid, now());
    if (!k) return null;
    const h = { "content-type": "application/json", "x-organizer": k.key };
    if (stepAction) {
      const a = await assertions([{ game, act: "stepup", sa: stepAction, eid }]);
      const t = a.ok && noteFor(a.notes, game);
      if (!t) return null;
      h["x-console-step"] = t;
    }
    return h;
  }

  /** after sign-in: ask every ready game for this person's keys (in parallel); each game answers or fails on its own */
  async function connect({ create = false, onGame } = {}) {
    const a = await assertions(ready.map((g) => ({ game: g.id, act: "session", em: create })));
    if (!a.ok) return { ok: false, results: [] };
    const results = await Promise.all(ready.map(async (g) => {
      const note = noteFor(a.notes, g.id);
      if (!note) return finish({ game: g.id, ok: false, error: "no-assertion" });
      const r = await call(g.origin + "/api/console/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assertion: note, create }) });
      if (!r.ok) return finish({ game: g.id, ok: false, error: r.unreachable ? "unreachable" : r.json?.error || "refused" });
      const j = r.json;
      if (j.organizer) vault.put(g.id, "master", null, j.organizer.key, j.organizer.expiresMs);
      for (const s of j.scoped) vault.put(g.id, s.role, s.eid, s.key, s.expiresMs);
      return finish({ game: g.id, ok: true, created: !!j.created, hasAccount: !!j.organizer, scoped: j.scoped.length });
    }));
    function finish(x) { if (onGame) onGame(x); return x; }
    return { ok: true, results };
  }

  /** every ready game is asked at the same moment; onGame(result) fires as EACH one answers, so fast games show up while a slow one is still being waited for */
  async function fanOut(act, path, extraBody, collect, onGame) {
    const a = await assertions(ready.map((g) => ({ game: g.id, act })));
    if (!a.ok) return ready.map((g) => ({ game: g.id, ok: false, error: "signed-out" }));
    return Promise.all(ready.map(async (g) => {
      const res = await (async () => {
        const note = noteFor(a.notes, g.id);
        if (!note) return { game: g.id, ok: false, error: "no-assertion" };
        const out = []; let cursor = null, credit = null, guard = 0;
        do {
          const nn = guard === 0 ? note : noteFor((await assertions([{ game: g.id, act }])).notes, g.id); // a note is good once: a second page needs a fresh one
          if (!nn) return { game: g.id, ok: false, error: "no-assertion" };
          const r = await call(g.origin + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assertion: nn, ...(cursor ? { cursor } : {}), ...extraBody }) });
          if (!r.ok) return { game: g.id, ok: false, error: r.unreachable ? "unreachable" : r.json?.error || "refused" };
          out.push(...collect(r.json)); credit = r.json.credit ?? credit; cursor = r.json.next; guard++;
        } while (cursor && guard < 40);
        return { game: g.id, ok: true, rows: out, credit };
      })();
      if (onGame) onGame(res);
      return res;
    }));
  }

  return {
    vault, auth, assertions, headersFor, connect, call, ready, byId,
    /** the person's games from every ready game */
    async listGames({ onGame } = {}) { const results = await fanOut("games", "/api/console/games", {}, (j) => j.games, onGame); return { results, ...mergeGames(results) }; },
    async billing({ onGame } = {}) { const results = await fanOut("billing", "/api/console/billing", {}, (j) => j.rows, onGame); return { results, ...mergeBilling(results) }; },
    async invited({ onGame } = {}) { const results = await fanOut("invited", "/api/console/invited", {}, (j) => j.cards, onGame); return { results, cards: results.filter((r) => r.ok).flatMap((r) => r.rows), failed: results.filter((r) => !r.ok).map((r) => r.game) }; },
    /** public answers: version, sizes, prices (what the game itself says, never a number held here) */
    async capabilities() {
      const out = await Promise.all(ready.map(async (g) => { const r = await call(g.origin + "/api/console/capabilities"); return r.ok ? { game: g.id, ok: true, caps: r.json } : { game: g.id, ok: false, error: r.unreachable ? "unreachable" : "refused" }; }));
      return out;
    },
    /** sign out: every held key is ended in its own game, then the console session; failures of one game do not stop the others */
    async signOut({ everywhere = false } = {}) {
      const held = vault.all();
      await Promise.all(held.map((k) => call(byId[k.game].origin + "/api/console/signout", { method: "POST", headers: { "content-type": "application/json", "x-organizer": k.key }, body: "{}" })));
      vault.clear();
      return own("/auth/signout", { everywhere });
    },
  };
}
