// FALSIFIED BY: gamesbar-copy-edited, gamesbar-missing-from-page
// The Corporate Games bar is ONE shared component: this site's copy must equal the canonical files in C:\ct\test-sites\corporate-games-bar
// byte for byte (SHA-256 below, printed by that folder's src/build.py, VERSION 2). If this fails, copy the canonical files again; never edit the copy here.
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
const sha = (f: string) => createHash("sha256").update(readFileSync(new URL("../public/" + f, import.meta.url), "utf8").split(String.fromCharCode(13)).join("")).digest("hex"); // line endings do not count (git may check files out with CRLF)
const CANON = "C:/ct/test-sites/corporate-games-bar/";
describe("the shared Corporate Games bar", () => {
  test("gamesbar.js and gamesbar.css are identical to the canonical copy", () => {
    expect(sha("gamesbar.js")).toBe("16f02208af3c84cef63d81cdfcbc788f1baf23957ed71e912d44cafd4f881b98");
    expect(sha("gamesbar.css")).toBe("6b0311de98525de646e637a28102163dfecf9fde35b8befe0344a5e16fff8b5b");
  });
  test("while the canonical folder is on this laptop, it still has the same hashes (a newer bar means: copy again)", () => {
    for (const f of ["gamesbar.js", "gamesbar.css"]) {
      if (!existsSync(CANON + f)) return;
      const canon = createHash("sha256").update(readFileSync(CANON + f, "utf8").split(String.fromCharCode(13)).join("")).digest("hex");
      expect([f, canon]).toEqual([f, sha(f)]);
    }
  });
  test("both pages of the console load the bar, and the bar needs no inline script or style", () => {
    for (const page of ["index.html", "signin.html"]) {
      const html = readFileSync(new URL("../public/" + page, import.meta.url), "utf8");
      expect(html).toContain('<link rel="stylesheet" href="/gamesbar.css?v=2">');
      expect(html).toContain('<script src="/gamesbar.js?v=2" defer></script>');
    }
    const js = readFileSync(new URL("../public/gamesbar.js", import.meta.url), "utf8");
    expect(js).not.toMatch(/setAttribute\(\s*["']style["']|\.cssText|innerHTML\s*=\s*["'`]<style/);
  });
  test("the bar's own addresses are the real ones: Tambola at housie., the home site at home., never the console and never the old hub", () => {
    const js = readFileSync(new URL("../public/gamesbar.js", import.meta.url), "utf8");
    expect(js).toContain("https://housie.corporatetambola.com/");
    expect(js).toContain("https://home.corporatetambola.com/");
    expect(js).not.toContain("console.corporatetambola.com");
    expect(js).not.toContain("games.corporatetambola.com");
  });
});
