# Knowledge: Corporate Games master console (corporate-console)

Written 20 Nov 2026 for a future AI session that has never seen this repo (standard: marketing-ledger plans/VERSION-AND-KNOWLEDGE-STANDARD-2026-11-20.md). It describes the CURRENT state only, from the code and existing docs. Anything not found is marked "unknown". Do not publish this file on the website.

## 1. What this is
One sign-in, six games, billing. The organizer/host website: set up, invite, pay, approve, monitor. Plain static pages plus a small sign-in service on Cloudflare Pages. Also holds the test tools shared by every game repo.
- Live site: https://console.corporatetambola.com (Cloudflare Pages project `corporate-console`). Live version now (from `/version.json`, read 20 Nov 2026): **0.1.0**, commit `9c57a8177b07`, built 2026-11-20 12:33 UTC (18:03 IST), env live.
- Other repos and what they are for: `KNOWLEDGE-MAP.md` in the repo root.

## 2. How it connects
Players and organizers reach the suite like this: home.corporatetambola.com (login gate) -> console.corporatetambola.com (set up, invite, pay) -> moneypenny.corporatetambola.com (credits; the single payment gate) -> IT Services by Rajat Agarwal -> Razorpay. Each game is its own website and takes settings from the console by API; a game calls ONLY Moneypenny for payment, never IT Services or Razorpay. The console-to-game contract is `docs/CONTRACT_V1.md` and `contract/` in corporate-console; the pay contract is `GAME_PAY_CONTRACT.md` (in the console pay-step branch: unknown on the default branch). Moneypenny chat: moneypennychat.corporatetambola.com.

## 3. Map of folders and the files that matter
public/ (the pages: index.html, signin.html and the screens), functions/ (auth, report, stats, _lib: Cloudflare Pages Functions), migrations/ (0001_console, 0002_report_hold, 0003_funnel_hit), packages/bridge (the one bridge module copied byte for byte into every game), packages/game-pack (shared game setup pack), packages/report (end-of-game PDF report), contract/ and docs/CONTRACT_V1.md (frozen console-game contract), config/games.json, tools/ (falsify-run, heavy-run, baseline, deploy, game-port, fake-game, prices), tests/, vendor/ (vendored corporate-game-core, pinned 0.1.0), build.mjs, releases.json.

Files that matter: build.mjs; releases.json; config/games.json; docs/CONTRACT_V1.md; docs/CONTROL_CONTRACT.md; docs/STATE.md; docs/RELEASE_RECIPE.md; docs/GO_LIVE_RUNBOOK.md; packages/bridge; functions/auth; functions/report.

## 4. Rules in force
- Suite rules version 1.1 (20 Nov 2026): `docs/SUITE_RULES.md` (on branch docs/suite-rules-v1-1-2026-11-20 until merged); source in the ledger `plans/SUITE-RULES-VERSION-2026-11-20.md`.
- One login (home), one console, one credit/payment system (Moneypenny), one chatbot system; no game or console has its own login, payment or chat; pay only via Moneypenny.
- Invite by ID only: one alphanumeric ID field, no names or personal details; strip every non-alphanumeric and uppercase before matching; not-on-list people need organizer/host approval; optional family invites (default 4) with approval.
- Console voice = "you", polite, simple English; privacy line "designed to follow US privacy laws, EU GDPR and India's DPDP"; all participant information including IDs deleted within 24 hours after the game; billing line only "We keep billing data for audit and tax reasons."
- Fairness wording: "No one knows the next number: not the organizer, not the host, not even the software." Prices with the rupee sign. Prizes: "You (the company) give the prizes directly to the winners."
- Do not claim "100% secure", "most secure gateway", "played by major companies".

## 5. How to run the tests
`bun test --isolate tests`; `node tools/falsify-run.mjs` (breaks the code on purpose; every case must go red). Heavy runs: `node tools/heavy-run.mjs -- <command>` takes the heavy lock.
RAM on the owner's laptop is tight: no full builds or browsers without the heavy lock (C:/ct/HEAVY_JOB_PROTOCOL.md).

## 6. Deploy and roll back
docs/RELEASE_RECIPE.md: stamp, releases.json last, build, check-dist, deploy to Cloudflare Pages project corporate-console. Rollback: Pages keeps every deployment; id ddf54f7a was the rollback target recorded on 31 Oct 2026. The current live deploy (0.1.0, 20 Nov) previous-deploy id: unknown. The pay step for all six games is on branch claude/console-game-pay-step-91b60a (live build commit 9c57a81 is on that branch, NOT on this default branch).
Nothing is deployed from a docs-only change. Cloudflare only, no Vercel. Every deploy needs a version bump and a CHANGELOG entry (standard section 1).

## 7. Known issues and open failures
This PR is cut from claude/master-console-complete-882589 (the repo default); the live 0.1.0 build comes from claude/console-game-pay-step-91b60a, so the code described in docs/STATE.md of this branch is older than live. Pay-step audits were reported PASS by the owning session (commit 3173ba7). Smoke failure map: unknown.

## 8. Owner-only steps still open
Secrets and keys are the owner's (names only in config/SECRETS_NAMES.md where present). Deploy, domain, payment live mode and the Rs 1 payment test are the owner's decisions via BOSS. Versioning work still to do in this repo: `docs/VERSIONING-TODO.md`.
