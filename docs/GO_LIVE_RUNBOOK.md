# Go-live runbook for the master console (draft 1, 27 October 2026)

For the owner. Plain words. NOTHING here has been done. Every step below needs the owner's explicit "go" (decision D20), one step at a time. No step may touch a game that is being played or starts within the hour. No secret value is ever written in a repository or in this file: secrets are typed by the owner into the Cloudflare tools, only their NAMES are listed.

Before every step run the guard (it must print QUIET):

```bash
node tools/deploy/guard.mjs
```

Until the bridge is switched on in all six games the guard says "could not be asked" for the dark ones; for those use `python -I -X utf8 C:\ct\test-sites\tools\live_games_now_game.py <database id> 6` (it must print 0 games).

Tools: the console repo is `C:\ct\test-sites\console`; each game's console branch lives in `C:\ct\test-sites\<game>-console` (branch `console/bridge`). `wrangler` is `node C:\ct\tools\wrangler3\node_modules\wrangler\bin\wrangler.js`.

## Step 0. Questions the owner answers first (nothing is built on a guess)

- **Prices.** The new price list (Rs 1,493 to Rs 29,477) is lower than today's prices (Rs 2,399 to Rs 29,499) and adds a 50-person size. Do the games switch to it? Until you say yes no price changes anywhere.
- **Cloudflare plan.** The account holds 10 of 10 free databases. Is the account on the paid Workers plan? (The console and Lucky Draw need 2 more.)
- **US dollar prices** for the new list, and whether GST is shown or added.
- **Lawyer:** the privacy-strip wording and whether a seat number kept 365 days is personal data.

Verify: the owner's four answers are written in `CONSOLE_DECISIONS.md`. Rollback: nothing was done.

## Step 1. IT Services first (additive)

Branch `console/lucky-draw-origin` in `C:\ct\itservices-console` (commit de6048d): lets `lucky.corporatetambola.com` open and frame the payment window, registers Lucky Draw's site and product (no prices). Prices and the 50-person plans are added in a later migration after Step 0.

1. Apply `migrations/0014_lucky_draw_site.sql` to the IT Services database (the owner's usual way).
2. `python build.py`, then deploy `dist` to the Pages project `itservices-rajat-agarwal` (same command as the last deploy).
3. The owner sets the site key for Lucky Draw with `scripts/setup-central.mjs` (the key is shown once and never saved in a repository).

Verify: `https://itservices-rajat-agarwal.pages.dev/payframe/pay.js` contains `lucky.corporatetambola.com`; an old game's test payment still opens and completes. Rollback: redeploy the previous Pages deployment (the migration only adds rows and can stay).

## Step 2. Each game, one at a time, bridge DARK (order: Bingo, Tic Tac Toe, Snakes and Ladders, Luck by Chance, Tambola last)

For one game at a time, after "go" from the owner and a QUIET guard:

1. In the game's console worktree run its full test suite and the break-it checks (all must be green / RED as designed).
2. Merge `console/bridge` into the game's master (owner's go), build, apply migration (`0029_game_role.sql`, or `0030` for Tic Tac Toe; optional because the game creates the tables itself), deploy with the game's usual script (`tools\deploy_game_live.ps1 -Game <dir> -Project <pages project>`).
3. Smoke: `node tools/deploy/smoke.mjs --game <id> --expect-commit <commit>`; then `curl -s -o /dev/null -w "%{http_code}" https://<game address>/api/console/capabilities` must print **404** (the bridge is dark).

Verify: version.json shows the new commit; the dark address prints 404; the game's own live smoke script passes. Rollback: redeploy the game's previous Pages deployment; stop; do not do the next game.

## Step 3. Lucky Draw (after it is built)

New Pages project `corporate-lucky-draw`, its own new database `corporate-lucky-draw`, address `lucky.corporatetambola.com`. Needs Step 0 (database count). Verify: `/version.json` answers; dark address prints 404. Rollback: the console tile stays "coming soon"; nothing depends on it.

## Step 4. The console on its own pages.dev address only

1. Create the database `corporate-console` (`wrangler d1 create corporate-console`), apply `migrations/0001_console.sql`.
2. Create the Pages project `corporate-console`; build with `node build.mjs --env preview`; deploy `dist`.
3. The owner sets the three secrets by NAME in the Pages project settings: `RESEND_API_KEY`, `CONSOLE_SIGNING_KEY` (a new Ed25519 key made by `bun -e` helper in the console repo), `SESSION_PEPPER`; plain settings from `wrangler.toml`.
4. Deploy the cron Worker `corporate-console-cron` from `apps/cron` (daily purge).
5. TEST mode first: set `TEST_MODE=1` on a COPY only; sign in with `demo1@xyz.in` code `123456`.

Verify: `https://corporate-console.pages.dev/` loads; `/auth/me` answers `{"signedIn":false}`; response headers contain the Content-Security-Policy and `frame-ancestors 'none'`. Rollback: delete nothing; unlink the project domain.

## Step 5. Switch the bridge on, ONE game first (Bingo)

Set `CONSOLE_PUBKEYS` = `k1:<console public key>` as a plain setting on Bingo only. Test create, publish, test payment, log, preview with two e-mail addresses the owner controls. Then the other games one by one; Tambola last of the five.

Verify: `/api/console/capabilities` prints the game's name and version. Rollback: remove `CONSOLE_PUBKEYS` from that game: the address answers 404 again, the game is unaffected.

## Step 6. Custom domain `console.corporatetambola.com`

Attach the domain to the Pages project; check on a real phone that the app installs; test the Host and Co-host invitations with two real addresses.

Verify: `https://console.corporatetambola.com/` shows the sign-in screen with the privacy strip; the install prompt appears on the phone; both invitation mails arrive and Accept works. Rollback: detach the domain.

## Step 7. The Tambola move to `housie.corporatetambola.com` (riskiest, last, quiet hour, no game booked that day)

As written in the build plan (Deploy order, Step 6): add housie. to Tambola's Pages project and verify; deploy the housie links; attach the bare address and www to the showcase with the redirect and proxy live in the same minute; check five old links and that a seated participant keeps the seat; reconcile payments before and after.

Verify: each of the five old links (personal, host, big screen, sign-in, pay) opens the same page on housie.; a seated participant still has the seat; the payment ledger has no paid-but-unfulfilled order. Rollback: re-attach the bare address to Tambola's project and redeploy Tambola's previous deployment.

## Step 8. After one quiet week

Switch on the per-game screens (Host / Co-host screens, log tab, upgrade button, participant invitations). Rollback: per-feature switch. At +90 days check the old-link proxy hit log; at +365 days watch the first e-mail purge.
