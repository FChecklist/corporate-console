// FALSIFIED BY: smoke-sw-caches-pay
// SMOKE 20 NOV 2026, owner steps 4, 12, 13 and 14 as the browser sees them: the installed app's service worker may keep the app's own files, but never an answer that is true only at this moment (a quote, an amount due, 'paid', a sign-in answer, a report).
// The worker's own code runs against a stand-in browser. One test = one cell of docs/SMOKE-20NOV-CONSOLE.md.
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
function worker() {
  const handlers: Record<string, (e: any) => void> = {};
  const self: any = { location: { origin: "https://console.corporatetambola.com" }, addEventListener: (t: string, f: any) => { handlers[t] = f; }, skipWaiting: () => {}, clients: { claim: () => {} }, registration: { unregister: () => {} } };
  new Function("self", "caches", "fetch", src)(self, { match: async () => undefined, open: async () => ({ put: async () => {}, addAll: async () => {} }), keys: async () => [], delete: async () => true }, async () => new Response("{}"));
  return (url: string, method = "GET") => { let took = false; handlers.fetch({ request: { method, url }, respondWith: () => { took = true; } }); return took; };
}
const O = "https://console.corporatetambola.com";
const KEEP = ["/", "/index.html", "/core/tokens.css", "/core/boot.js", "/screens/home.js", "/manifest.webmanifest", "/icons/icon-192.png", "/pay-link.js", "/pay-link.css", "/pay-link.html", "/view-laptop/shell.js", "/owner-funnel/", "/gamesbar.js"];
const NEVER = ["/auth/me", "/auth/request", "/api/z/1", "/signin.html", "/version.json", "/sw-config.json", "/sw.js",
  "/pay/quote?game=bingo&eid=ABCD1234&item=250", "/pay/link/info?t=" + "a".repeat(48), "/pay/" + "a".repeat(48), "/pay/check", "/pay/event", "/stats/summary", "/stats/csv", "/report/tick"];
for (const p of KEEP) test(`W-keep ${p} is an app file: the worker may serve it fast`, () => expect(worker()(O + p)).toBe(true));
for (const p of NEVER) test(`W-never ${p} is a live answer: the worker never keeps it, never serves it late`, () => expect(worker()(O + p)).toBe(false));
for (const m of ["POST", "PUT", "DELETE"]) test(`W-method a ${m} is never touched by the worker`, () => expect(worker()(O + "/pay/pay", m)).toBe(false));
test("W-other-address anything from another address (a game, the payment window) is never touched", () => {
  for (const u of ["https://housie.corporatetambola.com/api/z/1", "https://itservices-rajat-agarwal.pages.dev/payframe/", "https://api.resend.com/emails"]) expect(worker()(u)).toBe(false);
});
