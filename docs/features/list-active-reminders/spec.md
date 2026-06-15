---
status: Draft
owner: "Mykhailo Podaniev"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-06-15"
feature_size: "S"
---

# Spec — list-active-reminders

> **Glossary:** [CONTEXT](./CONTEXT.md)
> **Reference module / docs / channels used:** the interview + CONTEXT + `docs/architecture-map.md` + the existing `telegram-reminder` artifacts (spec.md, sad.md) for prior decisions and NFRs. No external channels read.

## 1. Context

¶1 — The bot is reactive: a Reminder is captured, then it silently waits and fires at its scheduled time. The Owner has **no way to ask "what do I have coming up?"** Once a Reminder is scheduled it disappears from view until it fires, so the Owner cannot review, sanity-check, or prune upcoming Reminders. This is a gap for the single Owner of a personal bot instance who schedules several Reminders and later wants to confirm or clean up what is still pending.

¶2 — Why now: the core capture→fire→resolve loop shipped (telegram-reminder, T01–T18). The next natural increment is **visibility into scheduled work** — the lowest-effort, highest-value follow-up, and a prerequisite for any future management features (bulk actions, search).

¶3 — Committed approach: a single **list command** (`/list`, also registered in the Telegram command menu) returns **one consolidated message** enumerating every Active reminder ordered by fire time, each carrying two inline actions — **go to source** and **cancel**. Cancelling an Active reminder removes it before it fires. The list is read + a single destructive action; rescheduling from the list is deferred.

¶4 — Traceability / deliberate overrides:
- **Decision override: cancellation of a `pending` reminder — rationale:** the telegram-reminder spec (Edit #8) restricted deletion to `fired` reminders only, on the premise that no UI surfaced pending reminders. This feature **adds** that surface, so it intentionally reopens the decision and introduces a `pending` → `deleted` lifecycle transition (to be recorded as an ADR in `design`). Reschedule (`pending` → `pending`) is explicitly NOT added here (see §3).
- The Active list is a **second** view of outstanding work alongside the cleared-inbox chat (fired-message presence). They use different definitions of "outstanding" (scheduled-but-unfired vs fired-but-unresolved) and are complementary, not redundant; §3 records this boundary.

## 2. Goals

- The Owner can see **all** upcoming Active reminders on demand, ordered by when they will fire, in a single glance.
- The Owner can remove an unwanted upcoming Reminder directly from that view, without waiting for it to fire.
- The list view never degrades the bot's safety posture — it stays within the existing anti-flood and owner-only guarantees.

## 3. Non-goals

- **Rescheduling from the list** — changing an Active reminder's time needs a time-entry dialog; deferred to a separate feature to keep this increment small.
- **Showing `fired`-but-unresolved or `firing` reminders** — those already live in the chat as fired messages (the cleared-inbox view); the Active list is scoped to `pending` only to avoid two surfaces claiming the same item. This `pending`-only scope is firm and **overrides** the former §8 open question about crash-stuck `firing` reminders (now resolved — see §8).
- **Search / filtering / grouping** of reminders — the list is a flat chronological view; query features are out of scope.
- **Multi-user / shared lists** — the bot remains single-Owner; no cross-user listing.

## 4. User stories

### US-01: View upcoming reminders

**As an** Owner
**I want** to request a list of all my Active reminders
**So that** I can see everything I have scheduled and when each will fire.

### US-02: Cancel an upcoming reminder

**As an** Owner
**I want** to cancel an Active reminder from the list
**So that** I can remove something I no longer need before it fires.

### US-03: Jump to a reminder's source

**As an** Owner
**I want** to open the original source message of a listed reminder
**So that** I can recall its full context before deciding what to do.

### US-04: Understand an empty list

**As an** Owner
**I want** a clear message when I have no Active reminders
**So that** I can trust that nothing is scheduled rather than wonder if the list failed.

### US-05: Reach the list quickly

**As an** Owner
**I want** to open the list both by typing a command and from the bot's command menu
**So that** I can check my reminders without remembering exact syntax.

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** an authorized Owner with three Active reminders scheduled for different times
**When** the Owner sends the list command
**Then** the bot replies with a single message listing all three Active reminders ordered from the soonest fire time to the latest (reminders sharing the same fire time are ordered by capture order, earliest first), each showing a bounded preview of its source text (first line, up to ~100 characters) and its fire time as an absolute local date-time in the Owner's configured home timezone (the one set via `/settings`).

### AC-02 (US-04) — happy path (empty)

**Given** an authorized Owner with no Active reminders
**When** the Owner sends the list command
**Then** the bot replies with a single message stating that there are no active reminders.

### AC-03 (US-02) — happy path (cancel)

**Given** an authorized Owner viewing the Active list that includes a reminder still in the `pending` state
**When** the Owner taps that reminder's cancel action
**Then** the bot transitions the reminder to the `deleted` state so it will never fire, and confirms the cancellation to the Owner in a separate message; the originally rendered list message is left unchanged — a frozen point-in-time snapshot, so re-tapping the cancelled entry is a safe no-op per AC-04.

### AC-04 (US-02) — domain invariant violation

**Given** an authorized Owner taps the cancel action on a listed reminder that is no longer Active (it has since moved to any non-`pending` state — `firing`, `fired`, `done`, `deleted`, or `expired` — since the list was rendered)
**When** the bot processes the action
**Then** the bot does not crash or double-act; it shows the Owner a single uniform "no longer active" message for every non-`pending` end state (including a `firing` reminder mid-delivery) and takes no further change. *(Named invariant: only an Active — `pending` — reminder can be cancelled from the list.)*

### AC-05 (US-01, US-02) — authorization

**Given** a Telegram user who is not the Owner
**When** that user sends the list command or taps a list action button
**Then** the bot does not reveal any reminders and does not perform any action, consistent with the bot's owner-only access rule.

### AC-06 (US-03) — cross-context

**Given** an authorized Owner viewing the Active list where one reminder has no available source link (its source chat has no public username, so no deep link can be built — the same availability rule the fired-reminder flow uses)
**When** the Owner taps that reminder's go-to-source action
**Then** the bot does not present a broken link; it instead shows the captured source content inline (the same graceful fallback used when a fired reminder's source link is unavailable).

### AC-07 (US-05) — happy path (entry points)

**Given** an authorized Owner
**When** the Owner opens the list either by typing the list command or by selecting it from the Telegram command menu
**Then** both paths produce the same Active list response.

### AC-08 (US-01) — anti-flood invariant

**Given** an authorized Owner with more Active reminders than the bot's per-window message limit allows
**When** the Owner sends the list command
**Then** the bot still replies with exactly one message and never exceeds the anti-flood budget: when the Active set is too large to fit a single message, the bot lists the soonest-firing reminders that fit and appends an overflow indicator (e.g. "… ще M", the count of reminders not shown) rather than sending additional messages. *(Named invariant: a single list invocation never exceeds the anti-flood message budget — the send-count assertion lives in §6.)*

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Latency p95 list response | ≤ 1000 ms from command receipt to message sent | timing log around the list use-case |
| Messages per list-command response | exactly 1 bot message regardless of reminder count — scopes the `/list` response only; replies to action-button taps (cancel confirm, stale no-op, inline source) are separate messages | integration test asserting send-count = 1 for the list command |
| Anti-flood | inherits the existing ≤ 10 bot messages / 60 s window — the list must not contribute more than 1 | existing anti-flood metric |
| Accuracy | the list reflects the `pending` set at query time; ordering is by fire time ascending | integration test with fixed clock |
| Owner-only | every list command and list action is rejected for any non-Owner | unit test on the auth gate |

## 6.1 Security / privacy

- **Data classification:** confidential — reminders contain the Owner's forwarded personal messages and their scheduled times.
- **Personal data touched:** none new — the list reads existing `source_snapshots` + `reminders` data; no new fields are introduced.
- **AuthZ/AuthN impact:** the list command and its action buttons reuse the existing single-Owner gate; a new capability (cancel a `pending` reminder) is added but is gated by the same Owner check. No new authorization boundary.
- **Abuse cases:**
  - non-Owner sends the list command: bot ignores/denies, reveals nothing.
  - non-Owner forges a list action button callback: bot rejects the action (owner gate on callbacks), no state change.
  - stale-list replay (Owner taps cancel on an already-changed reminder): bot no-ops gracefully (AC-04), no double-delete.
- **Security review:** N/A — single-Owner bot, no new authz boundary or PII; the one new mutation (cancel pending) is gated by the existing Owner check. (Re-evaluate if multi-user is ever introduced.)

## 7. Metrics / KPIs

- **List command usage** — baseline: 0 (new), target: the Owner uses it at least weekly within 30 days of ship.
- **Cancellations from the list** — baseline: 0, target: ≥ 1 successful cancel from the list within 30 days (proves the action works end-to-end in real use).
- **List-action errors** — baseline: 0, target: 0 unhandled errors (crashes / `bot.catch` hits) from list commands or list actions over any 30-day window.

## 8. Open questions

- [ ] Should rescheduling an Active reminder from the list be added? Default now: deferred to a separate feature. — owner: Mykhailo Podaniev, due: after this feature ships

> Resolved during drafting: the stale-list / fire-between-render-and-tap scenario is decided — the list is a point-in-time snapshot with no live refresh; tapping cancel on a since-fired reminder is a graceful no-op. This behavior is fixed and tested by **AC-04**, so it is not carried as an open question.
>
> Resolved during clarify (2026-06-15): crash-stuck `firing` reminders (re-fire path, ADR-0005) do **not** surface in the list — the list is strictly `pending`-only (§3 overrides the former OQ#2). A reminder that has moved to `firing` since render is handled by AC-04's uniform "no longer active" no-op.
