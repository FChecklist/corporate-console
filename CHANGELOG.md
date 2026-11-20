# Changelog - corporate-console

Newest first. Rule: every deploy bumps the version and adds an entry here (standard of 20 Nov 2026).
Numbering: 0.1.1 = PR #4 (bridge tests, no code change). 0.2.0 = PR #2 (this entry). They deploy together; the build carries 0.2.0.

## 0.2.0 - 20 Nov 2026 (not deployed yet; the release time is stamped at deploy)
### Fixed
- Sign-in mail (F-01..F-05): the settings carry the live address, `CONSOLE_ALT_ORIGINS` keeps the trial address; a failed mail keeps the code the person holds; 10 s limit on the mail call; the reason is logged; a test address is told so. Where: `wrangler.toml`, `functions/_lib/auth-core.ts`, `public/screens/signin.js`.
- Pay note and payee page (F-06..F-12): the note follows the game's size while the order is open; a game Moneypenny calls paid is told; the payee page also tells the game; no price number in the shared flow; "we" removed from the pay words; the installed app no longer keeps `/pay/*`. Where: `functions/_lib/pay-core.ts`, `packages/game-pack/zc-flow.js`, `public/pay-link.js`, `public/sw.js`.
- Audit HIGH-1: a game paid at one size and then edited to a bigger size is never marked paid at the bigger size; the game is told the size Moneypenny says was paid. Where: `functions/_lib/pay-core.ts` (`settle`).
- Audit M-4: every signed-in pay route needs the console header (`x-console: 1`) and a console or game page as origin; other pages of the same site cannot act as the organizer. Where: `functions/_lib/pay-core.ts`, `packages/game-pack/zc-flow.js`. **Every game must re-vendor the pack** or its Pay step answers "did not come from a Corporate Games page".
- Audit M-2: a mail that TIMES OUT may still arrive, so its code is kept (not deleted) and the screen says it may still arrive. Where: `functions/_lib/auth-core.ts`.
- Audit M-3: the go-live runbook no longer sets `CONSOLE_ORIGIN` back to the pages.dev address (step 2.4 only checks it). Where: `docs/GO_LIVE_RUNBOOK.md`, `tests/deploy-dist.test.ts`.
- Audit Lows: the pay routes also accept the console's other address; tests now count the notices sent to a game and check the payee page wording line by line.
- Tests: each fix has a test shown to go red when the fix is removed (`tests/smoke-*.test.ts`, `tests/deploy-dist.test.ts`).
### Changed
- PR: https://github.com/FChecklist/corporate-console/pull/2. Audit: pending (re-audit on the final commit). Rollback id of the previous deploy: `706f8e60` (commit 9c57a81); before that `7489a57e-72a7-4a35-b7b5-3e4b824cf23c`.
