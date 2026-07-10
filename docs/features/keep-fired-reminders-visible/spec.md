---
status: Draft
owner: "Mykhailo Podaniev"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-07-10"
feature_size: "S"
---

# Spec — keep-fired-reminders-visible

> **Glossary:** [CONTEXT](./CONTEXT.md)
> **Reference module / docs / channels used:** the interview + CONTEXT + `docs/architecture-map.md` + the existing `telegram-reminder` and `list-active-reminders` spec.md artifacts (for the decisions this feature reopens). No external channels read.

## 1. Context

¶1 — The Owner uses the list command to see everything scheduled, but the moment a reminder fires it vanishes from that list even though the Owner has not resolved it yet — the fired-reminder message is still sitting, unactioned, in the chat. This breaks the Owner's mental model of the list as "everything I still need to deal with": a reminder firing is not the same as the Owner being done with it, yet the list currently treats it that way. Separately, the fired-reminder message currently offers a **Done** action whose meaning is unclear to the Owner next to **Delete** — a second exit that looks distinct but isn't needed.

¶2 — Why now: the Owner hit this directly while using the shipped list-active-reminders feature — a fired reminder they still needed to act on had already disappeared from the list, forcing them to hunt for it in the chat instead. This is a correction to real usage, not a speculative ask.

¶3 — Committed approach: widen the list to show every reminder the Owner hasn't explicitly deleted yet — scheduled or already fired — clearly marking which is which, and holding each reminder at the position it was captured in so it never jumps around as it moves through its lifecycle. Retire the Done action entirely; Delete becomes the one and only way a reminder leaves the list.

¶4 — Traceability / deliberate overrides:
- **Decision override: fired reminders are hidden from the list — rationale:** `list-active-reminders` §3 scoped the list to `pending` only, treating fired reminders as already covered by the chat view. Real usage showed the Owner needs both surfaces to agree on "what's still outstanding," so this feature reopens that non-goal: the list now includes fired-but-undeleted reminders.
- **Decision override: list ordered by fire time — rationale:** `list-active-reminders` AC-01 ordered the list soonest-fire-time-first. Since fired items now stay listed indefinitely, sorting by fire time would bury newly captured reminders under old fired ones. The Owner asked instead for a stable position fixed at capture time, so reminders never reorder as they move through pending → fired.
- **Decision override: overflow truncation picks soonest-firing — rationale:** a mechanical consequence of the ordering override above — `list-active-reminders` AC-08's truncation rule ("keep the soonest-firing that fit") is restated against the new capture-order sort ("keep the earliest-added that fit").
- **Decision override: Done as a second resolving action — rationale:** `telegram-reminder` US-06/AC-06/AC-07 gave a fired reminder both a Done and a Delete action. The Owner finds Done's distinction from Delete unclear in practice and asked for it to be removed; Delete (and Snooze, which reschedules rather than resolves) remain.
- **Decision override: no delete action on the list itself — rationale:** this feature originally kept deletion confined to the fired-reminder message in chat (§3 non-goal, below). Real usage (`_fixes/2026-07-10-fired-row-no-delete-in-list.md`) showed the Owner needs to clear a fired entry straight from the list without hunting down that original message, so the list now also offers Delete on fired rows — see AC-09.

## 2. Goals

- The Owner can trust the list as a complete picture of every reminder they haven't explicitly deleted, whether it's still scheduled or already fired.
- The Owner can tell at a glance which listed reminders are still scheduled and which have already fired.
- The Owner has exactly one unambiguous way to remove a reminder from their view: deleting it.

## 3. Non-goals

- ~~Adding a delete action to the list itself~~ — **superseded by AC-09** (`_fixes/2026-07-10-fired-row-no-delete-in-list.md`): the list now also offers Delete on fired rows, reusing the same resolve path as the fired-message button, instead of requiring the Owner to locate that message in chat.
- **Capping or archiving the list** — no limit is added beyond the existing anti-flood truncation; an Owner who never deletes fired reminders will simply see them accumulate, accepted as a non-issue today.
- **Rescheduling from the list** — still deferred, unchanged from `list-active-reminders` §3.
- **Multi-user / shared lists** — the bot remains single-Owner, unchanged from prior specs.

## 4. User stories

### US-01: See every unresolved reminder

**As an** Owner
**I want** the list to include reminders that have already fired but that I haven't deleted yet
**So that** I can trust the list as the complete picture of everything I still need to act on

### US-02: Tell scheduled and fired reminders apart

**As an** Owner
**I want** each listed reminder to clearly show whether it's still scheduled or already fired
**So that** I don't confuse something still upcoming with something already delivered

### US-03: Keep a stable place in the list

**As an** Owner
**I want** a reminder to stay at the same position in the list as it moves from scheduled to fired
**So that** the list doesn't reshuffle under me every time something fires or gets snoozed

### US-04: Delete as the only way out

**As an** Owner
**I want** a reminder to leave the list only when I explicitly delete it
**So that** nothing disappears from my view without me choosing that

### US-05: One clear resolving action

**As an** Owner
**I want** the fired-reminder message to offer only Delete (plus Snooze) instead of both Done and Delete
**So that** I'm not stuck guessing what the second, unclear action actually does

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** an authorized Owner has a reminder that has already fired but has not been deleted
**When** the Owner requests the list
**Then** that reminder appears in the response alongside any still-scheduled reminders, instead of being silently omitted

### AC-02 (US-02) — happy path

**Given** an authorized Owner requests the list and it contains both still-scheduled and already-fired reminders
**When** the bot renders the response
**Then** each entry clearly indicates whether it is still scheduled or already fired, so the two are never visually indistinguishable

### AC-03 (US-03) — domain invariant

**Given** an authorized Owner has a reminder visible in the list
**When** that reminder fires, is delivered, or is snoozed to a new time
**Then** its position in the list is unchanged — none of those events reorders the list or moves the reminder to a different spot

### AC-04 (US-04) — domain invariant violation

**Given** an authorized Owner has a reminder visible in the list that has fired but not been deleted
**When** any event other than the Owner's explicit delete action occurs (it fires, is delivered, or is snoozed)
**Then** the reminder is not removed from the list — only an explicit delete removes a reminder from view

### AC-05 (US-04) — cross-context

**Given** an authorized Owner is viewing the list where some entries are already-fired reminders
**When** the Owner looks at the action available on a fired entry
**Then** no cancel action is offered on it — cancel remains available only on still-scheduled reminders, consistent with the existing rule that only a scheduled reminder can be cancelled

### AC-06 (US-05) — error / edge case

**Given** an authorized Owner has an older fired-reminder message from before this change that still displays the retired Done action
**When** the Owner taps that stale action
**Then** the bot does not crash and does not mark the reminder resolved through it; the Owner is told to use Delete instead, and the reminder's state is unchanged

### AC-07 (US-01) — authorization

**Given** a Telegram user who is not the Owner
**When** that user sends the list command
**Then** the bot reveals no reminders of any kind — scheduled or fired — consistent with the bot's owner-only access rule

### AC-08 (US-01) — happy path (overflow)

**Given** an authorized Owner has more visible reminders (scheduled plus fired-and-undeleted) than the bot's per-window message limit allows
**When** the Owner requests the list
**Then** the bot still replies with exactly one message, showing the earliest-added reminders that fit and appending an overflow indicator for the rest, rather than sending additional messages

### AC-09 (US-04) — happy path <!-- added-by-fix: 2026-07-10 -->

**Given** an authorized Owner is viewing the list where an entry has already fired but not been deleted
**When** the Owner taps that entry's Delete action from the list, instead of the fired-reminder message in chat
**Then** the reminder is deleted the same way it would be from that message's Delete button — the Owner is never required to locate the original fired message just to clear the list

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Latency p95 list response | ≤ 1000 ms from command receipt to message sent | timing log around the list use-case (unchanged from `list-active-reminders`) |
| Messages per list-command response | exactly 1 bot message regardless of reminder count | integration test asserting send-count = 1 |
| Anti-flood | inherits the existing ≤ 10 bot messages / 60 s window; the list still contributes at most 1 | existing anti-flood metric |
| Accuracy | the list reflects every reminder not yet explicitly deleted (scheduled or fired) at query time, ordered by capture time ascending | integration test with fixed clock |
| Owner-only | every list command is rejected for any non-Owner | unit test on the auth gate |

## 6.1 Security / privacy

- **Data classification:** confidential — unchanged; the list still reads existing reminder + source data, no new fields.
- **Personal data touched:** none new.
- **AuthZ/AuthN impact:** none new — the list command reuses the existing single-Owner gate; this feature widens what that already-gated view shows, it does not add a capability or a boundary. Removing the Done action *narrows* the fired-reminder message's capabilities rather than adding one.
- **Abuse cases:**
  - non-Owner sends the list command: bot reveals nothing, as before.
  - non-Owner forges a stale Done callback: bot rejects it via the existing owner gate on callbacks, no state change.
  - Owner taps a stale Done button from before rollout: handled gracefully per AC-06, no crash, no unintended resolution.
- **Security review:** N/A — no new authz boundary, no new PII; this reshapes an existing owner-gated view and removes a capability rather than adding one.

## 7. Metrics / KPIs

- **List completeness complaints** — baseline: 1 (the reported gap that triggered this feature), target: 0 recurrences within 30 days of ship.
- **Delete usage on fired reminders** — baseline: current rate via the existing Done+Delete split, target: maintained or increased now that Delete is the only resolving action (proves the single-action model works in practice).
- **Stale Done-tap errors** — baseline: 0 (new code path), target: 0 unhandled errors from stale Done taps over any 30-day window.

## 8. Open questions

- [ ] Should the fired-entry status marker also show the actual delivery time, or just a scheduled/fired flag? Default now: reuse the same bounded preview format as `list-active-reminders` (first line, ~100 chars) plus a simple scheduled/fired flag, no extra timestamp. — owner: Mykhailo Podaniev, due: before `sdd:design`
- [ ] Should the domain's internal `done` lifecycle state be removed outright now that its only trigger (the Done button) is retired, or left in place but unreachable? Default now: leave it unreachable, no removal — it's an implementation-only concern with no Owner-observable effect. — owner: Mykhailo Podaniev, due: before `sdd:design`

## Test plan

> Maps every §5 acceptance criterion to ≥1 named test. Levels are generic (unit / integration); `implement` detects the concrete runner/commands from the repo (Vitest co-located `__tests__/*.test.ts`). No UI surface is declared (`target_surfaces: [backend-service]`) → no component / visual-regression / e2e-through-UI tiers. No cross-participant API/event boundary → no contract tier.

### Coverage table (AC → test)

| AC | Intent | Test name | Level(s) | Notes |
|---|---|---|---|---|
| AC-01 | Fired-but-undeleted reminder still appears in the list | `includes fired reminders that have not been deleted` | integration | real SQLite; seed one `pending` + one `fired` reminder, assert both are present |
| AC-02 | Each entry visibly distinguishes scheduled vs fired | `marks each entry as scheduled or fired` | unit | pure view-model formatting test over a mixed input set |
| AC-03 | Firing / delivering / snoozing never changes a reminder's list position | `position is stable across fire, deliver, and snooze transitions` | unit | drives the ordering function with a fixed capture-order input, asserts index unchanged after each transition |
| AC-04 | Only explicit delete removes a reminder from the list | `only delete removes a reminder from the visible set` | integration | seed a fired reminder, drive fire/deliver/snooze, assert still listed; then delete, assert gone |
| AC-05 | Fired entries expose no cancel action | `fired entries carry no cancel action` | unit | **dedicated cross-context row.** asserts the rendered action set for a fired entry excludes cancel, reusing the existing pending-only cancel invariant |
| AC-06 | Stale Done tap after rollout → graceful message, no crash, no state change | `stale done callback is rejected without crashing or changing state` | integration | drive a `done` callback against a fired reminder, assert a graceful reply, unchanged persisted state |
| AC-07 | Non-Owner sees no reminders, scheduled or fired | `non-owner is rejected on the list command regardless of reminder mix` | unit | **dedicated authorization row.** extends the existing owner-gate test with a fired reminder present |
| AC-08 | Oversized visible set → exactly 1 message, earliest-added that fit + overflow indicator | `truncation keeps earliest-added within the message budget and counts overflow` (unit) + `oversized visible set sends exactly one message with overflow indicator` (integration) | unit + integration | **dedicated anti-flood-invariant row**, restated against capture-order sort |
| AC-09 | Fired entries expose a Delete action directly in the list | `marks fired rows with a distinct flag and omits Cancel; scheduled rows keep Cancel (AC-02/AC-05)` | unit | `<!-- added-by-fix: 2026-07-10 -->`; asserts `delete:<id>` on fired rows, absent on scheduled rows |

Every §5 criterion maps to ≥1 test; AC-04 (invariant), AC-05 (cross-context), and AC-07 (authorization) each have a dedicated row, not folded into a happy path.

### Integration strategy — real, ephemeral dependency

- **Dependency:** a throwaway real SQLite via `better-sqlite3` (in-memory or a temp-file DB per suite, schema from the existing `migrations/` up-scripts), torn down after. No mocked datastore.
- **Clock:** an injected fixed clock for AC-01/AC-03/AC-06/Accuracy so fire/deliver/snooze sequencing is deterministic.
- **Seed:** fixtures build `reminders` rows across `pending`, `firing`, `fired`, and `deleted` states, plus an oversized set for AC-08.
- **Cleanup boundary:** per-test — fresh DB (or transaction rollback) before each test.

### Load

<!-- N/A: no concurrency/throughput NFR — single-Owner bot, unchanged from `list-active-reminders`. -->

### CI placement

- **Every PR:** unit + integration — both are fast (pure logic + ephemeral SQLite, no network).
- No e2e / contract / load suites for this feature.
