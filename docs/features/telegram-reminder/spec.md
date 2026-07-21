---
status: Draft
owner: "Mykhailo Podaniev"
reviewers: ["Tech Lead"]
updated_at: "2026-06-13"
feature_size: "M"
---

# Spec — telegram-reminder

> **Glossary:** [CONTEXT](./CONTEXT.md)
> **Reference module / docs / channels used:** None — only the interview. Competitive research returned RESEARCH_LIMITED (no web access). Telegram Bot API consulted from training knowledge.

## 1. Context

The Owner forwards messages throughout the day from multiple Telegram chats — articles, tasks, links, action items — but these get buried in chat history. There is no lightweight, in-Telegram way to be reminded about a specific message at a chosen future time; mental notes fail and switching to external tools breaks the flow. The Owner needs to capture "deal with this later" intent at the moment it arises, without leaving Telegram.

The trigger is personal friction: important messages are regularly missed because the Owner has no mechanism to defer attention. The project is greenfield. The Owner is both the sole user and the builder, so delivery speed and personal fit outweigh multi-user extensibility.

The chosen approach is a personal Telegram bot that accepts forwarded messages, asks the Owner when to be reminded (via quick-picks or a custom time), stores the reminder durably, and fires it back at the scheduled time with one-tap inline actions. Resolved reminders (done or deleted) have their fired-reminder message removed from the bot chat entirely, so a chat with no active fired-reminder messages equals a fully cleared inbox — the Owner can glance at the bot to confirm nothing is pending. The invariant covers fired-reminder messages only; transient confirmation messages (e.g. "Reminder set for…") are not part of it.

Competitive analysis was not available (RESEARCH_LIMITED). Devil's-advocate analysis (2026-06-13) identified the following as highest-risk production vectors: silent data loss on service restart; chat-flood degrading the list-as-chat model (mitigated by the message-deletion-on-resolve decision); and private-chat deep-link failures (mitigated by a graceful fallback in AC-11).

## 2. Goals

- The Owner can capture any Telegram message as a pending reminder in under 10 seconds without leaving Telegram.
- Every fired reminder presents the original content and a full set of resolution actions in a single interaction.
- No pending reminder is ever silently lost — the bot recovers all scheduled reminders across service restarts with zero data loss.

## 3. Non-goals

- **Multi-user support** — the bot is bound to a single Telegram account (the Owner); there is no invitation flow, shared list, or per-user isolation logic.
- **Creating reminders without any content** — the bot still will not schedule an empty reminder; every reminder needs either a forwarded message or plain typed text to remind about. *(Superseded 2026-07-20 by `docs/features/plain-typed-message-capture/spec.md` — that feature removes the "must be forwarded" restriction; a reminder may now also originate from plain text typed directly into the bot chat.)*
- **Recurring / repeating schedules** — the Owner reschedules one reminder instance at a time via snooze; no daily/weekly repeat patterns.
- **Editing source message content** — the reminder stores a snapshot of the original message at capture time; the bot does not offer content editing.

## 4. User stories

### US-01: Forward message to start reminder

**As an** Owner
**I want** to forward any Telegram message to the bot
**So that** the bot captures it and asks me when to be reminded

### US-02: Set reminder time via quick-pick

**As an** Owner
**I want** to tap a quick-pick button (In 1 hour / This evening 19:00 / Tomorrow morning 07:00 / In a week)
**So that** the reminder is scheduled immediately without typing a date

### US-03: Set reminder time via custom input

**As an** Owner
**I want** to enter a specific date and time when no quick-pick fits
**So that** I can schedule reminders at precise moments

### US-04: Receive a fired reminder

**As an** Owner
**I want** the bot to send me the original message content at the scheduled time with action buttons
**So that** I can act on it at the right moment without searching my chat history

### US-05: Snooze a fired reminder

**As an** Owner
**I want** to tap Snooze on a fired reminder and pick a new time
**So that** I can defer it to a more convenient moment without losing it

### US-06: Mark a reminder as done

**As an** Owner
**I want** to tap Done on a fired reminder
**So that** it is removed from the bot chat and I know my reminder list is clear

### US-07: Delete a fired reminder

**As an** Owner
**I want** to tap Delete on a fired reminder
**So that** it is removed from the bot chat without being marked as completed

### US-08: Navigate to the source message

**As an** Owner
**I want** to tap "Go to source" on a fired reminder
**So that** I can jump directly to the original chat and message

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** the Owner sends a forwarded text or media message to the bot
**When** the bot receives it
**Then** the bot immediately replies asking "When to remind?" and shows the quick-pick buttons plus a "Custom time" option

### AC-02 (US-02) — happy path

**Given** the Owner has received the "When to remind?" prompt after forwarding a message
**When** the Owner taps one of the quick-pick buttons
**Then** the bot confirms the scheduled time in plain language (e.g. "Reminder set for this evening at 19:00") and the reminder enters pending state

### AC-03 (US-03) — happy path

**Given** the Owner taps "Custom time" after forwarding a message
**When** the Owner enters a valid future date and time
**Then** the bot confirms the scheduled time and the reminder enters pending state

### AC-04 (US-04) — happy path

**Given** a pending reminder has reached its scheduled time
**When** the bot fires the reminder
**Then** the bot sends the Owner the original source message content (text and media, if available) together with inline action buttons: Snooze, Done, Delete, and Go to source

### AC-05 (US-05) — happy path

**Given** the Owner receives a fired reminder with action buttons
**When** the Owner taps Snooze and selects a new time — only quick-picks whose wall-clock time is still in the future are offered (picks whose time has already passed today are hidden) — or enters a custom time
**Then** the bot confirms the new scheduled time, the reminder returns to pending state with the updated time, and the fired-reminder message is updated to reflect the rescheduled state

### AC-06 (US-06) — happy path

**Given** the Owner receives a fired reminder with action buttons
**When** the Owner taps Done
**Then** the bot deletes the fired-reminder message from the chat, confirming the reminder is resolved; if Telegram rejects the deletion because the message exceeds its delete window, the bot instead edits the message to an empty/resolved placeholder so the cleared-inbox invariant still holds visually

### AC-07 (US-07) — happy path

**Given** the Owner receives a fired reminder with action buttons
**When** the Owner taps Delete
**Then** the bot removes the fired-reminder message from the chat without marking it done; if deletion is rejected because the message exceeds Telegram's delete window, the bot edits it to an empty/removed placeholder instead

### AC-08 (US-03) — error

**Given** the Owner taps "Custom time" and enters a date or time that is in the past
**When** the Owner submits the input
**Then** the bot blocks the scheduling and tells the Owner that the reminder time must be in the future, leaving the timing prompt open for a new input

### AC-09 (US-01) — authorization

**Given** a Telegram user other than the Owner sends any message to the bot
**When** the bot receives the message
**Then** the bot does not create a reminder, does not store any data, and silently ignores the message — it sends no reply, so that replying to non-Owner messages cannot itself become a flood/abuse vector

### AC-10 (US-05) — domain invariant

**Given** the Owner attempts to snooze a reminder that has already been marked done or deleted
**When** the Owner taps Snooze
**Then** the bot tells the Owner that the reminder is already resolved and no further action is possible on it

### AC-11 (US-08) — cross-context

**Given** the Owner taps "Go to source" on a fired reminder
**When** the source lacks a public chat username together with a message identifier (private chat, DM, or a group the Owner may no longer be a member of), so no navigable deep link can be built — the bot offers the link only when both a public username and message id are present, and otherwise treats the link as unavailable
**Then** the bot informs the Owner that a direct link is not available for this source and displays the captured message content inline instead

### AC-12 (US-04) — cross-context

**Given** a pending reminder is due to fire and the original source message contained media from a protected-content chat
**When** the bot attempts to send the reminder
**Then** the bot fires the reminder with the available text content, attaches a note that the media could not be restored due to source restrictions, and still presents all action buttons

### AC-13 (US-01) — setup gate

**Given** the Owner forwards a message but has not yet configured a home timezone
**When** the bot receives the forwarded message
**Then** the bot does not show the quick-pick prompt and instead asks the Owner to set a timezone via `/settings` first, resuming the capture flow for that message once the timezone is configured

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Reminder fire accuracy | Fires within ±60 s of scheduled time | Diff between `scheduled_at` and `fired_at` logged per reminder |
| Durability on restart | Zero pending reminders silently lost across service restart | Integration test: schedule reminder, restart service, confirm it fires |
| Availability | ≥ 99% monthly uptime | External uptime monitor (e.g. UptimeRobot or equivalent) |
| Action response latency p95 | ≤ 2 s from button tap to bot response | Bot-side timestamp delta logged per callback |
| Chat anti-flood | No more than 10 bot messages sent within any 60-second window | 429 / flood-wait error rate in bot logs |

## 6.1 Security / privacy

- **Data classification:** Confidential — the bot stores personal message content forwarded from private Telegram chats.
- **Personal data touched:** Source message text, media file references, source chat identifiers, and sender metadata (name, username) embedded in forwarded messages.
- **AuthZ/AuthN impact:** The bot validates the Telegram user ID of every incoming message against the Owner's configured ID before any processing. All non-Owner interactions are rejected before any data is stored or any reminder is created.
- **Abuse cases:**
  - *Unauthorized access*: Any Telegram user who discovers the bot link sends messages → bot rejects all non-Owner requests without storing data.
  - *Data leak*: Stored message content must be accessible only to the Owner's Telegram session; no external API or admin interface exposes it.
  - *Replay / duplicate fire*: Delivery is at-least-once — a reminder whose send was not confirmed (e.g. the service crashed mid-fire, before delivery was acknowledged) is re-fired after restart so that no reminder is silently lost (§2); only confirmed deliveries are suppressed, so a true duplicate of an already-delivered reminder is never sent.
- **Security review:** N/A — single-user personal tool, no multi-tenant boundary, no external authentication surface beyond Telegram's own user identity.

## 7. Metrics / KPIs

- **Reminder capture rate** (forwards that result in a scheduled reminder ÷ total forwards) — baseline: 0 (new feature), target: ≥ 90% within 14 days of first use.
- **Fire accuracy** (reminders fired within ±60 s of scheduled time ÷ total fired reminders) — baseline: N/A, target: ≥ 99% within 30 days.
- **Resolution rate** (reminders marked done or explicitly deleted ÷ total fired reminders) — baseline: 0, target: ≥ 80% within 30 days (measures that the Owner acts on reminders rather than ignoring them).
- **Snooze rate** (reminders snoozed at least once ÷ total fired) — baseline: 0, target: diagnostic only for first 30 days; no target set until baseline is measured. High snooze rate may indicate quick-pick options need tuning.

## 8. Open questions

- [ ] What input grammar does "Custom time" accept (natural-language relative phrases, structured `DD.MM.YYYY HH:MM`, or both), and how are partial inputs filled? Default now: accept both — relative ("за 2 год", "завтра 15:00") and structured; date-only → defaults to 09:00; time-only → next future occurrence. — owner: Mykhailo Podaniev, due: before sdd:design
- [ ] Should the bot send a reminder even if it cannot recover the original media (e.g. expired file reference)? Default now: yes — fire with text only and a note (per AC-12). — owner: Mykhailo Podaniev, due: before sdd:tasks
- [ ] What happens if the Owner never responds to a "When to remind?" prompt (bot is waiting, Owner ignores it)? Default now: prompt expires after 24 hours and the forwarded message is discarded with a bot notification. — owner: Mykhailo Podaniev, due: before sdd:design
- [ ] **[S2-4, review-2026-06-13]** `messageId !== null` guard in `SourceSnapshot` is dead code (`messageId` is typed `number`, non-nullable). AC-11 link-availability is effectively a username-only check. Decide: remove guard, or widen `messageId` to `number | null`. — owner: Mykhailo Podaniev, due: before next release
- [ ] **[S2-5, review-2026-06-13]** Use cases (`ScheduleReminder`, `SnoozeReminder`, `ResolveReminder`) throw raw `new Error(...)` on not-found instead of domain sentinels. Hits `bot.catch` rather than user-facing message. Introduce typed domain errors per §8 architecture. — owner: Mykhailo Podaniev, due: before next release
- [x] **[S2-6, review-2026-06-13 → resolved review-2026-06-13b]** `scheduleUC` dead parameter in `capture-conversation.ts` removed (AC-03 landed via the `qpick` router branch, never via the capture conversation, so the deferral trigger had fired). Done in the re-review pass.

---

### Edits log

| # | Section | Change | Reason |
|---|---|---|---|
| 1 | §3 | Added "no recurring schedules" non-goal | Interview: Owner reschedules one instance at a time; repetition out of scope |
| 2 | §5 AC-06/07 | Done + Delete both delete the bot message entirely | Owner decision: "empty chat = all resolved" |
| 3 | §5 AC-12 | Protected-content cross-context AC added | Devil's advocate: media file_id may be unavailable |
| 4 | §5 AC-11 | Private-chat deep-link graceful fallback | Devil's advocate: deep links break for DMs and private groups |
| 5 | §6 | Anti-flood NFR added | Devil's advocate: Telegram 429 risk on burst |
| 6 | §1 ¶3 | "This evening = 19:00, tomorrow morning = 07:00" locked | Owner answer during Socratic pass |
| 7 | §8 OQ-1 | Timezone config surfaced as required open question | Devil's advocate: wall-clock quick-picks require a timezone |
| 8 | §4 US-07 + §5 AC-07 | Delete restricted to fired reminders only | Critic F1+F5: no UI exists for pending-reminder deletion; lifecycle is pending→fired→done/deleted |
| 9 | §6.1 | Removed "≤30 reminders/min" spam rate limit | Critic F2: single-owner bot, spam impossible; anti-flood in §6 covers Telegram 429 |
| 10 | §5 AC-09 | Non-Owner → silently ignore (dropped "or inform sender") | clarify: «or» forked behavior; replying to spam is itself a flood/abuse vector |
| 11 | §5 AC-05 | Snooze hides quick-picks whose wall-clock already passed | clarify: undefined behavior for past wall-clock picks (e.g. 19:00 after 20:00) |
| 12 | §6.1 | Duplicate-fire → at-least-once: re-fire if delivery unconfirmed | clarify: §2 "no silent loss" tensions with "suppress duplicates" at crash boundary |
| 13 | §1 ¶3 | "Empty chat" invariant scoped to fired-reminder messages only | clarify: AC-02 confirmation messages otherwise contradict the invariant |
| 14 | §5 AC-06/07 | 48h delete-window fallback → edit message to placeholder | clarify: Telegram bots cannot delete messages >48h; invariant breaks silently |
| 15 | §5 AC-13 (new) + §8 | Timezone unset → block capture, lead to /settings (OQ-1 resolved, removed) | clarify: AC-01 happy path assumed TZ existed; behavior-when-unset undefined |
| 16 | §5 AC-11 | Link availability signal = public username + message id present | clarify: "may no longer be a member" was unmeasurable as a detection rule |
| 17 | §8 (new row) | Custom-time input grammar deferred to design | clarify: AC-03/08 never defined accepted formats or partial-input defaults |
