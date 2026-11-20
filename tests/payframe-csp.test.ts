// FALSIFIED BY: payframe-not-allowed, payframe-wildcard, console-framable
// The secure payment window opens on top of the console page, so its address is allowed as a frame (and nothing wider); the console itself still cannot be framed.
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { headersFile, lintHeaders } from "../build.mjs";

const cfg = JSON.parse(readFileSync(new URL("../config/games.json", import.meta.url), "utf8"));
const NL = String.fromCharCode(10);
const frameSrcOf = (text: string): string[] => {
  const line = text.split(NL).find((l) => l.includes("Content-Security-Policy:"))!;
  const dir = line.split(";").map((d) => d.trim()).find((d) => d.startsWith("frame-src "))!;
  return dir.split(" ").slice(1).filter(Boolean);
};

test("a payframe address in config goes into frame-src only; the rules still pass; the console cannot be framed", () => {
  const withFrame = { ...cfg, payframeOrigins: { preview: ["https://pay.example"], live: ["https://pay.example"] } };
  const text = headersFile(withFrame, "live");
  expect(frameSrcOf(text)).toContain("https://pay.example");
  const connect = text.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src "))!;
  expect(connect).not.toContain("pay.example");
  expect(lintHeaders(text)).toEqual([]);
  expect(text).toContain("frame-ancestors 'none'");
});

test("frame-src is the games' player views plus exactly the configured payment-window address, nothing else", () => {
  const allowed = new Set<string>(cfg.payframeOrigins.live);
  const got = frameSrcOf(headersFile(cfg, "live"));
  expect(got.length).toBeGreaterThan(0);
  expect(got.every((x) => x.endsWith("/screenview/") || allowed.has(x))).toBe(true);
  expect(got.filter((x) => allowed.has(x)).length).toBe(allowed.size);
  const none = frameSrcOf(headersFile({ ...cfg, payframeOrigins: undefined }, "live"));
  expect(none.every((x) => x.endsWith("/screenview/"))).toBe(true);
});
