import type { FireDueReminders } from "../app/use-cases/fire-due-reminders.js";
import type { ExpireStalePrompts } from "../app/use-cases/expire-stale-prompts.js";

export class Scheduler {
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly fireUC: FireDueReminders,
    private readonly expireUC: ExpireStalePrompts,
    private readonly expireCutoffMs: number
  ) {}

  async tick(): Promise<void> {
    const run = this.runTick();
    this.inFlight = run;
    try {
      await run;
    } finally {
      if (this.inFlight === run) this.inFlight = null;
    }
  }

  async stop(): Promise<void> {
    if (this.inFlight) await this.inFlight;
  }

  private async runTick(): Promise<void> {
    await this.fireUC.execute();
    await this.expireUC.execute(this.expireCutoffMs);
  }
}
