import type { PendingPromptRepository, PendingPromptRow } from "../../../ports/index.js";

export class InMemoryPendingPromptRepository implements PendingPromptRepository {
  private row: PendingPromptRow | null = null;

  async savePendingPrompt(row: PendingPromptRow): Promise<void> {
    this.row = row;
  }

  async findPendingPrompt(): Promise<PendingPromptRow | null> {
    return this.row;
  }

  async clearPendingPrompt(): Promise<void> {
    this.row = null;
  }
}
