import type { ReminderRepository, ReminderStatusCounts } from "../ports/reminder-repository.js";
import { buildPreview } from "./list-active-reminders.js";

export interface StatsLongestActiveEntry {
  reminderId: number;
  preview: string;
  ageMs: number;
}

export interface StatsSummary {
  statusCounts: ReminderStatusCounts;
  avgReactionTimeMs: number | null;
  longestActive: StatsLongestActiveEntry[];
}

export class GetStats {
  constructor(private readonly repo: ReminderRepository) {}

  async execute(): Promise<StatsSummary> {
    const stats = await this.repo.getStats();
    return {
      statusCounts: stats.statusCounts,
      avgReactionTimeMs: stats.avgReactionTimeMs,
      longestActive: stats.longestActive.map((entry) => ({
        reminderId: entry.reminderId,
        preview: buildPreview(entry.messageText),
        ageMs: entry.ageMs,
      })),
    };
  }
}
