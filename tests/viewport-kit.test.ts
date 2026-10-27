// FALSIFIED BY: viewport-kit-second-chrome-allowed
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { WIDTHS, SWITCH_WIDTHS, acquireChromeLock, releaseChromeLock, contrastRatio, contrastFailures } from "../tools/browser-tests/viewport-kit.mjs";

const lockPath = () => join(mkdtempSync(join(tmpdir(), "chl-")), "chrome.lock");

test("the ten widths of the owner's rule and the 899/900 pair are all there", () => {
  expect(WIDTHS).toEqual([320, 360, 390, 414, 600, 768, 1024, 1280, 1440, 1920]);
  expect(SWITCH_WIDTHS).toEqual([899, 900]);
});

test("a second Chrome is refused while the first one's process is alive", () => {
  const lock = lockPath();
  const child = spawn(process.execPath, ["-e", "setTimeout(()=>{},20000)"], { stdio: "ignore" });
  try {
    writeFileSync(lock, String(child.pid));
    expect(() => acquireChromeLock(lock, process.pid)).toThrow(/one at a time/);
  } finally { child.kill(); }
});

test("a lock left by a dead process is taken over, and only the owner can release it", () => {
  const lock = lockPath();
  writeFileSync(lock, "2147483000"); // no such process
  acquireChromeLock(lock, process.pid);
  expect(readFileSync(lock, "utf8")).toBe(String(process.pid));
  releaseChromeLock(lock, 12345); // not ours: stays
  expect(existsSync(lock)).toBe(true);
  releaseChromeLock(lock, process.pid);
  expect(existsSync(lock)).toBe(false);
});

test("contrast: black on white is 21, a known grey misses 4.5, our checker lists it", () => {
  expect(Math.round(contrastRatio("#000", "#fff"))).toBe(21);
  expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(4.5);
  expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  const f = contrastFailures([["ok", "#000", "#fff"], ["weak", "#999", "#fff"]]);
  expect(f.map((x: any) => x.n)).toEqual(["weak"]);
});
