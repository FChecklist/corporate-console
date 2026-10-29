# Master console: build status (updated 29 October 2026; the 27 October table below is kept for the game worktrees)

**29 Oct 2026:** the master console itself is complete to spec 100 section 5.1 (see `STATE.md`). The table and lists below describe the first build and the game worktrees; where they say "NOT done yet" for the console screens, that is now done.

Plain words first, then where everything is. Nothing is deployed, nothing was created in Cloudflare, no money spent, no secret in any repo.

## Where the work is

| Thing | Folder | Branch / commit | State |
|---|---|---|---|
| Console (this repo) | `C:\ct\test-sites\console` | `main` | W1-W5, W7, W8 (shell), W9, W10, W34 done; W35/W36 first slice done |
| Bingo + bridge (dark) | `C:\ct\test-sites\bingo-console` | `console/bridge` (off master bd66d3c) | bridge, roles, hand-off page, one-game keys; 14 new tests |
| Tic Tac Toe + bridge | `C:\ct\test-sites\tictactoe-console` | `console/bridge` (off 045d629) | same + running tournaments in `/live` |
| Snakes and Ladders + bridge | `C:\ct\test-sites\snakesladders-console` | `console/bridge` (off d2a3ebd) | same; no Rs 0 size yet |
| Tambola + bridge | `C:\ct\test-sites\tambola-console` | `console/bridge` (off the live commit 6e0f643) | same; keys `ctk_/cth_/ctc_`, storage name `ctz-org` |
| Luck by Chance | not started | - | needs its Tambola-hardening port first (live Luck is master 752ff60, TEST mode) |
| Lucky Draw | not started | - | W32/W33 |
| Mockups | `C:\ct\test-sites\data\console-mockup-v3-laptop`, `console-mobile-mockup` | - | written; real-Chrome sweep waiting for the shared lock; owner sign-off pending |

Each game worktree is a separate checkout (`git worktree`), so the live folders of the games were never touched. Nothing is merged into any game's master and nothing is pushed.

## How the pieces fit

- `packages/bridge/` is the ONE shared module. `node tools/vendor-bridge.mjs --game <worktree>` copies it, byte for byte, into `apps/edge/src/console-bridge/` (and the contract tests into `apps/edge/test/console-contract/`) with a hash list. A drift check fails if one byte differs.
- `python tools/game-port/port-bridge.py --game <id> --repo <worktree>` applies the same small edits to a game (it STOPS if a line it expects is not there). Used for Tic Tac Toe, Snakes and Tambola after Bingo.
- Contract: `contract/schemas.json`, `contract/fixtures.json`, `docs/CONTRACT_V1.md`. Same fixtures run against the fake game, the bridge on a mini game, and each real game.
- Tests: `bun test --isolate tests` in this repo (202 pass). Break-it checks: `node tools/falsify-run.mjs --store tools/mutations --all` (80 stored + 8 for Tambola); each test file names its checks on line 1.
- Heavy runs go through `node tools/heavy-run.mjs -- <command>` (the shared lock `C:\ct\heavy.lock`).

## What each game now does (all dark: no CONSOLE_PUBKEYS = the ordinary 404)

Roles per game by e-mail (invite, accept with the invited mailbox, remove), keys of 2 hours labelled `console`, tied to ONE game for Host / Co-host, step-up confirmation for invite/remove, hand-off link to the game's own screen (opens once, 60 s, 16-hour key kept in that tab only), sign-out route, a key tied to a game stops when the game is over, cannot pay for or read another game, cannot read history or account pages. Old keys and AI work links are unchanged.

## NOT done yet (in plan order)

1. Baselines per repo (needs the lock), full-suite runs of the four game worktrees, real-Chrome sweeps of the mockups and the shell (need the lock).
2. W6 owner sign-off of the mockups (after my sweep), then W37 wizard (six steps, per game adapters, golden payloads from each game's real `validateCfg`), W38-W42 screens, W43 copy pass, W46-W49 rig, sims, security review, W50-W53 deploy tooling / runbook / go-live.
3. Per-game parity (W14-W21 log, trail, retention, upgrade, free caps, drafts rule, preview, public notes), Luck port, Lucky Draw, IT Services (W22), showcase (W44/W45), Tambola's housie move (W23).
4. Owner decisions listed in `CONSOLE_DECISIONS.md` (prices, Cloudflare plan, US$ ladder, lawyer).

## Known gaps found while building (so nobody is surprised)

- Account creation by the console records no Terms consent in the game (the game's own sign-up records K2); the console shows its own consent box. Lawyer / owner to decide the wording.
- `game_role` rows (hash + sealed e-mail) are not yet deleted with the game or at account close; W16 must add that to `eraseEverything` and account close in each game.
- The hand-off for the Tic Tac Toe tournament page (`host.html`) and the big screen currently opens the organizer screen; the `target` is not yet remembered.
- The test-login addresses (`demo1/2/3@xyz.in`) work on live Snakes without a test-mode check; the bridge never uses them.
