# Deploy and roll back the console pay step (Cloudflare Pages only, no Vercel) - 20 Nov 2026

Owner approval (20 Nov 2026, "Approve all"): deploy of the console pay step AND adding the console address to IT Services' allowed sites, **only after two independent audit PASSes on the exact final commit** (see `docs/STATE.md`). Nothing below has been run.

## Before (all must be true)
1. Two independent PASS audits are written in `docs/STATE.md` for the exact commit you are about to deploy (`git rev-parse HEAD`). If the commit moved, the audits no longer count.
2. `bun test --isolate tests` ends with only the two known unrelated failures (stale local `dist/`, Games bar hash).
3. The game side is ready (each game re-vendored, `markPaid`, `payGame`, `consoleOrigin`, `legacyPayRedirect`). Until a game sets `payGame`, its Pay step says "Payment is not set up for this game yet." Deploy the re-vendored pack of a game and open the flag (`PAY_VIA_MONEYPENNY=1`) together: with the flag off the step shows the game's own Pay now link if it has one (it may have none after a re-vendor), so never leave a re-vendored game on a closed flag for long.
4. Moneypenny's game-pay routes are deployed (branch `claude/game-pay-chain-085185`, commit ea2469c or later) and the console address is in IT Services' allowed sites (owner-approved; deployed through IT Services' own deploy, `docs/GO_LIVE_RUNBOOK.md` step 1).

## Deploy (one step, the rest is the existing recipe in `docs/RELEASE_RECIPE.md`)
1. Database: `wrangler d1 execute <console database> --remote --file=migrations/0004_game_pay.sql` (adds `pay_order`; nothing existing is changed).
2. Secrets in the Pages project (names in `config/SECRETS_NAMES.md`): `MNP_URL`, `MNP_KEY`, `MNP_SECRET`, `MNP_WEBHOOK_SECRET`; optional setting `PAYFRAME_ORIGIN` (default the IT Services pages address; keep it equal to `payframeOrigins` in `config/games.json`). Register `https://console.corporatetambola.com/pay/event` as the endpoint for Moneypenny's `game.paid` notice. **Do not set `PAY_VIA_MONEYPENNY` yet**: every `/pay/*` route answers "not open yet" until it is `1`.
3. `node tools/deploy/stamp-release.mjs`, commit `releases.json` last, `node build.mjs --env live`, `node tools/deploy/check-dist.mjs --deploy`, then
   `wrangler pages deploy dist --project-name corporate-console --branch main --commit-dirty=true`.
4. Open: set `PAY_VIA_MONEYPENNY=1` (a setting, no redeploy of code). Verify: `/pay/quote` signed out answers 401 "Please sign in", `/pay/<48 letters and digits>` shows the payee page, a test game shows the Pay step with Moneypenny's own numbers.

## Roll back (fastest first)
1. **Close the step at once, no deploy:** set `PAY_VIA_MONEYPENNY` to `0` (or remove it). Every pay route says "Paying for games is not open yet." Games stay as they are; nothing is lost; open orders stay on record and finish when it is opened again.
2. **Old console build:** Pages dashboard, Deployments, the deployment that was live before (note its id when you deploy), Rollback. The three new tables stay (harmless).
3. **Game side:** `PAY_VIA_CONSOLE` off in a game brings back its older pay screens; `tools/deploy/rollback.mjs` switches a game's console bridge off.
