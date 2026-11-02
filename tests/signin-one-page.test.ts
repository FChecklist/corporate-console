// FALSIFIED BY: signin-work-email-label, signin-work-email-lead, signin-placeholder-company, signin-google-after-form, signin-google-small, signin-google-no-mark, signin-or-line-missing, signin-hint-lost, signin-page-no-token-stays
// The one console sign-in screen (owner feedback 2 Nov 2026): plain "e-mail" wording (never "work e-mail" or "company e-mail", no example domain), "Continue with Google" is the FIRST and biggest action
// on the card (when the console has it switched on), a calm "or use your e-mail" line follows, then the e-mail field and "Send me a code", with the small legal line last.
// The address /signin.html without a one-time token is not a separate page: it forwards to the one sign-in address (the console root).
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio } from "../tools/browser-tests/viewport-kit.mjs";

const win = new Window({ url: "http://localhost/" });
Object.assign(globalThis, { window: win, document: win.document, HashChangeEvent: win.HashChangeEvent, Event: win.Event, location: win.location, sessionStorage: win.sessionStorage, alert: () => {}, innerWidth: 1280 });
const { renderSignIn, googleMark } = await import("../public/screens/signin.js");

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (f: string) => readFileSync(join(root, f), "utf8");
const OLD_WORDS = /work[ -]?e-?mail|company[ -]?e-?mail|yourcompany|official[ -]?e-?mail/i;

const fakeApi = (providers: Record<string, boolean> | null) => ({
  auth: {
    providers: async () => (providers ? { ok: true, json: providers } : { ok: false, json: {} }),
    request: async () => ({ ok: true, json: { codeMinutes: 30 } }),
    verify: async () => ({ ok: false, json: {} }),
  },
});
const draw = async (providers: Record<string, boolean> | null, extra: any = {}) => {
  const o = document.createElement("div"); document.body.replaceChildren(o);
  renderSignIn(o, { api: fakeApi(providers), onSignedIn: async () => {}, ...extra });
  await new Promise((r) => setTimeout(r, 20)); // the providers answer arrives
  return o;
};

/** every word a person can see or hear on the card: text, placeholders, aria-labels, titles, alt texts */
const spoken = (o: Element) => {
  const bits = [o.textContent || ""];
  for (const n of o.querySelectorAll("*")) for (const a of ["placeholder", "aria-label", "title", "alt", "value"]) { const v = n.getAttribute(a); if (v) bits.push(v); }
  return bits.join(" | ");
};

test("wording: the card says plain e-mail everywhere a person can see or hear it (label, aria-label, placeholder, lead), with no example domain", async () => {
  const o = await draw({ google: true });
  const email = o.querySelector("#si-email") as any;
  expect(o.querySelector('label[for="si-email"]')!.textContent).toBe("Your e-mail");
  expect(email.getAttribute("aria-label")).toBe("Your e-mail");
  expect(email.getAttribute("placeholder")).toBe("Type your e-mail");
  expect(o.querySelector(".lead")!.textContent).toBe("Use your e-mail. The system sends you a code. There is no password to remember.");
  expect(spoken(o)).not.toMatch(OLD_WORDS);
  expect(email.getAttribute("placeholder")).not.toMatch(/@|\.com/);
});

test("wording: no screen file of the console (js, html, words file) says work e-mail, company e-mail, official e-mail or yourcompany", () => {
  const hits: string[] = [];
  const walk = (dir: string) => { for (const f of readdirSync(join(root, dir))) { const rel = dir + "/" + f; if (statSync(join(root, rel)).isDirectory()) { walk(rel); } else if (/\.(js|html|json|webmanifest)$/.test(f) && OLD_WORDS.test(read(rel))) hits.push(rel); } };
  walk("public");
  expect(hits).toEqual([]);
});

test("Google on: the FIRST thing in the card is the Google button, then 'or use your e-mail', then the e-mail field, then Send me a code, and the small legal line is last", async () => {
  const o = await draw({ google: true });
  const form = o.querySelector("form")!;
  const order = [...form.querySelectorAll("#si-providers, [data-provider=google], #si-or, #si-email, button[type=submit], #si-notice")].map((n: any) => n.id || (n.dataset.provider ? "google" : "send"));
  expect(order).toEqual(["si-providers", "google", "si-or", "si-email", "send", "si-notice"]);
  expect(form.firstElementChild!.id).toBe("si-providers"); // nothing comes before it inside the card's form
  const g = o.querySelector("[data-provider=google]") as any;
  expect(g.classList.contains("hide")).toBe(false);
  expect(g.classList.contains("gbtn")).toBe(true);
  expect(g.querySelectorAll("svg path").length).toBe(4); // the standard G mark sits inside the button
  expect(g.textContent.trim()).toBe("Continue with Google");
  expect(o.querySelector("#si-or")!.textContent).toBe("or use your e-mail");
  expect(o.querySelector("#si-providers")!.classList.contains("hide")).toBe(false);
  // the old small lead-in is gone
  expect(spoken(o)).not.toContain("Or continue with");
});

test("Google off: nothing of the Google block shows (button and divider hidden together), the e-mail form is the whole card, and Microsoft stays dropped", async () => {
  for (const off of [{ google: false, microsoft: false }, null]) {
    const o = await draw(off);
    expect(o.querySelector("#si-providers")!.classList.contains("hide")).toBe(true);
    expect((o.querySelector("[data-provider=google]") as any).classList.contains("hide")).toBe(true);
    expect((o.querySelector("[data-provider=microsoft]") as any).classList.contains("hide")).toBe(true);
  }
  const ms = await draw({ google: true, microsoft: false });
  expect((ms.querySelector("[data-provider=microsoft]") as any).classList.contains("hide")).toBe(true);
});

test("the Google button carries the standard four-colour G mark (four shapes, hidden from screen readers)", () => {
  const m = googleMark() as any;
  expect(m.getAttribute("aria-hidden")).toBe("true");
  const fills = [...m.querySelectorAll("path")].map((p: any) => p.getAttribute("fill"));
  expect(fills).toEqual(["#EA4335", "#4285F4", "#FBBC05", "#34A853"]);
  expect([...m.querySelectorAll("path")].every((p: any) => (p.getAttribute("d") || "").length > 60)).toBe(true);
});

test("pressing Continue with Google keeps the typed e-mail as the hint (si-hint and h=) and goes to the start address; with no address typed there is no hint", async () => {
  const went: string[] = [];
  const o = await draw({ google: true }, { assign: (u: string) => went.push(u) });
  const g = o.querySelector("[data-provider=google]") as any;
  (o.querySelector("#si-email") as any).value = "demo5@demo-test.invalid";
  g.click();
  expect(went).toEqual(["/auth/oauth/start?p=google&h=demo5%40demo-test.invalid"]);
  expect(sessionStorage.getItem("si-hint")).toBe("demo5@demo-test.invalid");
  (o.querySelector("#si-email") as any).value = "";
  g.click();
  expect(went[1]).toBe("/auth/oauth/start?p=google");
});

const rule = (css: string, sel: string) => { const m = new RegExp("(?:^|\\n)" + sel.replace(/[.]/g, "\\.") + " \\{([^}]*)\\}").exec(css); return m ? m[1]! : ""; };
const css = read("public/core/app.css"), tokens = read("public/core/tokens.css");
const tokenSet = (re: RegExp) => { const m = re.exec(tokens); return Object.fromEntries([...(m ? m[1]! : "").matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{3,6})/g)].map((x) => [x[1], x[2]])); };
const LIGHT = tokenSet(/:root \{([^}]*)\}/), DARK = { ...LIGHT, ...tokenSet(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/) };

test("the Google button is big and bold: full width, at least 52 px high, bold 17-18 px text, a border of at least 2 px, dark text on white (AA) and a border that stands out from the page (3:1) in light and dark", () => {
  const b = rule(css, ".gbtn");
  expect(b).toMatch(/width:\s*100%/);
  expect(Number(/min-height:\s*(\d+)px/.exec(b)![1])).toBeGreaterThanOrEqual(52);
  const f = /font:\s*(\d+)\s+(\d+(?:\.\d+)?)px/.exec(b)!;
  expect(Number(f[1])).toBeGreaterThanOrEqual(700);
  expect(Number(f[2])).toBeGreaterThanOrEqual(17); expect(Number(f[2])).toBeLessThanOrEqual(18);
  expect(Number(/border:\s*(\d+)px/.exec(b)![1])).toBeGreaterThanOrEqual(2);
  const text = /color:\s*(#[0-9a-fA-F]{6})/.exec(b)![1]!, bg = /background:\s*(#[0-9a-fA-F]{3,6})/.exec(b)![1]!;
  expect(contrastRatio(text, bg)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(text, "#eaeef5")).toBeGreaterThanOrEqual(4.5); // the hover colour keeps AA too
  expect(rule(css, ".gbtn:hover")).toContain("#eaeef5");
  for (const [name, set] of [["light", LIGHT], ["dark", DARK]] as const) expect([name, contrastRatio(set["ink"]!, set["bg"]!) >= 3]).toEqual([name, true]); // the border is var(--ink)
  expect(b).toMatch(/border:\s*\d+px solid var\(--ink\)/);
  const o = rule(css, ".orline");
  expect(Number(/font-size:\s*(\d+(?:\.\d+)?)px/.exec(o)![1])).toBeGreaterThanOrEqual(13);
  for (const [n, set] of [["light", LIGHT], ["dark", DARK]] as const) expect([n, contrastRatio(set["muted"]!, set["bg"]!) >= 4.5]).toEqual([n, true]); // the divider words use --muted
});

/** the page behind the one-tap link in the sign-in mail, run with stand-ins for the browser */
function runSigninPage(search: string) {
  const code = read("public/signin.js").replace(/^import [^\r\n]*\r?\n/, "");
  const calls: string[] = [];
  const btn = { addEventListener: (_e: string, _f: unknown) => calls.push("handler"), disabled: false };
  const doc = { getElementById: (id: string) => (id === "go" ? btn : { textContent: "" }) };
  const loc = { search, pathname: "/signin", replace: (u: string) => calls.push("replace " + u) };
  const hist = { replaceState: (_a: unknown, _b: unknown, u: string) => calls.push("clean " + u) };
  new Function("location", "document", "history", "fetch", "showVersion", "URLSearchParams", code)(loc, doc, hist, async () => ({}), () => calls.push("version"), URLSearchParams);
  return calls;
}

test("/signin.html without a one-time token is not a page of its own: it forwards to the one sign-in address (the console root); with a token it stays and waits for the button", () => {
  expect(runSigninPage("")).toContain("replace /");
  expect(runSigninPage("?t=" + "a".repeat(48))).not.toContain("replace /");
  expect(runSigninPage("?t=" + "a".repeat(48))).toContain("handler"); // the button still finishes the sign-in
  expect(runSigninPage("?t=" + "a".repeat(48))).toContain("clean /signin"); // and the token still leaves the address bar
  // its "Back to sign in" link is the same one address
  expect(read("public/signin.html")).toContain('<a class="btn" href="/">Back to sign in</a>');
});
