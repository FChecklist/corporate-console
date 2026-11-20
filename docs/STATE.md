# State of the master console programme (pointer) - updated 29 October 2026

Full hand-overs: `C:\ct\test-sites\handover\2026-10-27\30-console-build-2026-10-27.md` (first build), `100-console-spec-2026-10-29.md` (the spec that wins), `102-master-console-2026-10-29.md` (this completion session).

1. Done locally, nothing deployed, nothing created in Cloudflare: the master console is complete to spec 100 section 5.1 (M1-M8): sign-in, Home (3 doors), My games, Create (5 tiles + a quiet Lucky Draw tile), Billing, Account (Sign out, Close my account), Player's screen view, five-item menu, light and dark, laptop and phone, the shared Corporate Games bar.
2. Decisions applied: today's prices only (one price list); sign-in tables can live in the console's own database or under `TABLE_PREFIX` in an existing one (no database created); origins housie. / home.; nothing links to console.corporatetambola.com until it is live.
3. Contract additions (all optional): hand-off `target: "new"`; `roleId` on an invitation row. The four game bridge worktrees still hold the OLD bridge copy: re-vendor (`node tools/vendor-bridge.mjs --game <worktree>`) in each game's own package.
4. NOT in this repo's scope and still to do (spec 100 wave 2): each game's own console page and edge work (BE/BW, TE0/TE/TW, SE/SW, LK0/LK1/LE/LW, TB0), the shared game pack (C3), Lucky Draw, the cross-game simulations (X1, X3).
5. Go-live is owner-gated: see `docs/GO_LIVE_RUNBOOK.md` (ten steps, each with Verify and Rollback) and the questions in its Step 0.

## Pay step (20 Nov 2026) - built locally, nothing deployed, no money moved
Branch `claude/console-game-pay-step-91b60a`. Full description: `docs/PAY_STEP.md`.
- **Exact commit to audit: `987ef21`** (code and tests; this STATE note is a later docs-only commit). Tests: 463 pass, 2 fail that are not from this work (a stale local `dist/`, and the shared Games bar hash against a newer canonical copy).
- **Audits: 0 of 2 done.** Two independent PASS audits of `987ef21` are requested (auditors, not the builder). No self-certification.
- Built: shared step 6 "Pay" (all six games, config-driven by `payGame`), console `/pay/*` routes over `console-wallet`, signed `paid` notice in the bridge (once per order id), payee link page, `legacyPayRedirect` (302 to the console behind `PAY_VIA_CONSOLE`), local demo, real-flow screenshots in `Corporate-Tambola-Console-Flow-Review\pay-step\`.
- Runs only against a local fake Moneypenny. Moneypenny's per-game routes (`buy_credits` with exact credits and `game_id`, `game.paid` notice, `game_order`) are from the mp-gamepay session and were not there yet.

### Needs owner
1. Wording approval for the pay screen, and the legal word: the privacy note says the games are "designed to follow" US privacy laws, the EU GDPR and India's DPDP (not "comply"). Nothing in code proves compliance. Please have your adviser choose.
2. Go for PAY_VIA_MONEYPENNY=1 and for deploy; the Moneypenny spend key and webhook secret (names in `config/SECRETS_NAMES.md`); DNS check for home. / console. / moneypenny.
3. The Rs 1 live test through IT Services (go-live F5) and the Moneypenny rate and pack decisions (A1 to A3).
4. Decision: Snakes and Ladders has the older 10-step console with its own pay step. It moves onto the shared 6-step flow (game session work).

### Not done here (game repos, separate sessions)
Each game: re-vendor bridge and pack, adapter `markPaid` (unlock start only from it), descriptor `payGame` and `consoleOrigin`, call `legacyPayRedirect`, remove or confirm no own login / payment / chat. Not touched: the Tambola PR 26 files.
