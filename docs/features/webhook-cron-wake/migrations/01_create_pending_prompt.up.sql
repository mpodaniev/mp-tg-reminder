-- pending_prompt: singleton row (id always 1) — durable replacement for the
-- in-memory pendingCustom map (src/ports/router.ts:19), so the "awaiting custom
-- time" prompt survives an idle-stop/restart cycle (AC-05). Only one Owner exists,
-- so at most one prompt can be pending at a time; savePendingPrompt() upserts this
-- row, clearPendingPrompt() deletes it. No expiry (spec §8 default) and no
-- updated_at (the row is fully replaced on write, never incrementally mutated).
CREATE TABLE IF NOT EXISTS pending_prompt (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  type          TEXT    NOT NULL CHECK (type IN ('capture', 'snooze')),
  reminder_id   INTEGER NOT NULL REFERENCES reminders(id),
  created_at    INTEGER NOT NULL
);

-- FK index — every REFERENCES column must have a backing index (repo convention,
-- see idx_reminders_snapshot_id in migrations/03_create_reminders.up.sql).
CREATE INDEX IF NOT EXISTS idx_pending_prompt_reminder_id
  ON pending_prompt (reminder_id);
