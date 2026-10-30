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

Copy and paste, in this order, from a bash window. Nothing here runs by itself. Do each block only after the owner's "go" for this step and a QUIET guard (see above).

**Who gives what.** The owner gives ONE thing: `RESEND_API_KEY` (from the owner's Resend account; only the owner has it). You can make the other two yourself with the repo's own tool in 2.5: `CONSOLE_SIGNING_KEY` (a new Ed25519 key) and `SESSION_PEPPER` (a new random value). The tool shows them once on the screen and saves nothing. Nobody else needs to see them.

**2.0 Get ready** (the console folder, the tests, the tool name for wrangler):

```bash
cd /c/ct/test-sites/console
git status --short            # must print nothing
git checkout claude/master-console-complete-882589
bun test --isolate tests      # must end with: 0 fail
W="node C:/ct/tools/wrangler3/node_modules/wrangler/bin/wrangler.js"
```

**2.1 Make the sign-in database** (the output shows a `database_id`; keep that window open):

```bash
$W d1 create corporate-console
```

**2.2 Put that id into BOTH settings files** (replace `PASTE-THE-ID` with the id printed above):

```bash
ID=PASTE-THE-ID
sed -i "s/REPLACE_AFTER_THE_DATABASE_EXISTS/$ID/" wrangler.toml apps/cron/wrangler.toml
grep -n database_id wrangler.toml apps/cron/wrangler.toml     # both lines must show the id
```

**2.3 Make the tables** (one migration, `migrations/0001_console.sql`). If Step 0 chose prefixed tables, do NOT run 2.1-2.3: point `DB` at the existing database, set `TABLE_PREFIX = "con_"` in BOTH files and run `bun tools/prefix-migration.mjs con_ > .tmp/prefixed.sql` then `$W d1 execute <existing database name> --remote --file=.tmp/prefixed.sql`.

```bash
$W d1 execute corporate-console --remote --file=migrations/0001_console.sql
```

**2.4 Tell the console its own address.** On pages.dev the browser's Origin is `https://corporate-console.pages.dev`; the sign-in service refuses anything else (that is the protection against forged requests). So for THIS step set that address in both files. Step 9 sets it back to `https://console.corporatetambola.com`.

```bash
sed -i 's#CONSOLE_ORIGIN = "https://console.corporatetambola.com"#CONSOLE_ORIGIN = "https://corporate-console.pages.dev"#' wrangler.toml apps/cron/wrangler.toml
grep -n CONSOLE_ORIGIN wrangler.toml apps/cron/wrangler.toml
```

**2.5 Make the two secrets you can make** (copy each line when asked in 2.7; the window then closes and they are gone):

```bash
node tools/deploy/make-secrets.mjs
```

**2.6 Build the console for this address and check the build is fresh** (preview = the pages.dev addresses; the guard prints STALE if anything changed after the build):

```bash
node tools/deploy/stamp-release.mjs     # the release time becomes NOW, so every screen shows the true date and time (IST) of this release
git add releases.json && git commit -m "Release stamp for the deploy"   # commit nothing else after this
node build.mjs --env preview           # stamps the real git commit into version.json (never a placeholder)
node tools/deploy/check-dist.mjs --deploy   # must print: dist/ is fresh and carries the version (commit = the one checked out, release time = today)
```

**2.7 Make the Pages project, set the three secrets by name, deploy:**

```bash
$W pages project create corporate-console --production-branch main
$W pages secret put CONSOLE_SIGNING_KEY --project-name corporate-console     # paste the value from 2.5
$W pages secret put SESSION_PEPPER --project-name corporate-console          # paste the value from 2.5
$W pages secret put RESEND_API_KEY --project-name corporate-console          # the owner's key
node tools/deploy/check-dist.mjs --deploy
$W pages deploy dist --project-name corporate-console --branch main --commit-dirty=true
```

**2.8 The daily clean-up Worker** (optional: if the Cloudflare token cannot deploy Workers, skip it; the console's own pages then do the same clean-up themselves, once a day, in the background, when the console is opened or a code is asked for: old codes, sessions and counters, and the 365-day e-mail rule, 20 e-mails per day at most) (it needs the SAME signing key and pepper as 2.7, so paste the same two values again):

```bash
cd apps/cron
$W deploy
$W secret put CONSOLE_SIGNING_KEY
$W secret put SESSION_PEPPER
cd ../..
```

**2.9 First sign-in on a COPY with `TEST_MODE=1`**: in the Pages project settings add the plain variable `TEST_MODE` = `1`, sign in with `demo1@xyz.in`, code `123456` (no e-mail is sent), then delete `TEST_MODE` again and sign in with a real address.

Verify: `https://corporate-console.pages.dev/` shows the sign-in screen, the Corporate Games bar and the version line ("Version 0.1.0, released ... IST"); `https://corporate-console.pages.dev/version.json` carries `version`, `releasedAt` and `releasedAtIST`; `/auth/me` answers `{"ok":true,"signedIn":false}`; the response headers carry the Content-Security-Policy and `frame-ancestors 'none'`; a real sign-in code arrives by e-mail. Rollback: unlink the project's domain, `$W pages project delete corporate-console` and `$W delete --name corporate-console-cron` if nothing else uses them, and put `CONSOLE_ORIGIN` back with `git checkout wrangler.toml apps/cron/wrangler.toml` (the database can stay: it holds only sign-in codes and sessions).

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
