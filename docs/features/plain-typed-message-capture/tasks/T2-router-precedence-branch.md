---
id: T2
title: "Wire router precedence branch for plain-text dispatch"
layer: "ports"
deps: ["T1"]
acs: ["AC-02", "AC-04", "AC-04b", "AC-05", "AC-07"]
files_hint: ["src/ports/router.ts", "src/ports/__tests__/router-auth.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T2 — Wire router precedence branch for plain-text dispatch

## Why

Derives from [spec §AC-02, AC-04, AC-04b, AC-05, AC-07](../spec.md) and [sad §4 pillar 2 / §6 Flow 1](../sad.md) — the router's dispatch order becomes: recognized commands → forwarded message → **pending custom-time answer** (existing, unchanged) → **[new] plain text** → callback queries. Placing the new branch after the pending-prompt check is what makes AC-04b/AC-07 hold structurally, per sad §4.

## What

In `src/ports/router.ts`, insert a new branch immediately after the existing `pendingPromptRepo.findPendingPrompt()` check (around line 78, before the `ctx.callbackQuery` block):

- if `msg.text` trimmed starts with `"/"` → do nothing (command-shaped exclusion, AC-04) — this check runs **only** when no pending prompt was found (the existing check above already routes a pending-prompt answer first, satisfying AC-04b/AC-07 with no extra guard);
- if `msg.text` trimmed is empty → do nothing (AC-05);
- otherwise → call `handleTypedMessage(ctx, captureUC)` from T1.

The top-of-router Owner-only gate (already present, unchanged) continues to cover this branch with no new code — AC-02 is a regression check, not new logic.

## Definition of Done

- [ ] Unit test: a non-Owner sender typing plain text creates no reminder and gets no response (AC-02 — regression, confirms the existing gate still covers the new branch).
- [ ] Unit test: text starting with `/` (recognized or not) after trimming never reaches the new capture branch (AC-04).
- [ ] Unit test: with a pending custom-time prompt waiting, text starting with `/` (not a recognized command) is still routed to the pending-answer handler, not excluded (AC-04b).
- [ ] Unit test: empty or whitespace-only text creates no reminder, no prompt, no response (AC-05).
- [ ] Unit test: with a pending custom-time prompt waiting, ordinary plain text is used as the time answer, not a new capture (AC-07).
- [ ] lint + vet clean.

## Notes

Blocked by T1 (imports the new handler export). Shares `src/ports/router.ts` with no other task in this feature — no overlap lane needed.
