# Master console: decisions sheet (27 October 2026)

One page, plain words. "Decided" means the owner has said so. "Default" means the build goes ahead with this answer until the owner says otherwise. The last column names the work packages (W) that depend on the answer.

## Decided by the owner (27 October 2026)

| # | Question | Answer | Needed by |
|---|---|---|---|
| D1 | Show the participant card "games you are invited to"? | **Yes.** Built only from e-mails the organizer typed on the guest list. Only a code made from the e-mail is kept, and it is erased 20 hours after the game. | W17, W42 |
| D2 | When are login e-mails deleted, and do invoices keep the payer e-mail? | **365 days after the LAST game or sign-in** that e-mail took part in. Invoices keep the payer details because the law requires it. | W9, W16 |
| D3 | US dollar prices and GST | **Open.** Only the rupee ladder is used for now. The dollar price is a clearly marked placeholder (`USD_PRICE_PENDING`) that the owner fills in. No dollar price is invented. | W5, W37, W41 |
| D4 | Free demos per person | **Unlimited free demos stay**, as today. | W18, W37 |
| D5 | Lucky Draw timing | **Built before the console goes live**, so six game tiles launch together. | W32, W33 |
| D6 | Where Tambola's four modes sit | **Under "More" on Step 2.** Default: "starts by itself, game calls the numbers". | W18, W37 |
| D7 | Cloudflare cost | **Free resources only.** Result of the check: see `CF_SPIKE.md`. The account already holds the free maximum of 10 databases; the owner must confirm the plan (see "Open for the owner") before the first deploy. Nothing was created. | W7, W52 |

## Defaults in force (change any of them by telling the build)

| # | Question | Default | Needed by |
|---|---|---|---|
| D8 | How long a person stays signed in | Console sign-in lasts 30 days if used. Game keys last 2 hours. A "Sign out everywhere" button exists. | W9, W34 |
| D9 | Lawyer questions | Whether a seat number kept 365 days is personal data, and the exact privacy-strip wording. Until answered the page says "built to follow" and never claims "100% deleted" for invoices. | W8, W43 |
| D10 | Upgrades | Allowed only before the game starts, never to a smaller size. | W19 |
| D11 | Old games in the list | Games older than 365 days are not listed ("games are kept 365 days"). | W36 |
| D12 | Cancelled drafts | A cancelled game that was never published can be deleted and does not count against the limit of 10 drafts. | W18 |
| D13 | Tic Tac Toe format and move clock | Stay on the tournament page on the day (not in the six steps). Clock 20 seconds. | W26, W37 |
| D14 | Old links | Old Tambola links are forwarded for at least 18 months. The old data paths are forwarded for 90 days, then closed (extended if still used). The games hub forwards to the new front page. | W45 |
| D15 | Order of moving games | Tambola moves last. The other four: Bingo, Tic Tac Toe, Snakes and Ladders, Luck by Chance. | W53 |
| D16 | Front page (showcase) content | Prices are shown, generated from the one price list. Only real numbers (finished games, hidden while zero). | W44 |
| D17 | Bingo catch-up | Bingo gets only what the console needs. Owner tools 1.3.6 to 1.3.8 are not brought over. | W25 |
| D18 | Can an organizer who also plays win prizes | No. | W11, W32 |
| D19 | Hash-chained 365-day console audit log | Off, to keep it simple. | W9 |
| D20 | Who goes live | The owner gives one explicit "go" per game, per domain move, per feature switch. The build never deploys by itself. | W53 |

## Open for the owner (these block the first deploy, not the build)

1. **Cloudflare plan.** The account holds 10 of 10 databases that the free plan allows. The console needs 1 more and Lucky Draw needs 1 more. Please confirm in the Cloudflare dashboard (Workers and Pages, Plans) whether the account is on the paid Workers plan; a Bingo release note says it is. If it is paid, nothing more is needed. If it is free, two existing small databases must be freed (candidates: `proof-forge`, `shobha-telemetry`) or sharing agreed. Nothing is deleted or created until then.
2. **US dollar price list (D3).** Give the dollar prices for 50 to 10,000 people, and say whether GST is shown or added.
3. **Lawyer (D9).** Two questions as above.
