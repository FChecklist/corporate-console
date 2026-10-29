# Go-live runbook for the master console (draft 2, 29 October 2026)

For the owner. Plain words. NOTHING here has been done. Every step below needs the owner's explicit "go" (decision D20), one step at a time, and none may be done while a game is being played or starts within the hour. No secret value is ever written in a repository or in this file: secrets are typed by the owner into the Cloudflare tools, only their NAMES are listed.

Order (spec 100, section 5.6, wave 4): the console on its own pages.dev address first, then the games one at a time with the bridge switched on (Bingo, Tic Tac Toe, Snakes and Ladders, Luck by Chance), Tambola LAST and only its dark bridge, then the custom address. No other site links to `console.corporatetambola.com` until the last step is done.

Before EVERY step run the guard (it must print QUIET), and for any game whose bridge is still dark also the older check:

```bash
node tools/deploy/guard.mjs
python3 -I C:\ct\test-sites\tools\live_games_now.py 3
```

The second line must print 0. Until the bridge is on in a game, the guard says "could not be asked" for that game: that is correct (it fails closed), use the second line for it.

Tools: the console repo is `C:\ct\test-sites\console`; each game's console branch lives in its own folder (`C:\ct\test-sites\<game>-console`). `wrangler` is `node C:\ct\tools\wrangler3\node_modules\wrangler\bin\wrangler.js`. To switch one game's bridge off again at any time: `node tools/deploy/rollback.mjs --config <copy of that game's settings file>` (dry run; add `--write` to make the changed copy), then redeploy that game's PREVIOUS build.

## Step 0. Questions the owner answers first (nothing is built on a guess)

- **Where the sign-in data lives.** Own small database `corporate-console` (the account is on Workers Paid; confirm it adds no cost) or the same four tables inside an existing database under a prefix (`TABLE_PREFIX = "con_"`, one line in two settings files). Recommendation: own database after the cost check.
- **Free demo size** for every game: 10 people at Rs 0 (three games already do this; the console file says 5 for three games).
- **Terms for accounts made in the console:** may its one tick stand for each game's Terms box?
- **Lawyer:** the privacy-strip wording and whether a seat number kept 365 days is personal data.
- **Prices:** nothing to decide. The console shows today's prices only (Rs 2,399 to Rs 29,499, US$ 34 to US$ 421, no GST). No game's price changes.

Verify: the owner's answers are written in `docs/CONSOLE_DECISIONS.md`. Rollback: nothing was done.

## Step 1. IT Services first (additive)

Branch `console/lucky-draw-origin` in `C:\ct\itservices-console` (commit de6048d): lets `lucky.corporatetambola.com` open and frame the payment window and registers Lucky Draw's site and product. It adds no price (Lucky Draw is a quiet "Tell us you want it" tile until it is built).

1. Apply `migrations/0014_lucky_draw_site.sql` to the IT Services database (the owner's usual way).
2. `python build.py`, then deploy `dist` to the Pages project `itservices-rajat-agarwal` (same command as the last deploy).
3. The owner sets the site key for Lucky Draw with `scripts/setup-central.mjs` (shown once, never saved in a repository).

Verify: `https://itservices-rajat-agarwal.pages.dev/payframe/pay.js` contains `lucky.corporatetambola.com`; an old game's test payment still opens and completes. Rollback: redeploy the previous Pages deployment (the migration only adds rows and can stay).

## Step 2. The console on its own pages.dev address (no custom address yet)

1. Create the sign-in database: `wrangler d1 create corporate-console`, put its id into `wrangler.toml` and `apps/cron/wrangler.toml`, apply `migrations/0001_console.sql`. (If Step 0 chose prefixed tables: point `DB` at the existing database, set `TABLE_PREFIX = "con_"` in BOTH files, apply the output of `bun tools/prefix-migration.mjs con_`, and create nothing else.)
2. Create the Pages project `corporate-console`; build with `node build.mjs --env preview`; deploy `dist`.
3. The owner sets the three secrets by NAME in the Pages project settings: `RESEND_API_KEY`, `CONSOLE_SIGNING_KEY` (a new Ed25519 key), `SESSION_PEPPER`. Plain settings come from `wrangler.toml`.
4. Deploy the cron Worker `corporate-console-cron` from `apps/cron` (daily clean-up).
5. First on a COPY with `TEST_MODE=1`: sign in with `demo1@xyz.in`, code `123456`. Then remove `TEST_MODE`.

Verify: `https://corporate-console.pages.dev/` shows the sign-in screen and the Corporate Games bar; `/auth/me` answers `{"ok":true,"signedIn":false}`; the response headers carry the Content-Security-Policy and `frame-ancestors 'none'`; a real sign-in code arrives by e-mail. Rollback: unlink the project's domain and disable the cron Worker; nothing else depends on them.

## Step 3. Each game's console work, merged locally and deployed with the bridge DARK (order: Bingo, Tic Tac Toe, Snakes and Ladders, Luck by Chance, Tambola last)

For one game at a time, after "go", a QUIET guard and the game's own work packages (spec 100: edge package, then console page package) being finished:

1. In the game's console worktree run its FULL test suite once and compare with the recorded baseline (all new break-it checks red when broken, green when restored).
2. Merge the console branches into a local release branch of the game (owner's go), build, apply the add-only migrations (check the next free number on the day), deploy with the game's usual script.
3. `node tools/deploy/smoke.mjs --game <id> --expect-commit <commit>`; then `curl -s -o /dev/null -w "%{http_code}" https://<game address>/api/console/capabilities` must print **404** (the bridge is dark).

Verify: version.json shows the new commit; the dark address prints 404; the game's own live smoke script passes. Rollback: redeploy the game's previous Pages deployment; stop; do not do the next game.

## Step 4. Bridge ON for Bingo only (first game)

Set `CONSOLE_PUBKEYS` = `k1:<console public key>` as a plain setting on Bingo only and redeploy. With two e-mail addresses the owner controls, test: sign in, Create (Start a new game opens Bingo's Step 1), My games shows the game, a Host invitation is accepted, Billing, the Player's screen view, Sign out, and the two-account hand-off test (account A cannot open account B's game).

Verify: `/api/console/capabilities` prints the game's name and version; the two-account test passes. Rollback: `node tools/deploy/rollback.mjs --config <copy of Bingo's settings>`, redeploy Bingo's previous build; the address answers 404 again and Bingo is unaffected.

## Step 5. Bridge ON for Tic Tac Toe

Same as Step 4 for Tic Tac Toe, plus: the tournament page opens from the console and the keep-open bar is shown. Verify and Rollback as Step 4 (the game's own address and previous build).

## Step 6. Bridge ON for Snakes and Ladders

Same as Step 4 for Snakes and Ladders, plus: an 11th person on the free 10-person game is refused and the test logins `demo1/2/3@xyz.in` do not work in live mode. Verify and Rollback as Step 4.

## Step 7. Bridge ON for Luck by Chance (only after its Tambola hardening port is live)

Same as Step 4 for Luck by Chance. If the port is not live, this step is skipped and the Luck tile stays; nothing else waits for it. Verify and Rollback as Step 4.

## Step 8. Tambola LAST: the dark bridge only (its own console page is not touched)

After Tambola 1.6.7 and the wording pass are live and the bridge branch has been re-cut from the live commit, with 0 live games and no game booked within 3 hours: deploy the dark bridge, then (a second "go") set `CONSOLE_PUBKEYS`. Check five old participant links, that a seated participant keeps the seat and that the payment ledger has no paid-but-unfulfilled order.

Verify: `/api/console/capabilities` prints the name and version; the five old links open the same pages; the ledger is clean. Rollback: `node tools/deploy/rollback.mjs --config <copy of Tambola's settings>`, then redeploy Tambola's previous deployment (use the deploy script on branch `wip/join-redesign` only).

## Step 9. The custom address `console.corporatetambola.com` (only now may other sites link to it)

Attach the domain to the Pages project; install the app on a real phone; test the Host and Co-host invitations with two real addresses. Then (separately, each its own "go") let the home site and the games link to the console.

Verify: `https://console.corporatetambola.com/` shows the sign-in screen with the privacy strip; the install prompt appears; both invitation mails arrive and Accept works. Rollback: detach the domain and remove the links again (the pages.dev address keeps working).
