-- source_snapshots: immutable capture of the forwarded message at the moment of reminder creation.
-- chat_username + message_id together determine deep-link availability (AC-11).
-- is_media_protected drives the media-unavailable note on fire (AC-12).
CREATE TABLE IF NOT EXISTS source_snapshots (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id             INTEGER NOT NULL,
  message_id          INTEGER NOT NULL,
  chat_username       TEXT,
  sender_name         TEXT,
  sender_username     TEXT,
  message_text        TEXT,
  media_file_id       TEXT,
  media_type          TEXT,
  is_media_protected  INTEGER NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL
);
