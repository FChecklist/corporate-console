-- Console sign-in data. Nothing here knows which games a person has or what they paid.
-- e-mail hash = sha256('email|' + trimmed lower-case e-mail), the same join key every game uses.
CREATE TABLE IF NOT EXISTS console_email (
  email_hash TEXT PRIMARY KEY,
  email_sealed TEXT NOT NULL,        -- the e-mail, encrypted; only needed to send mail and to prove the mailbox to a game
  created_ms INTEGER NOT NULL,
  last_seen_ms INTEGER NOT NULL,     -- last sign-in or use: the 365-day clock counts from here
  consent_ms INTEGER                 -- when the person ticked the consent box
);
CREATE TABLE IF NOT EXISTS login_code (
  email_hash TEXT PRIMARY KEY,
  email_sealed TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  link_hash TEXT NOT NULL,
  expires_ms INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_ms INTEGER NOT NULL,
  consent_ms INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS login_code_link ON login_code(link_hash);
CREATE TABLE IF NOT EXISTS session (
  sid_hash TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  created_ms INTEGER NOT NULL,
  last_seen_ms INTEGER NOT NULL,
  expires_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS session_email ON session(email_hash);
CREATE TABLE IF NOT EXISTS rate (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  win_start_ms INTEGER NOT NULL
);
