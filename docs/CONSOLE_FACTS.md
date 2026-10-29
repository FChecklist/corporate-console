# Master console: facts checked in the code (W1, read-only, 27 October 2026)

How this was made: seven readers each read one area of the five game repos and `itservices-site` and cited file and line; a skeptic re-opened the cited lines (all but 4 line numbers in two docs were right). Pinned commits: Tambola `6e0f643` (branch wip/join-redesign), Bingo `bd66d3c`, Tic Tac Toe `045d629` (4 files edited by another session, not committed), Snakes and Ladders `d2a3ebd`, Luck by Chance `b3479c0` (branch local/base-2026-10-24), itservices-site `e9bd2c1`. Line numbers move with every commit, so `tools/facts-check.mjs` checks the file and the symbol, not the line (155 checks, all green).

## 1. In plain words: where the plan was wrong or incomplete

These change the work. Each one names the package that must take it into account.

| # | What the plan said | What the code shows | Effect |
|---|---|---|---|
| 1 | The plan's new price list was an addition | **It would have changed every price of every live game.** All five games and the IT Services catalog charge Rs 2,399 / 3,499 / 4,699 / 5,899 / 7,099 / 11,799 / 17,699 / 29,499 (owner decision 2026-10-09, "ending in 99", no GST). | Resolved 27 Oct 2026 (decision c): today's prices only, one price list. |
| 2 | US$ prices "not defined anywhere" | A US$ price exists for every size in every game (34, 51, 67, 84, 101, 169, 253, 421 for 100 to 10,000). | Kept as they are. |
| 3 | "Cohost path already confines a key to one game" | `can()` never looks at the key's game (`eid`) in any of the five games. Co-hosts are confined route by route; a Host or Organizer key passes `can()` for every game of its organizer. About 34 call sites (Snakes) to 40 (Luck) plus the history route and several allow-lists. | W11 must add the game check inside `can()`, `canAi`, `mayPay` and the history route, and audit every route. The planned test "removing the eid check in can()" has nothing to remove yet. |
| 4 | Keys from `signInResult` can simply be set to 2 hours | `signInResult` mints a key that never expires, with no label and no game (`expires_ms`, `label` and `eid` columns already exist, so no schema change). The Host path copies none of them. | The bridge gets its own mint path (W10/W11). |
| 5 | `POST /api/z/{id}/paylink` leads to the game's pay page | It makes a public 7-day link `/paylink.html?t=...`, refuses games that are already paid (so it cannot be used for upgrades) and records the payer as `link`, not Organizer / Host / Co-host. | W19/W38: upgrades need their own pay route; billing "who paid" needs a rule for `link`. |
| 6 | IT Services plan codes are `<game>_pack_<N>` and an unknown plan is refused | Real codes: Tambola **`pack_<N>`** (no prefix), `bingo_pack_N`, `tictactoe_pack_N`, **`snakes_pack_N`**, **`luck_pack_N`**. `order.js` accepts any plan text up to 60 characters; it does not check the catalog and does not check the amount against a price. Upgrades must not reuse the first payment's reference (their transaction ids would collide). | W22 is rewritten: add rows for `<existing prefix>_pack_50`; if "unknown plan refused" is wanted, that is new code in `order.js`. |
| 7 | "Allow payframe return to housie., console., lucky." | housie. and console. are already allowed (commit 788e279, today). Only **lucky.** is missing, in two places in `build.py` (list at line 271 and frame-ancestors at 321). IT Services has **no return URL** at all: the payment window talks to its parent page by message. | The `?paid=` return is the game's page, not IT Services. W22 shrinks to: lucky. origin, plan rows, a Lucky Draw site row and site key (owner sets), `SITE_CODES` entry. |
| 8 | Add a free-demo cap to four games | Tambola and Bingo **already** have a free 10-person demo (`DEMO_CAP = 10` in `packages/beacon/src/config.ts`; free publish in `worker.ts`; Bingo has `demo10.test.ts`). Tic Tac Toe has `FREE_GAME_CAP = 10`. Snakes and Luck have nothing (Luck's port branch has `FREE_PACK = 10`). | W18/W25/W27/W29/W31: rename or alias `DEMO_CAP` to `FREE_DEMO_CAP`, then set 5 where wanted (TTT 10 to 5 touches `pay.ts:83`, four places in `worker.ts`, `zc.js:135`, two tests). |
| 9 | The cancelled-draft trap is "Bingo's" | Same count query in **all five** games (`clone.ts` and `worker.ts`), none ignores cancelled drafts. In **Luck** the count also still counts published-but-unpaid games (Bingo 1.3.2 fixed that; Luck did not get it). | W18 and each game's parity package fix both sites. |
| 10 | `retentionSweep` / `gamelog.ts` / `/preview` are free names | `retentionSweep` is in `worker.ts` (not `lifecycle.ts`) and does not touch login e-mails at all today. **`gamelog.ts` already exists** (end-of-game summary, route `/api/z/{id}/gamelog`). **`/preview` already exists** ("Test your brand moment"). | W14: use another file name (for example `eventlog.ts`) and say how it relates to `gamelog`. W20: use another path (for example `/screenview`). W16: build the e-mail sweep new. |
| 11 | Tambola origin is housie. | `BRAND.defaultOrigin` is still the bare `corporatetambola.com` (`brand.ts:14`), used by the `www`/`pages.dev` redirect and every mail link. The apex is the address the showcase will take. | W23 order matters: move links to housie. before the showcase takes the apex. Already in the plan; now confirmed. |
| 12 | Audit rows come from "places that already write audit_log" | There is **one** writer (`appendAudit`), fed from the generic request wrapper. There is no per-event hook. | W14 introduces a real `logEvent` call at each event; it cannot piggy-back. |
| 13 | Luck is a normal "port" target | Luck is far behind: no fulfil lease (so no safe upgrades), 23 h / 22 h deletion clock, no `lazyTick`, no `releases.json`, sign-in still mints `ctk_` keys, no device check on game-over. Press window and rounds are chosen on the host page at Start, not at publish, so "More" in the wizard cannot show them without moving them. The state of the live site cannot be read from the repo (`DEPLOYS.md` is stale). | W30/W31 first take the playbook port (branch `origin/port/tambola-2026-10-24`), then the bridge. Read `https://luck.corporatetambola.com/version.json` before starting. |
| 14 | Billing: totals per currency, credit, "who paid" | Credit totals are rupees only (`*_inr` columns, `activeTotalInr`); a dollar credit would not show. `paidby` is one key per game written at publish, not a payment column, so an upgrade has no slot. The credit list route is Organizer / Host only. There is no billing list route in any game. | W19/W41: new server code in every game for per-currency totals and per-payment payer. |
| 15 | Snakes "12 own settings" with defaults | Two real settings are missing from the table (milestone squares, turn limit). "Game ends when N are home" defaults to **5**, not 1; "one prize per person" defaults to **off**, not on. Hiding a setting at a different default changes behaviour. | OPTIONS_TABLES.md to be corrected before W29: use today's code defaults for hidden settings. Retro/Modern is not found in Snakes at all. |
| 16 | Bingo gap default 12 s | `GAPS = [6, 9, 12, 15]` in `worker.ts` (not `config.ts`); the console offers 9 and 12; the UI default is **9**. Tambola already sets 12 through `ONLY_12S`. | W25: make 12 the only choice and the default; games already saved with 6, 9 or 15 keep working. |
| 17 | Test sign-ins exist only in TEST mode | In Snakes the demo logins (`demo1/2/3@xyz.in`, code 123456) work on the live game today, with no test-mode check. | The bridge must never mint a console key from a test login. A test for it goes into W10. |
| 18 | Status words come from `organizerLookup` | `organizerLookup` is an owner-desk tool with its own words (draft, published not paid, paid waiting to start, paid started, not played, ended, cancelled), Organizer's own games only, 200 rows. The history route returns 50 rows and no role or status. | The console needs the new `/api/console/games` route and a mapping (contract v1). |
| 19 | Docs say 23 h in places | `RETENTION.md` is the right one (20 h). Stale 23 h text is in `PRIVACY_AND_LIFECYCLE.md`, `BINGO_SPEC.md`, ROLES specs 2, 3 and 5. Luck's **code** is still 23 h. "Not true yet" lists exist only in Tic Tac Toe and Luck docs. | W51 amends the docs. |
| 20 | Co-host has an e-mail | Doc 10 says yes (decision 1); `ROLES_AND_CONSOLE_SPEC_2` and the code (`credit.ts:46`) say "only Organizer and Host have an e-mail". A Co-host key carries a label and sealed name/number only. | W12: sealed Co-host e-mail needs a retention rule and the old docs need amending. |
| 21 | `/version.json` can just get more fields | It is a **static file written at build** (`pages/version.mjs`), no CORS header, no version number. `releases.json` has no customer notes; Luck has no `releases.json`. | W21: add to the build, plus CORS rule in the `_headers` file; X-Frame-Options is set in two places (`pages/build.mjs` line 26 and `apps/web/public/_headers`) plus CSP `frame-ancestors`. |
| 22 | CORS lines 359 / 425 | One `CORS` constant per game, different line each; allowed headers are `content-type, x-organizer, x-partner, authorization, x-cb-vid, x-cb-vs` (Tambola `x-ct-vid, x-ct-vs`). `x-console`, a step-up header and the device header are not allowed yet, so the browser's preflight would refuse them. | W10/W11: bridge adds its headers to the list. |
| 23 | Migrations 0029 everywhere | Last numbers: Tambola 0028, Bingo 0028 (no 0027), Snakes 0028 (no 0027), TTT 0029, Luck 0027. Tables are also created in code at run time (the D1 token cannot run CREATE TABLE), so every new table is added in **both** places. | W10 gives the SQL once; each game numbers it itself. |
| 24 | "Tambola has 1,000+ tests" | 159 test files (84 in `apps/edge/test`); case count unknown until the baseline run. Bingo 1,928 pass / 1 fail and TTT 1,774 pass / 1 fail were recorded by earlier sessions. The sim matrix is stale (99 of 1,045 fail). | Baselines: see section 5. |

## 2. Confirmed as the plan said

- `POST /api/start` creates an organizer account with **no mailbox proof** (all five).
- Sign-in link: opening it (GET) consumes nothing; a button POSTs (Tambola `worker.ts` auth link route, `signin.js`).
- The join key is `sha256('email|' + trimmed lowercase e-mail)` in all five (plain hash, no salt) — **use exactly `trim().toLowerCase()`**. One other hash (`visits.ts`, an HMAC) must never be used as the join key.
- `FREE_CAP = 100, MAX_DRAFTS = 10` in all five `pay.ts`; `FREE_GAME_CAP` only in Tic Tac Toe.
- `hostForEmail` has `LIMIT 1` in all five (`hostsetup.ts:67`); an e-mail is Organizer of **one** account per game (`organizer_email` primary key).
- `organizer_key` already has `expires_ms`, `label`, `eid`.
- 2-minute fulfil lease exists in Tambola, Bingo, TTT, Snakes (not Luck).
- Invoice routes `/api/invoice/inv_<32hex>`, `.pdf`, `.fragment` exist in all five. `paylink.ts` is byte-identical in all five.
- Deletion: 20 h after the game (`erasePersonal`), whole game record at midnight IST end of day 365 (`fullDeleteAt`); `game_record` kept for ever with no personal data.
- The central payment service works as described (`placeOrder` with direct-Razorpay fallback, one central webhook that passes on to each site's `webhook_url`, payment window `payframe`). `lucky.` and any new site need a site row and key (owner sets, never in a repo).

## 3. Cloudflare

See `CF_SPIKE.md`: Pages projects 10 of 100 (fine). D1 databases **10 of 10 on the free plan**; the console and Lucky Draw need two more. The Bingo release note says the account is on the paid Workers plan; the owner must confirm in the dashboard before the first deploy. Nothing was created.

## 4. Where each bridge point lives (all five games share the layout)

| Point | File | Note |
|---|---|---|
| key check | `apps/edge/src/worker.ts` `authOfKey` | returns `{org, kind, eid}`; expiry already honoured |
| may act | same file, `can`, `canAi`, `mayPay` | no game check today |
| mint a key | same file, `signInResult` (+ `hostsetup.ts` `mintDeviceKey`) | callers: link, verify, test login, Google |
| host lookup | `hostsetup.ts` `hostForEmail` | `LIMIT 1` |
| list | `GET /api/history` | org only, 50 rows |
| money | `pay.ts` (`checkout`, `fulfil`, `fulfilInner`, `placeOrder`), `credit.ts`, `cancel.ts`, `ledgerc.ts` | plan code built at `pay.ts` (`pack_` / `bingo_pack_` / ...) |
| erase | `lifecycle.ts` `erasePersonal` (one batch), `eraseEverything` | trail rows are written just before |
| headers | `pages/build.mjs` (`hdr`, line ~26), `apps/web/public/_headers` | framing exception touches both |
| settings | `apps/web/public/zc.js` (`GROUPS`) and `packages/beacon/src/config.ts` | server validator stays unchanged |

## 5. Baselines (test counts before any change)

See `docs/BASELINES.md` (filled by `tools/baseline.mjs`, run one repo at a time under the heavy lock on a clean copy of each repo's last commit).
