-- Game payment (pay step): the console talks only to Moneypenny. These tables hold no card data and no money.
-- pay_order: the console's note of ONE game being paid for (order_ref = GAME-<game>-<game id>): who (e-mail kept sealed), which game and size, and whether the game has been told it is paid.
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
