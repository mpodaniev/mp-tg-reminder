export type PendingPromptType = "capture" | "snooze";

export interface PendingPromptRow {
  type: PendingPromptType;
  reminderId: number;
  createdAt: number;
}

export interface PendingPromptRepository {
  savePendingPrompt(row: PendingPromptRow): Promise<void>;
  findPendingPrompt(): Promise<PendingPromptRow | null>;
  clearPendingPrompt(): Promise<void>;
}

export const PENDING_PROMPT_REPOSITORY_METHODS = [
  "savePendingPrompt",
  "findPendingPrompt",
  "clearPendingPrompt",
] as const;
