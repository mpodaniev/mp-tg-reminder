import { transition, type ReminderState } from "./state-machine.js";
import { type ScheduledTime } from "./value-objects/scheduled-time.js";
import { type SourceSnapshot } from "./value-objects/source-snapshot.js";

export interface ReminderProps {
  id?: number;
  snapshot: SourceSnapshot;
  state?: ReminderState;
  scheduledAt?: number | null;
  firedAt?: number | null;
  deliveredAt?: number | null;
  firedMessageId?: number | null;
  createdAt?: number;
}

export class Reminder {
  readonly id: number | undefined;
  readonly snapshot: SourceSnapshot;
  private _state: ReminderState;
  private _scheduledAt: number | null;
  private _firedAt: number | null;
  private _deliveredAt: number | null;
  private _firedMessageId: number | null;
  readonly createdAt: number;

  private constructor(props: ReminderProps) {
    this.id = props.id;
    this.snapshot = props.snapshot;
    this._state = props.state ?? "awaiting_time";
    this._scheduledAt = props.scheduledAt ?? null;
    this._firedAt = props.firedAt ?? null;
    this._deliveredAt = props.deliveredAt ?? null;
    this._firedMessageId = props.firedMessageId ?? null;
    this.createdAt = props.createdAt ?? Date.now();
  }

  static create(props: Omit<ReminderProps, "state">): Reminder {
    return new Reminder({ ...props, state: "awaiting_time" });
  }

  static reconstitute(props: ReminderProps): Reminder {
    return new Reminder(props);
  }

  get state(): ReminderState {
    return this._state;
  }

  get scheduledAt(): number | null {
    return this._scheduledAt;
  }

  get firedAt(): number | null {
    return this._firedAt;
  }

  get deliveredAt(): number | null {
    return this._deliveredAt;
  }

  get firedMessageId(): number | null {
    return this._firedMessageId;
  }

  schedule(time: ScheduledTime): void {
    this._state = transition(this._state, "schedule");
    this._scheduledAt = time.epochMs;
  }

  expire(): void {
    this._state = transition(this._state, "expire");
  }

  startFiring(): void {
    this._state = transition(this._state, "fire");
    this._firedAt = Date.now();
  }

  markFired(firedMessageId: number): void {
    this._state = transition(this._state, "deliver");
    this._firedMessageId = firedMessageId;
    this._deliveredAt = Date.now();
  }

  snooze(time: ScheduledTime): void {
    this._state = transition(this._state, "snooze");
    this._scheduledAt = time.epochMs;
    this._firedAt = null;
    this._deliveredAt = null;
    this._firedMessageId = null;
  }

  resolveDone(): void {
    this._state = transition(this._state, "resolve_done");
  }

  resolveDelete(): void {
    this._state = transition(this._state, "resolve_delete");
  }

  cancel(): void {
    this._state = transition(this._state, "cancel");
  }

  isResolved(): boolean {
    return this._state === "done" || this._state === "deleted";
  }
}
