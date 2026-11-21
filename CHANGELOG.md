# Changelog - corporate-console

Newest first. Rule: every deploy bumps the version and adds an entry here (standard of 20 Nov 2026).
Numbering: 0.3.0 = this branch (consent order, step banner text, forms, 404). 0.2.2 = banners, SEO, plain errors (live). 0.1.1 = PR #4 (bridge tests, no code change). 0.2.0 and 0.2.1 = PR #2 (these entries). They deploy together; the build carries 0.2.1.

## 0.3.0 - 21 Nov 2026 (not deployed; the release time is stamped at deploy)
Branch `claude/console-0-3-0`, cut from 0.2.2 (`claude/console-banners-seo-v0-2-2`, commit 32e1603, the version that is live). No money flag, no pay contract, no bridge, no pack, no function, no secret touched: `functions/`, `packages/bridge/`, `packages/game-pack/`, `docs/GAME_PAY_CONTRACT.md` are byte for byte as in 0.2.2. The pay flag `PAY_VIA_MONEYPENNY` stays OFF.
In plain words: the cookie box is stricter, the steps banner tells you what is next, every box you fill in shows an example and says what to fix, and pressing a button twice no longer does the job twice.
### Changed: cookie consent
- **No offline worker and no saved page copy before you answer.** Until now the console set up its offline worker (a saved copy of its own pages on your device) on the first visit, before the cookie question was answered. Now `public/core/offline.js` registers it only after the second answer, "Also remember your choices". Before an answer, after "Only what is needed", and with Global Privacy Control or Do Not Track, no worker is registered and no cached file exists; a worker or cache left by an earlier visit is removed at once. `public/core/boot.js` only follows the answer (the banner announces it with the event `cg-consent-changed`).
- Declining everything is one tap, the same size as accepting (unchanged). The words are warmer and say what each answer means, including the saved copy of the pages. "Cookie choices" in the footer changes your answer at any time.
- The owner page (`/owner-funnel/`) now starts the banner too: its footer had a "Cookie choices" link that opened nothing.
### Changed: step banner
- The banner says **"Step N of 6: name"** and **"Next: Step N+1 of 6: name"** in two lines above the six steps (`stepSummary` in `public/core/steps.js`). On the last step it says nothing more is left; for a cancelled or deleted game it claims nothing. Game rows in My games add "Next: ..." to their one-line step. "Start from an earlier game" shows the same banner.
### Changed: form fields, one press, confirm
- Every form field now has an example and its own error line right under it, in plain words, announced by screen readers and marked wrong (not by colour alone): sign-in e-mail, the agree box, the 6-digit code (a wrong shape is told without asking the server), the payee e-mail, the owner key and the two days of the owner page (`public/core/forms.js`, `signin.js`, `pay-link.*`, `owner-funnel/*`).
- One press does one job (no double sends, no double drafts): Get your code, Sign in, Start / Try a free game / Make it in (all buttons lock together, so no two drafts), open a game, copy, answer an invitation, sign out, close account, the owner page's Show and Download.
- Saying no to an invitation (Home and My games) asks Yes / No first; a failed answer on Home now says so instead of doing nothing.
### Changed: search and AI-search
- Signed-in screens ask search engines to stay away (`noindex,nofollow`) and have their own page title (`public/core/page-seo.js`); signed out, the public head comes back.
- `X-Robots-Tag: noindex, nofollow` headers on `/auth/`, `/pay/`, the sign-in link page, the pay link page, `/report/`, `/stats/`, the owner page and `/404.html` (in `build.mjs` `headersFile`; they cover static files; the function answers set their own headers, which this release does not touch).
- New `public/404.html`: says what happened in plain words and links to the console, the games, What's new and the help address (no dead end); built with `noindex`.
- Already in 0.2.2 and kept, now tested: unique title and description per page, canonical, Open Graph, JSON-LD Organization and WebSite, sitemap.xml (three public pages), robots.txt, llms.txt, no `<img>` without alt.
### Fixed
- `tools/heavy-run.mjs` starts the job in its own process group on Linux and Mac, so a job that runs too long is really killed (`tests/heavy-run.test.ts` was red on Linux since 0.2.1; it is green now).
### Tests
- New: `tests/consent-order.test.ts`, `accessibility.test.ts`, `sitemap-content.test.ts`, `step-next.test.ts`, `forms-idiot-proof.test.ts`, `release-0-3-0.test.ts`. They were run on the 0.2.2 code first and fail there (see the pull request for the list); mutations in `tools/mutations/` (ids `consent3-*`, `a11y3-*`, `sitemap3-*`, `step3-*`, `forms3-*`, `release3-*`).
- Updated for the new wording: `step-banner`, `screens`, `plain-errors`, `cookie-banner`, `release-0-2-2`.
- Browser check at 360 px: `node tools/browser-tests/mobile-360.mjs` (needs a built `dist/`).
### Not changed / open
- Audit: pending (two independent audits on the exact head SHA gate every deploy). Rollback id of the previous deploy (live 0.2.2): unknown to this branch, BOSS records it at deploy; before it `706f8e60` (commit 9c57a81).
- The game setup screens (the pack) have their own fields and are not part of this release; their form wording is the games' own work.
- The default branch (`claude/master-console-complete-882589`) is still 0.1.1; this branch is cut from the 0.2.2 line. Merging the lines needs the CHANGELOG, releases.json and `docs/GAME_PAY_CONTRACT.md` conflicts resolved (see 0.2.1 notes).
- `version.json` is made by `node build.mjs` from the first row of `releases.json`; there is no hand-written `version.json` in the repository.

## 0.2.2 - 21 Nov 2026 (not deployed; the release time is stamped at deploy)
Branch `claude/console-banners-seo-v0-2-2`, cut from the 0.2.1 line (`claude/console-game-pay-step-91b60a`, commit 395b2cb = PR #2). No money flag, no pay code, no function, no secret touched. Pay flag `PAY_VIA_MONEYPENNY` stays OFF.
### Added
- **Cookie banner** (`public/core/consent.js`, `consent.css`, `page-consent.js`). Until the visitor answers, the page stores nothing of its own (no cookie, nothing in browser storage); the only cookie the console needs, the sign-in cookie, is set by the server after a sign-in. Two answers of the same size ("Only what is needed" / "Also remember your e-mail and layout"), no pre-picked box, no countdown, the page is never blocked. Global Privacy Control and Do Not Track are honoured: no banner, nothing optional stored, and a click cannot switch it on. The answer is one small cookie `cg_consent` (180 days, this site, written only after a click). "Cookie choices" in the footer changes it; "Only what is needed" erases what was kept. Works from 320 px. The optional part is real: the sign-in screen fills in your e-mail (`cg-email`) and a chosen layout (`cg-design`) is used, only with the second answer.
- **Step banner** (`public/core/steps.js`, styles in `app.css`): the six organizer steps in plain English with the current one marked ("You are here", `aria-current="step"`, not colour alone). Shown on the Create screen; My games shows "You are at step N of 6" on an organizer's own games. The names are the game setup screen's own (`packages/game-pack/zc-flow.js`), a test keeps them equal. A draft claims nothing is done (the console cannot see inside the game's setup).
- **SEO and AI-search** (`seo.mjs`, made by `build.mjs`): title and description per page, canonical, Open Graph and Twitter tags, JSON-LD Organization and WebSite (plus ItemList on /games/, CollectionPage on /changes), `sitemap.xml` (3 public pages), `robots.txt`, `llms.txt`. Only a LIVE build asks to be indexed; the pages.dev build says noindex and `Disallow: /`. Sign-in link page, payee page and owner page stay noindex. Training crawlers are told no (list in `seo.mjs`); search and answer crawlers follow the general rule.
- **/changes** ("What's new"): the last 10 releases in plain words (`userNote` of each row of `releases.json`; the technical `note`, ids and audit details never show). `version.json` gains `product` and `changes` (last 20).
- **Footer standard**: line 1 stays "Version X, released ...", line 2 is `vX.Y.Z: what's new` (to /changes), Cookie choices, and the help address, on every page.
### Changed
- Idiot-proofing: every error sentence says what to do next (sign-in, hand-over, Control room, preview, payee page); the payee page has Try again and a help line; pages that need JavaScript say what to do without it; the console page has real text for search before the app starts. Voice: "Send me a code" is now "Get your code", "Sign me in" is "Sign in", "I agree" is "Tick this box to agree", "Close my account" is "Close your account", "Download my payments" is "Download your payments". The menu name "My games" stays (owner-approved label, pinned by tests).
- Page titles now carry the brand for search ("Corporate Games console: ...", was "Console"); menu and app labels stay brand-free.
### Tests
- New: `tests/cookie-banner.test.ts`, `step-banner.test.ts`, `plain-errors.test.ts`, `seo.test.ts`, `release-0-2-2.test.ts`; mutations in `tools/mutations/` (named in each file's first line). Updated for the new wording: `screens`, `wp07-screens`, `wp09-screens`, `shell`.
### Not changed / open
- Audit: pending (two independent audits on the exact head SHA gate every deploy). Rollback id of the previous deploy (live 0.2.1): unknown to this branch, BOSS records it at deploy; the one before it is `706f8e60` (commit 9c57a81).
- `tests/heavy-run.test.ts` "a job that runs too long is killed" fails on Linux on the base too: `tools/heavy-run.mjs` spawns without `detached` so `process.kill(-pid)` kills nothing. Out of this task's files; one-line fix: `detached: process.platform !== "win32"` in its `spawn` call.
- Branch base: the default branch (`claude/master-console-complete-882589`) is still 0.1.1 and does not have PR #2. Merging both lines needs the CHANGELOG, releases.json and `docs/GAME_PAY_CONTRACT.md` conflicts resolved (see 0.2.1 notes).
- The e2e suite of PR #5 clicks buttons by their old words ("Send me a code", "Sign me in"): update its two selectors when it is rebased on this.

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
