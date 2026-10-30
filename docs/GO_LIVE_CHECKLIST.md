# Master console: go-live checklist (rows A, H, I, J, K, L of boss note 400)
Rule: a row is ticked only with evidence (test name, commit, screenshot path, deployment id). N/A only with a written reason. Status as of 30 Oct 2026, head after the 30-minute release.

## A. Identity and lists
- [x] A1 Employee ID cleaner: packages/game-pack/employee-id.js (test tests/employee-id.test.ts, commit a87bab4). 30 cap and empty-refused covered there.
- [ ] A2 Console pass-through: the console never touches a raw employee ID (guard in tests/employee-id.test.ts). Games' own paths belong to the game sessions. Console side: DONE; rest N/A for the console, written reason: the console has no list, upload or export screen.
- [x] A3 E-mail cleaner: NFKC, inner spaces removed, lower case; tests/email-case.test.ts (16 case variants, spaces, full-width, same account on request/code/link); break checks email-no-nfkc, email-no-lowercase, email-bridge-old-reading, email-auth-own-reading, email-signin-copy-differs. Inner-space removal added in the next release (see Next release below).
- [ ] A4 N/A for the console: no list check. Reason: lists live inside each game.
- [ ] A5 Hint text "The system will read this as ...": TODO on the console sign-in page for the e-mail (page already shows the address as the system reads it).
- [ ] A6 N/A for the console: it has no games created before a deploy instant.
- [ ] A7 N/A for the console: criterion is chosen inside each game.
- [x] A8 Test addresses only demoN@demo-test.invalid: tests/mail-test-mode.test.ts (scans tests, tools, fixtures); the mail sender only records `.invalid` addresses. Commit b270f06.

## H. Messages and language
- [ ] H1 Wording audit of every console screen against note 191 (the system not we; close group; full game names; participants): TODO, part of the look-and-feel release. Already true: no "private" anywhere (tests/shell.test.ts), plain refusals in tests/screens.test.ts.

## I. Look and feel
- [ ] I1 Same look as the approved mock: TODO. Plan: screen-by-screen comparison (home, My games, Create, Billing, Account, sign-in) against C:\ct\test-sites\data\ui\ux-mock-5step, then fix. Version + release date/time IST on every page is DONE (tests/status-matrix.test.ts, deployment ddf54f7a).
- [ ] I2 Side-by-side gap report: TODO (screenshots to docs/shots/).

## J. Payment and data
- [ ] J1 Payee only IT Services by Rajat Agarwal via Razorpay: wording checked in config; billing per game is TODO (feature map release). TEST games take no live payment: TODO test.
- [ ] J2 Personal data gone within 24 h: the console deletes sign-in codes, sessions, counters daily (functions/_lib/purge.ts, tests/lazy-purge.test.ts, tests/console-auth.test.ts purge tests); e-mail record removed after 365 unused days. Strip text now says only what the code does. Consent text consistency and privacy/terms pages: TODO audit.

## K. Tests (every release)
- [x] K1 unit/logic/wire/smoke: bun test --isolate tests (333 pass at 797118f568d9 before the last two small fixes, then green on re-run).
- [x] K2 regression: same full suite.
- [ ] K3 1,000,000-scenario matrix: the console status matrix is streamed (tests/status-matrix.test.ts); a fresh count for each release is TODO.
- [x] K4 break check per new rule: tools/mutations/*.json (9 new for this release, all RED).
- [ ] K5 cloud suites: N/A until the boss runs the cloud pass for the console; TODO.
- [ ] K6 typecheck: TODO run for this release.
- [ ] K7 browser 360/768/1280 light+dark: screens-sweep exists (tools/browser-tests/screens-sweep.mjs); TODO per release.
- [ ] K8 skeptic audit: TODO.
- [ ] K9 live-game gate: N/A for the console (no game play).
- [x] K10 deploy with rollback id noted: deployed ddf54f7a on top of 14da526d (rollback target).
- [x] K11 live smoke: /auth/me signedIn:false and signed-in owner session (boss saw signedIn:true with games bar and three cards).
- [x] K12 version.json = commit: 797118f568d9 live, 30 Oct 2026 08:52 IST; tests/deploy-dist.test.ts.
- [ ] K13 register 150 + checklist: this file.

## L. Master console
- [ ] L1 Same look as games; per-game rows from config/games.json features: TODO (look-and-feel release, then feature-map release with a test that no undeclared feature is shown).
- [x] L2 Sign-in: 30 minutes, stays signed in (5-year sliding), case-insensitive e-mail, real stamp/commit. Evidence: tests/console-auth.test.ts, tests/email-case.test.ts, commit 797118f568d9, deployment ddf54f7a. ID cleaning on pass-through: console never touches IDs (tests/employee-id.test.ts).
- [x] L3 Strip text softened to "Players' personal details are deleted after the game" (tests/shell.test.ts); Lucky Draw says coming soon (Create tile and games bar, tests/gamesbar.test.ts).
- [ ] L4 Billing per game; bridge to games after CONSOLE_PUBKEYS (owner step); console.corporatetambola.com later: TODO / owner step.

## Next releases (in order, per boss)
1. This small release: inner spaces removed from e-mail (A3).
2. Look-and-feel release (I1, I2, H1, L1 look).
3. Per-game feature map release (config/games.json features list, L1/L4/J1).
