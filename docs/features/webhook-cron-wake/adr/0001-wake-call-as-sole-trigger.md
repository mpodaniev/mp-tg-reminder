---
status: Accepted
owner: "Mykhailo Podaniev"
reviewers: []
updated_at: "2026-07-02"
feature_size: "M"
ticket: "webhook-cron-wake"
---

# 0001 — Use the external wake call as the sole trigger for due-reminder checks

- **Status:** Accepted
- **Date:** 2026-07-02
- **Deciders:** Mykhailo Podaniev (Architect), no live response during the Socratic walk — Recommended default applied per Auto Mode, flagged for review.

## Context

The bot today drives `FireDueReminders` / `ExpireStalePrompts` from an in-process `setInterval` tick every 15 seconds (`src/scheduler/scheduler.ts:16`, `src/main.ts:52`). This feature's entire premise is letting the Fly.io machine idle-stop between activity — but an in-process timer keeps the process busy forever, which is structurally incompatible with idle-stop (per spec.md §1: Fly.io's idle-stop only tracks inbound HTTP, not internal timers). A decision is needed on what replaces the timer as the trigger for due-reminder checks.

## Decision drivers

- Spec §1: Fly.io's idle-stop mechanism has no visibility into an app's own internal timers — a live `setInterval` structurally prevents the machine from ever stopping.
- Spec AC-07: a reminder that becomes due during a gap in wake calls must still fire once the next wake call succeeds, with no cutoff on how overdue it is — this already gives the design a correctness net without needing a timer as a safety fallback.
- Spec §2 Goals: "the machine can sit fully stopped between activity windows."

## Considered options

1. **Wake-only trigger** — remove the internal `setInterval` entirely; `FireDueReminders`/`ExpireStalePrompts` run only when the external wake HTTP endpoint is called.
2. **Timer as a long-interval fallback** (e.g. every 4 hours) alongside the wake endpoint — a safety net if the external scheduler goes down for an extended period.

## Decision outcome

**Chosen:** Option 1, wake-only trigger. The internal timer is removed from `src/scheduler/scheduler.ts` and `src/main.ts`; the same tick logic becomes a method invoked by the new wake HTTP handler. Any fallback timer, even a long one, keeps the machine from ever fully idling for that duration — directly working against this feature's stated goal — and AC-07's no-cutoff catch-up semantics already provide the reliability property a fallback timer would otherwise exist for.

## Consequences

**Positive**
- The machine can actually reach a fully-stopped state — the feature's core goal is achievable, not just theoretically possible.
- Simpler runtime model: exactly one code path drives due-reminder checks, invoked identically whether triggered by the interval-turned-wake-handler in dev or the real external scheduler in production.

**Negative**
- Reminder delivery now depends entirely on the external scheduler's reliability; if it stops calling the wake endpoint indefinitely, reminders stop firing until it resumes (mitigated by AC-07 catch-up, but there is no bound on how long a total outage can run undetected).
- Losing the previous 15-second-tick precision is a felt behavior change for the Owner (already accepted in spec §3 Non-goals).

**Neutral**
- Re-adding a fallback timer later (if the external scheduler proves unreliable in practice) is a small, local change — this decision is not hard to reverse if needed.

## Links

- Spec: [[../spec.md]]
- SAD: [[../sad.md]] §4
- Related ADR: none
