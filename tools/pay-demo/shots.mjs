// node tools/pay-demo/shots.mjs <out folder>   (the demo server must be running: bun tools/pay-demo/server.ts)
// Takes the pay-step screenshots at desktop and phone width from the local build. Every file name says LOCAL.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { launchChrome } from "../browser-tests/viewport-kit.mjs";

const out = process.argv[2];
if (!out) { console.error("usage: node tools/pay-demo/shots.mjs <out folder>"); process.exit(2); }
mkdirSync(out, { recursive: true });
const GAME = "http://localhost:8123/demo.html?flow=new&e=WAIT001&console=http://localhost:8124&k=ctk_" + "0".repeat(48); // a made-up key: the demo game does not check it
const set = (q) => fetch("http://localhost:8124/__set?" + q).then((r) => r.json());
const SIZES = [["desktop", 1280, 900], ["phone", 390, 844]];
const { browser, close } = await launchChrome({ lock: "pay-demo-shots" });
try {
  for (const [name, w, hgt] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 1, permissions: ["clipboard-read", "clipboard-write"], hasTouch: w < 768 });
    const page = await ctx.newPage();
    const shot = async (file) => { await page.waitForTimeout(400); await page.screenshot({ path: join(out, `${file}-${name}-LOCAL.png`), fullPage: true }); console.log("saved", file, name); };
    // the demo game is already published and unpaid: it opens on the dashboard, and "Pay now" opens step 6 (right after publishing the flow goes there by itself)
    const open = async () => { await page.goto(GAME); await page.waitForSelector("#zf-paynow", { timeout: 8000 }); await page.click("#zf-paynow"); await page.waitForSelector("#zf-sec6 .zf-body"); };
    // 1. credits short
    await set("reset=1&balance=2000&down=0&signedin=1"); await open(); await page.waitForSelector("#zf-payneed"); await shot("1-pay-balance-short");
    // 2. payee link made (copy payment link)
    await page.click("#zf-copypay"); await page.waitForSelector("#zf-paylink"); await shot("2-pay-copy-link-done");
    const link = await page.inputValue("#zf-paylink");
    // 3. buy now: waiting for payment
    await page.click("#zf-buynow"); await page.waitForSelector("#zf-paywait"); await shot("3-pay-buy-now-waiting");
    // 4. payee page (what the person who pays sees)
    const payee = await ctx.newPage(); await payee.setViewportSize({ width: w, height: hgt });
    await payee.goto(link.replace("https://", "http://")); await payee.waitForSelector("#due:not(:empty)"); await payee.waitForTimeout(300);
    await payee.screenshot({ path: join(out, `4-payee-pay-link-page-${name}-LOCAL.png`), fullPage: true }); console.log("saved payee", name); await payee.close();
    // 5. the payment arrives (Moneypenny tells the console, the console tells the game): paid state
    await fetch("http://localhost:8124/__pay"); await page.waitForSelector("#zf-paid", { timeout: 20000 }); await shot("5-pay-after-payment-paid");
    // 6. balance enough: one button
    await set("reset=1&balance=6000"); await open(); await page.waitForSelector("#zf-payprimary"); await shot("6-pay-balance-enough");
    // 7. press it: paid
    await page.click("#zf-payprimary"); await page.waitForSelector("#zf-paid"); await shot("7-pay-with-credits-paid");
    // 8. Moneypenny down: soft words
    await set("reset=1&balance=2000&down=1"); await open(); await page.waitForSelector("#zf-payerr"); await shot("8-error-moneypenny-down-soft");
    // 9. not signed in to the console
    await set("down=0&signedin=0"); await open(); await page.waitForSelector("#zf-paysignin"); await shot("9-error-not-signed-in");
    await set("signedin=1&reset=1&balance=2000&down=0");
    await ctx.close();
  }
} finally { await close(); }
