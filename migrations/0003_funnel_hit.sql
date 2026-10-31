-- Funnel statistics: one row per visit, day, game and step. A visit id is random and lives only in the visitor's page. No address, no IP, no person.
CREATE TABLE IF NOT EXISTS funnel_hit (
  day TEXT NOT NULL,        -- IST day, YYYY-MM-DD
  game TEXT NOT NULL,       -- game id, or home
  event TEXT NOT NULL,      -- one of the funnel steps
  visit TEXT NOT NULL,
  size INTEGER,
  mode TEXT,
  PRIMARY KEY (day, game, event, visit)
);
