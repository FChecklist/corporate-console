// The end-of-game report: ONE standard layout for all six games (owner decision 31 Oct 2026, spec 410 section 6).
// A game posts a GameReport; the console checks it and draws the PDF. Nothing is stored. There are NO per-participant rows:
// the only people in the report are the winners (the audit record) and the organizers and hosts who receive it.
// Section order is fixed: 1 Game information, 2 Winners, 3 Statistics, 4 How it was played, 5 Game log (continues as an annexure, never cut).
import { Doc, A4, rgb, textWidth, wrap, readJpeg, type Rgb } from "./pdf";

export type Person = { email: string; name?: string };
export type Winner = { prize: string; position?: string; name?: string; empId?: string; email?: string; mobile?: string; chain?: string; tie?: boolean; wonCount?: number; ticket?: string };
export type GameReport = {
  v: 1;
  game: { id: string; name: string; labels?: string[] };
  gameId: string;
  title?: string;
  brand?: { name?: string; accent?: string; logoJpegB64?: string };
  organizers: Person[];
  hosts: Person[];
  startMode?: string;
  startMs?: number;
  endMs: number;
  gameOverMs: number;
  winners: Winner[];
  stats: Record<string, unknown>;
  played?: { settings?: Array<[string, string]>; pausesByRole?: Array<{ role: string; count: number; seconds: number }>; changes?: Array<{ atMs: number; role: string; what: string }> };
  log: Array<{ atMs: number; text: string }>;
};

export const SEND_WINDOW_MS = 3 * 3600_000; // the TARGET: the report should go out within 3 hours of game over
export const SEND_LAST_MS = 20 * 3600_000; // a late send still goes out until participant data is erased (the code erases at 20 hours); it is logged as late
export const LIMITS = { winners: 2000, log: 200_000, settings: 60, changes: 500, text: 300, people: 50 } as const;

const TOP = new Set(["v", "game", "gameId", "title", "brand", "organizers", "hosts", "startMode", "startMs", "endMs", "gameOverMs", "winners", "stats", "played", "log"]);
const WINNER_KEYS = new Set(["prize", "position", "name", "empId", "email", "mobile", "chain", "tie", "wonCount", "ticket"]);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown, max: number = LIMITS.text) => typeof x === "string" && x.length <= max;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Plain-words problems with a payload; [] means it can be drawn. Co-hosts are refused outright (they never receive the report), and no per-participant list is accepted. */
export function reportProblems(r: any): string[] {
  const bad: string[] = [];
  if (!isObj(r)) return ["The report is not an object."];
  for (const k of Object.keys(r)) if (!TOP.has(k)) bad.push(k === "cohosts" || k === "coHosts" ? "Co-hosts do not receive the report, so none may be sent." : `Unknown part "${k}" (the report has no per-participant rows or other personal data).`);
  if (r.v !== 1) bad.push("Report version must be 1.");
  if (!isObj(r.game) || !str(r.game.id, 40) || !str(r.game.name, 80)) bad.push("The game id and name are needed.");
  if (!str(r.gameId, 60) || !r.gameId) bad.push("The Game ID is needed.");
  for (const f of ["endMs", "gameOverMs"]) if (!Number.isFinite(r[f])) bad.push(`${f} must be a time in milliseconds.`);
  for (const [f, list] of [["organizers", r.organizers], ["hosts", r.hosts]] as const) {
    if (!Array.isArray(list) || list.length > LIMITS.people) { bad.push(`${f} must be a list of at most ${LIMITS.people}.`); continue; }
    for (const p of list) if (!isObj(p) || typeof p.email !== "string" || !EMAIL_RE.test(p.email.normalize("NFKC").replace(/\s+/g, ""))) bad.push(`A ${f.slice(0, -1)} has no valid e-mail.`);
  }
  if (Array.isArray(r.organizers) && r.organizers.length === 0) bad.push("At least one organizer is needed.");
  if (!Array.isArray(r.winners) || r.winners.length > LIMITS.winners) bad.push("winners must be a list.");
  else for (const w of r.winners) { if (!isObj(w) || !str(w.prize, 120)) { bad.push("Every winner needs a prize."); break; } for (const k of Object.keys(w)) if (!WINNER_KEYS.has(k)) bad.push(`Winner field "${k}" is not allowed.`); }
  if (!isObj(r.stats)) bad.push("stats must be an object.");
  else for (const v of Object.values(r.stats)) if (Array.isArray(v) && v.length > 500) bad.push("A statistics list is too long: the report keeps counts, not rows.");
  if (!Array.isArray(r.log) || r.log.length > LIMITS.log) bad.push("The game log must be a list.");
  else for (const l of r.log) if (!isObj(l) || !Number.isFinite(l.atMs) || !str(l.text, 400)) { bad.push("Every log line needs a time and short text."); break; }
  if (r.played !== undefined && !isObj(r.played)) bad.push("played must be an object.");
  return [...new Set(bad)];
}

const PLAIN: Record<string, string> = {
  invited: "People invited", joined: "People joined", neverJoined: "Never joined", late: "Joined late", peak: "Most playing at one time", avgMinutes: "Average minutes played", dropouts: "Dropped out",
  rounds: "Rounds", speed: "Speed of play", helpRequests: "Help requests", errors: "Errors", signInRejects: "Sign-in rejects", reconnects: "Reconnects", ties: "Ties",
};
const IST = 5.5 * 3600_000;
const p2 = (n: number) => String(n).padStart(2, "0");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const istDate = (ms: number) => { const d = new Date(ms + IST); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const istTime = (ms: number) => { const d = new Date(ms + IST); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`; };
export const istStamp = (ms: number) => `${istDate(ms)} ${istTime(ms)} IST`;
const dur = (s: number) => { s = Math.max(0, Math.round(s)); return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; };

const INK: Rgb = [0.13, 0.12, 0.17], MUTE: Rgb = [0.42, 0.4, 0.5], LINE: Rgb = [0.85, 0.83, 0.9], GOLD: Rgb = [0.79, 0.64, 0.29], PAPER: Rgb = [0.97, 0.96, 0.93];
const M = { l: 42, r: 42, top: 96, bottom: 58 };
const CW = A4.w - M.l - M.r;

export function buildReportPdf(r: GameReport, now: number = r.gameOverMs): Uint8Array {
  const d = new Doc();
  const accent = rgb(r.brand?.accent || "#7A1C33");
  const logo = readJpeg(r.brand?.logoJpegB64, "Logo");
  if (logo) d.addImage(logo);
  let y = A4.h - M.top;
  const need = (h: number) => { if (y - h < M.bottom) { d.addPage(); y = A4.h - M.top; } };
  const h1 = (t: string) => { need(44); y -= 8; d.rect(M.l, y - 4, 4, 18, GOLD); d.text(M.l + 12, y, t, 15, accent, true); y -= 22; };
  const h2 = (t: string) => { need(30); d.text(M.l, y, t, 10.5, INK, true); y -= 15; };
  const para = (t: string, size = 9.5, color: Rgb = INK, bold = false) => { for (const ln of wrap(t, CW, size, bold)) { need(size + 5); d.text(M.l, y, ln, size, color, bold); y -= size + 4.5; } };
  const kv = (rows: Array<[string, string]>) => {
    for (const [k, v] of rows) { const lines = wrap(v || "-", CW - 150, 9.5); need(lines.length * 13 + 2); d.text(M.l, y, k, 9.5, MUTE); lines.forEach((ln, i) => d.text(M.l + 150, y - i * 13, ln, 9.5, INK)); y -= lines.length * 13 + 2; }
    y -= 4;
  };
  const tiles = (items: Array<[string, string]>) => {
    const per = 4, gap = 8, w = (CW - gap * (per - 1)) / per, h = 46;
    for (let i = 0; i < items.length; i += per) {
      need(h + gap);
      items.slice(i, i + per).forEach(([label, val], j) => {
        const x = M.l + j * (w + gap);
        d.rect(x, y - h, w, h, PAPER); d.frame(x, y - h, w, h, LINE); d.rect(x, y - h, 3, h, accent);
        d.text(x + 10, y - 22, val, 16, accent, true);
        const ls = wrap(label, w - 16, 7.5); ls.slice(0, 2).forEach((ln, k) => d.text(x + 10, y - 33 - k * 9, ln, 7.5, MUTE));
      });
      y -= h + gap;
    }
    y -= 4;
  };
  const table = (head: string[], rows: string[][], widths: number[], size = 8.5) => {
    const tot = widths.reduce((a, b) => a + b, 0), ws = widths.map((x) => (x / tot) * CW);
    const drawHead = () => { need(20); d.rect(M.l, y - 4, CW, 14, accent); let x = M.l; head.forEach((t, i) => { d.text(x + 4, y, t, size, [1, 1, 1], true); x += ws[i]; }); y -= 16; };
    drawHead();
    rows.forEach((row, ri) => {
      const cells = row.map((c, i) => wrap(c || "-", ws[i] - 8, size)), lines = Math.max(...cells.map((c) => c.length)), h = lines * (size + 3) + 4;
      if (y - h < M.bottom) { d.addPage(); y = A4.h - M.top; drawHead(); }
      if (ri % 2) d.rect(M.l, y - h + (size + 3) - 2, CW, h, PAPER);
      let x = M.l; cells.forEach((c, i) => { c.forEach((ln, k) => d.text(x + 4, y - k * (size + 3), ln, size, INK)); x += ws[i]; });
      y -= h;
    });
    y -= 8;
  };

  // 1. Game information
  h1("1  Game information");
  const people = (l: Person[]) => l.map((p) => (p.name ? `${p.name} <${p.email}>` : p.email)).join(", ");
  kv([
    ["Game", r.game.name], ["Game ID", r.gameId], ...(r.title ? [["Name of the game", r.title] as [string, string]] : []),
    ["Organizers", people(r.organizers)], ["Hosts", r.hosts.length ? people(r.hosts) : "None"],
    ["Start mode", r.startMode || "-"],
    ["Started", r.startMs ? istStamp(r.startMs) : "-"], ["Ended", istStamp(r.endMs)],
    ["Duration", r.startMs ? dur((r.endMs - r.startMs) / 1000) : "-"],
  ]);

  // 2. Winners in full
  h1("2  Winners");
  if (!r.winners.length) para("No prize was won in this game.", 9.5, MUTE);
  else table(["Prize", "Winner", "Employee ID", "E-mail", "Mobile", "Who brought them in", "Tie", "Won"], r.winners.map((w) => [
    (w.position ? w.position + ": " : "") + w.prize, w.name || "", w.empId || "", w.email || "", w.mobile || "", w.chain || "", w.tie ? "Yes" : "No", String(w.wonCount ?? 1)]),
    [1.5, 1.3, 0.9, 1.7, 1.0, 1.5, 0.45, 0.45], 7.8);
  para("This winners record is the audit record. It is kept for 365 days and then deleted. It is the only place in this report where people are named.", 8, MUTE);

  // 3. Statistics
  h1("3  Statistics");
  const s = r.stats as any;
  const t1: Array<[string, string]> = [];
  for (const k of Object.keys(PLAIN)) if (typeof s[k] === "number") t1.push([PLAIN[k], k === "avgMinutes" ? String(Math.round(s[k] * 10) / 10) : String(s[k])]);
  if (t1.length) tiles(t1);
  if (isObj(s.cameBy)) { h2("How people came"); tiles(Object.entries(s.cameBy).filter(([, v]) => typeof v === "number").map(([k, v]) => [({ link: "Game link", list: "From the list", family: "Family pass", host: "Brought by a Host" } as any)[k] || k, String(v)] as [string, string])); }
  if (isObj(s.claims)) { h2("Claims"); tiles(Object.entries(s.claims).filter(([, v]) => typeof v === "number").map(([k, v]) => [({ made: "Claims made", accepted: "Accepted", wrong: "Wrong", late: "Late" } as any)[k] || k, String(v)] as [string, string])); }
  if (isObj(s.pauses)) { h2("Pauses"); tiles([["Pauses", String(s.pauses.count ?? 0)], ["Total time paused", dur(Number(s.pauses.totalSeconds) || 0)]]); }
  if (isObj(s.prizes)) { h2("Prizes"); tiles([["Planned", String(s.prizes.planned ?? 0)], ["Won", String(s.prizes.won ?? 0)], ["Unclaimed", String(s.prizes.unclaimed ?? 0)], ...(typeof s.prizes.valueInr === "number" ? [["Value (INR)", Number(s.prizes.valueInr).toLocaleString("en-IN")] as [string, string]] : [])]); }
  if (isObj(s.firstClaimSeconds) && Object.keys(s.firstClaimSeconds).length) { h2("Time to the first claim, by prize"); table(["Prize", "Time"], Object.entries(s.firstClaimSeconds).map(([k, v]) => [k, dur(Number(v))]), [3, 1]); }
  if (isObj(s.elimination)) {
    h2("Rounds and survivors");
    if (Array.isArray(s.elimination.rounds)) table(["Round", "Survivors"], s.elimination.rounds.map((x: any) => [String(x.round), String(x.survivors)]), [1, 1]);
    if (Array.isArray(s.elimination.winnerPath) && s.elimination.winnerPath.length) para("Winner's path: " + s.elimination.winnerPath.join("  >  "), 9);
  }
  if (isObj(s.luckyDraw)) { h2("Lucky Draw"); tiles([["People registered", String(s.luckyDraw.registered ?? 0)]]); if (s.luckyDraw.proof) para("Draw proof: " + String(s.luckyDraw.proof), 8.5, MUTE); }

  // 4. How it was played
  h1("4  How it was played");
  const pl = r.played || {};
  if (pl.settings?.length) { h2("Settings"); kv(pl.settings.map(([k, v]) => [String(k), String(v)] as [string, string])); }
  if (pl.pausesByRole?.length) { h2("Pauses, by role"); table(["Role", "Pauses", "Time paused"], pl.pausesByRole.map((x) => [x.role, String(x.count), dur(x.seconds)]), [2, 1, 1.5]); }
  if (pl.changes?.length) { h2("Changes made during the game"); table(["Time", "By", "Change"], pl.changes.map((x) => [istStamp(x.atMs), x.role, x.what]), [1.6, 1, 4]); }
  if (!pl.settings?.length && !pl.pausesByRole?.length && !pl.changes?.length) para("No settings were reported.", 9.5, MUTE);

  // 5. Game log: 3 columns, small font; when the page is full it continues on the next page (an annexure), never cut
  d.addPage(); y = A4.h - M.top;
  h1("5  Game log");
  para(`Every activity with its date and time. ${r.log.length} lines. The log carries ticket numbers only, no names.`, 8.5, MUTE);
  const cols = 3, gap = 12, cw = (CW - gap * (cols - 1)) / cols, size = 6.4, lh = size + 2.2, top = y, bottom = M.bottom;
  let c = 0, cy = top; const startPage = d.pages.length;
  void startPage;
  for (const l of r.log) {
    const lines = wrap(`${istDate(l.atMs)} ${istTime(l.atMs)}  ${l.text}`, cw, size);
    if (cy - lines.length * lh < bottom) { c++; cy = top; if (c >= cols) { d.addPage(); c = 0; cy = A4.h - M.top; } }
    lines.forEach((ln, i) => d.text(M.l + c * (cw + gap), cy - i * lh, ln, size, i ? MUTE : INK));
    cy -= lines.length * lh + 1.2;
  }
  if (!r.log.length) para("No activity was logged.", 9.5, MUTE);

  const brandName = r.brand?.name || r.game.name;
  return d.build((pg, i, total) => {
    const top = A4.h;
    pg.rect(0, top - 62, A4.w, 62, accent); pg.rect(0, top - 65, A4.w, 3, GOLD);
    let tx = M.l;
    if (logo) { const hh = 34, ww = Math.min(110, (logo.w / logo.h) * hh); pg.image("Logo", M.l, top - 48, ww, hh); tx += ww + 12; }
    pg.text(tx, top - 29, brandName, 14, [1, 1, 1], true);
    pg.text(tx, top - 45, "End-of-game report", 9, [0.95, 0.9, 0.8]);
    const right = `${r.game.name}  |  Game ID ${r.gameId}`;
    pg.text(A4.w - M.r - textWidth(right, 8.5, true), top - 29, right, 8.5, [1, 1, 1], true);
    pg.text(A4.w - M.r - textWidth("Corporate Games", 8, false), top - 45, "Corporate Games", 8, [0.95, 0.9, 0.8]);
    pg.line(M.l, 40, A4.w - M.r, 40, LINE);
    pg.text(M.l, 28, `${r.game.name} | Game ID ${r.gameId} | Made ${istStamp(now)}`, 7.5, MUTE);
    const pn = `Page ${i + 1} of ${total}`;
    pg.text(A4.w - M.r - textWidth(pn, 7.5), 28, pn, 7.5, MUTE);
  });
}
