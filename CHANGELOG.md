# Changelog - corporate-console

Newest first. Rule: every deploy bumps the version and adds an entry here (standard of 20 Nov 2026).
Numbering: 0.1.1 = PR #4 (bridge tests, no code change). 0.2.0 and 0.2.1 = PR #2 (these entries). They deploy together; the build carries 0.2.1.

## 0.2.1 - 20 Nov 2026 (not deployed yet; the release time is stamped at deploy)
### Fixed
- Audit HIGH-A / X-1 (fail closed): a game is told ONLY the size Moneypenny says was paid. When an answer (quote, status, start, confirm, payee link, signed notice) says paid but carries no `item`, the console tells the game nothing and answers "review". Before, it fell back to the console's own note, which an organizer's edit could have moved to a bigger size. Also, the paid branches of `/pay/quote` and `/pay/check` now only CREATE a note when none exists; they never move an existing one to the size on a screen. Where: `functions/_lib/pay-core.ts` (`settle`, `noteGame`).
- Audit MEDIUM-B / X-4: tests now guard every place the paid size is passed (quote, check, pay, buy, confirm, payee info, payee confirm, signed notice), each with a Moneypenny that carries `item`, one that omits it, and a note already moved to the new size; plus the preflight header (`x-console`) and the console's other address in the pay routes' page list.
- Audit M-3 (guard test): the runbook check was hollow (an escaped pipe never matched). It now looks at every line, and a second test proves it finds the old `sed ... pages.dev` line. Runbook: step 2 verify line no longer says "Version 0.1.0" and says the mail link works only after Step 9 (X-6).
- Audit X-5 / L-2: after "the e-mail is taking longer than usual" the sign-in screen opens the code box (a late mail's code works) and keeps "Send a new code" locked for the wait. Where: `public/screens/signin.js`.
- Audit X-3 / L-1: the "we, our, us" wording test is now case-insensitive and has no lowercase-start exemption (it shows red for "We use it ..."). The stored mutation for the payee page was brought up to date and 13 new ones added (settle fail-open, note moved on a paid answer, one per paid-size call site, csrf guard, preflight header, other address, slow-mail screen, runbook).
- Docs: `docs/PAY_STEP.md` says `item` must be on every "paid" answer; confirm with the Moneypenny owner and in the O-11 test-mode payment before the flag goes on (still a deploy gate).
### Not changed (open, for the owner)
- The pay flag `PAY_VIA_MONEYPENNY` stays OFF. Games must re-vendor `zc-flow.js` (header `x-console`). The CORS list in `pay-core.ts` / `stats-core.ts` uses the console address plus the other address only for pay pages (X-8). Merge with PR #4 (0.1.1): CHANGELOG, releases.json and docs/GAME_PAY_CONTRACT.md conflict (docs only): keep 0.2.1 on top, add the 0.1.1 entry, re-run the suite on the result (X-2). The ID-upload branch needs its own audit.
- Rollback id of the previous deploy: `706f8e60` (commit 9c57a81).

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
