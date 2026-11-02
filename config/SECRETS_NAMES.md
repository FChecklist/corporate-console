# Names of secrets and settings (NAMES ONLY - no value is ever written in this repository)

| Name | What | Where it is set | Kind |
|---|---|---|---|
| `RESEND_API_KEY` | sends the sign-in mails from corporatetambola.com | `wrangler pages secret put` (console project) | secret |
| `CONSOLE_SIGNING_KEY` | the console's private signing key (Ed25519, base64 PKCS8); its public half goes to every game as `CONSOLE_PUBKEYS` | `wrangler pages secret put` (console project) and the cron Worker | secret |
| `SESSION_PEPPER` | mixes into code hashes and seals the stored e-mail | `wrangler pages secret put` (console project) and the cron Worker | secret |
| `CONSOLE_KID` | name of the signing key currently used (default `k1`) | `wrangler.toml` | plain variable |
| `CONSOLE_ORIGIN` | the console's own address | `wrangler.toml` | plain variable |
| `GAME_ORIGINS` | the six game addresses the console may address | `wrangler.toml` | plain variable |
| `MAIL_FROM` | sender shown on sign-in mails | `wrangler.toml` | plain variable |
| `TABLE_PREFIX` | `""` = own database; `"con_"` = same four tables inside an existing database | `wrangler.toml` and `apps/cron/wrangler.toml` | plain variable |
| `TEST_MODE` | `1` only on a test copy: demo logins demo1/2/3@xyz.in with code 123456, no mail | test copy only | plain variable |
| `DB` | the console's D1 database `corporate-console` | `wrangler.toml` binding | binding |
| `ORGANIZER_SECRET` | the owner password of Mission Control: the same platform key every game's own `/api/owner/*` uses (sent to the games as `x-organizer`, accepted from the owner as `x-organizer`) | `wrangler pages secret put` (console project) | secret |
| `AI_CONTROL_KEY` | the AI read key: accepted ONLY on the read routes under `/api/control/*` (header `x-control-key`), never sent to any game; at least 24 characters and not equal to the owner password | `wrangler pages secret put` (console project) | secret |
| `CF_API_TOKEN` | optional: a READ-ONLY Cloudflare token (Pages: read) for the deployment list and rollback ids on the Releases tab | `wrangler pages secret put` (console project) | secret |
| `CF_ACCOUNT_ID` | optional: the Cloudflare account id that goes with `CF_API_TOKEN` | `wrangler pages secret put` (console project) | secret |
| `LEDGER_KEY` | optional: the central payment site's own read key (a different secret from the owner password); without it the Payments tab shows each game's own ledger only | `wrangler pages secret put` (console project) | secret |
