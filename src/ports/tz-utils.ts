export function getOwnerHour(timezone: string, nowMs: number): number {
  return Number(
    new Intl.DateTimeFormat("uk", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(new Date(nowMs))
  );
}

export function localTodayAt(timezone: string, hour: number, minute: number, dayOffset: number): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value) - 1;
  const day = Number(parts.find((p) => p.type === "day")!.value);

  const base = new Date(Date.UTC(year, month, day + dayOffset, 0, 0, 0, 0));

  const offsetMs = getUtcOffsetMs(timezone, base.getTime());
  return Date.UTC(
    base.getUTCFullYear(),
    base.getUTCMonth(),
    base.getUTCDate(),
    hour,
    minute,
    0,
    0
  ) - offsetMs;
}

function getUtcOffsetMs(timezone: string, probeMs: number): number {
  const probe = new Date(probeMs);
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(probe);
  return new Date(local.replace(", ", "T") + "Z").getTime() - probeMs;
}
