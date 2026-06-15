import Database from "better-sqlite3";
import type { ReminderRepository, OwnerSettingsRow } from "../../app/ports/reminder-repository.js";
import { Reminder } from "../../domain/reminder.js";
import type { SourceSnapshot } from "../../domain/value-objects/source-snapshot.js";
import {
  type ReminderDbRow,
  type SourceSnapshotDbRow,
  type OwnerSettingsDbRow,
  snapshotRowToVO,
  rowToReminder,
  ownerSettingsRowToVO,
} from "./row-mappers.js";

export class SqliteReminderRepository implements ReminderRepository {
  constructor(private readonly db: Database.Database) {}

  async saveWithSnapshot(
    snapshot: Omit<SourceSnapshot, "id">,
    reminder: Reminder
  ): Promise<Reminder> {
    const save = this.db.transaction(() => {
      const snapshotResult = this.db
        .prepare(
          `INSERT INTO source_snapshots
           (chat_id, message_id, chat_username, sender_name, sender_username,
            message_text, media_file_id, media_type, is_media_protected, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          snapshot.chatId,
          snapshot.messageId,
          snapshot.chatUsername,
          snapshot.senderName,
          snapshot.senderUsername,
          snapshot.messageText,
          snapshot.mediaFileId,
          snapshot.mediaType,
          snapshot.isMediaProtected ? 1 : 0,
          snapshot.createdAt
        );

      const snapshotId = snapshotResult.lastInsertRowid as number;

      const reminderResult = this.db
        .prepare(
          `INSERT INTO reminders
           (snapshot_id, state, scheduled_at, fired_at, delivered_at, fired_message_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          snapshotId,
          reminder.state,
          reminder.scheduledAt,
          reminder.firedAt,
          reminder.deliveredAt,
          reminder.firedMessageId,
          reminder.createdAt
        );

      const reminderId = reminderResult.lastInsertRowid as number;

      const snapshotRow = this.db
        .prepare("SELECT * FROM source_snapshots WHERE id = ?")
        .get(snapshotId) as SourceSnapshotDbRow;

      const reminderRow = this.db
        .prepare("SELECT * FROM reminders WHERE id = ?")
        .get(reminderId) as ReminderDbRow;

      return rowToReminder(reminderRow, snapshotRowToVO(snapshotRow));
    });

    return save();
  }

  async findById(id: number): Promise<Reminder | null> {
    const row = this.db
      .prepare(
        `SELECT r.*, s.id as s_id, s.chat_id, s.message_id, s.chat_username,
                s.sender_name, s.sender_username, s.message_text, s.media_file_id,
                s.media_type, s.is_media_protected, s.created_at as s_created_at
         FROM reminders r
         JOIN source_snapshots s ON s.id = r.snapshot_id
         WHERE r.id = ?`
      )
      .get(id) as (ReminderDbRow & { s_id: number; chat_id: number; message_id: number; chat_username: string | null; sender_name: string | null; sender_username: string | null; message_text: string | null; media_file_id: string | null; media_type: string | null; is_media_protected: number; s_created_at: number }) | undefined;

    if (!row) return null;
    return rowToReminder(row, this.extractSnapshot(row));
  }

  async findDuePending(nowMs: number): Promise<Reminder[]> {
    const rows = this.db
      .prepare(
        `SELECT r.*, s.id as s_id, s.chat_id, s.message_id, s.chat_username,
                s.sender_name, s.sender_username, s.message_text, s.media_file_id,
                s.media_type, s.is_media_protected, s.created_at as s_created_at
         FROM reminders r
         JOIN source_snapshots s ON s.id = r.snapshot_id
         WHERE r.state = 'pending' AND r.scheduled_at <= ?`
      )
      .all(nowMs) as any[];

    return rows.map((row) => rowToReminder(row, this.extractSnapshot(row)));
  }

  async findActivePendingOrdered(): Promise<Reminder[]> {
    // Implemented in T3 (real index-backed query). Stubbed so the port compiles.
    throw new Error("findActivePendingOrdered not implemented yet");
  }

  async findFiring(): Promise<Reminder[]> {
    const rows = this.db
      .prepare(
        `SELECT r.*, s.id as s_id, s.chat_id, s.message_id, s.chat_username,
                s.sender_name, s.sender_username, s.message_text, s.media_file_id,
                s.media_type, s.is_media_protected, s.created_at as s_created_at
         FROM reminders r
         JOIN source_snapshots s ON s.id = r.snapshot_id
         WHERE r.state = 'firing'`
      )
      .all() as any[];

    return rows.map((row) => rowToReminder(row, this.extractSnapshot(row)));
  }

  async findAwaitingOlderThan(cutoffMs: number): Promise<Reminder[]> {
    const rows = this.db
      .prepare(
        `SELECT r.*, s.id as s_id, s.chat_id, s.message_id, s.chat_username,
                s.sender_name, s.sender_username, s.message_text, s.media_file_id,
                s.media_type, s.is_media_protected, s.created_at as s_created_at
         FROM reminders r
         JOIN source_snapshots s ON s.id = r.snapshot_id
         WHERE r.state = 'awaiting_time' AND r.created_at < ?`
      )
      .all(cutoffMs) as any[];

    return rows.map((row) => rowToReminder(row, this.extractSnapshot(row)));
  }

  async update(reminder: Reminder): Promise<void> {
    this.db
      .prepare(
        `UPDATE reminders
         SET state = ?, scheduled_at = ?, fired_at = ?, delivered_at = ?, fired_message_id = ?
         WHERE id = ?`
      )
      .run(
        reminder.state,
        reminder.scheduledAt,
        reminder.firedAt,
        reminder.deliveredAt,
        reminder.firedMessageId,
        reminder.id
      );
  }

  async getOwnerSettings(): Promise<OwnerSettingsRow | null> {
    const row = this.db
      .prepare("SELECT * FROM owner_settings WHERE id = 1")
      .get() as OwnerSettingsDbRow | undefined;
    if (!row) return null;
    return ownerSettingsRowToVO(row);
  }

  async upsertOwnerSettings(ownerTelegramId: number, timezone: string | null): Promise<void> {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO owner_settings (id, owner_telegram_id, timezone, created_at)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET owner_telegram_id = excluded.owner_telegram_id,
                                       timezone = excluded.timezone`
      )
      .run(ownerTelegramId, timezone, now);
  }

  private extractSnapshot(row: any): SourceSnapshot {
    return {
      id: row.s_id,
      chatId: row.chat_id,
      messageId: row.message_id,
      chatUsername: row.chat_username,
      senderName: row.sender_name,
      senderUsername: row.sender_username,
      messageText: row.message_text,
      mediaFileId: row.media_file_id,
      mediaType: row.media_type,
      isMediaProtected: row.is_media_protected === 1,
      createdAt: row.s_created_at,
    };
  }
}
