// Owner rule R11: ONE standard PDF for all games, fixed section order, no per-participant rows, size independent of participant count.
import { test, expect } from "bun:test";
import { buildReportPdf, reportProblems, istTime, type GameReport } from "../../packages/report/src/report";

const T0 = Date.UTC(2026, 9, 30, 6, 0, 0);
const mk = (over: Partial<GameReport> = {}, id = "tambola"): GameReport => ({
  v: 1, game: { id, name: "Corporate " + id }, gameId: "G1", organizers: [{ email: "o@example.org" }], hosts: [{ email: "h@example.org" }],
  startMs: T0, endMs: T0 + 3600_000, gameOverMs: T0 + 3600_000,
  winners: [{ prize: "Full House", name: "Asha Rao", empId: "E1", email: "asha@example.org", mobile: "9000000001", chain: "Host Ravi", tie: true }],
  stats: { invited: 100000, joined: 100000, rounds: 3 }, played: { settings: [["Cap", "100000"]] },
  log: [{ atMs: T0 + 1000, text: "Game started" }, { atMs: T0 + 2000, text: "Number 7 called" }], ...over });
const text = (pdf: Uint8Array) => new TextDecoder("latin1").decode(pdf);
const strings = (pdf: Uint8Array) => [...text(pdf).matchAll(/\((.*)\) Tj/g)].map((m) => m[1]);

test("R11 one standard format for all six games: same section headings in the same order", () => {
  let first = "";
  for (const id of ["tambola", "bingo", "tictactoe", "snakes", "luck", "luckydraw"]) {
    const heads = strings(buildReportPdf(mk({}, id))).filter((s) => /^[1-5]  /.test(s)).join("|");
    if (!first) first = heads;
    expect(heads, id).toBe(first);
  }
  expect(first).toBe("1  Game information|2  Winners|3  Statistics|4  How it was played|5  Game log");
});
test("R11 sections are in the fixed order: game info, winners, statistics, how played, game log", () => {
  const s = text(buildReportPdf(mk()));
  const at = ["1  Game information", "2  Winners", "3  Statistics", "4  How it was played", "5  Game log"].map((h) => s.indexOf(h));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
});
test("R11 winners in full: name, employee ID, e-mail, mobile, who invited them, prize, tie yes/no", () => {
  const s = strings(buildReportPdf(mk()));
  for (const h of ["Prize", "Winner", "Employee ID", "E-mail", "Mobile", "Who brought them in", "Tie"]) expect(s, h).toContain(h);
  for (const v of ["Full House", "Asha Rao", "E1", "asha@example.org", "9000000001", "Host Ravi", "Yes"]) expect(s.some((x) => x.includes(v)), v).toBe(true);
  expect(strings(buildReportPdf(mk({ winners: [{ prize: "P", tie: false }] }))).includes("No")).toBe(true);
});
test("R11 elaborate statistics are drawn", () => {
  const s = strings(buildReportPdf(mk({ stats: { invited: 12, joined: 9, peak: 8, claims: { made: 4, accepted: 3 }, prizes: { planned: 5, won: 3, unclaimed: 2 } } })));
  for (const v of ["People invited", "Claims made", "Planned", "Unclaimed"]) expect(s, v).toContain(v);
});
test("R11 game log has a date+time stamp per activity", () => {
  const s = strings(buildReportPdf(mk()));
  const line = s.find((x) => x.includes("Game started"))!;
  expect(line).toMatch(/\d{1,2} [A-Z][a-z]{2} 2026 \d{2}:\d{2}:\d{2}/);
  expect(line).toContain(istTime(T0 + 1000));
});
test("R11 log overflow goes to further pages (annexure), never cut", () => {
  const log = Array.from({ length: 5000 }, (_, i) => ({ atMs: T0 + i * 1000, text: "Number " + i + " called" }));
  const pdf = buildReportPdf(mk({ log }));
  const s = strings(pdf);
  expect(s.filter((x) => /Number \d+ called/.test(x)).length).toBe(5000);
  expect(Number(/\/Count (\d+)/.exec(text(pdf))![1])).toBeGreaterThan(2);
});
test("R11 NO per-participant rows: a report with per-participant data is refused", () => {
  expect(reportProblems({ ...mk(), participants: [{ name: "x" }] }).length).toBeGreaterThan(0);
  expect(reportProblems({ ...mk(), people: [] }).length).toBeGreaterThan(0);
  expect(reportProblems(mk({ stats: { rows: Array.from({ length: 501 }, (_, i) => i) } })).length).toBeGreaterThan(0);
});
test("R11 size does not grow with participant count (100000 synthetic participants, no row per participant)", () => {
  const names = Array.from({ length: 100000 }, (_, i) => "Participant" + i);
  const small = buildReportPdf(mk({ stats: { invited: 10, joined: 10 } }));
  const big = buildReportPdf(mk({ stats: { invited: 100000, joined: 100000, peak: 99999 } }));
  expect(Math.abs(big.length - small.length)).toBeLessThan(400) // only the digits of the counts differ;
  const all = text(big);
  expect(names.some((n, i) => i % 1000 === 0 && all.includes(n))).toBe(false);
  expect(strings(big).filter((x) => /Participant\d+/.test(x)).length).toBe(0);
  expect(Number(/\/Count (\d+)/.exec(all)![1])).toBe(Number(/\/Count (\d+)/.exec(text(small))![1]));
  // and a participant list smuggled in as data is not accepted at all
  expect(reportProblems({ ...mk(), participants: names }).length).toBeGreaterThan(0);
});
