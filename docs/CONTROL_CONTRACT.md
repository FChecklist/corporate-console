# Control contract (what a game must offer the console)

Version 1, 31 Oct 2026. Spec 410 sections 2 and 4. These are additions to `docs/CONTRACT_V1.md`; every route follows the same rules (the game's own address, the console key in `x-organizer`, answers `{ok:true,...}` or `{ok:false,error}`, a 5xx counts as unreachable). A game that does not offer a route simply answers 404 and the console shows "not open on the console yet"; nothing breaks.

The console keeps no log and no game data. Everything below is logged and enforced by the GAME.

## 1. Start, Pause and Resume: `POST /api/console/control`
Body: `{ "eid": "<Game ID>", "op": "start" | "pause" | "resume" }`. Header: `x-organizer: <key for that game>` (no step-up note is needed).

The game checks, in this order, and answers with the first that fails:
| Check | Answer |
|---|---|
| key unknown, expired, or made for another game ID | 401 `{ok:false,error:"key"}` |
| the key's role in THIS game is not **organizer** or **host** (Co-host, family host, participant, anybody else) | 403 `{ok:false,error:"role"}` |
| the move is not allowed now (pause when not playing or already paused; resume when not paused; start when the game does not start by hand, is not ready, or already started) | 409 `{ok:false,error:"state"}` |

On success: `{ "ok": true, "state": "playing" | "paused" | "ready", "paused": true|false, "atMs": <epoch ms> }`.

What the game must do:
- **pause**: freeze every clock of the game (number calls, round timers, claim windows, draw timers); players see the word **Paused** on their screen; nothing is lost; both start modes.
- **resume**: unfreeze; players see play carry on; the paused time is not counted against anybody.
- **start**: begins the game now, like the press of Start in the game itself (only games that declare a manual start mode in their manifest; Organizer or Host).
- Each move is **logged by role** in the game's own log (kind `pause` / `resume` / `start`, role `organizer` or `host`, time; never a name) and appears in the end-of-game report under "How it was played" (pauses, with how long each lasted).
- Pause and start must work at every size up to the game's cap (spec 410 section 3).

`GET /api/console/capabilities` should list `"features": { "control": true }` for a game that offers this route. The console shows the buttons by what the manifest declares (`pauseSupport`, a manual start mode), not by this flag; the flag only lets a later console version tell a game that is behind.

## 2. Game rows: optional fields in `POST /api/console/games`
- `paused`: `true` while a playing game is paused. The row shows the pill **Paused**.
- `joinUrl`: the address people use to join (only for roles that may share it). The control room offers Copy link when it is present.
- `reportStatus`: `"waiting"` (game over, report not sent yet), `"sent"`, `"held"` (the mail did not reach somebody; the system retries) for a finished game. The control room shows it for games whose manifest says the report is sent. No names, no addresses.
- `startMode`: the start mode the organizer chose, as written in the manifest list (for example `manual-start`). Used to show the Start button only for a game that starts by hand.

## 3. Start from an earlier game
### 3a. Read the earlier game: `POST /api/console/earlier`
Body `{ "eid": "<Game ID>" }`, key of an **organizer** of that game. Answer:
```
{ "ok": true, "gameType": "tambola", "gameName": "Friday quiz night",
  "settings": {...}, "startMode": "manual-start", "prizePlan": [...], "roles": {...}, "look": {...} }
```
- Only: settings, start mode, prize plan, role setup (how many Hosts, who may bring people) and look (company name, logo, colours).
- NEVER: people, names, e-mails, IDs, mobiles, seats, tickets, moves, claims, the game's date and time, results, winners. The console also strips any key that ends like one of those (`public/core/clone.js`), so a game that adds a field by mistake leaks nothing, but the game must not send them.
- A game that has erased its data (24 hours after the game, 20 h in code) may still answer: these parts are game details, not participant data.

### 3b. Make the new draft: `POST /api/console/handoff` with `target: "new"` and `prefill`
Body: `{ "target": "new", "prefill": { settings, startMode, prizePlan, roles, look }, "from": "<earlier game name>" }`. The game validates everything again as if the organizer had typed it (unknown or out-of-range values are dropped, never trusted), creates the draft, and answers as today plus **`eid`** (the new draft's Game ID). The new draft has no people and no time.
Later handoffs for the same draft: `{ "eid", "target": "step-<n>" }` opens the game's step n (1 Game, 2 People, 3 Time, 4 Prizes, 5 Brand and Breaks, 6 Check and publish) and `{ "eid", "target": "publish" }` opens the last step (as today).

The console's review screen shows each step as "Copied from <game>" with Change (opens that step in the new draft) and Publish (opens the last step). Steps the new game type does not have are skipped.
