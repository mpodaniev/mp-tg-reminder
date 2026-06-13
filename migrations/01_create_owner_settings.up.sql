-- owner_settings: singleton row (id always 1) — written on first /settings call,
-- read on every incoming update for AuthZ (owner_telegram_id) and timezone gate (AC-13).
CREATE TABLE IF NOT EXISTS owner_settings (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  owner_telegram_id   INTEGER NOT NULL,
  timezone            TEXT,
  created_at          INTEGER NOT NULL
);
