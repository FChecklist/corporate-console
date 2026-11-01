# Funnel statistics (all sites into the console)
Every game site and the home page report steps with `makeReporter` of corporate-game-core `funnel.ts` (events: viewed, size_chosen, signup_started, game_created, game_published, payment_page_reached, payment_page_opened, payment_link_copied, payment_started, payment_succeeded, payment_failed, game_started, game_completed). Global Privacy Control is respected by the reporter itself.

- **Send:** `POST https://<console>/stats/e` with the JSON the reporter makes (`{event, at, visit, game, size?, mode?}`). The console accepts it from the six game origins, the console and the home page only (CORS), answers 202, and keeps one row per visit, day, game and step. A repeat is ignored. Nothing personal is stored: no address, no IP, no cookie.
- **Read (owner only):** `GET /stats/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` (JSON, visits per step per game) and `GET /stats/csv` (day,game,event,visits). Header `x-owner-key: <STATS_OWNER_KEY>`. Days are IST days; the default range is the last 30 days. Wrong or missing key: 401.
- **Keep:** 400 days, then rows are deleted.
- **Chooser:** `/games/` is the public games page (live games, one Create a game button each into the console create screen with that game marked, and an Open button to the game's own site). The home page links to it. `/robots.txt` and `/sitemap.xml` are built from `config/games.json`.

## The owner page: `/owner-funnel/`
Owner key only (`STATS_OWNER_KEY`, typed into the page, never stored). Shows, per game, the 13 steps in total and day by day, and a CSV download (`/stats/games` JSON, `/stats/games.csv`). For each game the console reads the game's own `GET <game>/api/owner/funnel?from&to` (header `x-organizer: <key from FUNNEL_KEYS>`) when the game has the route (Tambola 35efebd), reading `total` and `days` and the short payment names (`pay_started` is read as `payment_started`). Without a key or route it shows the steps the sites posted to `/stats/e`, and if there are none, "Not connected yet".

## Visitor statistics (visit level), added 1 Nov 2026
Switched OFF until the owner sets `VISITS_ON=1` in the Pages settings. Migration 0004 (the table is also made on first use). The 13 funnel steps stay with `makeReporter`; this adds page views, path sequence, referrer host, utm, time on page, scroll depth, presses, shares, copies, device, browser, language and country (from the edge header). No cookie, no IP, no personal details: a path loses its query, e-mail-like text and long numbers are refused. Global Privacy Control, Do Not Track and `x-test-run` traffic are answered but not counted. Rows are kept 400 days (not participant data).

**Snippet for the home site, every game site and the console** (add before `</body>`; the site's content-security-policy needs `https://console.corporatetambola.com` in `script-src` and `connect-src`):

    <script src="https://console.corporatetambola.com/core/reporter.js" data-game="bingo" defer></script>

`data-game` is the game id (`tambola`, `bingo`, `tictactoe`, `snakesladders`, `luckbychance`, `luckydraw`) or `home`. Optional: `data-track="label"` on a button names it; `data-share` marks a share button.

Owner reads: page `/owner-visits/` (key typed in the page), or `GET /stats/visits` and `/stats/visits.csv?from=&to=` with header `x-owner-key`.
