// Shared harness for the Part 1 specs: configuration, the local stack (or a live base URL), Chromium, organizers, the test mailbox, and the results log.
//   E2E_BASE_URL   console address. Empty = start the local stack (a build of THIS repo with fake games). Set = run against that address (live): only tests marked "safe" run.
//   E2E_HOME_URL   home site address (default https://home.corporatetambola.com). Only read-only GETs are made to it.
//   E2E_STORAGE_STATE  path of a Playwright storage-state JSON of an already signed-in organizer (live runs cannot read the mailbox, so they cannot get a code).
//   E2E_CHROMIUM   path of a Chromium binary (default: the one Playwright finds, e.g. under PLAYWRIGHT_BROWSERS_PATH)
//   E2E_SLOWMO     ms (default 0)
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { createHmac } from "node:crypto";
import { join } from "node:path";
import { test as bunTest, expect } from "bun:test";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

export { expect };
export const HERE = new URL("../", import.meta.url).pathname;
const RESULTS_DIR = join(HERE, ".results");
export const LIVE = !!process.env.E2E_BASE_URL;
export const HOME_URL = (process.env.E2E_HOME_URL || "https://home.corporatetambola.com").replace(/\/$/, "");

export type World = { origin: string; games: Record<string, string>; reportSecret: string; tickSecret: string; live: boolean };
const G = globalThis as any;

/** one stack and one Chromium per test process (a second file in the same run reuses them) */
export async function world(): Promise<World> {
  if (G.__e2eWorld) return G.__e2eWorld;
  if (LIVE) return (G.__e2eWorld = { origin: process.env.E2E_BASE_URL!.replace(/\/$/, ""), games: {}, reportSecret: "", tickSecret: "", live: true });
  G.__e2eWorld = (async () => {
    const child: ChildProcess = spawn(process.execPath, [join(HERE, "lib/stack.ts")], { stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, E2E_PARENT_PID: String(process.pid) } });
    G.__e2eStack = child; child.unref(); (child.stdout as any).unref?.();
    process.on("exit", () => child.kill());
    const info: any = await new Promise((ok, no) => {
      let buf = "";
      child.stdout!.on("data", (d) => { buf += d; const m = /STACK (\{.*\})/.exec(buf); if (m) ok(JSON.parse(m[1])); });
      child.on("exit", (c) => no(new Error("the local stack stopped early (code " + c + ")")));
      setTimeout(() => no(new Error("the local stack did not start in 60 s")), 60_000);
    });
    return { origin: info.origin, games: info.games, reportSecret: info.reportSecret, tickSecret: info.tickSecret, live: false } as World;
  })();
  return G.__e2eWorld;
}

/** playwright-core wants one exact browser revision; a machine often has another one installed. Use the installed Chromium when there is one (otherwise Playwright's own default). */
function findChromium(): string | undefined {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers", join(process.env.HOME || "", ".cache/ms-playwright")].filter(Boolean) as string[];
  for (const r of roots) for (const c of ["chromium/chrome", "chromium-1243/chrome-linux64/chrome", "chromium-1243/chrome-linux/chrome"]) if (existsSync(join(r, c))) return join(r, c);
  return undefined;
}
export async function browser(): Promise<Browser> {
  if (G.__e2eBrowser) return G.__e2eBrowser;
  const exe = process.env.E2E_CHROMIUM || findChromium();
  G.__e2eBrowser = chromium.launch({ headless: true, slowMo: Number(process.env.E2E_SLOWMO || 0), ...(exe ? { executablePath: exe } : {}), args: ["--no-sandbox", "--disable-gpu"] });
  process.on("exit", () => { try { (G.__e2eStack as ChildProcess | undefined)?.kill(); } catch { /* gone */ } });
  return G.__e2eBrowser;
}

export const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
} as const;
export type Device = keyof typeof VIEWPORTS;

// ---- results log: one JSON line per scenario; report.ts turns them into RESULTS.md ----
export type Status = "pass" | "fail" | "blocked" | "skipped-live";
export function record(step: number, perm: string, name: string, status: Status, why = "") {
  mkdirSync(RESULTS_DIR, { recursive: true });
  appendFileSync(join(RESULTS_DIR, `${LIVE ? "live" : "local"}.jsonl`), JSON.stringify({ step, perm, name, status, why, at: new Date().toISOString() }) + "\n");
}

type Opts = { /** live runs: "safe" = read-only, runs against the live sites; "mutates" = signs in / creates / pays, never run live */ live?: "safe" | "mutates"; timeout?: number };
/** one scenario = one cell group of the matrix: step number, permutation tag, a name, the function. Pass / fail is recorded; a failure is re-thrown so bun shows it too. */
export function scenario(step: number, perm: string, name: string, fn: () => Promise<void>, opts: Opts = {}) {
  const label = `[step ${step}] [${perm}] ${name}`;
  if (LIVE && opts.live !== "safe") { bunTest(label + " (skipped: live run, this one changes data)", () => { record(step, perm, name, "skipped-live", "changes data or needs the test mailbox, so it is never run against the live sites"); }); return; }
  bunTest(label, async () => {
    try { await fn(); record(step, perm, name, "pass"); }
    catch (e: any) { record(step, perm, name, "fail", String(e?.message || e).split("\n").slice(0, 4).join(" | ").slice(0, 400)); throw e; }
  }, opts.timeout ?? 90_000);
}
/** something that cannot be tested from this repository: recorded as blocked, with the reason, so the table is honest */
export function blocked(step: number, perm: string, name: string, why: string) {
  bunTest(`[step ${step}] [${perm}] ${name} (blocked)`, () => { record(step, perm, name, "blocked", why); });
}

// ---- the stack's control API (stand-ins for the game wizard, the payment provider, the clock) ----
export class Stack {
  constructor(public w: World) {}
  async post(path: string, body: unknown = {}) { const r = await fetch(this.w.origin + "/__stack" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return r.json() as Promise<any>; }
  async get(path: string) { return (await fetch(this.w.origin + "/__stack" + path)).json() as Promise<any>; }
  mail = () => this.get("/mail") as Promise<{ recorded: Array<{ to: string; subject: string; text: string }>; wouldDeliver: Array<{ to: string; subject: string; text: string }>; gameMails: any[] }>;
  clearMail = () => this.post("/mail/clear");
  resetRates = () => this.post("/reset-rates");
  advance = (ms: number) => this.post("/clock", { advanceMs: ms });
  resetClock = () => this.post("/clock", { reset: true });
  expireSession = (email: string) => this.post("/expire-session", { email });
  createGame = (game: string, email: string, o: Record<string, unknown> = {}) => this.post("/game/create", { game, email, ...o }) as Promise<{ eid: string }>;
  patchGame = (game: string, eid: string, patch: Record<string, unknown>, ext?: Record<string, unknown>) => this.post("/game/patch", { game, eid, patch, ext });
  getGame = (game: string, eid: string) => this.get(`/game/get?game=${game}&eid=${eid}`);
  pay = (game: string, eid: string, mode: "ok" | "busy" | "fail") => this.post("/game/pay", { game, eid, mode });
  credit = (game: string, email: string, balanceMinor: number) => this.post("/game/credit", { game, email, balanceMinor });
  role = (game: string, eid: string, email: string, role: string, state = "accepted") => this.post("/game/role", { game, eid, email, role, state });
  persona = (game: string, persona: string, slowMs = 0) => this.post("/persona", { game, persona, slowMs });
  hits = (game: string) => this.get(`/game/hits?game=${game}`) as Promise<{ hits: string[]; calls: string[] }>;
  clearHits = (game: string) => this.post("/game/hits/clear", { game });
  purge = () => this.post("/purge");
  /** what the game would send to /report/submit when it ends, signed the way a game signs it */
  async submitReport(game: string, report: any, o: { secret?: string; tamper?: boolean } = {}) {
    const body = JSON.stringify(report);
    const sig = createHmac("sha256", o.secret ?? this.w.reportSecret).update(o.tamper ? body + " " : body).digest("hex");
    const r = await fetch(this.w.origin + "/report/submit", { method: "POST", headers: { "content-type": "application/json", "x-report-sig": sig }, body });
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  }
}

let counter = 0;
const stamp = Date.now().toString(36);
export const newEmail = (tag = "org") => `e2e-${tag}-${stamp}-${++counter}@demo-test.invalid`;

/** a finished-game report in the shape of packages/report/src/report.ts */
export function sampleReport(o: { gameId: string; organizers: string[]; hosts?: string[]; game?: string; nowMs?: number; startMode?: string }) {
  const end = (o.nowMs ?? Date.now()) - 10 * 60_000;
  return {
    v: 1, game: { id: o.game || "tambola", name: "Corporate Tambola" }, gameId: o.gameId, title: "Friday party", brand: "Acme Corp",
    organizers: o.organizers.map((email) => ({ email })), hosts: (o.hosts || []).map((email) => ({ email })), startMode: o.startMode || "manual-start-auto-play",
    startMs: end - 3600_000, endMs: end, gameOverMs: end,
    winners: [{ prize: "Early Five", name: "A. Player", ticket: "T12" }, { prize: "Full House", name: "B. Player", ticket: "T40" }],
    stats: { players: 42, numbersCalled: 61 }, played: { settings: [["Start", "manual"]], pausesByRole: [] }, log: [{ atMs: end - 1000, text: "Game over" }],
  };
}

// ---- an organizer in a real browser ----
export type Organizer = {
  email: string; ctx: BrowserContext; page: Page; stack: Stack; w: World; device: Device;
  /** sign in through the screens (e-mail, tick the box, read the code from the TEST mailbox, type it) */
  signIn(o?: { page?: Page }): Promise<void>;
  codeFromMail(index?: number): Promise<string>;
  open(hash?: string): Promise<void>;
  go(hash: string): Promise<void>;
  close(): Promise<void>;
  errors: string[];
};

export async function organizer(o: { device?: Device; email?: string; storageState?: any; clipboard?: boolean; slow?: boolean; fresh?: boolean; tz?: string } = {}): Promise<Organizer> {
  const w = await world(), stack = new Stack(w), br = await browser(), device = o.device || "desktop";
  if (!w.live && o.fresh !== false) await stack.resetRates(); // the sign-in mail limits are per address and per office address; every test starts with clean counters
  const ctx = await br.newContext({ ...VIEWPORTS[device], acceptDownloads: true, timezoneId: o.tz || "Asia/Kolkata", locale: "en-GB", ...(o.storageState ? { storageState: o.storageState } : {}), ...(o.clipboard ? { permissions: ["clipboard-read", "clipboard-write"] } : {}) });
  ctx.setDefaultTimeout(15_000);
  const page = await ctx.newPage();
  const errors: string[] = [];
  const watch = (p: Page) => { p.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200))); p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push("console: " + m.text().slice(0, 200)); }); };
  watch(page); ctx.on("page", watch);
  if (o.slow) { const cdp = await ctx.newCDPSession(page); await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 }); } // "slow 3G"-like
  const email = o.email || newEmail();
  const self: Organizer = {
    email, ctx, page, stack, w, device, errors,
    async codeFromMail(index = -1) {
      for (let i = 0; i < 50; i++) {
        const m = (await stack.mail()).recorded.filter((x) => x.to === email.toLowerCase());
        const hit = m.at(index);
        const code = hit && /code is (\d{6})/.exec(hit.text)?.[1];
        if (code) return code;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("no sign-in mail for " + email + " in the test mailbox");
    },
    async signIn(oo = {}) {
      const pg = oo.page || page;
      await pg.goto(w.origin + "/");
      await pg.fill("#si-email", email);
      await pg.check("#si-consent");
      await pg.click("text=Send me a code");
      await pg.waitForSelector("#si-code");
      await pg.fill("#si-code", await self.codeFromMail());
      await pg.click("text=Sign me in");
      await pg.waitForSelector("h1:has-text('What would you like to do?')");
    },
    async open(hash = "") { await page.goto(w.origin + "/" + (hash ? "#/" + hash : "")); },
    async go(hash) { await page.evaluate((h) => { location.hash = "#/" + h; }, hash); },
    async close() { await ctx.close(); },
  };
  return self;
}

/** the chromium of this machine must be found; say so in plain words when it is not */
export async function preflight() { try { await browser(); } catch (e: any) { throw new Error("Chromium could not start: " + e.message + " (set E2E_CHROMIUM or PLAYWRIGHT_BROWSERS_PATH)"); } }
export const noSideways = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
export const fileExists = existsSync;

/** an organizer for the length of one function; the browser context is always closed */
export async function withOrg(o: Parameters<typeof organizer>[0], fn: (x: Organizer) => Promise<void>) { const x = await organizer(o); try { await fn(x); } finally { await x.close(); } }
/** every 4 starting formats the games declare (config/games.json startModes of Tambola) */
export const START_FORMATS = ["auto-start-auto-play", "auto-start-manual-play", "manual-start-auto-play", "manual-start-manual-play"] as const;
