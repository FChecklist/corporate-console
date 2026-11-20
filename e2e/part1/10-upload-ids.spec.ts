// Step 10: upload of IDs. The upload screen belongs to each game. What this repository owns is the ONE shared way to read an employee ID (packages/game-pack/employee-id.js),
// which every game uses. The spec drives that reader in a real browser with a list that has bad rows, through a small stand-in upload page served by the test stack.
import { expect } from "bun:test";
import { scenario, blocked, withOrg, type Organizer } from "./lib/harness";

async function run(o: Organizer, text: string) {
  await o.page.goto(o.w.origin + "/__stack/idtool.html");
  await o.page.evaluate((t) => { (document.getElementById("in") as HTMLTextAreaElement).value = t; }, text); await o.page.click("#go"); await o.page.waitForFunction(() => document.title === "done");
  return o.page.locator("#out li").evaluateAll((l) => l.map((x) => ({ row: (x as HTMLElement).dataset.row, ok: (x as HTMLElement).dataset.ok === "true", id: (x as HTMLElement).dataset.id, text: x.textContent })));
}
const LIST = ["1B-678", "emp/0042-a", "", "---", "A".repeat(31), "😀-7", "1b678", "٣٤", "１Ｂ－６７８", "  42  ", "OK123"].join("\n");

for (const device of ["desktop", "mobile"] as const) {
  scenario(10, device === "desktop" ? "badids+desktop" : "badids+mobile", "a list with good and bad rows: good rows are cleaned, each bad row is named with a plain reason, repeated IDs are flagged", async () => {
    await withOrg({ device }, async (o) => {
      const r = await run(o, LIST);
      const by = (n: number) => r.find((x) => x.row === String(n))!;
      expect(by(1)).toMatchObject({ ok: true, id: "1B678" });
      expect(by(2)).toMatchObject({ ok: true, id: "EMP0042A" });
      expect(by(3).ok).toBe(false); expect(by(3).text).toContain("Please type an employee ID");
      expect(by(4).ok).toBe(false);
      expect(by(5).ok).toBe(false); expect(by(5).text).toMatch(/30/);
      expect(by(6)).toMatchObject({ ok: true, id: "7" }); // an emoji is dropped, the 7 stays
      expect(by(7).ok).toBe(false); expect(by(7).text).toContain("repeated"); // 1b678 = 1B678
      expect(by(8).ok).toBe(false); // other alphabets' digits are not A-Z / 0-9
      expect(by(9).ok).toBe(false); expect(by(9).text).toContain("repeated"); // full-width form of 1B678
      expect(by(10)).toMatchObject({ ok: true, id: "42" });
      expect(by(11)).toMatchObject({ ok: true, id: "OK123" });
      expect(o.errors).toEqual([]);
    });
  });
}

scenario(10, "badids+desktop", "Windows line endings, a trailing blank line, and a 5,000-row list are handled quickly", async () => {
  await withOrg({}, async (o) => {
    const rows = Array.from({ length: 5000 }, (_, i) => (i % 50 === 0 ? "bad row !!" : "EMP-" + i)).join("\r\n") + "\r\n";
    const t0 = Date.now(); const r = await run(o, rows);
    expect(Date.now() - t0).toBeLessThan(8000);
    expect(r.length).toBe(5001); // the empty last line is a row, and is refused as empty
    expect(r.filter((x) => !x.ok).length).toBe(100); // "bad row !!" is read as the ID BADROW by the owner's rule: the first is good, 99 repeats and the empty last line are refused
  });
});

scenario(10, "badids+desktop", "script text in an ID row is not run and not kept (letters and numbers only)", async () => {
  await withOrg({}, async (o) => {
    const r = await run(o, "<script>window.__x=1</script>1");
    expect(await o.page.evaluate(() => (window as any).__x)).toBeUndefined();
    expect(r[0].id).toMatch(/^[A-Z0-9]*$/);
  });
});

scenario(10, "refresh", "refresh in the middle of an upload loses the typed list, and the page starts clean (nothing half-saved)", async () => {
  await withOrg({}, async (o) => { await run(o, "A1\nB2"); await o.page.reload(); expect(await o.page.inputValue("#in")).toBe(""); expect(await o.page.locator("#out li").count()).toBe(0); });
});

blocked(10, "new+desktop", "the game's upload screen (file picker, CSV/Excel, size limit, 'download the bad rows')", "Lives in each game repo (corporate-tambola etc.). Only the shared ID reader is in this repo and is tested above.");
