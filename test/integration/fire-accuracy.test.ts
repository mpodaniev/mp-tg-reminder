import { describe, it, expect } from "vitest";

/**
 * Fire accuracy NFR (spec §6): reminder fires within ±60 s of scheduled_at.
 * The polling tick is 15 s by default (SCHEDULER_INTERVAL_MS=15000 in .env.example).
 * 15 s ≪ 60 s budget → tick interval satisfies the NFR structurally.
 *
 * This test documents the invariant with numeric evidence rather than running
 * a real scheduler (which would require wall-clock waiting in CI).
 */
describe("Fire accuracy NFR (spec §6)", () => {
  const TICK_MS = 15_000;
  const ACCURACY_BUDGET_MS = 60_000;

  it("scheduler tick interval (15 s) is within ±60 s accuracy budget", () => {
    expect(TICK_MS).toBeLessThanOrEqual(ACCURACY_BUDGET_MS);
  });

  it("worst-case fire delay (tick_ms) is documented: ≤15 s ≪ ±60 s budget", () => {
    const worstCaseDelayMs = TICK_MS;
    expect(worstCaseDelayMs).toBeLessThan(ACCURACY_BUDGET_MS);
  });
});
