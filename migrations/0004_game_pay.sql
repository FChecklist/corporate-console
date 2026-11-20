-- Game payment (pay step): the console talks only to Moneypenny. These tables hold no card data and no money.
-- wallet_order: one row per click of "Pay with your credits" (console-wallet keeps its order state here). Key = one per game and person.
CREATE TABLE IF NOT EXISTS wallet_order (
  id TEXT PRIMARY KEY,
  spend_key TEXT NOT NULL UNIQUE,
  order_ref TEXT NOT NULL,
  status TEXT NOT NULL,
  row_json TEXT NOT NULL,
  at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS wallet_order_ref ON wallet_order(order_ref);
CREATE INDEX IF NOT EXISTS wallet_order_status ON wallet_order(status);
-- pay_order: a "Buy now" or payee-link purchase of the missing credits for ONE game (order_ref = GAME-<game>-<game id>-<credits>); Moneypenny tells us when it is paid.
CREATE TABLE IF NOT EXISTS pay_order (
  order_ref TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  email_sealed TEXT NOT NULL,
  game TEXT NOT NULL,
  eid TEXT NOT NULL,
  item TEXT NOT NULL,
  state TEXT NOT NULL,       -- open | told (the game has been told it is paid)
  created_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pay_order_eid ON pay_order(game, eid);
-- pay_link: the "copy payment link" a payee opens. Only a hash of the random token is kept; works 7 days. The money goes to the organizer's own Moneypenny account for this game.
CREATE TABLE IF NOT EXISTS pay_link (
  token_hash TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  email_sealed TEXT NOT NULL,
  game TEXT NOT NULL,
  eid TEXT NOT NULL,
  item TEXT NOT NULL,
  expires_ms INTEGER NOT NULL
);
