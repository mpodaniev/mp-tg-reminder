import { PastScheduledTimeError } from "../errors.js";

export class ScheduledTime {
  private constructor(readonly epochMs: number) {}

  static from(epochMs: number): ScheduledTime {
    if (epochMs <= Date.now()) {
      throw new PastScheduledTimeError();
    }
    return new ScheduledTime(epochMs);
  }
}
