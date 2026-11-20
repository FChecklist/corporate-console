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

test("with no payframe address yet, frame-src is only the games' player views", () => {
  const frameSrc = /frame-src ([^;\n]+)/.exec(headersFile(cfg, "live"))![1];
  expect(frameSrc.split(/\s+/).every((x: string) => x.endsWith("/screenview/"))).toBe(true);
});
