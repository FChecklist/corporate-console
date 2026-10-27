// node tools/heavy-run.mjs [--lock C:/ct/heavy.lock] [--min-free-mb 900] [--wait-min 30] [--timeout-min 20] -- <command> [args...]
// Runs ONE heavy job (test run, build, browser) at a time on this laptop. It follows C:\ct\HEAVY_JOB_PROTOCOL.md:
//   take the lock with mkdir (atomic), run only when enough RAM is free, remove the lock only if WE created it, kill the whole process tree when done or on timeout.
// If the lock exists (a directory OR a file written by another session) we wait and never remove it.
import { mkdirSync, rmdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { freemem } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const DEFAULT_LOCK = "C:/ct/heavy.lock";

/** try to take the lock; returns { ok, held } where held is a short description of who holds it */
export function takeLock(lock = DEFAULT_LOCK) {
  try { mkdirSync(lock); return { ok: true }; }
  catch (e) {
    if (e && e.code === "EEXIST") {
      let held = "another session";
      try { const st = statSync(lock); if (st.isFile()) held = readFileSync(lock, "utf8").trim().slice(0, 80) || held; } catch { /* unreadable: keep the default */ }
      return { ok: false, held };
    }
    throw e;
  }
}
/** release only a lock this process created */
export function dropLock(lock = DEFAULT_LOCK) { try { rmdirSync(lock); } catch { /* already gone */ } }
export const freeMb = () => Math.round(freemem() / 1048576);

export function killTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-pid, "SIGKILL");
  } catch { /* already gone */ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** run cmd under the lock; resolves { code, timedOut, waitedMs } */
export async function heavyRun(cmd, args, o = {}) {
  const lock = o.lock || DEFAULT_LOCK, minFree = o.minFreeMb ?? 900, waitMs = (o.waitMin ?? 30) * 60_000, timeoutMs = (o.timeoutMin ?? 20) * 60_000;
  const t0 = Date.now(); let got = false;
  while (true) {
    const l = takeLock(lock);
    if (l.ok) { if (freeMb() >= minFree) { got = true; break; } dropLock(lock); if (o.log) o.log(`waiting for RAM: ${freeMb()} MB free, need ${minFree}`); }
    else if (o.log) o.log(`waiting for the heavy lock (${l.held})`);
    if (Date.now() - t0 > waitMs) return { code: 98, timedOut: false, waitedMs: Date.now() - t0, reason: "gave up waiting for the lock or for RAM" };
    await sleep(o.pollMs ?? 15_000);
  }
  const waitedMs = Date.now() - t0;
  let child, timedOut = false, timer;
  const cleanup = () => { killTree(child && child.pid); if (got) { dropLock(lock); got = false; } };
  const onSig = () => { cleanup(); process.exit(130); };
  process.once("SIGINT", onSig); process.once("SIGTERM", onSig);
  try {
    const code = await new Promise((resolve) => {
      child = spawn(cmd, args, { stdio: o.stdio || "inherit", shell: false, cwd: o.cwd, env: o.env || process.env, windowsHide: true });
      timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, timeoutMs);
      child.on("error", () => resolve(127));
      child.on("exit", (c) => resolve(c === null ? 1 : c));
    });
    return { code: timedOut ? 124 : code, timedOut, waitedMs };
  } finally { clearTimeout(timer); process.off("SIGINT", onSig); process.off("SIGTERM", onSig); cleanup(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2), sep = a.indexOf("--");
  const flags = sep >= 0 ? a.slice(0, sep) : [], cmd = sep >= 0 ? a.slice(sep + 1) : [];
  const get = (n, d) => { const i = flags.indexOf(n); return i >= 0 ? flags[i + 1] : d; };
  if (!cmd.length) { console.error("usage: node tools/heavy-run.mjs [--lock P] [--min-free-mb N] [--wait-min N] [--timeout-min N] -- <command> [args]"); process.exit(2); }
  const r = await heavyRun(cmd[0], cmd.slice(1), { lock: get("--lock", DEFAULT_LOCK), minFreeMb: Number(get("--min-free-mb", 900)), waitMin: Number(get("--wait-min", 30)), timeoutMin: Number(get("--timeout-min", 20)), log: (m) => console.error("[heavy-run] " + m) });
  if (r.reason) console.error("[heavy-run] " + r.reason);
  process.exit(r.code);
}
