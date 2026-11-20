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
