-- The end-of-game report that could not be delivered. No PDF is stored by the console: only a report whose e-mail bounced is HELD here,
-- encrypted, apart from any game data, until it is delivered or the last retry (about 96 hours after the first failure) has passed.
CREATE TABLE IF NOT EXISTS report_hold (
  id TEXT PRIMARY KEY,               -- random
  game_id TEXT NOT NULL,             -- the Game ID (not personal)
  game_name TEXT NOT NULL,
  recipient_sealed TEXT NOT NULL,    -- the one failed recipient, encrypted
  pdf_sealed TEXT NOT NULL,          -- the PDF (base64), encrypted
  first_fail_ms INTEGER NOT NULL,
  attempts INTEGER NOT NULL,         -- sends so far, the first one included
  next_ms INTEGER NOT NULL,          -- when the next resend is due
  last_reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS report_hold_next ON report_hold(next_ms);

-- A good send keeps the encrypted PDF here ONLY until the mail service confirms delivery to every recipient (a bounce moves that one recipient to report_hold). Never past 96 hours.
CREATE TABLE IF NOT EXISTS report_watch (
  id TEXT PRIMARY KEY,               -- the mail service's e-mail id
  game_id TEXT NOT NULL, game_name TEXT NOT NULL,
  recipient_sealed TEXT NOT NULL,    -- recipients not yet confirmed, encrypted
  pdf_sealed TEXT NOT NULL,
  created_ms INTEGER NOT NULL
);
