# The pay step (last step of the organizer flow, all six games) - 20 Nov 2026

Owner order 20 Nov 2026: home.corporatetambola.com -> console.corporatetambola.com -> moneypenny.corporatetambola.com -> IT Services by Rajat Agarwal -> Razorpay.
**The console calls only Moneypenny.** It never calls IT Services or Razorpay (a test keeps `pay-core.ts` free of both). A game is paid ONLY with Moneypenny credits for that one game. Nothing here is deployed; `/pay/*` answers "not open yet" until `PAY_VIA_MONEYPENNY=1` (owner go).

## What the organizer sees (step 6, "Pay")
Title **Game only starts when you pay**. Cost of this game, your existing credits, "You only need to buy N credits (= US$ / ₹) to start the game", **Buy now** and **Copy payment link**. If the credits already cover the game: one button, **Pay with your credits**. Notes: no software, no subscription, nothing to download, you pay per game. Privacy note (the owner-approved 31 Oct line plus what is true in code): "No personal details needed. All participant information is deleted within 24 hours of the game. Our games are designed to follow US privacy laws, the EU GDPR and India's DPDP." The sentence "send all details to the organizer's e-mail as a PDF" is **not** in the screen (not true in any game today; a test keeps PDF/e-mail out of the note).
Every number (credits, US$, ₹) is a Moneypenny answer; no price is written in the console or the pack (tests change Moneypenny's list and the screen follows).

## Who does what
| Piece | Where | Does |
|---|---|---|
| Step 6 screen | `packages/game-pack/zc-flow.js` (shared, vendored into each game with `tools/vendor-pack.mjs`) | Draws the screen from the console's quote. A game says `payGame` (its id) and `consoleOrigin` in its `ZFLOW_GAME` descriptor. One flow for all games: 5 steps + Pay = 6. |
| Pay routes | `functions/pay/[[path]].ts`, `functions/_lib/pay-core.ts` | `GET /pay/quote`, `POST /pay/pay`, `/pay/buy`, `/pay/link`, `/pay/check`, `/pay/event` (Moneypenny's signed notice), the payee's `GET /pay/link/info` and `POST /pay/link/start`. Sign-in = the console cookie (`cbsess`); CORS only for the six game origins and the console, with credentials. |
| Wallet | `packages/console-wallet/` (copy of the Moneypenny repo's module, see `VENDORED.md`) | reserve -> capture -> **tell the game** (capture first, then grant); a definite refusal by the game returns the credits; an unclear failure is repeated by the 2-minute job `retryStuck`. Order state in the console database (`wallet_order`, migration 0004). |
| Payee page | `public/pay-link.html`, `.js`, `.css`, served at `/pay/<token>` | A console page (never another site). No sign-in. Shows only the amount due. The buy is made **as the organizer's Moneypenny account for this one game**, so the money enters the organizer's account and the game is paid by itself. The secure payment window opens on top of the page; the page says Paid by itself. The link works 7 days; only a hash of its token is kept. |
| Paid notice to a game | `packages/bridge` (copied into each game), `POST /api/console/paid` | Signed assertion act `paid` (60 seconds, one use). The game marks itself PAID **once per order id** (`console_paid` table: marking -> paid), only for the organizer's own game and size. Without `markPaid` in the game's adapter the route answers 404. |
| Old pay screens | `legacyPayRedirect` in the bridge | With `PAY_VIA_CONSOLE=1`: `/pay.html`, `/paylink.html`, `/paytest.html` and the old order / verify / paylink / credit routes answer 302 to the console. Nothing is deleted. Razorpay's own notice to a game is NOT redirected. |

## Field names agreed with the Moneypenny side (mp-gamepay)
Console -> Moneypenny (signed spend key): `GET /v1/catalogue?product=<game id>` (items `{product,item,credits}`; **item = the size's "up to" number as text, e.g. "250"**), `GET /v1/balance?email=`, `GET /v1/quote?credits=N` (`usd`, `inr_minor`), `POST /v1/spend/reserve_item {email,product,item,order_ref}`, `/v1/spend/capture {hold_id}`, `/v1/refund {type:'order',hold_id}`.
Shortfall buy: `POST /v1/buy_credits {email,credits:N,currency:'INR',order_ref:'GAME-<game>-<game id>-<N>',product,item,game_id}` -> `{order_id,pay_url,amount_minor}` (**exact N credits, not only listed packs**, and Moneypenny reserves + captures for the game when paid). Notice back: signed webhook `{type:'game.paid',event_id,product,item,game_id,order_ref}` (HMAC of `timestamp.body`, no e-mail) to `POST /pay/event`. Backup read: `GET /v1/game_order?order_ref=` -> `{status}`.
These were sent to mp-gamepay on 20 Nov; its branch had no code yet. **Until its routes exist the console runs against `tests/support/fake-moneypenny.ts`.** Anything that differs on its side is a one-line change in `pay-core.ts`.

## What each game must still do (not done here: the games are separate repos)
1. Re-vendor the bridge and the pack (`tools/vendor-bridge.mjs`, `tools/vendor-pack.mjs --game <game>`).
2. Adapter `markPaid(env,{eid,sub,item,orderRef,nowMs})`: the game exists, belongs to the account of `sub`, `item` equals its size, it is unpaid; then set PAID and **unlock start only from this**. Refuse with `Object.assign(new Error(text),{definite:true})` only when nothing was changed. (Reference: `tests/support/fake-host.ts`.)
3. Descriptor: `payGame: "<id>"`, `consoleOrigin: "https://console.corporatetambola.com"`; Snakes and Ladders (older 10-step console with its own Pay step) moves onto the shared flow.
4. Router: call `legacyPayRedirect(req,{flag:env.PAY_VIA_CONSOLE, consoleOrigin})` before its own routes.
5. Confirm there is no login, payment or chat of its own. Found in this check: every game public folder still has `pay.html`, `paylink.html`, `paytest.html` (covered by the redirect) and `signin.html` (the hand-off landing from the console; its other uses are NOT checked).

## Privacy of the pay step
The console keeps no card data and no money. `pay_order` and `pay_link` hold the organizer's e-mail sealed (encrypted) and a hash; links are removed one day after they end, orders after 90 days. Logs carry no e-mail.

## Local demo and screenshots
`bun tools/pay-demo/server.ts` (fake Moneypenny, real console routes and bridge, ports 8123 and 8124), then `node tools/pay-demo/shots.mjs <folder>`. Screens: `C:\Users\Dell\Downloads\Corporate-Tambola-Console-Flow-Review\pay-step\` (every file name ends LOCAL).

## Seamless (owner order 20 Nov 2026)
Nobody leaves the console: no redirect to Moneypenny or IT Services. Buy now puts `payPage` (the address Moneypenny gives) into a frame on top of the screen (`#zf-payoverlay`; the payee page does the same). The console's CSP allows that one address as `frame-src` (`payframeOrigins` in `config/games.json`); the console itself still cannot be framed. After paying, the organizer's screen checks the game every 5 s and the console every 15 s, `/pay/quote` says `paid` or `waiting` so a reopened tab shows the right state, and the payee page polls `/pay/link/info` (`covered`). A game's own page must also allow the payment window as a frame in its own CSP (game side).
**Needs from Moneypenny / IT Services:** `buy_credits` returns a `pay_url` that can be shown in a frame (the payframe), `GET /v1/game_order?order_ref=` for the status, and the console address in IT Services' allowed sites (approved).
**Known edge:** if an organizer pays with credits after sharing a payment link, the payee page cannot tell the game is paid (the credit spend is not an order the page can see); the amount it shows would be the full price. Rare; a later improvement.
