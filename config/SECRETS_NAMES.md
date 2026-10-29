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
