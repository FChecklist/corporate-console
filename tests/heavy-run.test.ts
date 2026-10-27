// FALSIFIED BY: heavy-lock-ignored
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { takeLock, dropLock, heavyRun } from "../tools/heavy-run.mjs";

const fresh = () => join(mkdtempSync(join(tmpdir(), "hv-")), "heavy.lock");

test("the first job takes the lock, a second one is told who holds it", () => {
  const lock = fresh();
  expect(takeLock(lock).ok).toBe(true);
  const second = takeLock(lock);
  expect(second.ok).toBe(false);
  dropLock(lock);
  expect(existsSync(lock)).toBe(false);
  expect(takeLock(lock).ok).toBe(true);
  dropLock(lock);
});

test("a lock FILE written by another session is respected, read, and never removed", async () => {
  const lock = fresh();
  writeFileSync(lock, "boss-live-smoke 18:43");
  const l = takeLock(lock);
  expect(l.ok).toBe(false);
  expect(l.held).toContain("boss-live-smoke");
  const r = await heavyRun(process.execPath, ["-e", "0"], { lock, waitMin: 0.001, pollMs: 50, minFreeMb: 0 });
  expect(r.code).toBe(98);
  expect(existsSync(lock)).toBe(true);
  rmSync(lock);
});

test("a job runs, returns its exit code and frees the lock", async () => {
  const lock = fresh();
  const ok = await heavyRun(process.execPath, ["-e", "process.exit(0)"], { lock, minFreeMb: 0, pollMs: 50 });
  expect(ok.code).toBe(0);
  expect(existsSync(lock)).toBe(false);
  const bad = await heavyRun(process.execPath, ["-e", "process.exit(3)"], { lock, minFreeMb: 0, pollMs: 50 });
  expect(bad.code).toBe(3);
  expect(existsSync(lock)).toBe(false);
});

test("while a job holds the lock a second job does not start", async () => {
  const lock = fresh();
  const first = heavyRun(process.execPath, ["-e", "setTimeout(()=>{},1500)"], { lock, minFreeMb: 0, pollMs: 50 });
  await new Promise((r) => setTimeout(r, 400));
  const second = await heavyRun(process.execPath, ["-e", "0"], { lock, minFreeMb: 0, waitMin: 0.002, pollMs: 50 });
  expect(second.code).toBe(98);
  expect((await first).code).toBe(0);
});

test("a job that runs too long is killed with its children and the lock is freed", async () => {
  const lock = fresh();
  const r = await heavyRun(process.execPath, ["-e", "setTimeout(()=>{},60000)"], { lock, minFreeMb: 0, pollMs: 50, timeoutMin: 0.03 });
  expect(r.timedOut).toBe(true);
  expect(r.code).toBe(124);
  expect(existsSync(lock)).toBe(false);
}, 20000);

test("not enough free RAM: the job does not start and gives the lock back", async () => {
  const lock = fresh();
  const r = await heavyRun(process.execPath, ["-e", "0"], { lock, minFreeMb: 10_000_000, waitMin: 0.002, pollMs: 50 });
  expect(r.code).toBe(98);
  expect(existsSync(lock)).toBe(false);
});
