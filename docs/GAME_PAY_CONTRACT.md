# What each game must add so its Pay step works through the console

Applies to all six games: Corporate Tambola, Bingo, Tic Tac Toe, Snakes and Ladders, Luck by Chance, Lucky Draw.
The console (console.corporatetambola.com) shows the Pay step and talks to Moneypenny. The game never talks to Moneypenny, IT Services or Razorpay, and never shows its own payment page. Details of the console side: `docs/PAY_STEP.md`.

## 1. Re-vendor
- Copy the console's bridge and game pack again (`tools/vendor-bridge.mjs`, `tools/vendor-pack.mjs`), byte for byte. Do not edit the copies.

## 2. Two adapter functions (the game's own code)
`payInfo(env, { eid, sub })` — read only, changes nothing.
- Returns `{ owner, item, paid }`.
- `owner` is true only when `sub` is the game's ORGANIZER (not a host, not a player).
- `item` is the game size as a string (for example "100", "250"); the console checks it against what the screen showed.
- `paid` is true when the game is already marked paid.

`markPaid(env, { eid, sub, item, orderRef, nowMs })` — must be REPEATABLE.
- Checks owner and size again. If either is wrong, nothing changes and it throws a definite refusal (`{ definite: true }`).
- If the game is already paid, it returns normally and changes nothing.
- Never "pays twice", never extends or resets anything on a repeat.
- `orderRef` is `GAME-<game>-<eid>`; keep it with the game record.
- The bridge gives it a 30 second lease: if a call dies halfway, the next call takes over. So a half-done call must be safe to run again.

## 3. Descriptor
- `payGame`: the game's product name as Moneypenny lists it (the same word the console uses).
- `consoleOrigin`: `https://console.corporatetambola.com`.
- Console side: the game's origin is listed in `config/games.json`; nothing to do in the game.

## 4. Old pay link
- Keep `legacyPayRedirect` behind the switch `PAY_VIA_CONSOLE`. While the switch is off, the game's old "Pay now" link keeps working exactly as before. When on, old pay routes send the person to the console.

## 5. The game page's own security rules (CSP)
- `frame-src` must allow the secure payment window address (same value as `payframeOrigins` in `config/games.json`).
- `connect-src` must allow the console address.
- No wildcard. No other new address. Run the game's own CSP test.

## 6. Must not exist in the game
- Its own sign-in, its own payment page, its own chat, any price number written in code (every number comes from the console / Moneypenny).
- Any e-mail promise that is not true in code.

## 7. Snakes and Ladders
- Its own flow moves to the shared flow (so it gets the same Pay step). Needs the owner's timing (see STATE.md, Needs owner).

## 8. Tests the game should run (copy the idea from `tests/support/fake-host.ts`)
- `payInfo` for organizer, for a host, for a stranger, for a paid game.
- `markPaid` twice in a row: the second call changes nothing.
- `markPaid` with the wrong size or wrong owner: refused, nothing changed.
- Flag off: the old Pay now link still works.

## 9. Not allowed to be done before the owner says go
- Deploying a game, turning on `PAY_VIA_CONSOLE` or the console's `PAY_VIA_MONEYPENNY`, or any real payment.
