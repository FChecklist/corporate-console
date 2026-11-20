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
| Pay routes | `functions/pay/[[path]].ts`, `functions/_lib/pay-core.ts` | `GET /pay/quote`, `POST /pay/pay`, `/pay/buy`, `/pay/confirm`, `/pay/link`, `/pay/check`, `/pay/event` (Moneypenny's signed notice), and the payee's `GET /pay/link/info`, `POST /pay/link/start`, `/pay/link/confirm`. Sign-in = the console cookie (`cbsess`); CORS only for the six game origins and the console, with credentials. |
| Order note | `pay_order` (migration 0004) | One row per game: who (e-mail sealed), game, size, and whether the game has been told. Moneypenny reserves, captures and keeps the order; the console keeps no wallet of its own. |
| Payee page | `public/pay-link.html`, `.js`, `.css`, served at `/pay/<token>` | A console page (never another site). No sign-in. Shows only the amount due. The buy is made **as the organizer's Moneypenny account for this one game**, so the money enters the organizer's account and the game is paid by itself. The secure payment window opens on top of the page; the page says Paid by itself. The link works 7 days; only a hash of its token is kept. |
| Paid notice to a game | `packages/bridge` (copied into each game), `POST /api/console/paid` | Signed assertion act `paid` (60 seconds, one use). The game marks itself PAID **once per order id** (`console_paid` table: marking -> paid), only for the organizer's own game and size. Without `markPaid` in the game's adapter the route answers 404. |
| Old pay screens | `legacyPayRedirect` in the bridge | With `PAY_VIA_CONSOLE=1`: `/pay.html`, `/paylink.html`, `/paytest.html` and the old order / verify / paylink / credit routes answer 302 to the console. Nothing is deleted. Razorpay's own notice to a game is NOT redirected. |

## Moneypenny's game-pay routes (contract/v1/openapi.json, branch game-pay-chain, commit ea2469c)
The game id is Moneypenny's `order_ref`. Console -> Moneypenny (signed spend key): `GET /v1/game_pay/quote?order_ref=&product=&item=&email=` (cost, balance, `short_by`, `to_buy` = the smallest LISTED pack that covers the gap, `can_pay_now`, `paid`), `POST /v1/game_pay/start` (enough credits: Moneypenny reserves and captures in one step and the game is PAID; short: an order for the pack opens and `order.payframe {key, order_id, amount, currency}` comes back), `POST /v1/game_pay/confirm {order_ref, order_id, razorpay ids}` (Moneypenny asks the payment side what happened, credits, then pays the game), `GET /v1/game_pay/status?order_ref=` (open, awaiting_payment, paid, review), pay link `POST /v1/game_pay/link` (token shown once), `GET /v1/game_pay/link?token=`, `POST /v1/game_pay/link/start {token, payer_email}`; plus `GET /v1/quote?credits=N` for dollars and rupees. Notice back: signed webhook `{id, type:'game.paid', data:{game_ref, product, item, ...}}` (HMAC of `timestamp.body`, no e-mail) to `POST /pay/event`; every notice reaches every endpoint, so the console only acts on a game it noted.
**A shortfall buys a listed pack, not the exact gap** (Moneypenny may not invent a price): "You only need to buy N credits" shows the pack. Errors carry a stable `code`; the console shows its own soft words and never Moneypenny's text.
**The secure window:** the console passes the page `order.payframe` plus the window's address (`PAYFRAME_ORIGIN`, default the IT Services pages address). The page puts that address in a frame, the window says `ready`, the page sends `{t:'open', opts}`, and the window answers `paid` with the payment ids (or `failed`, `dismissed`); the page then calls `/pay/confirm`. A closed tab is finished by the signed notice and by `/pay/check`.
Until Moneypenny is deployed the console runs against `tests/support/fake-moneypenny.ts` (shapes taken from its `src/gamepay.js`).

## What each game must still do (not done here: the games are separate repos)
1. Re-vendor the bridge and the pack (`tools/vendor-bridge.mjs`, `tools/vendor-pack.mjs --game <game>`).
2. Adapter `markPaid(env,{eid,sub,item,orderRef,nowMs})`: the game exists, belongs to the account of `sub`, `item` equals its size, it is unpaid; then set PAID and **unlock start only from this**. Refuse with `Object.assign(new Error(text),{definite:true})` only when nothing was changed. (Reference: `tests/support/fake-host.ts`.)
3. Descriptor: `payGame: "<id>"`, `consoleOrigin: "https://console.corporatetambola.com"`; Snakes and Ladders (older 10-step console with its own Pay step) moves onto the shared flow.
4. Router: call `legacyPayRedirect(req,{flag:env.PAY_VIA_CONSOLE, consoleOrigin})` before its own routes.
5. Confirm there is no login, payment or chat of its own. Found in this check: every game public folder still has `pay.html`, `paylink.html`, `paytest.html` (covered by the redirect) and `signin.html` (the hand-off landing from the console; its other uses are NOT checked).

## Privacy of the pay step
The console keeps no card data and no money. `pay_order` holds the organizer's e-mail sealed (encrypted) and a hash; rows are removed after 90 days. The payee types an e-mail only so the payment can be matched; the console does not keep it. Logs carry no e-mail.

## Local demo and screenshots
`bun tools/pay-demo/server.ts` (fake Moneypenny, real console routes and bridge, ports 8123 and 8124), then `node tools/pay-demo/shots.mjs <folder>`. Screens: `C:\Users\Dell\Downloads\Corporate-Tambola-Console-Flow-Review\pay-step\` (every file name ends LOCAL).

## Seamless (owner order 20 Nov 2026)
Nobody leaves the console: no redirect to Moneypenny or IT Services. Buy now puts `payPage` (the address Moneypenny gives) into a frame on top of the screen (`#zf-payoverlay`; the payee page does the same). The console's CSP allows that one address as `frame-src` (`payframeOrigins` in `config/games.json`); the console itself still cannot be framed. After paying, the organizer's screen checks the game every 5 s and the console every 15 s, `/pay/quote` says `paid` or `waiting` so a reopened tab shows the right state, and the payee page polls `/pay/link/info` (`covered`). A game's own page must also allow the payment window as a frame in its own CSP (game side).
**Needs from IT Services:** the console address in the payframe's allowed sites (approved; already in the source, the deployed copy is unchecked).
**Known edge:** if an organizer pays with credits after sharing a payment link, the payee page cannot tell the game is paid (the credit spend is not an order the page can see); the amount it shows would be the full price. Rare; a later improvement.
