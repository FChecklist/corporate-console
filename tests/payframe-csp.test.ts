// FALSIFIED BY: payframe-not-allowed, payframe-wildcard, console-framable
// The secure payment window opens on top of the console page, so its address is allowed as a frame (and nothing wider); the console itself still cannot be framed.
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { headersFile, lintHeaders } from "../build.mjs";

const cfg = JSON.parse(readFileSync(new URL("../config/games.json", import.meta.url), "utf8"));

test("a payframe address in config goes into frame-src only; the rules still pass; the console cannot be framed", () => {
  const withFrame = { ...cfg, payframeOrigins: { preview: ["https://pay.example"], live: ["https://pay.example"] } };
  const text = headersFile(withFrame, "live");
  const frameSrc = /frame-src ([^;]+)/.exec(text)![1];
  expect(frameSrc).toContain("https://pay.example");
  expect(/connect-src ([^;]+)/.exec(text)![1]).not.toContain("pay.example");
  expect(lintHeaders(text)).toEqual([]);
  expect(text).toContain("frame-ancestors 'none'");
});

test("frame-src is the games' player views plus exactly the configured payment-window address, nothing else", () => {
  const frameSrc: string[] = /frame-src ([^;
]+)/.exec(headersFile(cfg, "live"))![1].split(/\s+/);
  const allowed = new Set<string>(cfg.payframeOrigins.live);
  expect(frameSrc.every((x) => x.endsWith("/screenview/") || allowed.has(x))).toBe(true);
  expect(frameSrc.filter((x) => allowed.has(x)).length).toBe(allowed.size);
  const none = /frame-src ([^;
]+)/.exec(headersFile({ ...cfg, payframeOrigins: undefined }, "live"))![1].split(/\s+/);
  expect(none.every((x) => x.endsWith("/screenview/"))).toBe(true);
});
