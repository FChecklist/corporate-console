-- Visitor statistics: one row per page view or action. A random visit id that lives only in the visitor's page; no address, no IP, no cookie, no person.
CREATE TABLE IF NOT EXISTS visit_event (
  ts_ms INTEGER NOT NULL,
  day TEXT NOT NULL,        -- IST day
  game TEXT NOT NULL,       -- game id, home or console
  visit TEXT NOT NULL,
  kind TEXT NOT NULL,       -- page, leave, click, share, copy
  path TEXT,                -- path only, no query
  ref TEXT,                 -- referrer host only
  src TEXT,                 -- utm source, medium and campaign joined
  target TEXT,              -- what was pressed (a short plain label)
  ms INTEGER,               -- time on the page (leave)
  scroll INTEGER,           -- deepest scroll, 0-100 (leave)
  device TEXT, browser TEXT, lang TEXT, country TEXT, width INTEGER
);
CREATE INDEX IF NOT EXISTS visit_event_day ON visit_event(day, game);
