import { describe, it, expect } from "vitest";
import { formatStatsMessage } from "../handlers/stats-handler.js";
import type { StatsSummary } from "../../app/use-cases/get-stats.js";

function baseStats(overrides: Partial<StatsSummary> = {}): StatsSummary {
  return {
    statusCounts: {
      awaitingTime: 0,
      pending: 0,
      firing: 0,
      fired: 0,
      closedAfterFiring: 0,
      cancelledBeforeFiring: 0,
      expired: 0,
    },
    avgReactionTimeMs: null,
    longestActive: [],
    ...overrides,
  };
}

describe("formatStatsMessage", () => {
  it("renders each status count line", () => {
    const text = formatStatsMessage(
      baseStats({
        statusCounts: {
          awaitingTime: 2,
          pending: 5,
          firing: 0,
          fired: 1,
          closedAfterFiring: 10,
          cancelledBeforeFiring: 2,
          expired: 3,
        },
      })
    );
    expect(text).toContain("Очікує часу: 2");
    expect(text).toContain("Заплановано: 5");
    expect(text).toContain("Спрацьовує: 0");
    expect(text).toContain("Спрацювало: 1");
    expect(text).toContain("Закрито після спрацювання: 10");
    expect(text).toContain("Скасовано заздалегідь: 2");
    expect(text).toContain("Прострочено: 3");
  });

  it("renders '—, немає даних' when there is no reaction-time data", () => {
    const text = formatStatsMessage(baseStats());
    expect(text).toContain("Середній час реакції: —, немає даних");
  });

  it("renders formatted average reaction time when present", () => {
    const text = formatStatsMessage(baseStats({ avgReactionTimeMs: (2 * 60 + 15) * 60_000 }));
    expect(text).toContain("Середній час реакції: 2 год 15 хв");
  });

  it("renders 'Активних нагадувань немає' when longestActive is empty", () => {
    const text = formatStatsMessage(baseStats());
    expect(text).toContain("Активних нагадувань немає");
  });

  it("renders each longest-active row with its formatted age", () => {
    const text = formatStatsMessage(
      baseStats({
        longestActive: [{ reminderId: 1, preview: "Купити квитки", ageMs: (5 * 24 + 3) * 60 * 60_000 }],
      })
    );
    expect(text).toContain("1. Купити квитки — 5 дн 3 год");
  });
});
