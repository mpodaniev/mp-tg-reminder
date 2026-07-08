import Database from "better-sqlite3";
import type { PendingPromptRepository, PendingPromptRow } from "../../app/ports/pending-prompt-repository.js";
import { type PendingPromptDbRow, pendingPromptRowToVO } from "./row-mappers.js";

export class SqlitePendingPromptRepository implements PendingPromptRepository {
  constructor(private readonly db: Database.Database) {}

  async savePendingPrompt(row: PendingPromptRow): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO pending_prompt (id, type, reminder_id, created_at)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET type = excluded.type,
                                       reminder_id = excluded.reminder_id,
                                       created_at = excluded.created_at`
      )
      .run(row.type, row.reminderId, row.createdAt);
  }

  async findPendingPrompt(): Promise<PendingPromptRow | null> {
    const row = this.db
      .prepare("SELECT * FROM pending_prompt WHERE id = 1")
      .get() as PendingPromptDbRow | undefined;
    if (!row) return null;
    return pendingPromptRowToVO(row);
  }

  async clearPendingPrompt(): Promise<void> {
    this.db.prepare("DELETE FROM pending_prompt WHERE id = 1").run();
  }
}
