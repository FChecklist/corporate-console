# Knowledge: Corporate Games master console (corporate-console)

Written 20 Nov 2026, updated 21 Nov 2026 for version 0.2.2, for a future AI session that has never seen this repo (standard: marketing-ledger plans/VERSION-AND-KNOWLEDGE-STANDARD-2026-11-20.md). It describes the CURRENT state only, from the code and existing docs. Anything not found is marked "unknown". Do not publish this file on the website.

## 1. What this is
One sign-in, six games, billing. The organizer/host website: set up, invite, pay, approve, monitor. Plain static pages plus a small sign-in service on Cloudflare Pages. Also holds the test tools shared by every game repo.
- Live site: https://console.corporatetambola.com (Cloudflare Pages project `corporate-console`). Live version (owner, 21 Nov 2026): **0.2.1** (PR #2). This branch is **0.2.2** (not deployed). Read `/version.json` on the site for the truth; it now also carries `product` and `changes`.
- Other repos and what they are for: `KNOWLEDGE-MAP.md` in the repo root.

## 2. How it connects
Players and organizers reach the suite like this: home.corporatetambola.com (login gate) -> console.corporatetambola.com (set up, invite, pay) -> moneypenny.corporatetambola.com (credits; the single payment gate) -> IT Services by Rajat Agarwal -> Razorpay. Each game is its own website and takes settings from the console by API; a game calls ONLY Moneypenny for payment, never IT Services or Razorpay. The console-to-game contract is `docs/CONTRACT_V1.md` and `contract/` in corporate-console; the pay contract is `GAME_PAY_CONTRACT.md` (in the console pay-step branch: unknown on the default branch). Moneypenny chat: moneypennychat.corporatetambola.com.

## 2a. What 0.2.2 added (21 Nov 2026) and where it lives
- **Cookie banner**: `public/core/consent.js` (rules and banner), `consent.css`, `page-consent.js` (for pages that are not the app; the app starts it in `boot.js`). Stores nothing before an answer; the answer is the cookie `cg_consent` (`v1.needed` or `v1.prefs`, 180 days). Global Privacy Control and Do Not Track always mean "only what is needed". The optional things it governs are `cg-email` (sign-in screen fills in the e-mail) and `cg-design` (layout choice). Any new thing kept in the browser MUST go through `keepOptional` / `readOptional` and be added to `OPTIONAL_KEYS`, or it breaks the promise on the banner (a test reads boot.js for stray `localStorage.setItem`).
- **Step banner**: `public/core/steps.js`. Six steps = the game setup screen's steps (`packages/game-pack/zc-flow.js` `STEPS`; a test keeps them equal). `stepsFor(status)` says where a game is; a draft claims nothing done.
- **Plain errors**: `public/core/errors.js` (`HELP_EMAIL`, `notOpenYet`) and a test (`tests/plain-errors.test.ts`) that reads every console file: an error sentence must say what to do next; no "I / me / my" (only the menu label "My games"); no "we / our / us".
- **SEO and AI search**: `seo.mjs` (page list, head block, JSON-LD, robots, sitemap, llms.txt, /changes page) called by `build.mjs`. Every page in `public/` that has a public or private role has a `<!--seo-->` marker in its head; a page without it stops the build. Only a live build says index; the pages.dev build says noindex and `Disallow: /`. Indexed: `/`, `/games/`, `/changes`. Not indexed: sign-in link page, payee page, owner page, `/auth`, `/pay`, `/report`, `/stats`. Training crawlers are told no in robots.txt (list `TRAINING_BOTS`).
- **/changes**: built from `releases.json`; each row needs a `userNote` (plain words, no security or internal detail). The technical `note` never shows.
- **Footer standard**: `public/core/version.js` + `footer.css`: line 1 "Version X, released ...", line 2 `vX.Y.Z: what's new` (to /changes), Cookie choices, help address.

## 3. Map of folders and the files that matter
public/ (the pages: index.html, signin.html and the screens), functions/ (auth, report, stats, _lib: Cloudflare Pages Functions), migrations/ (0001_console, 0002_report_hold, 0003_funnel_hit), packages/bridge (the one bridge module copied byte for byte into every game), packages/game-pack (shared game setup pack), packages/report (end-of-game PDF report), contract/ and docs/CONTRACT_V1.md (frozen console-game contract), config/games.json, tools/ (falsify-run, heavy-run, baseline, deploy, game-port, fake-game, prices), tests/, vendor/ (vendored corporate-game-core, pinned 0.1.0), build.mjs, releases.json.

Files that matter: build.mjs; seo.mjs; chooser.mjs; releases.json; config/games.json; docs/CONTRACT_V1.md; docs/CONTROL_CONTRACT.md; docs/STATE.md; docs/RELEASE_RECIPE.md; docs/GO_LIVE_RUNBOOK.md; packages/bridge; functions/auth; functions/report.

## 4. Rules in force
- Suite rules version 1.1 (20 Nov 2026): `docs/SUITE_RULES.md` (on branch docs/suite-rules-v1-1-2026-11-20 until merged); source in the ledger `plans/SUITE-RULES-VERSION-2026-11-20.md`.
- One login (home), one console, one credit/payment system (Moneypenny), one chatbot system; no game or console has its own login, payment or chat; pay only via Moneypenny.
- Invite by ID only: one alphanumeric ID field, no names or personal details; strip every non-alphanumeric and uppercase before matching; not-on-list people need organizer/host approval; optional family invites (default 4) with approval.
- Console voice = "you", polite, simple English; privacy line "designed to follow US privacy laws, EU GDPR and India's DPDP"; all participant information including IDs deleted within 24 hours after the game; billing line only "We keep billing data for audit and tax reasons."
- Fairness wording: "No one knows the next number: not the organizer, not the host, not even the software." Prices with the rupee sign. Prizes: "You (the company) give the prizes directly to the winners."
- Do not claim "100% secure", "most secure gateway", "played by major companies".

## 5. How to run the tests
`bun test --isolate tests`; `node tools/falsify-run.mjs` (breaks the code on purpose; every case must go red). Heavy runs: `node tools/heavy-run.mjs -- <command>` takes the heavy lock.
Typecheck: there is no tsconfig in the repo; `npx tsc --noEmit` with strict mode over `functions/` and `packages/` is clean (0 errors); the tests folder has older type errors (83 before 0.2.2, unchanged after). Known failing test on Linux: `tests/heavy-run.test.ts` "a job that runs too long is killed" (tools/heavy-run.mjs spawns without `detached`; one-line fix noted in CHANGELOG 0.2.2).
RAM on the owner's laptop is tight: no full builds or browsers without the heavy lock (C:/ct/HEAVY_JOB_PROTOCOL.md).

## 6. Deploy and roll back
docs/RELEASE_RECIPE.md: stamp, releases.json last, build, check-dist, deploy to Cloudflare Pages project corporate-console. Rollback: Pages keeps every deployment; id ddf54f7a was the rollback target recorded on 31 Oct 2026. The live deploy is 0.2.1; its deployment id and the one before it: unknown here (BOSS records them; the older rollback ids in CHANGELOG are `706f8e60` and `7489a57e-72a7-4a35-b7b5-3e4b824cf23c`). The 0.2.x line is branch claude/console-game-pay-step-91b60a (PR #2 merged there); the repo default branch claude/master-console-complete-882589 is still 0.1.1.
Nothing is deployed from a docs-only change. Cloudflare only, no Vercel. Every deploy needs a version bump and a CHANGELOG entry (standard section 1).

## 7. Known issues and open failures
This branch is cut from the 0.2.1 line, not from the repo default branch (which lacks PR #2). Two lines to reconcile before they are one: CHANGELOG, releases.json and docs/GAME_PAY_CONTRACT.md conflict (PR #4, version 0.1.1). The pay flag `PAY_VIA_MONEYPENNY` is OFF; no money moves. Audits of 0.2.2: pending. PR #5 (e2e) clicks "Send me a code" and "Sign me in", which are now "Get your code" and "Sign in". Smoke failure map: `docs/SMOKE-20NOV-CONSOLE.md`.

## 8. Owner-only steps still open
Secrets and keys are the owner's (names only in config/SECRETS_NAMES.md where present). Deploy, domain, payment live mode and the Rs 1 payment test are the owner's decisions via BOSS. Versioning: `version.json` now has `product` and `changes`, the footer shows `vX.Y.Z` linked to /changes, and /changes exists (0.2.2); every deploy still bumps the version and adds a CHANGELOG entry with two audit PASS ids and the previous deploy's rollback id.
