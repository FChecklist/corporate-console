// FALSIFIED BY: errors-no-next-step, errors-first-person, errors-we-our, errors-dead-end-signin, errors-notopen-no-next
// Idiot-proofing (0.2.2): every error says what to do next, no screen is a dead end, and the console speaks to organizers as "you" (owner rule 20 Nov 2026, docs/CONSOLE_VOICE.md).
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const win: any = new Window({ url: "https://console.corporatetambola.com/" });
Object.assign(globalThis, { window: win, document: win.document, innerWidth: 1280 });

/** every console file that holds words an organizer reads (not the generated games config, not the shared Games bar, which is pinned byte for byte) */
function consoleFiles(): string[] {
  const out: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) { if (e !== "owner-funnel" && e !== "icons") walk(p); } else if (/\.(js|html|json)$/.test(e) && !/^(gamesbar\.js|games\.config\.js|sw-config\.json|manifest\.webmanifest)$/.test(e)) out.push(p); } };
  walk(join(root, "public"));
  return out;
}
/** the text literals of a file, without comments */
function literals(src: string, file: string): string[] {
  if (file.endsWith(".json")) return [...src.matchAll(/:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  if (file.endsWith(".html")) return [src.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")];
  const bare = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/(^|[;,{}\s])\/\/ [^"'`\n]*$/gm, "$1");
  return [...bare.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2]);
}

const BAD = /\b(could not|did not (work|go through|reach|answer)|cannot|can't|not right|has failed|went wrong|is slow|not open|has run out|have run out|unable to|is not in your account)\b/i;
const NEXT = /\b(try again|please|press|tap|go back|back to|sign in|write to|ask |wait|choose|type |check |look again|reload|you do not need|nothing (was|has been) (taken|changed|lost|deleted)|you can|nothing is lost|will try again by itself)\b/i;

test("every sentence that says something went wrong also says what to do next (read from the console's own files)", () => {
  const bad: string[] = [];
  for (const f of consoleFiles()) {
    const all = literals(readFileSync(f, "utf8"), f);
    all.forEach((s, i) => {
      if (s.split(/\s+/).length < 4 || !BAD.test(s)) return;
      if (/cannot be undone|^You have credit:/.test(s)) return; // a warning before a Yes / No choice, and a plain statement of what is kept: neither is an error
      // the next step sits in the same sentence or in the line right after it (a title and its second line are two literals: emptyNote("could not ...", "Please try again."))
      if (!NEXT.test(s) && !NEXT.test(all[i + 1] || "") && !NEXT.test(all[i + 2] || "")) bad.push(f.slice(root.length + 1) + ": " + s.slice(0, 120));
    });
  }
  expect(bad).toEqual([]);
});

test("the console speaks as 'you': no 'I', 'me', 'my', 'mine' or 'myself' in any text an organizer reads (the menu name 'My games' is the one owner-approved label)", () => {
  const bad: string[] = [];
  for (const f of consoleFiles()) for (const raw of literals(readFileSync(f, "utf8"), f)) {
    const s = raw.replace(/\bMy games\b/g, "").replace(/\bI[A-Z]\w*\b/g, "");
    if (/\b(I|I'm|I'll|me|my|mine|myself)\b|\bMy\b/.test(s) && /\s/.test(s.trim())) bad.push(f.slice(root.length + 1) + ": " + raw.slice(0, 100));
  }
  expect(bad).toEqual([]);
});

test("the console never says 'we', 'our' or 'us' in its own words (the owner-approved privacy sentence on the payee page is the one exception)", () => {
  const bad: string[] = [];
  for (const f of consoleFiles()) for (const raw of literals(readFileSync(f, "utf8"), f)) {
    const s = raw.replace(/Our games are designed to follow US privacy laws, the EU GDPR and India's DPDP\./g, "").replace(/\bUS\b|\bUS\$/g, "");
    if (/\b(we|our|ours|us)\b/i.test(s) && /\s/.test(s.trim()) && !/\bUS\b/.test(raw.replace(/Our games[^.]*\./, ""))) bad.push(f.slice(root.length + 1) + ": " + raw.slice(0, 100));
  }
  expect(bad).toEqual([]);
});

test("no page is a dead end without JavaScript: the console page and the payee page say how to go on, the sign-in link page has a way back", () => {
  const read = (p: string) => readFileSync(join(root, "public", p), "utf8");
  for (const f of ["index.html", "pay-link.html"]) { const n = /<noscript>([\s\S]*?)<\/noscript>/.exec(read(f)); expect([f, !!n]).toEqual([f, true]); expect([f, /turn JavaScript on|turn it on/i.test(n![1]), /hello@corporatetambola\.com|another browser/.test(n![1])]).toEqual([f, true, true]); }
  expect(read("signin.html")).toContain('href="/">Back to sign in</a>');
});

test("sign-in: every way it can fail tells the person what to do next (empty box, bad address, mail not sent, test address, wrong code, slow mail)", async () => {
  const { renderSignIn } = await import("../public/screens/signin.js");
  const submit = (f: any) => f.dispatchEvent(new win.Event("submit", { cancelable: true }));
  const wait = () => new Promise((r) => setTimeout(r, 25));
  async function run(request: any, verify: any, email: string, tick: boolean, code = "") {
    const o: any = document.createElement("div"); document.body.replaceChildren(o);
    renderSignIn(o, { api: { auth: { request, verify } }, onSignedIn: async () => {}, resendAfterMs: 0 });
    const [f1, f2] = o.querySelectorAll("form");
    o.querySelector("#si-email").value = email; o.querySelector("#si-consent").checked = tick;
    submit(f1); await wait();
    if (code) { o.querySelector("#si-code").value = code; submit(f2); await wait(); }
    return { msg: [o.querySelector(".signmsg").textContent, ...[...o.querySelectorAll(".fielderror")].map((n: any) => n.textContent)].join(" ") as string, sent: o.querySelector("#si-sent").textContent as string, o };
  }
  const ok = async () => ({ ok: true, json: {} });
  const r1 = await run(ok, ok, "demo1@demo-test.invalid", false); expect(r1.msg).toMatch(/tick the box.*press Get your code/i);
  const r2 = await run(ok, ok, "nonsense", true); expect(r2.msg).toMatch(/work e-mail address.*press Get your code/i);
  const r3 = await run(async () => ({ ok: false, json: {} }), ok, "demo1@demo-test.invalid", true); expect(r3.msg).toMatch(/press Get your code again.*write to hello@corporatetambola\.com/i);
  const r4 = await run(async () => ({ ok: true, json: { testAddress: true } }), ok, "demo1@demo-test.invalid", true); expect(r4.msg).toMatch(/type your own work e-mail address and press Get your code/i);
  const r5 = await run(ok, async () => ({ ok: false, json: {} }), "demo1@demo-test.invalid", true, "000000"); expect(r5.msg).toMatch(/newest e-mail.*6 digits again.*Send a new code/i);
  const r6 = await run(async () => ({ ok: false, json: { error: "mail_slow" } }), ok, "demo1@demo-test.invalid", true); expect(r6.sent).toMatch(/may still arrive.*type its code here.*wait a minute/i);
  expect(r6.o.querySelector("#si-code")).toBeTruthy(); // the code box is open: the person is never left without a way to go on
});

test("a game that will not open names the way on: choose another game, write to the help address (every cause has an action)", async () => {
  const { openError, notOpenYet, HELP_EMAIL } = await import("../public/core/errors.js");
  for (const e of ["no-key", "unreachable", "not_found", "not-on-console", "weird", undefined]) {
    const t = openError(e ? { error: e } : undefined, "Bingo");
    expect([String(e), NEXT.test(t)]).toEqual([String(e), true]);
  }
  expect(notOpenYet("Bingo")).toContain("choose another game");
  expect(notOpenYet("Bingo")).toContain(HELP_EMAIL);
});

test("My games: when no game answers the screen offers Try again (never a bare error); the games bar help line is on every screen", async () => {
  const { renderMyGames } = await import("../public/screens/mygames.js");
  const api: any = { listGames: async () => ({ rows: [], failed: ["bingo"], off: [] }), capabilities: async () => [], byId: {} };
  const o: any = document.createElement("div"); document.body.replaceChildren(o);
  await renderMyGames(o, { api, names: { bingo: "Bingo" }, colors: {}, games: [], email: "demo2@demo-test.invalid" });
  expect([...o.querySelectorAll("button")].some((b: any) => b.textContent === "Try again")).toBe(true);
  expect(o.textContent).toContain("Please try again");
  expect(readFileSync(join(root, "public/core/boot.js"), "utf8")).toContain('class: "helpline"'); // "Need help? hello@..." under every screen
});

test("the payee page: a failed look-up shows Try again and who to ask; the page always shows the help line", () => {
  const js = readFileSync(join(root, "public/pay-link.js"), "utf8"), html = readFileSync(join(root, "public/pay-link.html"), "utf8");
  expect(js).toContain('rt.addEventListener("click", () => location.reload())');
  expect(js).toContain("ask the person who sent you this link for a new one");
  expect(html).toContain('id="retry"');
  expect(html).toContain("Something not working? Press Try again");
});
