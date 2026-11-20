// FALSIFIED BY: paystep-hardcoded-price, paystep-wrong-button, paystep-voice, paystep-other-host, paystep-no-soft-error, paystep-privacy-claims-pdf
// The shared pay step (step 6) in the game pack: what an organizer reads and presses. The console answers are scripted here; the real routes are tested in pay-core.test.ts.
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";

const src = readFileSync(join(import.meta.dir, "../packages/game-pack/zc-flow.js"), "utf8");
const BASE = "http://localhost:8123";
const Q_SHORT = { ok: true, game: "bingo", item: "250", label: "Moneypenny", price: { credits: 5000, usd: "50.00", inrMinor: 350000 }, balance: { credits: 2000, usd: "20.00", inrMinor: 140000 }, short: { credits: 3000, usd: "30.00", inrMinor: 210000 }, enough: false };
const Q_ENOUGH = { ...Q_SHORT, balance: { credits: 6000, usd: "60.00", inrMinor: 420000 }, short: { credits: 0, usd: "0.00", inrMinor: 0 }, enough: true };
function bare(): any { const w: any = new Window({ url: "http://localhost/zc.html?flow=new" }); w.document.body.innerHTML = '<main id="app"></main>'; new Function("window", "document", "location", "fetch", src)(w, w.document, w.location, async () => ({})); return w; }
const tick = () => new Promise((r) => setTimeout(r, 15));

function boot(script: Record<string, (init: any) => any>, o: { descriptor?: string } = {}) {
  const log: Array<{ url: string; method: string; credentials?: string; body?: any }> = [];
  const win: any = new Window({ url: "http://localhost/zc.html?flow=new&e=WAIT001&console=" + encodeURIComponent(BASE) });
  win.document.body.innerHTML = '<main id="app"></main>';
  win.open = () => ({ location: { href: "" }, close() {} });
  const fakeFetch = async (url: string, init: any = {}) => {
    const u = new URL(url), key = (init.method || "GET") + " " + u.pathname;
    log.push({ url: u.origin + u.pathname, method: init.method || "GET", credentials: init.credentials, body: init.body ? JSON.parse(init.body) : undefined });
    const h = script[key];
    const out = h ? h(init) : { status: 404, body: { ok: false } };
    return { ok: out.status < 400, status: out.status, json: async () => out.body };
  };
  const descriptor = o.descriptor ?? 'window.ZFLOW_GAME = { brand: "Game X", payGame: "bingo", consoleOrigin: "https://console.example" };';
  new Function("window", "document", "location", "fetch", descriptor + "\n" + src)(win, win.document, win.location, fakeFetch);
  const F = win.ZFLOW;
  F.state.raw = { cap: 250 }; F.state.info = { published: true, paid: false }; F.state.done = { 1: true, 2: true, 3: true, 4: true, 5: true }; F.state.open = 6; F.state.view = "steps";
  F.draw();
  return { win, F, d: win.document, log, text: () => win.document.getElementById("zf-sec6").textContent as string, stop: () => { if (F.pay.timer) clearInterval(F.pay.timer); } };
}
const quoteOk = (q: any) => ({ "GET /pay/quote": () => ({ status: 200, body: q }) });

test("six steps; Pay is the last and opens after publishing", () => {
  const t = boot({});
  try { expect([...t.d.querySelectorAll(".zf-bar [data-step]")].map((b: any) => b.textContent.replace(/\s+/g, " ").trim())).toEqual(["1 Date and time", "2 Who is this game for", "3 Tickets and prizes", "4 Brand & Breaks (optional)", "5 Check and publish", "6 Pay"]); } finally { t.stop(); }
});

test("credits short: the cost, the existing credits, 'You only need to buy N credits', Buy now and Copy payment link - every number from the console's answer", async () => {
  const t = boot(quoteOk(Q_SHORT));
  try {
    await tick();
    const s = t.text();
    expect(s).toContain("Game only starts when you pay");
    expect(t.d.getElementById("zf-paycost").textContent).toBe("5,000 Moneypenny credits (= US$ 50.00 / ₹3,500)");
    expect(t.d.getElementById("zf-payhave").textContent).toBe("2,000 Moneypenny credits (= US$ 20.00 / ₹1,400)");
    expect(t.d.getElementById("zf-payneed").textContent).toBe("You only need to buy 3,000 credits (= US$ 30.00 / ₹2,100) to start the game");
    expect(t.d.getElementById("zf-buynow").textContent).toBe("Buy now");
    expect(t.d.getElementById("zf-copypay").textContent).toBe("Copy payment link");
    expect(t.d.getElementById("zf-payprimary")).toBe(null);
    expect(s).toContain("You don't have to buy software or a subscription or download anything. You only pay per game. Simple and easy.");
    expect(s).toContain("The payment link works for 7 days");
  } finally { t.stop(); }
});

test("a different answer from the console gives different numbers on the screen (no price in the page)", async () => {
  const t = boot(quoteOk({ ...Q_SHORT, price: { credits: 1234, usd: "12.34", inrMinor: 86380 }, short: { credits: 1234, usd: "12.34", inrMinor: 86380 }, balance: { credits: 0, usd: "0.00", inrMinor: 0 } }));
  try { await tick(); expect(t.d.getElementById("zf-paycost").textContent).toBe("1,234 Moneypenny credits (= US$ 12.34 / ₹863.80)"); expect(t.d.getElementById("zf-payneed").textContent).toContain("1,234 credits"); } finally { t.stop(); }
});

test("credits already cover the game: ONE button, 'Pay with your credits'; pressing it marks the game paid and shows the paid state", async () => {
  const t = boot({ ...quoteOk(Q_ENOUGH), "POST /pay/pay": () => ({ status: 200, body: { ok: true, paid: true } }), "GET /api/z/WAIT001/info": () => ({ status: 200, body: { startMs: 1, unpaid: false } }) });
  try {
    await tick();
    expect(t.d.getElementById("zf-payprimary").textContent).toBe("Pay with your credits");
    expect(t.d.getElementById("zf-buynow")).toBe(null); expect(t.d.getElementById("zf-copypay")).toBe(null); expect(t.d.getElementById("zf-payneed")).toBe(null);
    t.d.getElementById("zf-payprimary").click(); await tick(); await tick();
    expect(t.d.getElementById("zf-paid").textContent).toBe("Thank you. Your game is paid and ready.");
    expect(t.d.getElementById("zf-paydash").textContent).toBe("Open your Game dashboard");
    expect(t.log.filter((x) => x.method === "POST").map((x) => x.url + " " + JSON.stringify(x.body))).toEqual([BASE + "/pay/pay " + JSON.stringify({ game: "bingo", eid: "WAIT001", item: "250" })]);
  } finally { t.stop(); }
});

test("Buy now opens the payment page Moneypenny gave and waits; Copy payment link copies the payee link", async () => {
  const opened: string[] = [];
  const t = boot({ ...quoteOk(Q_SHORT), "POST /pay/buy": () => ({ status: 200, body: { ok: true, orderRef: "GAME-bingo-WAIT001-3000", payPage: "https://pay.invalid/stub/x" } }), "POST /pay/link": () => ({ status: 200, body: { ok: true, url: "https://console.example/pay-link.html?t=" + "a".repeat(48) } }), "GET /api/z/WAIT001/info": () => ({ status: 200, body: { startMs: 1, unpaid: true } }) });
  t.win.open = () => ({ location: { set href(v: string) { opened.push(v); } }, close() {} });
  const copied: string[] = [];
  Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText: async (v: string) => { copied.push(v); } }, configurable: true });
  try {
    await tick();
    t.d.getElementById("zf-copypay").click(); await tick(); await tick();
    expect(copied[0]).toMatch(/^https:\/\/console\.example\/pay-link\.html\?t=a{48}$/);
    expect(t.d.getElementById("zf-paynote").textContent).toContain("Payment link copied");
    expect((t.d.getElementById("zf-paylink") as any).value).toBe(copied[0]);
    t.d.getElementById("zf-buynow").click(); await tick(); await tick();
    expect(opened).toEqual(["https://pay.invalid/stub/x"]);
    expect(t.d.getElementById("zf-paywait").textContent).toContain("Waiting for your payment");
    expect(t.d.getElementById("zf-payopen").getAttribute("href")).toBe("https://pay.invalid/stub/x");
    expect(t.d.getElementById("zf-buynow").hasAttribute("disabled")).toBe(true); // no second purchase while waiting
  } finally { t.stop(); }
});

test("Moneypenny down: soft words and a 'Check again' button, never a hard error", async () => {
  const msg = "Credits are refreshing. Nothing has been taken from you. Please try again in a few minutes.";
  const t = boot({ "GET /pay/quote": () => ({ status: 503, body: { ok: false, error: "busy", message: msg } }) });
  try { await tick(); expect(t.d.getElementById("zf-payerr").textContent).toBe(msg); expect(t.d.getElementById("zf-payagain").textContent).toBe("Check again"); expect(t.d.getElementById("zf-buynow")).toBe(null); } finally { t.stop(); }
  const t2 = boot({}); // the console itself cannot be reached at all
  t2.win.fetch = undefined;
  try { await tick(); expect(t2.d.getElementById("zf-payerr")?.textContent ?? "").not.toMatch(/error|failed|exception|undefined/i); } finally { t2.stop(); }
});

test("not signed in to the console: a polite sign-in button", async () => {
  const t = boot({ "GET /pay/quote": () => ({ status: 401, body: { ok: false, error: "sign_in", message: "Please sign in to your console to pay for your game.", signIn: "https://console.example" } }) });
  try { await tick(); expect(t.d.getElementById("zf-payerr").textContent).toBe("Please sign in to your console to pay for your game."); expect(t.d.getElementById("zf-paysignin").getAttribute("href")).toBe("https://console.example"); } finally { t.stop(); }
});

test("the pay step talks to the console only, with the console's sign-in cookie, never to a payment company or another address", async () => {
  const t = boot({ ...quoteOk(Q_SHORT), "POST /pay/link": () => ({ status: 200, body: { ok: true, url: "https://console.example/pay-link.html?t=" + "b".repeat(48) } }) });
  try {
    await tick(); t.d.getElementById("zf-copypay").click(); await tick();
    const hosts = new Set(t.log.map((x) => new URL(x.url).origin));
    expect([...hosts]).toEqual([BASE]);
    expect(t.log.every((x) => x.credentials === "include")).toBe(true);
    expect(src).not.toMatch(/razorpay|itservices|api\/pay\/|\/pay\.html/i);
  } finally { t.stop(); }
});

test("the console address can be changed only on this computer: on a real address the setting of the game is used", () => {
  const f = bare().ZFLOW;
  expect(f.consoleBase({ consoleOrigin: "https://console.example/" }, "?console=http://127.0.0.1:9", "housie.example")).toBe("https://console.example");
  expect(f.consoleBase({ consoleOrigin: "https://console.example" }, "?console=https://evil.example", "localhost")).toBe("https://console.example");
  expect(f.consoleBase({ consoleOrigin: "https://console.example" }, "?console=http://localhost:8123", "localhost")).toBe("http://localhost:8123");
});

test("a game without a pay setting says so politely and shows no button", () => {
  const t = boot({}, { descriptor: 'window.ZFLOW_GAME = { brand: "Game X" };' });
  try { expect(t.d.getElementById("zf-paynone").textContent).toBe("Payment is not set up for this game yet."); expect(t.d.getElementById("zf-buynow")).toBe(null); } finally { t.stop(); }
});

test("CONSOLE VOICE: every sentence of the pay step is 'you', polite, simple; no banned word, no first person, no threat", async () => {
  const states: string[] = [];
  for (const [q, pay] of [[Q_SHORT, null], [Q_ENOUGH, null]] as const) {
    const t = boot(quoteOk(q)); await tick(); states.push(t.text()); t.stop();
  }
  const t = boot({ "GET /pay/quote": () => ({ status: 503, body: { ok: false, message: "Credits are refreshing. Nothing has been taken from you. Please try again in a few minutes." } }) }); await tick(); states.push(t.text()); t.stop();
  const F: any = bare();
  const all = [...states, ...Object.values(F.ZFLOW.PAY), F.ZFLOW.PAY_PRINT].join(" | ");
  expect(F.ZFLOW.badWords(all)).toEqual([]);
  expect(all).not.toMatch(/\bI\b|\bI'm\b|\bI'll\b|\bwe\b|\bour team\b/i);
  expect(all).not.toMatch(/\b(must|forced|penalt|fine|illegal|blocked|banned|suspend|or else|legal action)\b/i);
});

test("PRIVACY NOTE says only what is true today: designed to follow the laws, IDs deleted within 24 hours; it does NOT promise a PDF e-mail", () => {
  const F: any = bare();
  const p = F.ZFLOW.PAY.privacy;
  expect(p).toBe("Our games are designed to follow US privacy laws, the EU GDPR and India's DPDP. All participant information, including IDs, is deleted within 24 hours after the game ends.");
  expect(p).not.toMatch(/pdf|e-?mail|comply|complies|compliant|guarantee/i);
});
