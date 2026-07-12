# /list live refresh after Delete/Cancel — design spec

Status: approved
Date: 2026-07-12
Related issue: GitHub #8

## 1. Purpose

Right now, tapping "🗑 Видалити" on a fired row in `/list` gives the Owner
almost no visible feedback: no confirmation message, and the `/list` message
itself is never touched (it renders as an immutable point-in-time snapshot,
per `docs/features/list-active-reminders/adr/0002-immutable-snapshot-list.md`).
The only side effect is a silent edit/delete of the original fired-reminder
notification elsewhere in the chat, which the Owner may never see. "Скасувати"
on a pending row is slightly better (it sends a confirmation reply) but still
leaves the `/list` message stale.

This feature makes both actions give clear feedback: a confirmation message,
followed by an in-place edit of the tapped `/list` message so the deleted/
cancelled row disappears.

## 2. Scope

In scope:
- `LIST_CALLBACK.DELETE` (fired rows) and `LIST_CALLBACK.CANCEL` (pending
  rows), when tapped from a `/list` message: send a confirmation reply, then
  edit that same `/list` message to a freshly rendered view (row removed,
  remaining rows renumbered, overflow count recomputed).
- Empty-list edge case: if the refreshed view has no rows, the edited message
  switches to the existing empty-state text with no inline keyboard.
- Each `/list` message is refreshed independently, based on
  `ctx.callbackQuery.message` — if the Owner has multiple `/list` messages
  open in the chat, only the one the tapped button belongs to is edited.

Out of scope (deliberately):
- The Delete button on the original fired-reminder notification message
  (`callback_data: delete:ID`, sent from `sendReminder()`) — unchanged. It
  does not know about, and must not touch, any `/list` message.
- Refreshing a `/list` message for reasons other than the Owner's own
  Delete/Cancel tap on that same message (e.g. another reminder firing in the
  background does not push a live update to an open `/list` message).
- Refreshing the list on a stale tap (AC-04 no-op case) — the existing
  uniform "⚠️ Це нагадування більше не активне." reply is unchanged, no edit
  attempted.
- Reopening the Cancel/Delete label-unification question raised during
  brainstorming — tracked as a separate, later issue.

## 3. Callback routing change

`LIST_CALLBACK.DELETE` currently reuses the same `"delete"` callback_data
prefix as the fired-notification's own Delete button
(`src/infra/telegram/grammy-telegram-gateway.ts:40`), so `router.ts` cannot
tell the two apart. `LIST_CALLBACK.DELETE` is renamed to `"list_delete"`
(`src/ports/dto/index.ts`), giving the list's fired-row Delete button its own
callback namespace. `LIST_CALLBACK.CANCEL` (`"cancel"`) already only exists
on `/list` rows — no change needed there.

`router.ts` gets a new branch:
```ts
if (action === "list_delete") {
  return handleListDelete(ctx, resolveUC, gateway, repo, listUC, reminderId, ownerChatId);
}
```
The existing `action === "delete"` branch (→ `handleResolve`) is untouched.

## 4. Components

- **`TelegramGateway` port + `GrammyTelegramGateway` adapter:** new method
  ```ts
  editListMessage(
    chatId: number,
    messageId: number,
    text: string,
    inlineKeyboard: any[][] | null
  ): Promise<void>;
  ```
  `inlineKeyboard: null` clears the keyboard (empty-state case). Distinct
  from `editMessageToPlaceholder`, which only ever changes text and is used
  for the fired-notification cleanup path (out of scope here).

- **`list-handler.ts`:**
  - `renderListMessage()` — unchanged, reused as-is.
  - New `refreshListMessage(gateway, listUC, repo, chatId, messageId)`:
    calls `listUC.execute()`, then either `editListMessage(...)` with the
    rendered text+keyboard, or with the empty-state text and `null` keyboard
    when `vm.isEmpty`.
  - New `handleListDelete(ctx, resolveUC, gateway, repo, listUC, reminderId, ownerChatId)`:
    mirrors `handleResolve`'s fired-notification cleanup (delete/placeholder
    the original message if `firedMessageId` is set), sends a new confirmation
    reply ("✅ Нагадування видалено."), then calls `refreshListMessage`.
    Catches `InvalidStateTransitionError` / `ReminderNotFoundError` the same
    way `handleListCancel` already does — uniform "not active" reply, no
    refresh — for consistency with Cancel's existing stale-tap safety on this
    same surface.
  - `handleListCancel`: unchanged happy/error logic, with one addition —
    after `CANCEL_CONFIRM_MESSAGE` is sent, call `refreshListMessage`.

## 5. Data flow

**Delete (fired row):**
1. Owner taps `🗑 Видалити #N` → `callback_data = list_delete:ID`.
2. `router.ts` → `handleListDelete`.
3. `resolveUC.execute({ reminderId, action: "delete" })` — valid only from
   `fired` (`state-machine.ts:37-41`); `fired → deleted`.
4. If `firedMessageId` is set, clean up that notification message (same as
   `handleResolve` today).
5. `ctx.reply("✅ Нагадування видалено.")`.
6. `refreshListMessage(...)` edits the `/list` message the tap came from.

**Cancel (pending row):** same shape — `cancelUC.execute()` instead of steps
3-4, existing `CANCEL_CONFIRM_MESSAGE` reply, then step 6.

**Stale tap:** `resolve_delete` is only valid from `fired`; a repeat tap or a
race (reminder changed state between render and tap) throws
`InvalidStateTransitionError` or `ReminderNotFoundError`, caught the same way
`handleListCancel` already handles it — uniform reply, no refresh attempted.

## 6. Error handling & edge cases

- **Empty list after removal:** `refreshListMessage` checks `vm.isEmpty` like
  `handleList` does, edits to `EMPTY_MESSAGE` with no inline keyboard.
- **Multiple open `/list` messages:** each refresh targets only
  `ctx.callbackQuery.message.message_id` — other previously sent `/list`
  messages are untouched.
- **Edit fails (Telegram edit window, message manually deleted, etc.):** the
  confirmation reply has already been sent (step 5) before the refresh is
  attempted, so the Owner still gets primary feedback either way. The edit
  failure is swallowed (logged, not re-thrown) — best-effort, no retry.
- **Fired-notification Delete button (`action: "delete"`):** completely
  unchanged — no `list_delete` routing, no refresh call, no new error paths.

## 7. Testing plan

Following the existing Vitest / co-located `__tests__` convention:

- `src/ports/handlers/__tests__/list-handler.test.ts`:
  - `handleListDelete` happy path — reply text, `editListMessage` called with
    the row removed.
  - `handleListDelete` stale tap — uniform reply, `editListMessage` not
    called.
  - `handleListCancel` — existing cases plus: refresh called with fresh data
    after a successful cancel.
  - Refresh to empty state when the deleted/cancelled row was the last one.
- `src/infra/__tests__/grammy-gateway.test.ts`: `editListMessage` — with a
  keyboard, and with `null` (keyboard cleared).
- Integration (real SQLite, matching the rest of this feature area):
  `/list` → tap Delete → edited message excludes the deleted row, DB state is
  `deleted`. Same for Cancel.
- Regression: tapping Delete on the original fired-notification message
  (`action: "delete"`) triggers no `editListMessage` call.

## 8. Non-goals / explicitly deferred

- Unifying the Cancel/Delete labels or use-cases into a single action —
  raised during brainstorming, intentionally deferred to a separate issue.
- Live-syncing an open `/list` message when reminders change for reasons
  other than the Owner's own tap on that message (e.g. background firing).
- Refreshing on the stale-tap no-op path.
