# Console contract v1 (frozen 27 October 2026)

This is the agreement between the master console and every game. The console and the games are built separately; both are tested against the same files:

- `contract/schemas.json` - the exact shape of every request and answer. An object with a field that is not listed is wrong (a game must never send more than the contract says: that is how a mobile number could leak).
- `contract/fixtures.json` - 40 golden cases (request, expected status, expected shape). They run against the fake game today (`tools/fake-game`) and against each real game's bridge later.
- `packages/bridge/` - the ONE bridge module that is copied byte for byte into each game.

Changing any of these is a contract change: raise `contract/VERSION`, tell every game session by message.

## 1. The rule that matters most

The console proves **who a person is** (by a mailed code). The game decides **what that person may do**, from its own tables. Nothing the console says about a role is believed. A game never trusts another game, and nothing about people or games is stored centrally.

## 2. The assertion (a signed, one-time note from the console to ONE game)

Written `v1.<payload>.<signature>`. The payload is JSON, the signature is Ed25519 over the text `cgv1.` + payload (so a signature made for something else can never be reused).

| Field | Meaning |
|---|---|
| `v` | always 1 |
| `kid` | which console key signed it (several can be live while keys are being changed) |
| `aud` | the game's own web address, for example `https://bingo.corporatetambola.com`. A different address is refused. |
| `sub` | the person: `sha256('email|' + trimmed lower-case e-mail)` as 64 hex letters. Identical in all six games. |
| `em` | the plain e-mail, ONLY when the console has just proved the mailbox and wants an account made or an invitation accepted |
| `act` | what it is for: `session`, `games`, `billing`, `invited`, `role`, `handoff`, `stepup`, `purge`. A route accepts only its own purpose. |
| `eid`, `sa` | for `stepup` (and `role`): the game and the high-impact action it allows (`pay`, `upgrade`, `role-add`, `role-remove`, `draft-delete`, `cancel`) |
| `hint` | a guess at the role. Ignored. |
| `jti` | a random number used once. The game remembers it until it has expired; a second use is refused (`replayed`). |
| `iat`, `exp` | seconds. At most 60 seconds apart. The game allows 30 seconds of clock difference on each side. |

The game checks, in this order: format and size (at most 2,048 characters), key id known, signature, audience, lifetime, purpose, then marks the `jti` as used. Public keys are in the plain setting `CONSOLE_PUBKEYS` as `k1:<key>,k2:<key>`. **If the setting is empty, every `/api/console/*` route answers 404 with the body `{}`** (the bridge is dark; nothing leaks that it exists).

## 3. Keys the game hands out

After a good `session` assertion the game mints ordinary game keys (they work with the game's existing `x-organizer` header):

- **Organizer** key where the person owns an account here: lives 2 hours, label `console`.
- **Host / Co-host** keys, one per game where the person has an accepted role: lives 2 hours, label `console`, bound to that ONE game (the game refuses it for any other game, and for account-wide routes).
- Console keys are kept in browser memory only, never in a web address or in storage.
- The old long-lived keys (`cbk_`, `cbh_`, `cbc_`, `cba_`) and AI work links keep working unchanged.
- A role ends when its game ends or when it is removed; the key stops working at the next request.
- High-impact calls (`pay`, `upgrade`, role add / remove, delete draft, cancel) need the key AND a fresh one-time `stepup` assertion in the header `x-console-step`, with the matching `sa` and `eid`.

## 4. Routes (all on the game's own address)

| Route | Who | Does |
|---|---|---|
| `GET /api/console/capabilities` | anyone | Game, name, version, bridge schema number, the console key ids it accepts, the sizes with prices (rupees in paise), free demo size, which features exist (`roles`, `log`, `upgrade`, `preview`, `trail`, `invited`), the draft limit |
| `GET /api/console/live` | anyone (counts only) | How many games are playing now and how many start within 60 minutes (the deploy guard uses it); Tic Tac Toe adds running tournaments |
| `POST /api/console/session` | assertion `session` | Opens the person's keys. If the assertion carries `em` and the request says `"create": true`, a new account is made HERE (this is the only place an account is made, so it is always proven by mailbox first) |
| `POST /api/console/games` | assertion `games` | The person's games in this game, as Organizer, Host, Co-host (including invitations not yet accepted), 50 per page with a `cursor`. A row for an invitation not yet accepted (`nextAction: accept`) may carry the optional `roleId` (10 hex letters) so the console can show Accept / Decline; a game that leaves it out simply gets no buttons there (added 29 Oct 2026) |
| `POST /api/console/billing` | assertion `billing` | Payments of the person's games, the credit balance and expiry, 50 per page, filter `fromMs` / `toMs` |
| `POST /api/console/invited` | assertion `invited` | Participant cards: games where an organizer typed this person's e-mail on the guest list. Name, start time and the personal link only. Never a guest list. |
| `POST /api/console/role` | `op`: `list`, `invite`, `remove` with the Organizer key (`invite` and `remove` also need a step-up); `accept`, `decline` with assertion `role` | Who helps with a game. An invitation goes only to the typed e-mail address. Accepting needs the assertion of exactly that e-mail, otherwise `not_yours`. |
| `POST /api/console/handoff` | a key for that game | A one-time address (valid 60 seconds) that opens the game's own Organizer / Host / big-screen / tournament page: `.../signin.html?t=<48 hex>&go=console&e=<game>`. **`target: "new"` (Start a new game, added 29 Oct 2026, optional):** no `eid`; only the Organizer's own key may ask; the address ends `e=_new_`; redeeming it gives an Organizer key that lives 2 hours (not 16) and belongs to no single game, and the game's sign-in page then opens its own Step 1 (`zc.html?new=1`, which makes the draft with the game's defaults). A game that does not know `_new_` yet must answer its ordinary error page; nothing else changes. |
| `POST /api/console/handoff/redeem` | the token | Called by the game's own sign-in page. Single use. Gives a 16 hour key for that game and role. A scanner that only opens the link (GET) uses up nothing. |
| `POST /api/console/signout` | a key made by the console | Ends that key and every other console key made for the same person in this game (organizer key, hand-off keys). The console calls it once for each key it holds when the person signs out. |
| `POST /api/console/preview` | a key for that game | Address of the Player's screen view with a short-lived token (15 minutes). Only that path may be shown inside the console, and only by the console. |
| `POST /api/console/purge-email` | assertion `purge` | Removes this person's e-mail and role rows (the 365-day rule). Invoices and legal records stay. |
| `POST /api/z/{id}/upgrade-quote` | a key for that game | `{toPack}` gives price of the new size, what was paid, credit used and the difference to pay. Only a bigger size, only before the game starts (`too_late` otherwise). |
| `GET /api/z/{id}/log?since=<seq>` | a key for that game | Game log rows after `since`, with a cursor `next`. Organizer sees all, Host their own and shared milestones, Co-host only their own. |

Browsers reach these routes across origins, so every game adds `x-console-step` to the headers its CORS answer allows (today: `content-type, x-organizer, x-partner, authorization, x-cb-vid, x-cb-vs`). Nothing else new is needed: the console's own cookie never goes to a game.

## 5. Answers

Success: `{"ok": true, ...}`. Failure: `{"ok": false, "error": "<code>", "message": "<one plain sentence>", "where": "...", "fix": "..."}` with these codes: `bad_assertion` 401, `expired` 401, `wrong_audience` 401, `replayed` 401, `unknown_kid` 401, `wrong_act` 401, `forbidden` 403, `step_up_required` 403, `not_yours` 403, `not_found` 404, `rate_limited` 429, `conflict` 409, `too_late` 409, `invalid` 400. Every message says what happened and what to do, in words a non-technical person understands (the games' guide catalog needs an entry for each).

## 6. Words and numbers everyone uses

- **Status** of a game, always one of: `draft` (Draft), `waiting_payment` (Waiting for payment), `ready` (Ready), `playing` (Playing now), `finished` (Finished), `cancelled` (Cancelled), `not_started` (Did not start). Each game maps its own internal states to these seven.
- **Role** names: `organizer`, `host`, `cohost`, `participant`.
- **Money** is whole paise or cents (`amountMinor`) with its `currency` (`INR` or `USD`). The console shows it; it never converts or adds across currencies.
- **Payment state** of a game: `none`, `free`, `waiting`, `paid`, `credit`. A Co-host never receives an amount.
- **Billing "who paid"**: `organizer`, `host`, `cohost`, or `link` (paid through a shared pay link).
- **Game log kinds** and what they may carry (nothing else; never a name, mobile, e-mail, employee ID or a hash of them): `created`, `published`, `payment` (amount, currency: Organizer and Host only), `setting` (field, before, after), `role_added`, `role_removed`, `role_accepted` (role), `started`, `paused`, `resumed`, `number_called` (number), `winner` (prize, ticket number), `ended`, `report_sent`, `upgraded` (from, to), `cancelled`. Each row has `seq`, `tsMs`, `who` (`organizer`, `host`, `cohost`, `system`), one plain sentence `text`, and `data`. Kept 365 days, deleted with the game.

## 7. Open points that the games decide while building (nothing here blocks the console)

1. The event log lives in a NEW file (for example `eventlog.ts`); `gamelog.ts` (the end-of-game summary) stays as it is.
2. The Player's screen view lives at `/screenview/<game>` because `/preview` already means "Test your brand moment".
3. `paidBy: link` appears for payments made through a shared pay link.
4. A US dollar price is in `sizes[].usdMinor`; `null` only if a game has no dollar price for a size (today every size has one).
5. Luck by Chance must first take the Tambola hardening port; its bridge comes second.

## 8. Addendum of 29 October 2026 (all fields OPTIONAL; contract stays v1; the 40 original cases pass unchanged)

1. `POST /api/console/handoff`: the optional target `new` ("Start a new game", see section 4) and the address now ends `&to=<target>` (organizer, host, big, tournament) so the game's sign-in page can open the page that was asked for instead of always the Organizer screen. A game that ignores `to` keeps working as before.
2. `GET /api/console/capabilities`: optional `previewUrl` = `/screenview/` (the path where the game serves the Player's screen view; present only when `features.preview` is true).
3. `GET /api/console/live`: optional `story` (one plain sentence up to 160 letters, for example "Running. 30 of 75 called.") and `counts` (`joined`, `waiting`, `done`, `total`: whole numbers). Counts only; never a name.
4. `POST /api/console/purge-email`: optional `rolesErased` (how many Host / Co-host rows were erased). Close my account in the console reports it.
5. `POST /api/console/games`: optional `roleId` on an invitation row (section 4); optional `joined` (how many people have joined) and `yourLimit` (how many a Co-host may add) so My games can show them.
