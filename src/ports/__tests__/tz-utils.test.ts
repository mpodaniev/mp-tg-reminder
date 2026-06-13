import { describe, it, expect } from "vitest";
import { localTodayAt, getOwnerHour } from "../tz-utils.js";

describe("localTodayAt", () => {
  it("returns UTC ms that, when formatted in the given timezone, shows the requested hour:minute", () => {
    const tz = "Europe/Kyiv";
    const ms = localTodayAt(tz, 19, 0, 0);
    const formatted = new Intl.DateTimeFormat("uk", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(ms));
    expect(formatted).toBe("19:00");
  });

  it("with dayOffset=1 returns next-day 07:00 in the given timezone", () => {
    const tz = "Europe/Kyiv";
    const ms = localTodayAt(tz, 7, 0, 1);
    const parts = new Intl.DateTimeFormat("uk", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(ms));
    expect(parts).toBe("07:00");

    const dayParts = new Intl.DateTimeFormat("uk", {
      timeZone: tz,
      weekday: "short",
    }).format(new Date(ms));
    const todayParts = new Intl.DateTimeFormat("uk", {
      timeZone: tz,
      weekday: "short",
    }).format(new Date(localTodayAt(tz, 7, 0, 0)));
    // tomorrow is a different day
    expect(dayParts).not.toBe(todayParts);
  });

  it("works for UTC+0 timezone", () => {
    const tz = "UTC";
    const ms = localTodayAt(tz, 12, 30, 0);
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(ms));
    expect(formatted).toBe("12:30");
  });
});

describe("getOwnerHour", () => {
  it("returns the current local hour in the given timezone", () => {
    const tz = "Europe/Kyiv";
    const ms = Date.now();
    const hour = getOwnerHour(tz, ms);
    const expected = Number(
      new Intl.DateTimeFormat("uk", {
        timeZone: tz,
        hour: "numeric",
        hour12: false,
      }).format(new Date(ms))
    );
    expect(hour).toBe(expected);
  });
});
