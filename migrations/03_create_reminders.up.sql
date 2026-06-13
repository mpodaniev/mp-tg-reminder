-- reminders: aggregate root. One row per captured forwarded message.
-- state machine: awaiting_time → pending → firing → fired → done|deleted
--                awaiting_time → expired (24h)
--                fired → pending (snooze)
-- scheduled_at: UTC Unix epoch ms; NULL while awaiting_time.
-- fired_at: logged for ±60s fire-accuracy metric (spec §6).
-- delivered_at: at-least-once guard — set only after Telegram ack (ADR-0005).
-- fired_message_id: Telegram message_id of the fired-reminder message,
--   needed to delete or edit it on Done/Delete (AC-06/07).
CREATE TABLE IF NOT EXISTS reminders (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id       INTEGER NOT NULL REFERENCES source_snapshots(id),
  state             TEXT    NOT NULL CHECK (state IN (
                      'awaiting_time', 'pending', 'firing',
                      'fired', 'done', 'deleted', 'expired'
                    )),
  scheduled_at      INTEGER,
  fired_at          INTEGER,
  delivered_at      INTEGER,
  fired_message_id  INTEGER,
  created_at        INTEGER NOT NULL
);

-- Composite index for the scheduler tick query:
--   SELECT * FROM reminders WHERE state = 'pending' AND scheduled_at <= ?
-- Also covers the re-fire query for 'firing' rows after restart (same leading column).
CREATE INDEX IF NOT EXISTS idx_reminders_state_scheduled_at
  ON reminders (state, scheduled_at);

-- FK index — every REFERENCES column must have a backing index.
CREATE INDEX IF NOT EXISTS idx_reminders_snapshot_id
  ON reminders (snapshot_id);
