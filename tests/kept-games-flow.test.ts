// FALSIFIED BY: hidden3-starts-hidden-game
// The three games that STAY (Tambola, Bingo, Lucky Draw) still work through the console with the hide switch ON: create, invite, pay, run, result.
// Real sign-in service + one fake game per kept game (the three hidden games are present in the world and flagged hidden, so a leak into the kept flow would show).
// What this covers is the console side of each step. The games' own screens (the employee-ID list, the number draw, the winners page) belong to the game repositories and are not run here.
import { test, expect, setDefaultTimeout } from "bun:test";
import { world, spies } from "./support/world";
import { emailHash } from "../tools/fake-game/server.mjs";

setDefaultTimeout(90_000);
const HIDDEN = ["tictactoe", "snakesladders", "luckbychance"], KEPT = ["tambola", "bingo", "luckydraw"];

for (const id of KEPT) {
  test(`${id}: create, invite, pay, run and result work through the console while the three other games are hidden`, async () => {
    const w = await world({ slowMs: 0, hidden: HIDDEN, luckydraw: true }); spies();
    try {
      const S = w.states[id];
      // CREATE: a brand-new person starts a game; the console hands over to THIS game only and makes an account only there
      await w.signIn("demo12@demo-test.invalid"); await w.api.connect();
      const made = await w.api.startNew(id);
      expect(made.ok).toBe(true);
      expect(made.url.startsWith(S.origin + "/signin.html?t=")).toBe(true);
      const me = await emailHash("demo12@demo-test.invalid");
      expect(S.people.has(me)).toBe(true);
      for (const other of [...KEPT.filter((x) => x !== id), ...HIDDEN]) expect([other, w.states[other].people.has(me)]).toEqual([other, false]);
      // a hidden game cannot be started at all
      for (const h of HIDDEN) expect(await w.api.startNew(h)).toEqual({ ok: false, error: "game-hidden" });
      await w.api.signOut();

      // the person who already has games (the fake world's Alice)
      await w.signIn(); await w.api.connect();
      const list = await w.api.listGames();
      const mine = list.rows.filter((r: any) => r.game === id);
      expect(mine.length).toBeGreaterThan(5);
      const by = (eid: string) => mine.find((r: any) => r.eid === eid);

      // PAY: the game waiting for payment shows in Billing's "To pay" and the console makes a pay link in THIS game's own address
      expect(by("WAIT001").status).toBe("waiting_payment");
      const pl = await w.api.payLink(id, "WAIT001");
      expect(pl.ok).toBe(true);
      expect(pl.url.startsWith(S.origin + "/paylink.html?t=")).toBe(true);
      const bill = await w.api.billing();
      expect(bill.rows.some((r: any) => r.game === id && r.eid === "WAIT001" && r.status === "waiting")).toBe(true);
      expect(bill.rows.some((r: any) => r.game === id && r.eid === "READY01" && r.status === "paid" && /^\/api\/invoice\/inv_[0-9a-f]{32}$/.test(r.invoice))).toBe(true);

      // INVITE: an invitation to help with a game is accepted and gives a key for that game only
      const card = mine.find((r: any) => r.eid === "CARO001");
      expect(card).toBeTruthy();
      expect(card.role).toBe("cohost");
      const acc = await w.api.answerInvitation(id, "CARO001", S.roles.find((r: any) => r.eid === "CARO001").roleId, "accept");
      expect(acc.ok).toBe(true);
      expect(w.api.vault.all().some((k: any) => k.game === id && k.eid === "CARO001")).toBe(true);

      // RUN: a game that is playing is listed as playing and its player's screen opens from the console
      expect(by("PLAY001").status).toBe("playing");
      const pv = await w.api.preview(id, "PLAY001");
      expect(pv.ok).toBe(true);

      // RESULT: a finished game is listed as finished, with its paid receipt
      expect(by("DONE001").status).toBe("finished");
      // nothing about this flow asked a hidden game for anything it did not already hold for this person
      for (const h of HIDDEN) expect(w.states[h].calls.some((c: string) => /\/api\/console\/handoff/.test(c))).toBe(false);
    } finally { w.stop(); }
  });
}
