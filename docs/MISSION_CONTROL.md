# Mission Control (step 1: read only)

The owner's control room for Corporate Games. One page, `/owner/` on the master console, that shows how every game and website is doing, and the same facts as JSON for the AI boss at `/api/control/*`.
**Step 1 only reads.** Nothing on the page or in the JSON changes a game, a website, a payment or a setting. The only thing that can be written is one history line, and only by the helper script from a terminal.

## Opening it

1. Go to `https://console.corporatetambola.com/owner/` (the page is `noindex`, and not in any sitemap).
2. Type the **owner password** (the same value as `ORGANIZER_SECRET`, the one the games' own owner pages take). The page keeps it in memory only, sends it in the `x-organizer` header, and forgets it when the tab is closed or "Close and forget the password" is pressed.
3. Anyone without the password (or with the wrong one) gets a plain 404 from `/api/control/*`, exactly like the games' own owner routes. Forty wrong tries in an hour from one address also get a 404 for that address.

## What the tabs show

| Tab | What it shows | Where it comes from |
|---|---|---|
| **Overview** | One traffic-light line per game and per site, with the reason in plain words | live checks of the six games, the home page, the console and the payment site |
| **Games** | Per game: live commit, mode (LIVE or TEST), search-engine rule, errors, health, visits and journeys, funnel, mail events, data requests (counts only), site switch, game records (count and newest only), organizer lookup | the game's `/version.json`, `/api/mode`, `/api/status/health`, `/api/owner/*` |
| **Websites and pages** | Every page of the home site and of each game: status, answer time, and whether the search-engine rule is right (public home indexable, game sites noindex) | live GET of each page |
| **Payments** | Per game: paid, waiting, failed, last receipts, refunds, commission. Test payments (`PAYTEST-...`, `is_test`) are kept apart | each game's ledger (`/api/owner/ledger`); the central ledger when `LEDGER_KEY` is set |
| **Logs and errors** | Errors by hour, mail problems, data requests, per game | `/api/owner/errors`, `/mail-events`, `/data-requests` |
| **Releases and history** | Live version per game and its release notes, Cloudflare Pages deployments with rollback ids (when connected), the release log from the handover, and the append-only history table | `/version.json`, `/api/owner/releases`, Cloudflare API, `config/release-log.json`, D1 table `control_history` |

If a game does not have one of these routes, that panel says **"not available on this game"** and nothing else breaks. On 2 Nov 2026 the live games answered like this: Tambola has no `/api/owner/funnel` and no `/api/owner/game-records`, Lucky Draw has no `/api/owner/funnel`, and the other four have everything.

### The traffic lights

* **Red:** the game does not answer, its health says not ok, a 20-hour deletion is overdue, the site is switched off, errors are at or over the limit, the front page is not 200, or its search-engine rule is wrong.
* **Amber:** some errors, TEST mode, slow (over 3000 ms), version or mode unreadable, or the owner password is not accepted by that game.
* **Green:** none of the above.

## What it never shows or keeps

Mission Control does not show or store any participant's personal details (participant information is deleted within 24 hours). Cities, per-visitor counts, names in notes, card and phone details are dropped on the way in (`scrub` in `functions/_lib/control-core.ts`), data requests are shown as counts, game records as a count and the newest time, and organizer e-mail addresses are masked (`r***@example.com`). A safety net removes anything that still looks like an e-mail address, a phone number or a card number from every answer.

## The AI door (read only)

* Header **`x-control-key`** with the **AI read key** (`AI_CONTROL_KEY`), accepted **only on `/api/control/*` read routes**. It is never sent to a game and it is not accepted on any game's own owner routes (AI work links keep getting 404 there, as before).
* The owner password also works on `/api/control/*`, and is the only thing that can use `POST /api/control/organizer`.
* Everything that is not a plain GET (except the organizer lookup, which only reads) answers 404.

| Call | What it gives |
|---|---|
| `GET /api/control/ping` | who is asking (owner or ai) and the time |
| `GET /api/control/schema` | this list, for the AI to read |
| `GET /api/control/overview` | one traffic-light line per game and site, with the reason |
| `GET /api/control/games` and `?id=<game>` (`/api/control/game?id=bingo`) | the six games; everything one game can tell |
| `GET /api/control/websites` and `?site=<id>` | the sites; a live check of each page of one site |
| `GET /api/control/payments?month=YYYY-MM` | payments per game, test payments apart |
| `GET /api/control/logs` | errors by hour, mail problems, data requests |
| `GET /api/control/releases` | versions, notes, Cloudflare deployments and rollback ids, release log, history |
| `GET /api/control/history?limit=50` | the history table |
| `POST /api/control/organizer` `{game,email}` | owner password only: that organizer's games (read only) |

The work is split into topics because a Cloudflare Pages Function on the free plan may make at most 50 outgoing calls per request. The page calls the topics in parallel.

## Secrets (names only; values are never written in the repository)

| Name | What for | Where it lives |
|---|---|---|
| `ORGANIZER_SECRET` | the owner password; sent to the games' own owner routes as `x-organizer` | `C:\ct\tambola\config\live-secrets.txt` (line `ORGANIZER_SECRET=`) and, once released, a Pages secret of `corporate-console` |
| `AI_CONTROL_KEY` | the AI read key (48 random hex characters), only for `/api/control/*` | `C:\ct\tambola\config\mission-control-keys.txt` (made by `node tools/control-make-key.mjs`, never printed) and a Pages secret |
| `CF_API_TOKEN`, `CF_ACCOUNT_ID` | optional: lets the Releases tab list Cloudflare Pages deployments (GET only). Make a **read-only** token (Pages: Read) | Pages secrets |
| `LEDGER_KEY` | optional: lets the Payments tab read the central ledger on `itservices-rajat-agarwal` (Bearer, GET only) | Pages secret |

Set a Pages secret with `python C:\ct\games-ops\putsecret.py corporate-console <NAME> env:<file>:<KEY>`. It applies only after the next deploy. Without the optional secrets the page says what is missing instead of failing.

## The history table

Migration `migrations/0005_control_history.sql` adds `control_history` to the console's D1 database: `at_ms`, `who` (`owner` or `ai`), `site`, `what`, `result`, and an optional `ref` (a commit or deployment id). The table is **append-only**: database triggers refuse any UPDATE or DELETE. Step 1 shows it (Releases and history tab, `/api/control/history`) and has **no write address**. A line is added from a terminal:

```
node tools/control-history.mjs --who ai --site bingo --what "Released Bingo fc5f01f" --result "live gate 0; version.json matches" --ref fc5f01f
```

Without `--sqlite <file>` or `--remote` the helper only prints the statement. `--remote` writes to the live D1 database through wrangler and is for use once the boss or the owner has said go. The helper refuses text that holds an e-mail address or a run of nine or more digits.

## Looking at it on this laptop

```
node tools/heavy-run.mjs --min-free-mb 700 -- node tools/browser-tests/control-shots.mjs --mode sample --out <folder>
```

`--mode sample` runs the real code against a made-up internet (six fake games in different moods) and takes pictures at laptop and phone width. `--mode real` asks the real sites (GET only). In real mode the password is read from the local secrets file at run time and is never printed or saved; its pictures show real (masked) data, so keep them out of the repository.

Tests: `bun test --isolate tests/control-core.test.ts tests/control-page.test.ts tests/control-tools.test.ts` (run through `tools/heavy-run.mjs`).

## What step 1 cannot show yet

* Cloudflare deployments and rollback ids until a read-only `CF_API_TOKEN` and `CF_ACCOUNT_ID` are set as Pages secrets.
* The central ledger (all games together) until `LEDGER_KEY` is set; the per-game ledgers work without it.
* Anything a game does not offer yet (2 Nov 2026: Tambola has no step counts and no kept-games list; Lucky Draw has no step counts).
* The home site, the console and the payment site get a light check in the overview (the front page, the sitemap or version file, the payment ping), not a deep one.
* No live write of the history table, and no action of any kind.

## Step 2 (not built): AI operating actions, each one written to the history table

1. Site on/off for one game (`POST /api/owner/site` on that game).
2. Mode LIVE/TEST for one game (`/api/owner/mode`).
3. Price coupon on/off (the games' coupon owner route; its exact name is confirmed per game in step 2).
4. Close a data request (`POST /api/owner/data-requests`).
5. Purge test data (`POST /api/owner/purge-test-data`).
6. `POST /api/control/history` so the AI and the owner can write the history line themselves.

Each action would need its own confirmation step, the owner password (or a separate AI action key), a dry run that says what would change, and a history line written before and after.

## Release plan (nothing here has been done)

One site at a time, the console only. Do not start without the boss's go-ahead.

1. Live gate first: `python C:\ct\test-sites\tools\live_games_now.py` — the last line must end `: 0`.
2. Note the console's current deployment id as the **rollback id** (Pages deployment list).
3. Apply migration `0005_control_history.sql` to D1 `corporate-games-master-console` (it only adds a table and two triggers; safe to repeat).
4. Set the Pages secrets `ORGANIZER_SECRET` and `AI_CONTROL_KEY` (and, if wanted, a read-only `CF_API_TOKEN` + `CF_ACCOUNT_ID`, and `LEDGER_KEY`) with `putsecret.py`. Check that setting secrets on this `wrangler.toml`-managed project does not drop its existing variables (the handover warns about the "merge" behaviour) before and after.
5. Full test run (`bun test --isolate`) must be clean. Stamp the release, build, `check-dist`, deploy.
6. After deploy: `version.json` equals the deployed commit; `/owner/` is noindex; `/api/control/ping` without a password answers 404; with the password it answers `{who:"owner"}`.
7. Add the history line with `node tools/control-history.mjs ... --remote`.
8. Rollback: promote the rollback id from step 2.

Base commit for this change is the live console commit `6ef68cd`. The console commit `584cc77` (origin change) is not live; merge or rebase after it is released.
