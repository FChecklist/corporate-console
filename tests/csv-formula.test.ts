// The payments CSV is opened by the finance team in Excel or Sheets. A game name chosen by an organizer must never be run as a formula there (found by e2e/part1 step 19).
import { test, expect } from "bun:test";
const { billingCsv } = await import("../public/screens/billing.js");
const row = (gameName: string) => ({ game: "bingo", eid: "AB12", gameName, what: "pack", amountMinor: 239900, currency: "INR", status: "paid", paidBy: "organizer", tsMs: Date.UTC(2026, 10, 20), invoice: null });

test("a game name that starts with = + - @ gets a leading apostrophe in the CSV; ordinary names and the amount are untouched", () => {
  for (const bad of ['=HYPERLINK("http://x.example","a")', "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) {
    const line = billingCsv([row(bad)], { bingo: "Bingo" }).split("\r\n")[1];
    expect(line.startsWith("Bingo,")).toBe(true);
    expect(line.split(",")[1].replace(/^"/, "")).toMatch(/^'/);
  }
  const ok = billingCsv([row("Friday party")], { bingo: "Bingo" }).split("\r\n")[1];
  expect(ok).toBe("Bingo,Friday party,2026-11-20,pack,2399.00,INR,paid,you,");
});
