import { Reminder } from "../../domain/reminder.js";
import type { SourceSnapshot } from "../../domain/value-objects/source-snapshot.js";
import type { OwnerSettingsRow } from "../../app/ports/reminder-repository.js";
import type { PendingPromptRow, PendingPromptType } from "../../app/ports/pending-prompt-repository.js";

export interface ReminderDbRow {
  id: number;
  snapshot_id: number;
  state: string;
  scheduled_at: number | null;
  fired_at: number | null;
  delivered_at: number | null;
  fired_message_id: number | null;
  created_at: number;
}

export interface SourceSnapshotDbRow {
  id: number;
  chat_id: number;
  message_id: number;
  chat_username: string | null;
  sender_name: string | null;
  sender_username: string | null;
  message_text: string | null;
  media_file_id: string | null;
  media_type: string | null;
  is_media_protected: number;
  created_at: number;
}

export interface OwnerSettingsDbRow {
  id: 1;
  owner_telegram_id: number;
  timezone: string | null;
  created_at: number;
}

export function snapshotRowToVO(row: SourceSnapshotDbRow): SourceSnapshot {
  return {
    id: row.id,
    chatId: row.chat_id,
    messageId: row.message_id,
    chatUsername: row.chat_username,
    senderName: row.sender_name,
    senderUsername: row.sender_username,
    messageText: row.message_text,
    mediaFileId: row.media_file_id,
    mediaType: row.media_type,
    isMediaProtected: row.is_media_protected === 1,
    createdAt: row.created_at,
  };
}

export function rowToReminder(
  row: ReminderDbRow,
  snapshot: SourceSnapshot
): Reminder {
  return Reminder.reconstitute({
    id: row.id,
    snapshot,
    state: row.state as any,
    scheduledAt: row.scheduled_at,
    firedAt: row.fired_at,
    deliveredAt: row.delivered_at,
    firedMessageId: row.fired_message_id,
    createdAt: row.created_at,
  });
}

export function ownerSettingsRowToVO(row: OwnerSettingsDbRow): OwnerSettingsRow {
  return {
    id: 1,
    ownerTelegramId: row.owner_telegram_id,
    timezone: row.timezone,
    createdAt: row.created_at,
  };
}

export interface PendingPromptDbRow {
  id: 1;
  type: string;
  reminder_id: number;
  created_at: number;
}

export function pendingPromptRowToVO(row: PendingPromptDbRow): PendingPromptRow {
  return {
    type: row.type as PendingPromptType,
    reminderId: row.reminder_id,
    createdAt: row.created_at,
  };
}
