// FALSIFIED BY: privacy-log-email, privacy-log-mobile
// A made-up e-mail and mobile number go through the sign-in service, the daily clean-up, the bridge's note-making and a fake game. Neither may appear in any log line,
// in any error the services write, or (the e-mail) in a plain database column. The console keeps only a hash and a sealed copy of the e-mail, and never a mobile number.
import { test, expect, setDefaultTimeout } from "bun:test";
import { makeD1 } from "./support/d1-sqlite";
import { handleAuth, type Env } from "../functions/_lib/auth-core";
import { purgeExpired } from "../functions/_lib/purge";

setDefaultTimeout(60_000);
const EMAIL = "Zed.Fuzz+9@fuzzcorp-test.example", MOBILE = "9876512345", MOBILE_SPACED = "98765 12345", MOBILE_PLUS = "+919876512345";
const ORIGIN = "https://console.test";
const seen = (text: string) => [EMAIL, EMAIL.toLowerCase(), "fuzzcorp-test", MOBILE, MOBILE_SPACED, MOBILE_PLUS].filter((s) => text.toLowerCase().includes(s.toLowerCase()));

test("no log line, error text, game call line or plain database column carries the e-mail or the mobile number", async () => {
  const lines: string[] = [];
  const saved: Record<string, any> = {};
  for (const k of ["log", "info", "warn", "error", "debug"] as const) { saved[k] = console[k]; (console as any)[k] = (...a: unknown[]) => { lines.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")); }; }
  try {
    const { db, raw } = makeD1();
    const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
    const mails: string[] = [];
    const env: Env = { DB: db, SESSION_PEPPER: "pepper", CONSOLE_SIGNING_KEY: btoa(String.fromCharCode(...pkcs8)), CONSOLE_ORIGIN: ORIGIN, GAME_ORIGINS: JSON.stringify({ bingo: "https://bingo.test" }), MAILER: async (_t, _s, text) => { mails.push(text); } };
    const NOW = Date.UTC(2026, 9, 28, 6, 0, 0);
    const out: string[] = []; // everything the services SAY back that is not meant for the person (error bodies)
    const call = async (path: string, body?: unknown, cookie?: string) => {
      const r = await handleAuth(new Request(ORIGIN + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-console": "1", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env, NOW);
      const text = await r.text(); if (!r.ok) out.push(text);
      return { r, text };
    };
    await call("/auth/request", { email: EMAIL, consent: true, mobile: MOBILE, phone: MOBILE_PLUS });
    await call("/auth/request", { email: "not-an-email " + EMAIL, consent: true, mobile: MOBILE_SPACED }); // refused
    await call("/auth/verify", { email: EMAIL, code: "000000", mobile: MOBILE }); // wrong code
    const v = await call("/auth/verify", { email: EMAIL, code: /code is (\d{6})/.exec(mails[0]!)![1] });
    const cookie = /(cbsess=[0-9a-f]{64})/.exec(v.r.headers.get("set-cookie") || "")![1];
    await call("/auth/me", undefined, cookie);
    await call("/auth/assert", { requests: [{ game: "bingo", act: "session", em: true }, { game: "nowhere", act: "games" }] }, cookie);
    await call("/auth/signout", { everywhere: true }, cookie);
    await purgeExpired(env, NOW + 400 * 86400_000, (async () => new Response("{}", { status: 503 })) as any);
    expect(mails.length).toBeGreaterThan(0); // the flow really ran (the mail goes TO the address; its text never repeats it)
    // 1. log lines   2. error answers   3. every plain value in the database
    expect(seen(lines.join("\n"))).toEqual([]);
    expect(seen(out.join("\n"))).toEqual([]);
    const dump = JSON.stringify(["console_email", "login_code", "session", "rate"].map((t) => raw.query(`SELECT * FROM ${t}`).all()));
    expect(seen(dump)).toEqual([]);
  } finally { for (const k of Object.keys(saved)) (console as any)[k] = saved[k]; }
});

test("a fake game that receives a note for this person writes no e-mail or mobile number in its call lines or its game log", async () => {
  const { world } = await import("./support/world");
  const w = await world({ slowMs: 0 });
  try {
    await w.signIn("zed.fuzz+9@fuzzcorp-test.example"); await w.api.connect({ create: true });
    await w.api.listGames(); await w.api.billing();
    await w.api.handoff("tambola", { target: "new" });
    const all = Object.values(w.states).map((S: any) => JSON.stringify([S.calls, S.log])).join("\n");
    expect(seen(all)).toEqual([]);
  } finally { w.stop(); }
});
