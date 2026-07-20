---
status: Draft
owner: "Mykhailo Podaniev"
reviewers: ["Tech Lead"]
updated_at: "2026-07-20"
feature_size: "XS"
---

# Spec — plain-typed-message-capture

> **Glossary:** [CONTEXT](./CONTEXT.md)
> **Reference module / docs / channels used:** None as a formal channel — read `docs/features/telegram-reminder/spec.md`, its `CONTEXT.md`, and the current router/capture code (`src/ports/router.ts`, `src/ports/conversations/capture-conversation.ts`, `src/domain/value-objects/source-snapshot.ts`) directly during the interview to ground the deep-dive. Ideation suite skipped — `interview_depth: easy`, and the feature is XS.

## 1. Context

Today the Owner can only capture a reminder by forwarding an existing Telegram message from somewhere else — a note, a task, a link already sitting in some chat. There is no way to capture a reminder for a thought, an idea, or a task that has no existing message anywhere to forward: the Owner simply cannot ask the bot to remind them of "buy milk" unless they first find or fabricate a message to forward.

This gap was a deliberate non-goal at first ("every reminder must originate from a forwarded Telegram message" — `docs/features/telegram-reminder/spec.md` §3), written when the bot's only proven interaction pattern was "forward, then pick a time." Having used the bot for real capture flows since (forward → quick-pick → fire → resolve, plus list/delete/stats), the gap now reads as an artificial restriction rather than a real constraint: the scheduling machinery (quick-pick, custom time, firing, snooze, resolve, source) has no dependency on the reminder's content having come from another chat.

The committed approach: add a second entry point beside "forward a message" — the Owner can simply type plain text directly into the bot chat, and the bot treats it exactly like a forwarded message's content, running it through the same "When to remind?" quick-pick / custom-time flow, storing it with the same generic snapshot mechanism, just with no source chat to point back to.

This reverses `docs/features/telegram-reminder/spec.md` §3's second non-goal; that file's Non-goals section is amended alongside this spec for consistency (see the commit accompanying this spec).

## 2. Goals

- The Owner can create a reminder from a plain-typed thought with no existing message to forward — capture is no longer gated on "something already exists to forward."
- Every existing forwarded-message behavior (quick-pick, custom time, firing, snooze, done/delete, source lookup) keeps working unchanged for typed-origin reminders — no second UI to learn.
- No reminder is ever accidentally created from a stray command, empty input, or the Owner's answer to an unrelated pending time-request.

## 3. Non-goals

- **Directly-sent media (photo / video / document, not forwarded, not accompanied by text)** — out of scope; this feature only widens what counts as *text* content. Reason: there is no capture story yet for storing/retrieving media sent this way — a separate future feature.
- **Editing the captured text after creation** — the reminder stores what the Owner typed at capture time verbatim. Reason: consistent with the existing immutable-snapshot behavior for forwarded messages.
- **A new UI trigger (menu button, dedicated command, etc.) for starting a reminder** — the only new trigger is typing plain text into the existing chat. Reason: minimal surface change; anything more belongs to a separate feature.
- **Any change to the forwarded-message capture flow** — untouched by this feature; purely additive. Reason: keep blast radius to the new entry point only.

## 4. User stories

### US-01: Start a reminder by typing plain text

**As an** Owner
**I want** to type a plain message directly to the bot
**So that** I can capture a reminder for a thought or task with no existing message to forward

### US-02: Same scheduling experience regardless of origin

**As an** Owner
**I want** the same quick-pick and custom-time options after typing a message as I get after forwarding one
**So that** I don't need to learn a second way of scheduling

### US-03: Bot ignores text that looks like a command

**As an** Owner
**I want** a mistyped or unrecognized slash-command to be ignored rather than captured
**So that** a typo never turns into a bogus reminder

### US-04: Bot ignores empty input

**As an** Owner
**I want** a message with no real content (blank or only spaces) to be ignored
**So that** I never end up with a reminder with nothing to remind me of

### US-05: Re-read a typed reminder's original text

**As an** Owner
**I want** to tap "🔗 Джерело" on a fired reminder that came from typed text and see that text again
**So that** I can still review what I meant, even though there is no source chat to jump to

### US-06: A pending time-answer always wins over a new capture

**As an** Owner
**I want** my reply to an already-pending "enter a time" request to be used as that answer
**So that** answering a time prompt never accidentally starts an unrelated new reminder

## 5. Acceptance criteria

### AC-01 (US-01) — happy path

**Given** the Owner sends a plain text message directly to the bot, with no pending time-request waiting and no leading command syntax
**When** the bot receives it
**Then** the bot captures it as a new pending reminder and immediately asks "When to remind?" with the same quick-pick buttons and a custom-time option

### AC-02 (US-01) — authorization

**Given** a non-Owner sender sends a plain text message directly to the bot
**When** the bot receives it
**Then** the bot creates no reminder and sends no response, exactly as for any other non-Owner interaction

### AC-03 (US-02) — happy path

**Given** the Owner has just typed a plain-text message and received the "When to remind?" prompt
**When** the Owner picks a quick-pick option or enters a custom time
**Then** the reminder is scheduled and confirmed in exactly the same way as it would be for a forwarded message

### AC-04 (US-03) — domain invariant

**Given** the Owner sends text that begins with a slash, whether a recognized command or a mistyped/unknown one
**When** the bot receives it
**Then** the bot never treats that text as reminder content — command-shaped text is never captured as a reminder

### AC-05 (US-04) — error

**Given** the Owner sends a message whose text is empty or contains only whitespace
**When** the bot receives it
**Then** the bot creates no reminder and does not open a "When to remind?" prompt, recognizing there is nothing to capture

### AC-06 (US-05) — domain invariant

**Given** a fired reminder whose content came from typed text rather than a forwarded message
**When** the Owner taps "🔗 Джерело"
**Then** the bot shows the originally typed text back to the Owner — the source action always resolves to something visible, never to a dead or missing link

### AC-07 (US-06) — cross-context

**Given** the Owner already has a pending request to type a custom time for a different, previously-started reminder
**When** the Owner sends a plain text message
**Then** the bot uses that text as the answer to the pending time-request and does not start a new reminder capture from it

## 6. Non-functional requirements

This feature reuses telegram-reminder's existing synchronous write path (same in-process capture use-case, same datastore) — it introduces no new latency-sensitive operation, so it inherits that feature's NFRs rather than defining new ones.

| Aspect | Target | Measurement |
|---|---|---|
| Latency of the "When to remind?" reply after a typed message | ≤ 1000 ms | same manual timing already used for the forwarded-capture path; no new budget |
| Correctness — no reminder from non-content input | 0 reminders created from command-shaped or empty text | verified by AC-04 / AC-05 tests |

<!-- N/A: Throughput / Availability — no new external dependency, no new concurrent-write path; unchanged from telegram-reminder. -->

## 6.1 Security / privacy

- **Data classification:** internal — same classification as existing forwarded-message text; typed text may in practice be more personal (the Owner's own raw thought rather than a quote), but it is stored through the identical mechanism.
- **Personal data touched:** none new — reuses the existing `messageText` field; no new field or table.
- **AuthZ/AuthN impact:** none new — the existing single Owner-only gate (checked once for every update, before any handler dispatch) already covers this new entry point; AC-02 confirms it explicitly.
- **Abuse cases:**
  - **Non-Owner typing to the bot:** denied by the existing Owner-only gate — no reminder, no response (AC-02).
  - **Owner accidentally typing sensitive text (e.g. a password) as a reminder:** unchanged risk from the existing forwarded-text storage; no new mitigation introduced or required by this feature.
  - **Spam-typing many messages to flood-create reminders:** no rate limit today for this path, matching the already-accepted behavior of the forwarded-message path — not a new exposure introduced by this feature.
- **Security review:** N/A — reuses the exact authorization gate and storage path already reviewed for `telegram-reminder`; no new boundary is introduced.

## 7. Metrics / KPIs

- **Typed-capture gets used** — baseline: 0 (feature not yet shipped), target: ≥1 reminder successfully created via typed text within the first 7 days after deployment.
- **No mis-captured reminders** — baseline: N/A (feature not yet shipped), target: 0 reminders created from command-shaped or empty text in the first 30 days, confirmed by AC-04/AC-05 automated tests plus a manual spot-check.
- **Forwarded-capture stays regression-free** — baseline: 100% (existing forwarded-capture tests currently pass), target: remains at 100% pass rate on `telegram-reminder`'s existing capture test suite after this feature ships.

## 8. Open questions

- [ ] Should there be a maximum length for typed reminder text, to avoid a very long message becoming an unwieldy "reminder title"? Default now: no cap — matches existing forwarded-text storage, which also has none. — owner: Mykhailo Podaniev, due: revisit if it becomes annoying in real use.
- [ ] Should the bot echo the typed text back before asking "When to remind?", so a typo can be caught before scheduling? Default now: no echo — matches the existing forwarded-message flow, which also doesn't echo. — owner: Mykhailo Podaniev, due: revisit after the first week of real use.
