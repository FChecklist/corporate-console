// Step 11: publish and the join link. Console side: Publish hands over to the game's last step; the Control room offers 'Copy link' only when the game gives a safe https join link; Billing makes a finance pay link.
import { expect } from "bun:test";
import { scenario, blocked, withOrg } from "./lib/harness";

const PAID = { status: "ready", nextAction: "share", pack: 100, payment: { state: "paid", amountMinor: 239900, currency: "INR" } };
const cr = (eid: string) => `#cr-body article.gcard[data-eid="${eid}"]`;

scenario(11, "returning+desktop", "Copy link: the join link from the game goes to the clipboard, with a 'Link copied.' note", async () => {
  await withOrg({ clipboard: true }, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { ...PAID, ext: { joinUrl: "https://housie.example.test/z.html?e=ABC#p=open", startMode: "auto-start-auto-play" } });
    await o.go("control"); await o.page.waitForSelector(cr(eid));
    await o.page.click(`${cr(eid)} button:has-text("Copy link")`);
    await o.page.waitForSelector(".toast:has-text('Link copied.')");
    expect(await o.page.evaluate(() => navigator.clipboard.readText())).toBe("https://housie.example.test/z.html?e=ABC#p=open");
  });
});

scenario(11, "returning+mobile", "Copy link on a phone-size window", async () => {
  await withOrg({ device: "mobile", clipboard: true }, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { ...PAID, ext: { joinUrl: "https://housie.example.test/z.html?e=M1" } });
    await o.go("control"); await o.page.waitForSelector(cr(eid)); await o.page.click(`${cr(eid)} button:has-text("Copy link")`); await o.page.waitForSelector(".toast:has-text('Link copied.')");
  });
});

scenario(11, "wrong", "a join link that is not https (http:, javascript:, data:) is never offered for copying", async () => {
  await withOrg({}, async (o) => {
    await o.signIn();
    const ids: string[] = [];
    for (const u of ["http://housie.example.test/x", "javascript:alert(1)", "data:text/html,<script>1</script>", ""]) ids.push((await o.stack.createGame("tambola", o.email, { ...PAID, ext: { joinUrl: u } })).eid);
    await o.go("control"); await o.page.waitForSelector(cr(ids[0]));
    for (const e of ids) expect(await o.page.locator(`${cr(e)} button:has-text("Copy link")`).count()).toBe(0);
  });
});

scenario(11, "wrong", "when the browser refuses the clipboard, the link is shown in a box to copy by hand", async () => {
  await withOrg({ clipboard: false }, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { ...PAID, ext: { joinUrl: "https://housie.example.test/z.html?e=HAND" } });
    await o.page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) }, configurable: true }); }); // the browser says no
    await o.go("control"); await o.page.waitForSelector(cr(eid)); await o.page.click(`${cr(eid)} button:has-text("Copy link")`);
    await o.page.waitForSelector("input.copybox"); expect(await o.page.inputValue("input.copybox")).toContain("e=HAND");
  });
});

scenario(11, "returning+desktop", "a Co-host never sees the game (or its link) in the Control room; a Host does", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const boss = "e2e-boss-" + Date.now() + "@demo-test.invalid";
    const h = await o.stack.createGame("tambola", boss, { ...PAID, ext: { joinUrl: "https://housie.example.test/z.html?e=H" } });
    const c = await o.stack.createGame("tambola", boss, { ...PAID, ext: { joinUrl: "https://housie.example.test/z.html?e=C" } });
    await o.stack.role("tambola", h.eid, o.email, "host"); await o.stack.role("tambola", c.eid, o.email, "cohost");
    await o.go("control"); await o.page.waitForSelector(cr(h.eid)); expect(await o.page.locator(cr(c.eid)).count()).toBe(0);
  });
});

scenario(11, "returning+desktop", "'Publish' on a draft opens the game's last step through a one-time link (to=publish)", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, {});
    await o.page.reload(); await o.go("mygames"); await o.page.waitForSelector(`article.gcard[data-eid="${eid}"]`);
    await o.page.click(`article.gcard[data-eid="${eid}"] button:has-text("Publish")`); await o.page.waitForURL(/signin\.html\?t=.*to=publish/);
  });
});

scenario(11, "refresh", "refreshing the Control room keeps the Copy link button", async () => {
  await withOrg({}, async (o) => {
    await o.signIn(); const { eid } = await o.stack.createGame("tambola", o.email, { ...PAID, ext: { joinUrl: "https://housie.example.test/z.html?e=R" } });
    await o.go("control"); await o.page.waitForSelector(cr(eid)); await o.page.reload(); await o.page.waitForSelector(`${cr(eid)} button:has-text("Copy link")`);
  });
});

blocked(11, "new+desktop", "the publish screen itself and the share page (QR code, WhatsApp text, 'Ready' check)", "Game repository. The console only hands over and shows the link the game provides.");
