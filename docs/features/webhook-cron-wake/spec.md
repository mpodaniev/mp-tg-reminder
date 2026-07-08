---
status: Draft
owner: "Mykhailo Podaniev"
reviewers: ["Owner"]
updated_at: "2026-07-02"
feature_size: "M"
---

# Spec — webhook-cron-wake

> **Glossary:** reuses [docs/features/telegram-reminder/CONTEXT.md](../telegram-reminder/CONTEXT.md) — Owner, Reminder, Fire. No new domain terms are introduced by this feature; no per-feature CONTEXT.md was created.
> **Reference module / docs / channels used:** `src/main.ts`, `src/scheduler/scheduler.ts`, `src/ports/router.ts`, `src/app/use-cases/fire-due-reminders.ts` (current architecture, read via `docs/architecture-map.md`); Fly.io's own docs on idle-based auto-stop/auto-start, scheduled-machine runs, and the `fly-apps/cron-manager` community project (read via a researcher subagent, product-level only — no library/API names carried into this spec).

## 1. Context

The bot (a single-Owner personal Telegram reminder tool) currently runs as an always-on Fly.io machine that continuously long-polls the Telegram API for updates, and separately runs an in-process 15-second timer that checks for reminders whose scheduled time has arrived and fires them. This keeps the machine busy 24/7 even though the Owner's usage is bursty and sparse — a personal tool with negligible traffic. This spec addresses whether and how the machine can be allowed to sit idle between activity without breaking either normal chat responses or the proactive, time-scheduled firing of reminders that don't depend on the Owner doing anything.

The trigger was the Owner investigating a Fly.io billing notice and asking about idle-based auto-stop features. Two facts surfaced during investigation and were confirmed by a researcher subagent against Fly.io's own documentation and community tooling: (1) Fly.io's idle-based stop/start mechanism only tracks inbound HTTP connections through its proxy — it has no visibility into an app's own outbound long-polling loop or internal timers, so it is structurally inapplicable to the bot's current design; (2) no platform (Fly.io included, per its own scheduled-machines documentation and the community cron-orchestrator project surveyed) offers a primitive to wake a process at an arbitrary future minute — every real-world pattern for "proactive notification from a sleeping host" converges on an external periodic caller hitting an HTTP endpoint on the app.

The committed approach: migrate the bot from long-polling to a Telegram webhook (so the app has real inbound HTTP traffic the platform can track) and add an authenticated periodic "wake" endpoint that an external scheduler calls to trigger a due-reminders check, allowing the platform to safely stop and restart the machine between calls. Because the current monthly bill ($1.14) is already under Fly's $5 free-billing floor, a separate research pass (devil's-advocate failure-mode review) confirmed the realized cost savings from this change are $0 today — so this spec reframes the primary value as operational hygiene and reliability hardening (closing gaps that exist independently of whether idle-stop ships), not cost reduction; cost benefit is deferred to future usage growth.

Traceability: the devil's-advocate review, run against the actual code, found several defects that exist in the current design and would be made worse (not created) by adding sleep/wake cycles: in-memory conversation state (`pendingCustom` in `src/ports/router.ts:19`) has no durability, only `callback_query` handling checks the sender is the Owner (`src/ports/router.ts:64`) while message-based handlers do not, `FireDueReminders` sends before marking fired (`src/app/use-cases/fire-due-reminders.ts:25-27`) which is a duplicate-delivery risk under any process interruption, and `SIGTERM` handling in `src/main.ts:81-85` does not await an in-flight scheduler tick before closing the database. This spec's §5 acceptance criteria are written to close these gaps as first-class requirements, independent of the idle-stop mechanism itself.

**Decision override (critic finding F1, no user response available to confirm live — recorded for review at `clarify`):** AC-06's "never deliver a reminder twice" requirement tightens the existing accepted behavior in ADR-0005, which leaves a reminder in the `firing` state for retry on a send failure — an accepted at-least-once trade-off today. Under the current always-on design that ambiguous window (send succeeded, but the follow-up write recording it did not) is rare; sleep/wake cycles make process interruption at exactly that point routine (e.g. `SIGTERM` racing an in-flight tick, per the traceability paragraph above), so the same accepted risk would fire far more often. This spec therefore **amends** ADR-0005 by requiring idempotent delivery (a reminder already recorded as delivered is never re-sent, even on retry) rather than overturning its retry-on-failure design; a formal ADR update is expected during `design`.

**Decision override (critic finding F2, no user response available to confirm live):** AC-05 (surviving a mid-conversation restart) requires the "awaiting custom time" prompt to be durable, which means persisting state that today lives only in an in-memory `Map` — a new persisted field/table per the architecture map's own convention. Combined with the new webhook + wake endpoints (a new API) and the auth/idempotency hardening above, this pushes the feature past the "S" classification (which allows at most one of new-module/new-API/migration) into **M** (`feature_size` updated to `"M"` in the frontmatter and in `.size`). This is a size correction, not a scope cut — the underlying data-loss bug is real and independent of whether idle-stop itself ships.

**Assumptions ledger (recorded because the user was unreachable for live Socratic confirmation across three attempts — flagged for override at the next `clarify` pass):**
- Proceeding with the full webhook + cron-wake approach (not the lighter "webhook only, no auto-stop" alternative that was also offered and not answered).
- Reframing the goal away from cost savings (confirmed $0 near-term) toward reliability/hygiene, rather than abandoning the feature.
- Accepting a wake-interval-bounded reminder delay (see NFR) as an intentional, communicated trade-off rather than trying to preserve the current 15-second tick accuracy.

## 2. Goals

- The machine can sit fully stopped between activity windows without the Owner losing, duplicating, or delaying reminders beyond an explicitly communicated bound.
- Every new inbound surface this feature adds (the Telegram webhook, the periodic wake endpoint) is authenticated so only Telegram and the configured external scheduler can trigger bot behavior — closing the pre-existing owner-authorization gap in the same pass.
- A missed or delayed external wake cycle degrades reminder delivery gracefully (later, not lost, not duplicated) rather than failing silently.

## 3. Non-goals

- Sub-minute reminder delivery precision is not preserved — reason: no platform primitive exists to wake a process at an arbitrary future minute (confirmed by research); the wake-interval bound replaces the current 15-second tick.
- Building or adopting a dedicated scheduling/orchestration service (e.g. a full cron-manager style system) is out of scope — reason: overkill for a single-Owner bot that needs one lightweight periodic check; a plain external periodic caller is sufficient.
- Near-term cost reduction is not a goal of this spec — reason: the current bill is already under Fly.io's free-billing floor, so the realized dollar savings are $0 today; this is a hygiene/reliability change, not a cost-cutting one.
- Changing the persistence layer (SQLite) or the reminder domain model is out of scope — reason: unrelated to how the process is woken or how it receives updates (the one new piece of persisted state, the durable custom-time prompt, extends the existing repository rather than replacing it).

## 4. User stories

### US-01: Reminders keep firing while the machine sleeps

**As an** Owner
**I want** my scheduled reminders to still arrive even when the machine has been idle
**So that** I don't miss a reminder just because nothing else was happening

### US-02: Chat behavior is unchanged after the migration

**As an** Owner
**I want** forwarding a message and picking a time to work exactly as it does today
**So that** the internal switch to webhook + wake doesn't change my day-to-day experience

### US-03: In-progress input survives an idle cycle

**As an** Owner
**I want** my reply to a "pick a custom time" prompt to still be understood even if the machine went idle and restarted in between
**So that** I don't have to notice a special case and restart the flow myself

### US-04: No duplicate reminders

**As an** Owner
**I want** each reminder delivered exactly once
**So that** an interrupted process or a retried check doesn't spam me with the same reminder repeatedly

### US-05: The bot can't be triggered by anyone but me and my scheduler

**As an** Owner
**I want** the new public endpoints to reject anyone who isn't Telegram or my configured external scheduler
**So that** exposing an HTTP surface doesn't become a way for a stranger to manipulate my reminders or run up activity on my machine

### US-06: A missed wake cycle doesn't silently lose a reminder

**As an** Owner
**I want** a reminder that became due during a gap in external wake calls to still fire once the next call succeeds
**So that** an unreliable third-party scheduler never means a reminder just vanishes

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** the machine has been idle with no activity for longer than the configured idle window
**When** the scheduled time for one of the Owner's pending reminders arrives
**Then** the system starts back up and delivers the reminder to the Owner within the delivery-delay bound defined in the non-functional requirements, confirming delivery the same way it does today

### AC-02 (US-02) — happy path

**Given** the Owner forwards a message to the bot exactly as before
**When** the bot is running in the new webhook-and-wake mode
**Then** the Owner is offered the same quick-pick choices and confirmation as before, with no visible change in behavior

### AC-03 (US-01) — error

**Given** the Owner is about to confirm a reminder time that falls sooner than the wake interval (see §6 terminology)
**When** the Owner confirms that time
**Then** the system tells the Owner that, under normal operation (the external wake source running on schedule), delivery may arrive up to the wake interval late — an estimate for the ordinary case, not a guarantee; a missed wake cycle can delay it further per AC-07, but never causes it to be lost — instead of silently promising the same immediacy as before

### AC-04 (US-05) — authorization

**Given** a request reaches the bot's message-handling or wake endpoint without a verifiable origin (not Telegram, not the configured external scheduler)
**When** the system processes that request
**Then** the system rejects it and takes no action on the Owner's reminders or settings — the Owner's data is unchanged

### AC-04b (US-05) — authorization

**Given** a request reaches the bot's message-handling endpoint with a verifiable Telegram origin but from a sender who is not the Owner
**When** the system processes that request
**Then** the system denies the action on every handler that touches the Owner's reminders or settings — not only callback-based ones as today — and the Owner's data is unchanged

### AC-01b (US-01) — domain invariant

**Given** a wake call has triggered a due-reminders check
**When** that check is in progress
**Then** the machine stays available until the check has finished delivering and durably recording every due reminder, before the machine is allowed to go idle again

### AC-05 (US-03) — domain invariant

**Given** the Owner has been prompted for a custom time and has not yet replied
**When** the machine goes idle and later restarts before the Owner replies
**Then** the system still recognizes the Owner's next reply as the awaited custom time and schedules the reminder — the prompt is not silently forgotten

### AC-06 (US-04) — domain invariant

**Given** a specific scheduled occurrence of a reminder (the original scheduled time, or a new time set via a Snooze) has already been delivered to the Owner
**When** the wake mechanism runs again and re-evaluates due reminders — including a retry of an earlier check
**Then** the system does not deliver that same scheduled occurrence a second time, even if an earlier attempt is retried; a reminder that is Snoozed to a new time is treated as a new occurrence and is expected to fire again at that new time. If it is ever ambiguous whether an earlier attempt actually reached the Owner, the system favors not delivering again over delivering again — accepting, in that narrow case only, a small risk that a genuinely-failed send is not retried, consistent with the amended ADR-0005 decision in §1.

### AC-07 (US-06) — cross-context

**Given** the external wake source fails to trigger the bot for one or more expected cycles
**When** the wake source eventually succeeds again
**Then** the system fires any reminders that became due during the gap, and the Owner is not left with a silently dropped reminder — delivery is delayed, never lost

## 6. Non-functional requirements

**Interval terminology used throughout this spec:** the *idle window* (AC-01) is the platform's own auto-stop threshold — how long the machine sits with no inbound HTTP activity before the platform stops it; it does not by itself affect reminder timing. The *wake interval* (this section, §8, and AC-03/AC-07, where earlier drafts also said "check interval" or "expected cycles" — all the same value) is the period between calls from the external scheduler to the wake endpoint, and directly bounds the delivery-delay row below.

**Constraint:** the wake interval chosen (§8) must leave headroom under the delivery-delay target — i.e. wake interval + cold-start p95 (row below) must together keep delivery-delay p95 at ≤ 5 min, so the interval itself must be set below 5 min, not equal to it.

| Aspect | Target | Measurement |
|---|---|---|
| Reminder delivery delay (p95), for reminders scheduled at least one wake interval ahead | ≤ 5 min from the scheduled time | compare scheduled time vs actual sent timestamp in application logs |
| Unauthenticated request rejection (webhook + wake endpoints) | 100% rejected, 0% processed | rejected-request counter in application logs |
| Duplicate reminder deliveries | 0 per reminder occurrence | count of sent-events per reminder id in logs |
| Webhook message processing success rate | ≥ 99% of platform-delivered updates processed without error | delivery-error counters from the messaging platform's own diagnostics |
| Cold-start wake latency (p95) | ≤ 15 s from external wake call to the process being ready to check reminders | machine-start timestamp vs first successful reminder check, from logs |

## 6.1 Security / privacy

- **Data classification:** internal — personal reminder content for a single Owner; no new data classes are introduced by this feature.
- **Personal data touched:** none new; the same reminder/message data already handled today now also transits the new webhook and wake endpoints.
- **AuthZ/AuthN impact:** introduces two new inbound trust boundaries that did not exist before (previously the process only made outbound calls to the messaging platform, so nothing external could reach in). Both new endpoints require verifying the caller's origin before doing anything; every message-handling code path — not only callback queries as today — must deny action from a non-Owner sender, closing the existing gap.
- **Abuse cases:**
  - A forged update posted to the guessed webhook address: the system rejects it before any handler runs; no reminder or setting is touched.
  - A leaked or guessed wake-endpoint credential used to force repeated wake cycles: the system rejects any wake attempt without a current valid credential, and the Owner can rotate it without needing to change anything else.
  - A message or callback from a sender who is not the Owner: the system denies the action consistently across every handler, not only callback queries.
  - A wake request that arrives twice (network retry): the system treats the extra call as a harmless no-op check, never a second delivery (ties to AC-06).
- **Security review:** Required — this feature adds the bot's first public inbound endpoints and closes a pre-existing owner-authorization gap.

## 7. Metrics / KPIs

- **On-time reminder delivery** — baseline: ~100% within 15 s today (fixed tick); target: ≥95% within the 5-minute bound within 2 weeks of launch, tracked via delivery-delay logs.
- **Idle machine time share** — baseline: 0% (always-on today); target: ≥50% of each rolling 24h period spent stopped, tracked via platform start/stop events, within 30 days of rollout.
- **Delivery-integrity incidents** — baseline: 0 known incidents; target: 0 duplicate-delivery or lost-reminder incidents in the first 30 days post-launch, tracked via log audit + Owner reports.
- **Unauthorized-request block rate** — baseline: N/A (no public endpoint exists today to measure); target: 100% of non-Telegram/non-scheduler requests rejected from day one, tracked via access logs.

## 8. Open questions

- [ ] Which external scheduler will call the periodic wake endpoint (a free cron-ping service, a scheduled CI workflow, or the hosting platform's own scheduled-machine feature)? Default now: a free external cron-ping service. — owner: Mykhailo Podaniev, due: before `sdd:design`
- [ ] What wake interval balances the delivery-delay NFR against the chosen scheduler's minimum granularity — chosen with headroom under the §6 constraint (interval + cold-start p95 ≤ 5 min), not equal to the 5-min NFR itself? Default now: 5 minutes (flagged in §6 as needing revisiting against the constraint — a value with headroom, e.g. 2–3 min, may be required once the scheduler is picked). — owner: Mykhailo Podaniev, due: before `sdd:design`
- [ ] Is there a max-overdue age beyond which a reminder that became due during a long wake-source gap (AC-07) is fired-with-a-note rather than fired silently as if on time, or should every overdue reminder always fire regardless of age? Default now: no cutoff — always fire, regardless of how overdue. — owner: Mykhailo Podaniev, due: before `sdd:design`
- [ ] Should the durable "awaiting custom time" prompt (AC-05) expire after some time window, and what happens if the Owner sends an unrelated message (e.g. forwards a new source message) before replying with the custom time — does that cancel the pending prompt or queue alongside it? Default now: no expiry (the prompt stays live until answered), and an intervening forward cancels the pending prompt in favor of the new one. — owner: Mykhailo Podaniev, due: before `sdd:design`
- [ ] What idle-window value and wake cadence are actually needed to reach the ≥50%-stopped KPI (§7) without the webhook's own persistent inbound traffic resetting the platform's idle timer before it can fire? Default now: unknown — needs validation against the actual platform behavior during `design`. — owner: Mykhailo Podaniev, due: before `sdd:design`
- [ ] Should the webhook migration + reliability hardening ship as its own release first (machine still always-on), with idle-stop enabled in a follow-up once monitored in production? Default now: ship together. — owner: Mykhailo Podaniev, due: before `sdd:tasks`
- [ ] Given the confirmed $0 near-term cost delta, should the roadmap framing for this feature be reliability/hygiene rather than cost savings? Default now: yes, reliability/hygiene framing. — owner: Mykhailo Podaniev, due: before `sdd:ship`
- [ ] Three separate `AskUserQuestion` prompts during the `specify` session (interview depth/idea/size, the negative-ROI go/no-go decision, and the critic-finding resolutions) went unanswered and were resolved by Claude's best judgment — please review every "Decision override" and "Assumptions ledger" bullet in §1 and correct anything that doesn't match your intent. — owner: Mykhailo Podaniev, due: before `sdd:design`
- [ ] `sdd:clarify` ran on 2026-07-02: a clean-context devil's-advocate subagent plus a self-sweep surfaced 10 ambiguities across AC-06/Snooze scope, AC-03/AC-07's delay-bound conflict, the NFR-vs-wake-interval math, the AC-04 owner-authorization gap, and interval terminology — all resolved in place (AC-01b, AC-03, AC-04b, AC-06, §6 rewritten) — plus 4 genuinely open items appended to this section. Two `AskUserQuestion` batches during this pass went unanswered (60s timeout, no response) — every "Resolve now" edit above used Claude's best-judgment default (the "(Recommended)" option offered), not a confirmed choice. Please review the rewritten AC-01b/03/04b/06 and the new §6 terminology/constraint paragraphs against your intent. — owner: Mykhailo Podaniev, due: before `sdd:design`
