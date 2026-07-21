# Changelog — plain-typed-message-capture

## plain-typed-message-capture — capture a reminder from plain typed text, not just a forwarded message

**What:** the Owner can now type a plain message directly into the bot chat and have it captured as a new pending reminder — the bot immediately asks "When to remind?" with the same quick-pick / custom-time flow used for forwarded messages. Forwarding a message is no longer the only way to start a reminder.

**Why:** this closes a gap called out in [spec](./spec.md) §1 — the bot previously required an existing message to forward, so a bare thought or task with nothing to forward couldn't be captured at all. The change reverses `docs/features/telegram-reminder/spec.md` §3's original "forward-only" non-goal now that the scheduling machinery (quick-pick, custom time, firing, snooze, resolve, source) has no real dependency on the content having come from another chat.

**How to use:** the Owner sends any plain-text message to the bot (no forward, no leading `/`). The router (`src/ports/router.ts`) dispatches it to the new plain-text branch — positioned after command handling and after the pending-time-prompt check, so an in-flight "enter a time" answer and any recognized/unrecognized command still take precedence. `handlePlainTextMessage` (`src/ports/conversations/capture-conversation.ts`) then runs the same `CaptureMessage` use case as forwarded messages, storing the typed text as the snapshot's `messageText` with the documented no-source-chat sentinel (`chatId: 0`, `messageId: 0`, `chatUsername: null`) — so "🔗 Джерело" on a typed-origin reminder always shows the original text back instead of attempting a dead deep link.

**Operational notes:**
- Migration: none — reuses the existing `source_snapshots` schema and `CaptureMessage` use case, no new field or table.
- Feature flag / config: none.
- Rollback: revert the deploy; no data migration to reverse.

**Acceptance criteria delivered:** AC-01, AC-01b, AC-02, AC-03, AC-04, AC-04b, AC-05, AC-06, AC-07.
