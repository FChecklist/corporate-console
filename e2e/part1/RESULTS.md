# Part 1 results: organizer journey, local build

Run of 2026-11-20T17:52:14.308Z against the **local build of this repository** (console + real sign-in service + fake games + test mailbox + payment stand-in). Scenarios: **177** = 158 pass, 0 fail, 19 blocked (cannot be tested from this repository, reason given).

Legend: `pass N` = N scenarios passed; `FAIL a/b` = a of b failed; `(+k blocked)` = k scenarios in that cell cannot run here; `-` = no scenario for that combination.

## Step x permutation table

| # | Step | new | returning | desktop | mobile | slow | refresh | back | expired | dblclick | wrong | badids | fmt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | First-time landing (home + console) | pass 3 (+1 blocked) | - | pass 2 (+1 blocked) | pass 1 | pass 1 | pass 1 | - | - | - | pass 1 | - | - |
| 2 | Console login | pass 3 | - | pass 2 | pass 1 | pass 1 | - | - | pass 1 | pass 2 | pass 6 | - | - |
| 3 | Repeat visit | - | pass 4 | pass 3 | pass 1 | - | pass 1 | pass 1 | - | - | - | - | - |
| 4 | Auto login / session | - | pass 5 | pass 4 | pass 1 | - | - | pass 1 | pass 6 | - | - | - | - |
| 5 | Create game | pass 4 (+1 blocked) | - | pass 3 (+1 blocked) | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | - | - |
| 6 | Manage | pass 1 | pass 5 | pass 5 | pass 1 | pass 1 | pass 1 | pass 1 | - | - | pass 2 | - | - |
| 7 | Edit | - | pass 3 (+1 blocked) | pass 3 (+1 blocked) | - | - | pass 1 | - | - | pass 1 | pass 2 | - | - |
| 8 | Date | blocked | pass 6 | pass 5 (+1 blocked) | pass 1 | - | - | - | - | - | pass 2 | - | - |
| 9 | Options | pass 2 (+1 blocked) | pass 1 | pass 2 (+1 blocked) | pass 1 | - | - | - | - | - | pass 1 | - | - |
| 10 | Upload IDs | blocked | - | pass 3 (+1 blocked) | pass 1 | - | pass 1 | - | - | - | - | pass 4 | - |
| 11 | Publish link | blocked | pass 4 | pass 3 (+1 blocked) | pass 1 | - | pass 1 | - | - | - | pass 2 | - | - |
| 12 | Moneypenny credit | pass 1 (+1 blocked) | pass 2 | pass 2 (+1 blocked) | pass 1 | - | - | - | - | - | pass 1 | - | - |
| 13 | Payment | - | pass 4 (+1 blocked) | pass 3 (+1 blocked) | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 3 | - | - |
| 14 | Payment confirmation | - | pass 2 (+1 blocked) | pass 1 (+1 blocked) | pass 1 | - | pass 1 | - | - | pass 1 | pass 1 | - | - |
| 15 | Start | blocked | pass 3 | pass 2 (+1 blocked) | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 1 | pass 2 | - | - |
| 16 | Play (all 4 start formats) | - | pass 2 | pass 1 | pass 1 | - | - | - | - | - | - | - | pass 12 (+4 blocked) |
| 17 | Complete | - | pass 3 (+1 blocked) | pass 2 (+1 blocked) | pass 1 | - | - | - | - | - | pass 2 | - | - |
| 18 | E-mails after each step | pass 1 (+1 blocked) | pass 1 | pass 2 (+1 blocked) | pass 1 | - | - | - | - | - | pass 1 | - | - |
| 19 | Data to organizer | - | pass 2 (+1 blocked) | pass 2 (+1 blocked) | pass 1 | - | - | - | - | - | pass 3 | - | - |
| 20 | Deletion within 24 h | - | pass 4 (+1 blocked) | pass 4 (+1 blocked) | pass 1 | - | pass 1 | - | pass 1 | pass 1 | pass 1 | - | - |

Permutation words: new = first-time organizer (no account, no games), returning = organizer who has signed in before and has games; desktop 1280x800, mobile 390x844 touch; slow = 400 ms delay and 400 kbit/s; refresh = page reloaded mid-step; back = browser Back/Forward; expired = session or code that has run out; dblclick = double click; wrong = wrong or hostile input, game down, bad data; badids = ID list with bad rows; fmt = the four start formats.

## Failures in the last run

None. (Failures found earlier and fixed are listed under Findings.)

## Blocked (cannot be tested from this repository)

| Step | Permutation | What | Why |
|---|---|---|---|
| 1 | new+desktop | home.corporatetambola.com first-time landing | The home site is another repository (corporate-home); this repo has no copy of it. Run against live with E2E_HOME_URL (read-only GET only). |
| 5 | new+desktop | the game's own Step 1 (name, company, size) after the hand-over | Lives in corporate-tambola (and the other game repos). Here the hand-over page is a stand-in; the hand-over itself is tested above. |
| 7 | returning+desktop | editing name, size, people, prizes, brand inside the game | Editing happens on the game's own pages (corporate-tambola etc.), not in the console; the console's only part is the hand-over, tested above. |
| 8 | new+desktop | picking the date and time in the game's wizard (calendar, past dates refused) | The date picker is in the game repository. Here only the display of a date is tested. |
| 9 | new+desktop | setting options in the game (prizes, tickets per person, auto-claim, brand) | Options are chosen on the game's own pages; the console only shows what the game declares (tested above and in the start-format file). |
| 10 | new+desktop | the game's upload screen (file picker, CSV/Excel, size limit, 'download the bad rows') | Lives in each game repo (corporate-tambola etc.). Only the shared ID reader is in this repo and is tested above. |
| 11 | new+desktop | the publish screen itself and the share page (QR code, WhatsApp text, 'Ready' check) | Game repository. The console only hands over and shows the link the game provides. |
| 12 | new+desktop | Moneypenny credit being applied to a price at checkout (credit minus price = amount to pay) | Checkout, the credit maths and Moneypenny live in the game / payment repositories and need the provider; this repo has no Moneypenny code. Only the display of credit is tested here. |
| 13 | returning+desktop | the real payment page (Razorpay via IT Services), card/UPI, failed and retried payments | Never run from here: no real payments. The page is in the game repo; PAY_VIA_MONEYPENNY on/off lives there. Stand-in modes ok / busy / fail are tested above. |
| 14 | returning+desktop | the 'payment received' e-mail and the invoice PDF content | Sent by the game / payment service, not by the console. The stand-in only records that a mail would be sent; the real mail is for the game repo's own run. |
| 15 | new+desktop | auto-start at the scheduled second (the game's own timer) | The timer is the game's; the console shows the result (tested in step 16 by moving the game state). |
| 16 | fmt:auto-start-auto-play | playing the game itself (numbers called, tickets marked, claims, prizes, ties) | Gameplay is in the game repositories (corporate-tambola etc.) with their own engine tests; this repo's stack has no game engine. |
| 16 | fmt:auto-start-manual-play | Host calling numbers by hand | Gameplay is in the game repository. |
| 16 | fmt:manual-start-auto-play | auto number calling after a manual start | Gameplay is in the game repository. |
| 16 | fmt:manual-start-manual-play | manual calling after a manual start | Gameplay is in the game repository. |
| 17 | returning+desktop | the game ending itself (last prize, 'Game over' screen for players) | Game repository. |
| 18 | new+desktop | mails after create, publish, payment, start, finish (invitation, 'game is on', payment received, report) | Sent by the games and the payment service, not by the console. Only sign-in and the end-of-game report are console mails (both tested). The stand-in records the 'payment received' mail but it is not the real one. |
| 19 | returning+desktop | downloading the report PDF from the game within 24 hours, winners list, ID/e-mail export | The download page is in the game repository; the e-mail PDF is built by the console (size checked above) but the stand-in mailbox keeps no attachment for .invalid addresses. |
| 20 | returning+desktop | participant names, e-mails, IDs and mobiles really gone from the game within 24 hours (20 h in code), seen from the organizer's side | Done by each game's own clean-up job against its own database. The console holds no participant data; the due-time rule is checked above. |

## Live run

Not run yet. See `e2e/README.md` for how (read-only steps only; anything that signs in, creates or pays is skipped and flagged `skipped-live`).

## Findings: failure points, root causes, what was changed

### Fixed on this branch (each has a test that was seen red without the fix, green with it)

| # | Step | What failed | Root cause (this repo) | Fix | Test (red before, green after) |
|---|---|---|---|---|---|
| F1 | 13 Payment (also Open, Publish, Control room Open: every hand-over button) | Double-clicking **Pay** (or Open / Publish) asked the game for **two** one-time links. | `openGame()` in `public/screens/ui.js` had no "already working" guard. Only the Create screen's Start button disabled itself. | One hand-over at a time per game + page (a second press of the same button is ignored until the first is done, and for 1.5 s after it moved). A different button is never blocked. | e2e step 13 `dblclick` "double-clicking Pay opens the game once" |
| F2 | 19 Data to organizer | The payments CSV wrote a game name such as `=HYPERLINK("http://evil.example","click")` **raw**. Finance opening the CSV in Excel/Sheets would run it as a formula. The organizer chooses the game name. | `billingCsv()` in `public/screens/billing.js` quoted commas and quotes but did not neutralise a leading `=`, `+`, `-`, `@`, tab or carriage return. | Text cells (game name, what) that start with one of those get a leading `'`. Amount, date, status are unchanged. | e2e step 19 "cannot become a spreadsheet formula" + unit test `tests/csv-formula.test.ts` |
| F3 | 15 Start (same path as every call that needs a key) | When the game did not answer at the moment the console needed a fresh key, the person was told **"Please sign in again."** Signing in again could not help. | `headersFor()` in `public/core/api.js` threw away the reason the key could not be fetched, so every caller reported `no-key`. | The reason is kept: a game that did not answer gives `unreachable` ("The game is slow, try again."); only a real missing key gives `no-key`. | e2e step 15 "the game is down at the moment of Start" |

Unit tests of the repo after the fixes: 430 pass; the one failure (`tests/heavy-run.test.ts`, "a job that runs too long is killed...", 20 s timeout) failed the same way **before** any change on this container and is not caused by this branch.

### Test mistakes found and corrected while writing the suite (not repo bugs)
- Chrome stores a cookie for at most 400 days, so the browser copy of the 5-year session cookie shows about 400 days. The server asks for 5 years and re-sends the cookie on every visit (the code already says so). The test now checks both.
- A `.invalid` address is recorded by the console and, when a test mailer is set, also passed to that mailer. "Never given to the real mail service" is already covered by `tests/mail-test-mode.test.ts`; the e2e check was reduced to what a browser run can see.
- The 365-day clean-up forgets at most 20 e-mails per tick, and a visit by the person themselves counts as activity (their own `/auth/me` kept them). The test ticks until the backlog is empty and does not touch the account first.
- `bad row !!` is a valid ID under the owner's rule (it becomes `BADROW`); the bad-row list now uses rows the rule really refuses (empty, symbols only, 31+ characters, other alphabets' digits, repeats after cleaning).

### Seen but NOT changed (owner's call)
- `tools/browser-tests/console-shell.mjs` (the older Windows browser test) still expects the privacy phrase "100% data deletion of player data", but `public/copy/en.json` now says "Players' personal details are deleted after the game". One of the two is stale. Wording is the owner's, so neither was edited.
- The home site (`home.corporatetambola.com`) and every game's own wizard, upload, payment page, play and e-mails live in other repositories; their steps are `blocked` in the table with the reason. Moneypenny does not exist in this repository: it is a stand-in with three modes (ok / busy / fail) in `e2e/part1/lib/stack.ts`. `PAY_VIA_MONEYPENNY` is not read anywhere in this repo.
- The live sites could not be reached from this cloud session (the network proxy refuses `home.corporatetambola.com`), so the live run is written and its skip logic was checked against a local address, but it has not been run against the real sites.
