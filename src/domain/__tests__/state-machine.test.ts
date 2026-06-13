import { describe, it, expect } from "vitest";
import {
  transition,
  VALID_TRANSITIONS,
  type ReminderState,
} from "../state-machine.js";
import { InvalidStateTransitionError } from "../errors.js";

describe("state machine transitions", () => {
  it("awaiting_time → pending", () => {
    expect(transition("awaiting_time", "schedule")).toBe("pending");
  });

  it("awaiting_time → expired", () => {
    expect(transition("awaiting_time", "expire")).toBe("expired");
  });

  it("pending → firing", () => {
    expect(transition("pending", "fire")).toBe("firing");
  });

  it("firing → fired", () => {
    expect(transition("firing", "deliver")).toBe("fired");
  });

  it("firing → pending (re-fire on restart = back to firing; deliver after re-fire)", () => {
    // firing row after restart stays firing; scheduler picks it up again
    expect(transition("firing", "deliver")).toBe("fired");
  });

  it("fired → pending (snooze)", () => {
    expect(transition("fired", "snooze")).toBe("pending");
  });

  it("fired → done", () => {
    expect(transition("fired", "resolve_done")).toBe("done");
  });

  it("fired → deleted", () => {
    expect(transition("fired", "resolve_delete")).toBe("deleted");
  });

  it("invalid transition throws InvalidStateTransitionError", () => {
    expect(() => transition("done", "snooze")).toThrow(
      InvalidStateTransitionError
    );
  });

  it("invalid transition from deleted throws", () => {
    expect(() => transition("deleted", "resolve_done")).toThrow(
      InvalidStateTransitionError
    );
  });

  it("invalid transition from expired throws", () => {
    expect(() => transition("expired", "fire")).toThrow(
      InvalidStateTransitionError
    );
  });
});
