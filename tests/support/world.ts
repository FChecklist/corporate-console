// A whole little world for the console tests: the real sign-in service, five fake games (normal, slow, down, empty, many rows) and a fetch that keeps the console's cookie.
import { makeD1 } from "./d1-sqlite";
import { handleAuth, type Env } from "../../functions/_lib/auth-core";
import { handle, newGame, seedGames, emailHash } from "../../tools/fake-game/server.mjs";
import { makeKeyPair, parseKeyList } from "../../packages/bridge/src/assertion";
import { createApi } from "../../public/core/api.js";

export const NAMES: Array<[string, string, string]> = [["tambola", "Tambola", "normal"], ["bingo", "Bingo", "slow"], ["tictactoe", "Tic-Tac-Toe", "down"], ["snakesladders", "Snakes and Ladders", "empty"], ["luckbychance", "Luck by Chance", "many"]];

export async function world(o: { slowMs?: number; timeoutMs?: number } = {}) {
  const kp = await makeKeyPair();
  const keys = parseKeyList("k1:" + kp.publicB64u);
  const subs = { alice: await emailHash("alice@acme.example"), bob: await emailHash("bob@bob.example"), carol: await emailHash("carol@carol.example") };
  const servers: any[] = [], games: any[] = [], states: any = {}, headersSeen: Record<string, Set<string>> = {};
  for (const [id, name, persona] of NAMES) {
    const S: any = newGame({ game: id, name: "Corporate " + name, persona, origin: "", keys });
    Object.defineProperty(S, "nowMs", { get: () => Date.now(), set: () => {} });
    S.slowMs = o.slowMs ?? 3500;
    const srv = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req) => { for (const [k] of req.headers) (headersSeen[id] ||= new Set()).add(k); return handle(S, req); } });
    S.origin = `http://127.0.0.1:${srv.port}`;
    seedGames(S, subs);
    servers.push(srv); states[id] = S;
    games.push({ id, name, short: name, ready: true, origin: S.origin, freeCap: 10, accent: "#000" });
  }
  games.push({ id: "luckydraw", name: "Lucky Draw", short: "Lucky Draw", ready: false, status: "planned", origin: "http://127.0.0.1:1", freeCap: 10, accent: "#000" });
  const { db } = makeD1();
  const mails: string[] = [];
  const env: Env = { DB: db, SESSION_PEPPER: "p", CONSOLE_SIGNING_KEY: btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey)))), CONSOLE_ORIGIN: "", GAME_ORIGINS: JSON.stringify(Object.fromEntries(games.map((g) => [g.id, g.origin]))), MAILER: async (_to, _s, text) => { mails.push(text); } };
  const cs = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req) => handleAuth(req, env, Date.now()) });
  const consoleOrigin = `http://127.0.0.1:${cs.port}`; env.CONSOLE_ORIGIN = consoleOrigin;
  let cookie = "";
  const fetchFn = async (url: string, init: any = {}) => {
    const isOwn = String(url).startsWith(consoleOrigin);
    const headers: Record<string, string> = { ...(init.headers || {}) };
    if (isOwn) { headers.origin = consoleOrigin; if (cookie) headers.cookie = cookie; }
    const r = await fetch(url, { ...init, headers });
    const sc = r.headers.get("set-cookie"); if (isOwn && sc) cookie = sc.split(";")[0]!.startsWith("cbsess=0000") ? "" : sc.split(";")[0]!;
    return r;
  };
  const api = createApi({ games, consoleOrigin, fetchFn, timeoutMs: o.timeoutMs ?? 1500 });
  const signIn = async (email = "alice@acme.example") => { await api.auth.request(email, true); const code = /code is (\d{6})/.exec(mails[mails.length - 1]!)![1]!; return api.auth.verify(email, code); };
  const stop = () => { for (const s of [...servers, cs]) s.stop(true); };
  return { api, signIn, states, games, headersSeen, stop, mails };
}

/** spies: anything written to a storage or the address bar */
export function spies() {
  const writes: string[] = [];
  const mk = (n: string) => ({ setItem: (k: string, v: string) => writes.push(`${n}:${k}=${v}`), getItem: () => null, removeItem: () => {}, clear: () => {} });
  (globalThis as any).localStorage = mk("local"); (globalThis as any).sessionStorage = mk("session");
  (globalThis as any).history = { pushState: (_a: any, _b: any, u: string) => writes.push("url:" + u), replaceState: (_a: any, _b: any, u: string) => writes.push("url:" + u) };
  return writes;
}

