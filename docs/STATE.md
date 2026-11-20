# State of the master console programme (pointer) - updated 29 October 2026

Full hand-overs: `C:\ct\test-sites\handover\2026-10-27\30-console-build-2026-10-27.md` (first build), `100-console-spec-2026-10-29.md` (the spec that wins), `102-master-console-2026-10-29.md` (this completion session).

1. Done locally, nothing deployed, nothing created in Cloudflare: the master console is complete to spec 100 section 5.1 (M1-M8): sign-in, Home (3 doors), My games, Create (5 tiles + a quiet Lucky Draw tile), Billing, Account (Sign out, Close my account), Player's screen view, five-item menu, light and dark, laptop and phone, the shared Corporate Games bar.
2. Decisions applied: today's prices only (one price list); sign-in tables can live in the console's own database or under `TABLE_PREFIX` in an existing one (no database created); origins housie. / home.; nothing links to console.corporatetambola.com until it is live.
3. Contract additions (all optional): hand-off `target: "new"`; `roleId` on an invitation row. The four game bridge worktrees still hold the OLD bridge copy: re-vendor (`node tools/vendor-bridge.mjs --game <worktree>`) in each game's own package.
4. NOT in this repo's scope and still to do (spec 100 wave 2): each game's own console page and edge work (BE/BW, TE0/TE/TW, SE/SW, LK0/LK1/LE/LW, TB0), the shared game pack (C3), Lucky Draw, the cross-game simulations (X1, X3).
5. Go-live is owner-gated: see `docs/GO_LIVE_RUNBOOK.md` (ten steps, each with Verify and Rollback) and the questions in its Step 0.

## Pay step (20 Nov 2026) - built locally, nothing deployed, no money moved
Branch `claude/console-game-pay-step-91b60a`. Full description: `docs/PAY_STEP.md`.
- **Exact commit to audit: `1015205`** (code, tests, demo, deploy note; this STATE edit is a later docs-only commit, `git log` shows it). Tests: 469 pass, 2 fail that are not from this work (a stale local `dist/`, and the shared Games bar hash against a newer canonical copy).
- **Audits: 0 of 2 done.** Two independent PASS audits of `1015205` are requested (auditors, not the builder). No self-certification. Owner approved (20 Nov, "Approve all") deploy to Cloudflare Pages only after two PASSes on the exact final commit: `docs/PAY_STEP_DEPLOY.md` (one-step deploy and rollback, nothing run).
- Built: shared step 6 "Pay" (all six games, config-driven by `payGame`), console `/pay/*` routes over `console-wallet`, signed `paid` notice in the bridge (once per order id), `legacyPayRedirect` (302 to the console behind `PAY_VIA_CONSOLE`), local demo, real-flow screenshots in `Corporate-Tambola-Console-Flow-Review\pay-step\` (the address bar is drawn from the page's own address).
- **Seamless (owner, 20 Nov):** the secure payment window opens on top of the page (a frame, never a new address); the payee link is a console page `/pay/<token>` (no sign-in, only the amount due, same frame); the screen flips itself to Paid (organizer polls the game and the console; payee page polls; a reopened tab shows Paid at once); soft words only (a test keeps "Moneypenny", "API", "IT Services", "Razorpay", "server", "error" out of every message). The e-mail is sealed in the wallet's order rows too.
- **Privacy line (owner-approved 31 Oct, reused):** "No personal details needed. All participant information is deleted within 24 hours of the game." plus "Our games are designed to follow US privacy laws, the EU GDPR and India's DPDP." The e-mailed PDF is not claimed (not built).
- Runs only against a local fake Moneypenny. Moneypenny's game-pay routes are now followed exactly as in its contract (commit ea2469c on `claude/game-pay-chain-085185`): the game id is the order reference, a shortfall buys the smallest listed pack (not the exact gap), the console shows its payment window from `order.payframe` and asks Moneypenny to confirm. Tested only against a fake of those routes; not yet against the real Moneypenny code.

### Needs owner
1. The legal word: the privacy note says the games are "designed to follow" US privacy laws, the EU GDPR and India's DPDP (not "comply"). Nothing in code proves compliance. Please have your adviser confirm; also confirm "No personal details needed" is still true for every game (players join with an Employee ID in some).
2. The secrets (names in `config/SECRETS_NAMES.md`): Moneypenny spend key and webhook secret, and the setting `PAY_VIA_MONEYPENNY=1` when you want paying opened (deploy and the allowed-sites change are already approved, after the audits).
3. Snakes and Ladders has the older 10-step console with its own pay step. It moves onto the shared 6-step flow (game session work); your decision on timing.
4. Check one address: the payment window is allowed from `https://itservices-rajat-agarwal.pages.dev` (from the go-live runbook, `payframeOrigins` in `config/games.json`). Change it there if it is served elsewhere.
5. Money rate and pack decisions on the Moneypenny side (A1 to A3), unchanged.

### Not done here (game repos, separate sessions)
Each game: re-vendor bridge and pack, adapter `markPaid` (unlock start only from it), descriptor `payGame` and `consoleOrigin`, call `legacyPayRedirect`, remove or confirm no own login / payment / chat. Not touched: the Tambola PR 26 files.
