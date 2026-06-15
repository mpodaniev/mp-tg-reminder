export class InvalidStateTransitionError extends Error {
  constructor(from: string, event: string) {
    super(`Cannot apply event '${event}' to reminder in state '${from}'`);
    this.name = "InvalidStateTransitionError";
  }
}

export class PastScheduledTimeError extends Error {
  constructor() {
    super("Scheduled time must be in the future");
    this.name = "PastScheduledTimeError";
  }
}

export class AlreadyResolvedError extends Error {
  constructor() {
    super("Reminder is already resolved — no further action is possible");
    this.name = "AlreadyResolvedError";
  }
}

export class TimezoneNotConfiguredError extends Error {
  constructor() {
    super("Owner timezone is not configured — set it via /settings first");
    this.name = "TimezoneNotConfiguredError";
  }
}

export class ReminderNotFoundError extends Error {
  constructor(id: number) {
    super(`Reminder ${id} not found`);
    this.name = "ReminderNotFoundError";
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized: not the Owner");
    this.name = "UnauthorizedError";
  }
}
