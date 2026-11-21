// FALSIFIED BY: a11y3-heading-skip, a11y3-field-no-example, a11y3-field-no-error-line, a11y3-no-404, a11y3-signed-in-indexable, a11y3-private-header-missing, a11y3-img-alt
// Accessibility and search-safety of every built page and of the sign-in screen (0.3.0): one h1, headings in order, a name for every control, alt text on every image,
// an example and an error line for every form field, a way out of every page, and no signed-in screen open to search.
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { build } from "../build.mjs";

const root = join(import.meta.dir, "..");
const out = mkdtempSync(join(tmpdir(), "a11y-"));
build({ env: "live", out, version: "0.0.1", commit: "0123456789ab", releasedAt: "2026-11-21T00:00:00.000Z" });
const pages: string[] = [];
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!/^(core|screens|icons|view-)/.test(f)) walk(p); } else if (f.endsWith(".html")) pages.push(p); } };
walk(out);
const rel = (p: string) => p.slice(out.length);
const docOf = (html: string) => { const w: any = new Window({ url: "https://console.corporatetambola.com/" }); w.document.write(html); return w.document; };
const named = (n: any, d: any) => !!(n.getAttribute("aria-label") || n.getAttribute("aria-labelledby") || n.getAttribute("title") || (n.id && d.querySelector(`label[for="${n.id}"]`)) || n.closest("label"));

test("the built site has the pages the plan needs, including a 404 page", () => {
  const names = pages.map(rel).sort();
  for (const f of ["/404.html", "/changes.html", "/games/index.html", "/index.html", "/owner-funnel/index.html", "/pay-link.html", "/signin.html"]) expect([f, names.includes(f)]).toEqual([f, true]);
});

test("every page: one h1, headings never skip a level, a language, a title, one main area, a viewport that can zoom", () => {
  for (const p of pages) {
    const d = docOf(readFileSync(p, "utf8"));
    expect([rel(p), d.querySelectorAll("h1").length]).toEqual([rel(p), 1]);
    let prev = 0;
    for (const h of d.querySelectorAll("h1,h2,h3,h4,h5,h6")) { const lvl = Number(h.tagName[1]); expect([rel(p), h.textContent.trim().slice(0, 30), lvl <= prev + 1]).toEqual([rel(p), h.textContent.trim().slice(0, 30), true]); prev = lvl; }
    expect([rel(p), d.documentElement.getAttribute("lang")]).toEqual([rel(p), "en"]);
    expect([rel(p), d.title.trim().length > 10]).toEqual([rel(p), true]);
    expect([rel(p), d.querySelectorAll("main").length <= 1 && d.querySelectorAll("main").length === 1]).toEqual([rel(p), true]);
    const vp = d.querySelector('meta[name="viewport"]')?.getAttribute("content") || "";
    expect([rel(p), /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/.test(vp)]).toEqual([rel(p), false]);
    expect([rel(p), d.querySelectorAll("[tabindex]").length === 0 || [...d.querySelectorAll("[tabindex]")].every((n: any) => Number(n.getAttribute("tabindex")) <= 0)]).toEqual([rel(p), true]);
  }
});

test("every page: every image has alt text, every control has a name, every link says where it goes, new-tab links are safe, every id used by aria-describedby exists", () => {
  for (const p of pages) {
    const html = readFileSync(p, "utf8"), d = docOf(html);
    for (const i of d.querySelectorAll("img")) expect([rel(p), i.hasAttribute("alt")]).toEqual([rel(p), true]);
    for (const s of d.querySelectorAll("svg")) expect([rel(p), s.getAttribute("aria-hidden") === "true" || !!s.querySelector("title") || !!s.getAttribute("aria-label")]).toEqual([rel(p), true]);
    for (const n of d.querySelectorAll("input:not([type=hidden]),select,textarea")) expect([rel(p), n.id || n.name, named(n, d)]).toEqual([rel(p), n.id || n.name, true]);
    for (const b of d.querySelectorAll("button")) expect([rel(p), (b.textContent.trim() || b.getAttribute("aria-label") || "").length > 0]).toEqual([rel(p), true]);
    for (const a of d.querySelectorAll("a[href]")) expect([rel(p), a.getAttribute("href"), (a.textContent.trim() || a.getAttribute("aria-label") || "").length > 0]).toEqual([rel(p), a.getAttribute("href"), true]);
    for (const a of d.querySelectorAll('a[target="_blank"]')) expect([rel(p), /noopener/.test(a.getAttribute("rel") || "")]).toEqual([rel(p), true]);
    for (const n of d.querySelectorAll("[aria-describedby]")) for (const id of n.getAttribute("aria-describedby").split(/\s+/)) expect([rel(p), id, !!d.getElementById(id)]).toEqual([rel(p), id, true]);
    expect([rel(p), /\sstyle=|<img[^>]*(?<!alt=")>/.test(html.replace(/<img[^>]*\balt="[^"]*"[^>]*>/g, ""))]).toEqual([rel(p), false]); // no inline style (the page's policy forbids it) and no img without alt
  }
});

test("every form field on a built page has an example the person can copy the shape of AND an error line next to it", () => {
  for (const p of pages) {
    const d = docOf(readFileSync(p, "utf8"));
    for (const n of d.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]),select,textarea")) {
      const ids = (n.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
      const hint = ids.map((i: string) => d.getElementById(i)).find((x: any) => x && /hint/.test(x.id));
      const err = ids.map((i: string) => d.getElementById(i)).find((x: any) => x && /err/.test(x.id));
      expect([rel(p), n.id, !!hint && hint.textContent.trim().length > 10]).toEqual([rel(p), n.id, true]);
      expect([rel(p), n.id, !!err && (err.getAttribute("role") === "alert")]).toEqual([rel(p), n.id, true]);
    }
  }
});

test("the 404 page is a way out, not a dead end: it says what happened in plain words, links to the console, the games and the help address, and is not for search", () => {
  const html = readFileSync(join(out, "404.html"), "utf8"), d = docOf(html);
  expect(d.querySelector("h1").textContent).toMatch(/could not be found/i);
  const hrefs = [...d.querySelectorAll("a")].map((a: any) => a.getAttribute("href"));
  for (const h of ["/", "/games/", "/changes", "mailto:hello@corporatetambola.com"]) expect([h, hrefs.includes(h)]).toEqual([h, true]);
  expect(html).toContain('content="noindex,nofollow"');
  expect(html).not.toMatch(/<link rel="canonical"/);
  expect(/\b(we|our|us)\b/i.test(d.body.textContent)).toBe(false); // the console says "you"
});

test("pages that must not be searched say so twice: a robots meta in the page AND an X-Robots-Tag header on the path (headers cover non-html answers too)", () => {
  const headers = readFileSync(join(out, "_headers"), "utf8");
  for (const path of ["/auth/*", "/pay/*", "/pay-link.html", "/signin.html", "/report/*", "/stats/*", "/owner-funnel/*", "/404.html"]) {
    const block = headers.split(/\n\n/).find((b) => b.split("\n")[0].trim() === path) || "";
    expect([path, /X-Robots-Tag:\s*noindex, nofollow/.test(block)]).toEqual([path, true]);
  }
  for (const f of ["signin.html", "pay-link.html", "owner-funnel/index.html", "404.html"]) expect([f, readFileSync(join(out, f), "utf8").includes('content="noindex,nofollow"')]).toEqual([f, true]);
  for (const f of ["index.html", "games/index.html", "changes.html"]) expect([f, /X-Robots-Tag/.test(headers.split(/\n\n/).find((b) => b.split("\n")[0].trim() === "/" + f) || "")]).toEqual([f, false]); // public pages stay open
});

test("the console app: signed in, a screen asks not to be indexed and has its own title; signed out, the public head comes back", async () => {
  const { setPageSeo, titleFor } = await import("../public/core/page-seo.js");
  const w: any = new Window({ url: "https://console.corporatetambola.com/" });
  w.document.write('<!doctype html><html lang="en"><head><title>Corporate Games console: set up and run your team game</title><meta name="robots" content="index,follow,max-image-preview:large"></head><body></body></html>');
  const doc = w.document, robots = () => doc.querySelector('meta[name="robots"]')?.getAttribute("content");
  expect(setPageSeo(doc, { signedIn: false, route: "home" })).toBe("index,follow,max-image-preview:large");
  setPageSeo(doc, { signedIn: true, route: "billing" });
  expect(robots()).toBe("noindex,nofollow"); expect(doc.title).toBe("Billing: Corporate Games console");
  const titles = ["home", "mygames", "create", "create/from", "control", "billing", "account", "view/bingo/ABC1234"].map((r) => titleFor(r));
  expect(new Set(titles.filter((t, i) => i !== 3)).size).toBe(titles.length - 1); // every screen has its own title (create/from shares the Create title)
  for (const t of titles) expect(t.endsWith(": Corporate Games console")).toBe(true);
  setPageSeo(doc, { signedIn: false, route: "home" });
  expect(robots()).toBe("index,follow,max-image-preview:large"); expect(doc.title).toBe("Corporate Games console: set up and run your team game");
  expect(readFileSync(join(root, "public/core/boot.js"), "utf8")).toContain("setPageSeo(document, { signedIn: app.signedIn, route })");
});

test("the sign-in screen: each field has its label, an example, an error line the screen reader announces, and a wrong entry is said under that field", async () => {
  const w: any = new Window({ url: "https://console.corporatetambola.com/" });
  Object.assign(globalThis, { window: w, document: w.document, CustomEvent: w.CustomEvent, Event: w.Event });
  const { renderSignIn } = await import("../public/screens/signin.js");
  const o: any = document.createElement("div"); document.body.replaceChildren(o);
  renderSignIn(o, { api: { auth: { request: async () => ({ ok: true, json: {} }), verify: async () => ({ ok: false, json: {} }) } }, onSignedIn: async () => {}, resendAfterMs: 0 });
  for (const id of ["si-email", "si-consent", "si-code"]) {
    const n = o.querySelector("#" + id);
    expect([id, named(n, o.ownerDocument)]).toEqual([id, true]);
    expect([id, !!o.querySelector("#" + id + "-hint")?.textContent.trim()]).toEqual([id, true]);
    expect([id, o.querySelector("#" + id + "-err")?.getAttribute("role")]).toEqual([id, "alert"]);
    expect([id, (n.getAttribute("aria-describedby") || "").split(" ")]).toEqual([id, [id + "-hint", id + "-err"]]);
  }
  expect(o.querySelector("#si-email-hint").textContent).toMatch(/for example/i);
  const [f1] = o.querySelectorAll("form");
  f1.dispatchEvent(new w.Event("submit", { cancelable: true }));
  expect(o.querySelector("#si-email").getAttribute("aria-invalid")).toBe("true");
  expect(o.querySelector("#si-email-err").textContent).toMatch(/type your work e-mail address, for example/i);
  expect(o.querySelector("#si-email-err").classList.contains("hide")).toBe(false);
  o.querySelector("#si-email").value = "demo1@demo-test.invalid"; o.querySelector("#si-email").dispatchEvent(new w.Event("input", { bubbles: true }));
  expect(o.querySelector("#si-email").getAttribute("aria-invalid")).toBeNull(); // typing clears the complaint
  const hs = [...o.querySelectorAll("h1,h2,h3")].map((h: any) => h.tagName); expect(hs[0]).toBe("H1");
});
