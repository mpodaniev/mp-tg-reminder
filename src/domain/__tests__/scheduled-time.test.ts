import { describe, it, expect } from "vitest";
import { ScheduledTime } from "../value-objects/scheduled-time.js";
import { PastScheduledTimeError } from "../errors.js";

describe("ScheduledTime value object", () => {
  it("accepts a future timestamp", () => {
    const future = Date.now() + 60_000;
    const st = ScheduledTime.from(future);
    expect(st.epochMs).toBe(future);
  });

  it("rejects a past timestamp", () => {
    const past = Date.now() - 1000;
    expect(() => ScheduledTime.from(past)).toThrow(PastScheduledTimeError);
  });

  it("rejects the current epoch (boundary: now)", () => {
    const now = Date.now();
    expect(() => ScheduledTime.from(now)).toThrow(PastScheduledTimeError);
  });
});
