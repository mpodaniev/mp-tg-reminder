import type { FireDueReminders } from "../app/use-cases/fire-due-reminders.js";
import type { ExpireStalePrompts } from "../app/use-cases/expire-stale-prompts.js";

export class Scheduler {
  private handle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly fireUC: FireDueReminders,
    private readonly expireUC: ExpireStalePrompts,
    private readonly intervalMs: number,
    private readonly expireCutoffMs: number
  ) {}

  start(): void {
    if (this.handle) return;
    this.handle = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.handle) {
      clearInterval(this.handle);
      this.handle = null;
    }
  }

  private async tick(): Promise<void> {
    await this.fireUC.execute();
    await this.expireUC.execute(this.expireCutoffMs);
  }
}
