// Owner rules R1-R8 (spec 410) against config/games.json. A rule the product has no field for FAILS here on purpose: that is a gap, not a test fault.
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(new URL("../../config/games.json", import.meta.url), "utf8"));
const games: any[] = cfg.games;
const ids = ["tambola", "bingo", "tictactoe", "snakes", "luck", "luckydraw"];
const g = (id: string) => games.find((x) => x.id === id);
const CLAIM = ["tambola", "bingo"], ELIM = ["tictactoe", "snakes", "luck"];
const present = (id: string) => { const x = g(id); expect(x, `game ${id} is not in games.json (ids found: ${games.map((y) => y.id).join(", ")})`).toBeTruthy(); return x; };

test("R1 games.json lists exactly the 6 games tambola, bingo, tictactoe, snakes, luck, luckydraw", () => {
  expect(games.map((x) => x.id).sort()).toEqual([...ids].sort());
});
test("R1 every game has a labels[] array", () => {
  for (const x of games) expect(Array.isArray(x.labels) && x.labels.length > 0, x.id).toBe(true);
});
test("R1 Claim label on tambola and bingo", () => { for (const id of CLAIM) expect(present(id).labels).toContain("Claim"); });
test("R1 Elimination label on tictactoe, snakes, luck", () => { for (const id of ELIM) expect(present(id).labels).toContain("Elimination"); });
test("R1 Lucky Draw label on luckydraw", () => { expect(present("luckydraw").labels).toContain("Lucky Draw"); });
test("R1 Team reserved: a 'Team' label is reserved in the games list", () => {
  const all = games.flatMap((x) => x.labels || []);
  expect(all.includes("Team") || JSON.stringify(cfg).includes("Team"), "no Team label is reserved anywhere in games.json").toBe(true);
});

test("R2 caps: tambola, bingo, luckydraw auto up to 100000", () => { for (const id of ["tambola", "bingo", "luckydraw"]) expect(present(id).caps.auto, id).toBe(100000); });
test("R2 caps: manual play (host calls) in tambola and bingo up to 1000", () => { for (const id of CLAIM) expect(present(id).caps.manual, id).toBe(1000); });
test("R2 caps: tictactoe, snakes, luck up to 2000", () => { for (const id of ELIM) expect(present(id).caps.auto, id).toBe(2000); });
test("R2 caps: no manual-play cap on the four games where the software always runs the rounds", () => { for (const id of [...ELIM, "luckydraw"]) expect(present(id).caps.manual, id).toBeUndefined(); });

test("R3 tambola and bingo have all four start modes (auto|manual start x auto|manual play)", () => {
  for (const id of CLAIM) {
    const m = present(id).startModes;
    expect(m.length, id).toBe(4);
    for (const s of ["auto", "manual"]) for (const p of ["auto", "manual"]) expect(m.some((x: string) => x.includes(s) && x.includes(p)), `${id}: no ${s} start x ${p} play`).toBe(true);
  }
});
test("R3 tictactoe, snakes, luck, luckydraw have only the start choice auto|manual", () => {
  for (const id of [...ELIM, "luckydraw"]) {
    const m: string[] = present(id).startModes;
    expect(m.length, id).toBe(2);
    expect(m.some((x) => x.startsWith("auto")), id).toBe(true);
    expect(m.some((x) => x.startsWith("manual")), id).toBe(true);
  }
});

test("R4 rehearsal max 20 participants for tambola and bingo", () => { for (const id of CLAIM) expect(present(id).rehearsalMax ?? present(id).rehearsal?.max, `${id}: no rehearsal cap in games.json`).toBe(20); });
test("R4 rehearsal max 10 participants for all other games", () => { for (const id of [...ELIM, "luckydraw"]) expect(present(id).rehearsalMax ?? present(id).rehearsal?.max, `${id}: no rehearsal cap in games.json`).toBe(10); });

test("R5 pause/resume exists for all 6 games", () => { for (const id of ids) expect(present(id).pause, `${id}: no pause/resume declared`).toBeTruthy(); });
test("R5 pause/resume only by Organizer or Host, never Co-host or participant", () => {
  for (const id of ids) { const p = present(id).pause; expect(p && [...p.by].sort(), `${id}: no pause roles declared`).toEqual(["host", "organizer"]); }
});

test("R6 prizes can be auto or manual in all games", () => { for (const id of ids) expect([...(present(id).prizeModes || [])].sort(), `${id}: no prizeModes`).toEqual(["auto", "manual"]); });
test("R6 Organizer final say on prizes only in tambola and bingo", () => {
  for (const id of ids) expect(!!present(id).organizerFinalSayPrizes, id).toBe(CLAIM.includes(id));
});

test("R7 golden button: tambola and bingo = participant must press Claim", () => { for (const id of CLAIM) expect(present(id).goldenButton, `${id}: no goldenButton rule`).toBe("claim"); });
test("R7 golden button: the other four are auto-claimed and the button only announces 'You won'", () => { for (const id of [...ELIM, "luckydraw"]) expect(present(id).goldenButton, `${id}: no goldenButton rule`).toBe("announce"); });

test("R8 roles Organizer, Host, Co-host, participant, family pass in all games", () => {
  for (const id of ids) expect([...(present(id).roles || [])].sort(), `${id}: no roles declared`).toEqual(["cohost", "family", "host", "organizer", "participant"]);
});
