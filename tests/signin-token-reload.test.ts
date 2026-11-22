// FALSIFIED BY: signin32-token-stripped-early, signin32-no-confirm, signin32-double-press, signin32-confirm-reads-cookie
// The e-mailed sign-in link (`/signin.html?t=<one-time code>`), audit finding H1 of 0.3.1: an automatic page reload threw the one-time code away, because the page took it out of the
// address at once and kept it only in memory. 0.3.2: the code stays in the address until the server says you are signed in; a reload before that finds it again and uses it once.
// The real public/signin.js runs here in a fake page, against a fake server that spends a code on its first use and sets the (HttpOnly, so unreadable) sign-in cookie.
import { test, expect } from "bun:test";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dir, "..");
const SRC = readFileSync(join(root, "public/signin.js"), "utf8").replace('import { showVersion } from "/core/version.js";', "const showVersion = () => {};"); // the page's version line is not under test
const dir = mkdtempSync(join(tmpdir(), "signin-"));
let n = 0;
const TOKEN = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718";

/** a fake server: a code works once; /auth/me says signedIn only if the browser kept the cookie (`cookies: false` = a browser that refuses it) */
function server(o: { cookies?: boolean } = {}) {
  const spent = new Set<string>(), valid = new Set([TOKEN]), seen: string[] = [], calls: string[] = [];
  let signedIn = false;
  const doFetch = async (url: string, init: any = {}) => {
    calls.push((init.method || "GET") + " " + url);
    if (url === "/auth/link") {
      const t = JSON.parse(init.body).t; seen.push(t);
      await new Promise((r) => setTimeout(r, 5));
      if (!valid.has(t) || spent.has(t)) return { ok: false, status: 401, json: async () => ({ message: "That code did not work." }) };
      spent.add(t); if (o.cookies !== false) signedIn = true;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (url === "/auth/me") return { ok: true, status: 200, json: async () => ({ ok: true, signedIn }) };
    throw new Error("unexpected call " + url);
  };
  return { doFetch, seen, calls, spent };
}

/** one "tab": loads public/signin.js as a page would, at the tab's current address; `reload()` loads it again at whatever the address is NOW */
function tab(srv: ReturnType<typeof server>, startUrl: string) {
  const state = { url: new URL(startUrl), replaced: [] as string[], loads: 0 };
  const els: any = { msg: { textContent: "" }, go: { disabled: false, handlers: [] as any[], addEventListener(_: string, f: any) { this.handlers.push(f); } } };
  async function load() {
    state.loads++;
    els.go.handlers.length = 0; els.go.disabled = false;
    Object.assign(globalThis, {
      document: { getElementById: (id: string) => els[id] }, // no cookie property at all: the page must not need one
      location: { get search() { return state.url.search; }, get pathname() { return state.url.pathname; }, replace: (u: string) => state.replaced.push(u) },
      history: { replaceState: (_s: any, _t: any, u: string) => { state.url = new URL(u, state.url); } },
      fetch: srv.doFetch,
    });
    delete (globalThis as any).cookieStore; // Firefox and older Safari have none; the page must not need it
    const f = join(dir, `s${++n}.mjs`); writeFileSync(f, SRC);
    return await import(pathToFileURL(f).href);
  }
  return { state, els, load, press: async () => { await els.go.handlers[0](); await new Promise((r) => setTimeout(r, 20)); } };
}
const WITH = "https://console.corporatetambola.com/signin.html?t=" + TOKEN;

test("H1: loading the page does NOT take the one-time code out of the address (a reload before the button needs it)", async () => {
  const t = tab(server(), WITH);
  await t.load();
  expect(t.state.url.search).toBe("?t=" + TOKEN);
});

test("H1: the page is loaded again before the button is pressed (an automatic reload): the code is still there and is used once, and the person is signed in", async () => {
  const srv = server();
  const t = tab(srv, WITH);
  await t.load();
  await t.load(); // the reload: same address as it is now
  await t.press();
  expect(srv.seen).toEqual([TOKEN]); // sent once, and not empty
  expect(srv.calls).toEqual(["POST /auth/link", "GET /auth/me"]);
  expect(t.state.replaced).toEqual(["/"]);
});

test("H1: the code leaves the address only AFTER the server confirms the sign-in (not before the post, and not while it is being checked)", async () => {
  const srv = server();
  const t = tab(srv, WITH);
  const seenSearch: string[] = [];
  const inner = srv.doFetch;
  (srv as any).doFetch = async (u: string, i: any) => { seenSearch.push(u + " @ " + t.state.url.search); return inner(u, i); };
  await t.load(); // `fetch` is read from the module's globals at call time: set it again to the wrapped one
  (globalThis as any).fetch = (srv as any).doFetch;
  await t.press();
  expect(seenSearch).toEqual(["/auth/link @ ?t=" + TOKEN, "/auth/me @ ?t=" + TOKEN]); // still in the address at both calls
  expect(t.state.url.search).toBe(""); // gone once confirmed
  expect(t.state.replaced).toEqual(["/"]);
});

test("H1: if the server does not confirm the sign-in (a browser that refuses the cookie), the page says so in plain words, does not move on, and keeps the address", async () => {
  const srv = server({ cookies: false });
  const t = tab(srv, WITH);
  await t.load(); await t.press();
  expect(t.state.replaced).toEqual([]);
  expect(t.state.url.search).toBe("?t=" + TOKEN);
  expect(t.els.msg.textContent).toMatch(/did not keep it.*allow cookies/i);
  expect(t.els.go.disabled).toBe(false); // the person can act again
});

test("H1: a reload AFTER sign-in keeps the person signed in: the address has no code, the server still says signed in, and the page does not post an empty code", async () => {
  const srv = server();
  const t = tab(srv, WITH);
  await t.load(); await t.press();
  expect(t.state.replaced).toEqual(["/"]);
  await t.load(); // reload of the (now clean) address
  expect(t.state.url.search).toBe("");
  expect(srv.seen).toEqual([TOKEN]); // nothing was posted by the reload
  expect((await srv.doFetch("/auth/me")).json().then((j: any) => j.signedIn)).resolves.toBe(true);
});

test("one press sends the code once: a second press while the first is working does nothing (the code is spent by the first)", async () => {
  const srv = server();
  const t = tab(srv, WITH);
  await t.load();
  const h = t.els.go.handlers[0];
  await Promise.all([h(), h()]);
  await new Promise((r) => setTimeout(r, 20));
  expect(srv.seen).toEqual([TOKEN]);
  expect(t.state.replaced).toEqual(["/"]);
});

test("a wrong or used code: the plain 'run out' message, the address stays (the person can press Back and ask for a new code)", async () => {
  const srv = server();
  const t = tab(srv, "https://console.corporatetambola.com/signin.html?t=ffffffffffffffffffffffffffffffffffffffffffffffff");
  await t.load(); await t.press();
  expect(t.els.msg.textContent).toBe("That code did not work.");
  expect(t.state.replaced).toEqual([]);
});

test("the sign-in cookie is HttpOnly, so the page confirms it with the server's status answer and never reads it in the browser (no cookieStore, no document.cookie)", () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n"]*$/gm, ""); // the code without its comments
  expect(code).not.toMatch(/cookieStore|document\.cookie/);
  expect(code).toContain('"/auth/me"');
});
