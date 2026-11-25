// Owner order (25 Nov 2026): the small mark "१३९" sits at the very top centre of every page, exactly once, exactly as approved.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { chooserHtml } from "../chooser.mjs";
const read = (f: string) => readFileSync(new URL("../" + f, import.meta.url), "utf8").split("\r").join("");
const MARK = '<div class="mark139" lang="hi" aria-hidden="true"><span>१३९</span></div>';
const CSS = '.mark139{position:absolute;top:0;left:0;right:0;margin:0;padding:1px 0 0;text-align:center;line-height:1;pointer-events:none;user-select:none;z-index:2147483647;font-family:"Noto Sans Devanagari","Mukta","Nirmala UI","Mangal","Kohinoor Devanagari","Devanagari Sangam MN",sans-serif;font-size:6px;font-weight:700;color:#0B2A6B}\n.mark139 span{display:inline-block;border-bottom:.5px solid #7A1010;padding-bottom:.5px}';
const count = (s: string, n: string) => s.split(n).length - 1;
const games = JSON.parse(read("config/games.json"));
const walk = (dir: string): string[] =>
  readdirSync(new URL("../" + dir, import.meta.url), { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name.startsWith(".")) return [];
    const p = dir ? dir + "/" + e.name : e.name;
    return e.isDirectory() ? walk(p) : e.name.endsWith(".html") ? [p] : [];
  });
const pages: Record<string, string> = {};
for (const f of walk("")) pages[f] = read(f);
pages["chooser.mjs (games/index.html)"] = chooserHtml(games, "preview");
pages["functions/_lib/auth-core.ts (link page)"] = read("functions/_lib/auth-core.ts");
describe("the 139 mark", () => {
  for (const [name, src] of Object.entries(pages)) {
    test(`${name} has the mark exactly once, as approved, first in the body`, () => {
      expect(count(src, 'class="mark139"')).toBe(1);
      expect(count(src, MARK)).toBe(1);
      expect(src).toMatch(/<body[^>]*>\s*<div class="mark139"/);
    });
  }
  test("the shared stylesheets every page loads carry the approved CSS once", () => {
    for (const f of ["public/core/tokens.css", "packages/game-pack/pack.css"]) {
      const css = read(f);
      expect(count(css, ".mark139{")).toBe(1);
      expect(css).toContain(CSS);
    }
  });
  test("every page loads a stylesheet that has the CSS", () => {
    for (const [name, src] of Object.entries(pages)) expect([name, /href="\/(core\/tokens|pack\/pack)\.css/.test(src)]).toEqual([name, true]);
  });
  test("colours, size, weight, line and numerals are the approved ones", () => {
    const css = read("public/core/tokens.css");
    for (const s of ["#0B2A6B", "#7A1010", "font-size:6px", "font-weight:700", ".5px solid", "padding-bottom:.5px", "pointer-events:none", "user-select:none", "position:absolute"]) expect(css).toContain(s);
    expect(MARK).toContain("\u0967\u0969\u096F");
  });
});
