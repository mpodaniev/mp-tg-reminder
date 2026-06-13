import type { SourceSnapshot } from "../../src/domain/value-objects/source-snapshot.js";

export interface OwnerSettingsRow {
  id: 1;
  owner_telegram_id: number;
  timezone: string | null;
  created_at: number;
}

export interface SourceSnapshotRow {
  id?: number;
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

export interface ReminderRow {
  id?: number;
  snapshot_id: number;
  state: string;
  scheduled_at: number | null;
  fired_at: number | null;
  delivered_at: number | null;
  fired_message_id: number | null;
  created_at: number;
}

export function buildOwnerSettings(
  overrides: Partial<OwnerSettingsRow> = {}
): OwnerSettingsRow {
  return {
    id: 1,
    owner_telegram_id: 123456789,
    timezone: "Europe/Kyiv",
    created_at: Date.now(),
    ...overrides,
  };
}

export function buildSourceSnapshot(
  overrides: Partial<SourceSnapshotRow> = {}
): SourceSnapshotRow {
  return {
    chat_id: 100,
    message_id: 200,
    chat_username: "testchat",
    sender_name: "Alice",
    sender_username: "alice",
    message_text: "Hello world",
    media_file_id: null,
    media_type: null,
    is_media_protected: 0,
    created_at: Date.now(),
    ...overrides,
  };
}

export function buildReminderRow(
  state: string,
  overrides: Partial<ReminderRow> = {}
): ReminderRow {
  return {
    snapshot_id: 1,
    state,
    scheduled_at: state === "pending" ? Date.now() + 60_000 : null,
    fired_at: null,
    delivered_at: null,
    fired_message_id: null,
    created_at: Date.now(),
    ...overrides,
  };
}

export function snapshotRowToVO(row: SourceSnapshotRow & { id: number }): SourceSnapshot {
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
