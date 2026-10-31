# What the owner must do (one short list)
Nothing here is done by the code. No secret is ever put in the repository, in chat or in a log.

1. **Mail service key.** Keep the console's mail key (RESEND_API_KEY) in the Pages settings. It sends the sign-in codes and the end-of-game report.
2. **Mail service events.** In Resend add a webhook: event email.bounced calls `/report/bounce`, event email.delivered calls `/report/delivered`, both with `{emailId,to,reason}` and the BOUNCE_TOKEN header. Without the delivered event the kept copy is deleted after 96 hours.
3. **Bounce address.** Report e-mails are sent from `hello@corporatetambola.com`, the same sender the Tambola mails already use at the mail service (Resend), and hello@ is the reply / notice address. No new domain or mail key is needed if the console's mail key belongs to the same mail account where corporatetambola.com is verified. One OPTIONAL step: at the mail service, add a webhook for "bounced" that calls the console at `/report/bounce` with the token BOUNCE_TOKEN. Without it, a refusal at send time is still caught and retried; only a bounce that arrives later is not.
4. **Pages settings of the console (secrets):**
   - `REPORT_SECRETS`: one secret per game, written as {"tambola":"...","bingo":"..."}; each game gets its own value to sign its report.
   - `BOUNCE_TOKEN`: the token the mail service's bounce notice carries.
   - `TICK_SECRET`: the shared secret of the 15-minute caller.
   - `OWNER_NOTICE_EMAIL`: where the no-names failure notice goes.
5. **GitHub secrets for the 15-minute workflow** (repository settings, Secrets): `CONSOLE_TICK_SECRET` (the same value as TICK_SECRET) and `CONSOLE_TICK_URL` (the console address, for example https://console.corporatetambola.com).
6. **Database step.** Apply migrations/0002_report_hold.sql to the console database (the code also creates the table the first time it is needed).
7. **Nothing to paste for the new screens.** The control room, Start from an earlier game and the per-game facts need no secret. They work for a game only after that game offers the routes in `docs/CONTROL_CONTRACT.md`; until then the console says "not open on the console yet" and nothing breaks.
8. **Say yes before the deploy.** The deploy itself waits for the owner's yes. Never type a secret value into chat; set each by name with `wrangler pages secret put`, the value goes only into the prompt.
9. **Statistics key.** In the Pages settings of the console set `STATS_OWNER_KEY` (a long random value only the owner knows; set it by name with `wrangler pages secret put`, never in chat). It opens `/stats/summary` (JSON) and `/stats/csv` with the header `x-owner-key`. Optional plain variable `HOME_ORIGIN` if the home page is not https://home.corporatetambola.com.
10. **Database step 2.** Apply `migrations/0003_funnel_hit.sql` (the code also creates the table on first use).
11. **Game funnel keys.** To show each game's own funnel, set `FUNNEL_KEYS` in the Pages settings of the console: JSON like {"tambola":"<that game's owner key>"} (by name with `wrangler pages secret put`; never in chat). A game without a key or without the route shows "Not connected yet", never an error. The page is `/owner-funnel/` (owner key `STATS_OWNER_KEY`).
