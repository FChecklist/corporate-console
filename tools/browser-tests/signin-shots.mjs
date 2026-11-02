// Real Chrome, the ONE console sign-in screen, Google OFF and Google ON, at 360, 768 and 1280 px, light and dark:  node tools/browser-tests/signin-shots.mjs [--out dir]
// Run it through the lock:  node tools/heavy-run.mjs --wait-min 45 --timeout-min 15 -- node tools/browser-tests/signin-shots.mjs
// Saves signin-<google-on|google-off>-<light|dark>-<width>.png and checks on every picture: no sideways scroll | tap targets >= 44 px | no visible text under 13 px | no browser error
//   | wording ("Your e-mail", "Type your e-mail", no work/company e-mail) | Google ON: the Google button is the FIRST control, the full width of the card, >= 52 px high, bold 17-18 px, with the four-colour G,
//   then "or use your e-mail", then the e-mail field and "Send me a code" | Google OFF: no Google button, no divider.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { launchChrome, noSidewaysScroll, tapTargets, heightFor } from "./viewport-kit.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const out = arg("--out", join(tmpdir(), "console-signin-shots"));
const WIDTHS = [360, 768, 1280];
mkdirSync(out, { recursive: true });
const root = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function startStack(google) {
  const stack = spawn("bun", ["tools/browser-tests/stack.ts"], { cwd: root, env: { ...process.env, STACK_GOOGLE: google ? "1" : "0" }, stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32" });
  const info = new Promise((ok, bad) => { let buf = ""; stack.stdout.on("data", (d) => { buf += d; const m = /STACK (.+)\n/.exec(buf); if (m) ok(JSON.parse(m[1])); }); stack.on("exit", (c) => bad(new Error("stack stopped early " + c))); });
  const stop = () => { try { if (process.platform === "win32" && stack.pid) spawnSync("taskkill", ["/pid", String(stack.pid), "/t", "/f"], { stdio: "ignore" }); else stack.kill(); } catch { /* gone */ } }; // the whole tree first: killing the shell alone would leave the servers running
  return { info, stop };
}

const results = [], errors = [];
const add = (tag, w, name, v) => results.push({ tag, w, name, ok: typeof v === "object" && v !== null ? !!v.ok : !!v, detail: typeof v === "object" && v !== null ? v.detail || "" : "" });
const chrome = await launchChrome();
try {
  for (const google of [false, true]) {
    const stack = startStack(google);
    try {
      const info = await stack.info;
      for (const theme of ["light", "dark"]) {
        for (const w of WIDTHS) {
          const tag = `${google ? "google-on" : "google-off"}-${theme}`;
          const ctx = await chrome.browser.newContext({ viewport: { width: w, height: heightFor(w) }, deviceScaleFactor: 1, colorScheme: theme, ...(w < 768 ? { hasTouch: true } : {}) });
          const page = await ctx.newPage();
          page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_|503/.test(m.text())) errors.push(`${tag} ${w}px: ${m.text().slice(0, 200)}`); });
          page.on("pageerror", (e) => errors.push(`${tag} ${w}px: ${String(e).slice(0, 200)}`));
          try {
            await page.goto(info.origin + "/", { waitUntil: "load" });
            await page.waitForSelector("#si-email");
            await page.waitForTimeout(400); // the providers answer arrives
            add(tag, w, "no sideways scroll", await noSidewaysScroll(page));
            add(tag, w, "tap targets are at least 44 px (buttons and fields; the links inside the legal and help sentences are inline text links and are not measured)", await tapTargets(page, "main button, main a.btn, main input:not([type=hidden])"));
            add(tag, w, "no visible text is under 13 px", await page.evaluate(() => {
              const bad = [];
              const walker = document.createTreeWalker(document.querySelector("main") || document.body, NodeFilter.SHOW_TEXT);
              for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                if (!n.textContent.trim()) continue; const e = n.parentElement; if (!e || e.offsetParent === null) continue;
                const cs = getComputedStyle(e); if (cs.visibility === "hidden") continue;
                if (parseFloat(cs.fontSize) < 13) bad.push(`${e.tagName.toLowerCase()} ${cs.fontSize} '${n.textContent.trim().slice(0, 20)}'`);
              }
              return { ok: bad.length === 0, detail: bad.slice(0, 5).join("; ") };
            }));
            const card = await page.evaluate(() => {
              const vis = (e) => !!e && e.offsetParent !== null;
              const label = document.querySelector('label[for="si-email"]'), email = document.getElementById("si-email");
              const g = document.querySelector("[data-provider=google]"), or = document.getElementById("si-or"), form = document.querySelector("form:not(.hide)");
              const controls = [...form.querySelectorAll("button, input:not([type=hidden])")].filter(vis).map((e) => (e.dataset.provider ? "google" : e.id === "si-email" ? "email" : e.type === "submit" ? "send" : e.tagName.toLowerCase()));
              const r = vis(g) ? g.getBoundingClientRect() : null, f = form.getBoundingClientRect(), cs = vis(g) ? getComputedStyle(g) : null;
              return {
                label: label && label.textContent, aria: email && email.getAttribute("aria-label"), placeholder: email && email.getAttribute("placeholder"), lead: (document.querySelector(".lead") || {}).textContent,
                controls, googleShown: vis(g), orShown: vis(or), orText: or && or.textContent, mark: vis(g) ? g.querySelectorAll("svg path").length : 0,
                gh: r && Math.round(r.height), gw: r && Math.round(r.width), formW: Math.round(f.width), gfont: cs && cs.fontSize, gweight: cs && cs.fontWeight, gtext: vis(g) ? g.textContent.trim() : "",
                text: document.querySelector("main").innerText,
              };
            });
            add(tag, w, "wording: Your e-mail / Type your e-mail, and never work e-mail or company e-mail", { ok: card.label === "Your e-mail" && card.aria === "Your e-mail" && card.placeholder === "Type your e-mail" && card.lead === "Use your e-mail. The system sends you a code. There is no password to remember." && !/work[ -]?e-?mail|company[ -]?e-?mail|yourcompany|official[ -]?e-?mail/i.test(card.text), detail: JSON.stringify([card.label, card.aria, card.placeholder, card.lead]) });
            if (google) {
              add(tag, w, "Google button is the FIRST control, then the e-mail field, then Send me a code", { ok: JSON.stringify(card.controls) === JSON.stringify(["google", "email", "send"]), detail: card.controls.join(",") });
              add(tag, w, "Google button: full width of the card, >= 52 px high, bold 17-18 px, text 'Continue with Google', with the G mark", { ok: card.googleShown && card.gw >= card.formW - 2 && card.gh >= 52 && Number(card.gweight) >= 700 && parseFloat(card.gfont) >= 17 && parseFloat(card.gfont) <= 18 && card.gtext === "Continue with Google" && card.mark === 4, detail: JSON.stringify({ w: card.gw, formW: card.formW, h: card.gh, font: card.gfont, weight: card.gweight, text: card.gtext, mark: card.mark }) });
              add(tag, w, "the calm divider says 'or use your e-mail'", { ok: card.orShown && card.orText === "or use your e-mail", detail: String(card.orText) });
            } else {
              add(tag, w, "Google off: no Google button and no divider; the e-mail form is the whole card", { ok: !card.googleShown && !card.orShown && JSON.stringify(card.controls) === JSON.stringify(["email", "send"]), detail: JSON.stringify([card.googleShown, card.orShown, card.controls]) });
            }
            await page.screenshot({ path: join(out, `signin-${tag}-${w}.png`) });
          } catch (e) { add(tag, w, "the screen could be reached", { ok: false, detail: String(e).slice(0, 220) }); }
          finally { await ctx.close(); }
        }
      }
    } finally { stack.stop(); }
  }
} finally { await chrome.close(); }
const bad = results.filter((r) => !r.ok);
writeFileSync(join(out, "results.json"), JSON.stringify({ results, errors }, null, 1));
console.log(`checks: ${results.length}, failed: ${bad.length}, browser errors: ${errors.length}`);
for (const r of bad.slice(0, 60)) console.log(`FAIL ${r.tag} ${r.w}px: ${r.name} - ${r.detail}`);
for (const e of errors.slice(0, 20)) console.log("ERROR " + e);
console.log("screenshots: " + out);
process.exit(bad.length || errors.length ? 1 : 0);
