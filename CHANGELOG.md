# Changelog: Corporate Games master console

Reconstructed on 20 Nov 2026 from git history, tags and the live `/version.json` (https://console.corporatetambola.com/version.json). Before this file there was no changelog and no version policy; entries below the live one are approximate (dates from tags and commits). Unknown values are written "unknown", not guessed. From now on follow the standard: marketing-ledger plans/VERSION-AND-KNOWLEDGE-STANDARD-2026-11-20.md section 2.2 (newest first; Added/Changed/Fixed; what, where, PR, two audit PASS ids, rollback id).

## Live now
Version 0.1.0; commit `9c57a8177b07`; built 2026-11-20 12:33 UTC (18:03 IST), env live.

## History (newest first)
- 0.1.0 (live, released 2026-11-20 12:33 UTC = 18:03 IST, build commit 9c57a81 "Release stamp for the deploy", on branch claude/console-game-pay-step-91b60a). Added: the pay step (step 6) for all six games through Moneypenny, per the suite rules v1.1. Where: console pay-step screens and functions on that branch (see its docs/STATE.md; commit 1015205, docs 2db8168, audited 3173ba7: both audits reported PASS by the owning session). Rollback id of the previous deploy: unknown.
- 2026-11-14: docs/knowledge map (#1) (this branch's head).
- 2026-11-01 tags: console-release-2026-11-01 (128e17b), console-private-2026-11-01 (2b151ce). Added: six games in the list incl. Luck by Chance, Lucky Draw, Snakes; owner funnel page /owner-funnel/ (e73f597).
- 2026-10-31: games chooser /games/, funnel statistics (3449246), roles from the vendored core, control room Start/Pause/Resume, end-of-game PDF report (397303b). Rollback target recorded then: Pages deployment ddf54f7a (docs/RELEASE_RECIPE.md). Tag console-release-2026-10-31 (0508b1b).
- 2026-10-30: Email ID case-insensitive, uniform employee ID cleaner, test addresses demoN@demo-test.invalid, release stamps.
