-- Mission Control: the change and release history. One line per release or change: when, who (owner or ai), which site, what, the result, an optional id (commit or deployment).
-- Append-only: a line can be added, never changed and never deleted (two triggers say so). No participant details belong here, only what was done to the sites.
CREATE TABLE IF NOT EXISTS control_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at_ms INTEGER NOT NULL,
  who TEXT NOT NULL CHECK (who IN ('owner', 'ai')),
  site TEXT NOT NULL CHECK (length(site) BETWEEN 1 AND 40),
  what TEXT NOT NULL CHECK (length(what) BETWEEN 1 AND 500),
  result TEXT NOT NULL CHECK (length(result) BETWEEN 1 AND 500),
  ref TEXT CHECK (ref IS NULL OR length(ref) <= 80)
);
CREATE INDEX IF NOT EXISTS control_history_at ON control_history(at_ms);
CREATE TRIGGER IF NOT EXISTS control_history_no_update BEFORE UPDATE ON control_history BEGIN SELECT RAISE(ABORT, 'control_history is append-only'); END;
CREATE TRIGGER IF NOT EXISTS control_history_no_delete BEFORE DELETE ON control_history BEGIN SELECT RAISE(ABORT, 'control_history is append-only'); END;
