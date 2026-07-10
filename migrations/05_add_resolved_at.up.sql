-- resolved_at: set the moment a reminder reaches a terminal, Owner-caused
-- state (Reminder.resolveDone/resolveDelete/cancel — see reminder.ts). Used to
-- compute the /stats average-reaction-time metric as resolved_at - fired_at.
-- NULL for rows not yet resolved and for the system-driven awaiting_time →
-- expired path, which is not an Owner action.
ALTER TABLE reminders ADD COLUMN resolved_at INTEGER;
