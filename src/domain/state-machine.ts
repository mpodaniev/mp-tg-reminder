import { InvalidStateTransitionError } from "./errors.js";

export type ReminderState =
  | "awaiting_time"
  | "pending"
  | "firing"
  | "fired"
  | "done"
  | "deleted"
  | "expired";

export type ReminderEvent =
  | "schedule"
  | "expire"
  | "fire"
  | "deliver"
  | "snooze"
  | "resolve_done"
  | "resolve_delete"
  | "cancel";

export const VALID_TRANSITIONS: Record<
  ReminderState,
  Partial<Record<ReminderEvent, ReminderState>>
> = {
  awaiting_time: {
    schedule: "pending",
    expire: "expired",
  },
  pending: {
    fire: "firing",
    cancel: "deleted",
  },
  firing: {
    deliver: "fired",
  },
  fired: {
    snooze: "pending",
    resolve_done: "done",
    resolve_delete: "deleted",
  },
  done: {},
  deleted: {},
  expired: {},
};

export function transition(
  state: ReminderState,
  event: ReminderEvent
): ReminderState {
  const next = VALID_TRANSITIONS[state][event];
  if (next === undefined) {
    throw new InvalidStateTransitionError(state, event);
  }
  return next;
}
