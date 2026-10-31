# What the owner must do (one short list)
Nothing here is done by the code. No secret is ever put in the repository, in chat or in a log.

1. **Mail service key.** Keep the console's mail key (RESEND_API_KEY) in the Pages settings. It sends the sign-in codes and the end-of-game report.
2. **Bounce address.** Report e-mails are sent from `hello@corporatetambola.com`, the same sender the Tambola mails already use at the mail service (Resend), and hello@ is the reply / notice address. No new domain or mail key is needed if the console's mail key belongs to the same mail account where corporatetambola.com is verified. One OPTIONAL step: at the mail service, add a webhook for "bounced" that calls the console at `/report/bounce` with the token BOUNCE_TOKEN. Without it, a refusal at send time is still caught and retried; only a bounce that arrives later is not.
3. **Pages settings of the console (secrets):**
   - `REPORT_SECRETS`: one secret per game, written as {"tambola":"...","bingo":"..."}; each game gets its own value to sign its report.
   - `BOUNCE_TOKEN`: the token the mail service's bounce notice carries.
   - `TICK_SECRET`: the shared secret of the 15-minute caller.
   - `OWNER_NOTICE_EMAIL`: where the no-names failure notice goes.
4. **GitHub secrets for the 15-minute workflow** (repository settings, Secrets): `CONSOLE_TICK_SECRET` (the same value as TICK_SECRET) and `CONSOLE_TICK_URL` (the console address, for example https://console.corporatetambola.com).
5. **Database step.** Apply migrations/0002_report_hold.sql to the console database (the code also creates the table the first time it is needed).
