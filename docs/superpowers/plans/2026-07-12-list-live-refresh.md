# /list live refresh after Delete/Cancel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the Owner taps Delete (fired row) or Cancel (pending row) on a `/list` message, send a confirmation reply, then edit that same `/list` message in place so the row disappears — closing GitHub issue #8.

**Architecture:** A new `TelegramGateway.editListMessage` method edits a message's text+keyboard together (distinct from the existing text-only `editMessageToPlaceholder`). A new `refreshListMessage` helper in `list-handler.ts` re-runs `ListActiveReminders` and calls it. `handleListCancel` gets this refresh bolted on; a new `handleListDelete` handler (routed via a renamed `list_delete` callback, split from the fired-notification's own `delete` callback) gets the same confirm-then-refresh treatment plus the existing fired-notification cleanup.

**Tech Stack:** TypeScript, Vitest, grammy (Telegram Bot API), better-sqlite3.

## Global Constraints

- Follow the repo's existing Vitest + co-located `__tests__` convention — do not introduce a new test runner or test file layout.
- All new source comments in English only (existing repo convention — see other handler files).
- No new npm dependencies.
- Confirmation reply is sent before the list-refresh edit is attempted, in that order, with no artificial delay (`setTimeout`) between them — confirmed with the user during brainstorming.
- A failed list-message edit (e.g. Telegram edit window expired) must never crash the handler — the confirmation reply is the primary feedback and must not be undone by a refresh failure.
- The fired-notification message's own Delete button (`callback_data: delete:ID`, sent from `sendReminder()`) must remain completely untouched by this feature — no new routing, no list refresh, no behavior change.

---

### Task 1: `TelegramGateway.editListMessage` (port + adapter)

**Files:**
- Modify: `src/app/ports/telegram-gateway.ts`
- Modify: `src/infra/telegram/grammy-telegram-gateway.ts`
- Modify: `src/infra/__tests__/grammy-gateway.test.ts`
- Modify (mechanical, TS interface conformance): all 12 files listed in Step 6

**Interfaces:**
- Produces: `TelegramGateway.editListMessage(chatId: number, messageId: number, text: string, inlineKeyboard: any[][] | null): Promise<void>` — consumed by Task 2's `refreshListMessage`.

- [ ] **Step 1: Write the failing tests**

Add to `src/infra/__tests__/grammy-gateway.test.ts`, inside the existing `describe("GrammyTelegramGateway", ...)` block, after the `editMessageToPlaceholder` test:

```ts
  it("editListMessage calls api.editMessageText with the given text and keyboard", async () => {
    const keyboard = [[{ text: "🗑 Скасувати #1", callback_data: "cancel:1" }]];
    await gateway.editListMessage(777, 42, "📋 Активні нагадування:\n\n1. row", keyboard);
    expect(mockApi.editMessageText).toHaveBeenCalledWith(
      777,
      42,
      "📋 Активні нагадування:\n\n1. row",
      { reply_markup: { inline_keyboard: keyboard } }
    );
  });

  it("editListMessage clears the keyboard when passed null (empty-state case)", async () => {
    await gateway.editListMessage(777, 42, "📭 Немає активних нагадувань.", null);
    expect(mockApi.editMessageText).toHaveBeenCalledWith(
      777,
      42,
      "📭 Немає активних нагадувань.",
      { reply_markup: { inline_keyboard: [] } }
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/infra/__tests__/grammy-gateway.test.ts`
Expected: FAIL — `gateway.editListMessage is not a function`

- [ ] **Step 3: Add the method to the port**

In `src/app/ports/telegram-gateway.ts`, add to the `TelegramGateway` interface (after `editMessageToPlaceholder`):

```ts
  /**
   * Edits both the text and inline keyboard of an existing message.
   * `inlineKeyboard: null` clears the keyboard entirely (empty-state case).
   */
  editListMessage(
    chatId: number,
    messageId: number,
    text: string,
    inlineKeyboard: any[][] | null
  ): Promise<void>;
```

- [ ] **Step 4: Implement it in the adapter**

In `src/infra/telegram/grammy-telegram-gateway.ts`, add to `GrammyTelegramGateway` (after `editMessageToPlaceholder`):

```ts
  async editListMessage(
    chatId: number,
    messageId: number,
    text: string,
    inlineKeyboard: any[][] | null
  ): Promise<void> {
    await this.api.editMessageText(chatId, messageId, text, {
      reply_markup: { inline_keyboard: inlineKeyboard ?? [] },
    });
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/infra/__tests__/grammy-gateway.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 6: Patch every test double that implements `TelegramGateway`**

Widening the interface breaks `tsc` for every file that returns an object typed `TelegramGateway` without the new method. Run this from the repo root:

```bash
node -e '
const fs = require("fs");
const files = [
  "src/app/use-cases/__tests__/fire-due-reminders.test.ts",
  "src/ports/__tests__/custom-time-conversation.test.ts",
  "src/ports/__tests__/list-router.test.ts",
  "src/ports/__tests__/router-auth.test.ts",
  "src/ports/__tests__/resolve-handler.test.ts",
  "src/scheduler/__tests__/scheduler.test.ts",
  "src/ports/__tests__/source-handler.test.ts",
  "src/ports/__tests__/list-integration.test.ts",
  "src/ports/__tests__/snooze-handler.test.ts",
  "src/ports/__tests__/router-wake-interval.test.ts",
  "src/ports/__tests__/router-schedule-stale.test.ts",
  "src/ports/__tests__/list-handler.test.ts",
];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const out = src.replace(
    /^([ \t]*)editMessageToPlaceholder: vi\.fn\(\)\.mockResolvedValue\(undefined\),$/m,
    (m, indent) => `${m}\n${indent}editListMessage: vi.fn().mockResolvedValue(undefined),`
  );
  if (out === src) throw new Error("no match in " + f);
  fs.writeFileSync(f, out);
}
console.log("patched " + files.length + " files");
'
```

Expected output: `patched 12 files`

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npm run build && npm test`
Expected: both succeed, no TS errors, all existing tests still green

- [ ] **Step 8: Commit**

```bash
git add src/app/ports/telegram-gateway.ts src/infra/telegram/grammy-telegram-gateway.ts \
  src/infra/__tests__/grammy-gateway.test.ts \
  src/app/use-cases/__tests__/fire-due-reminders.test.ts \
  src/ports/__tests__/custom-time-conversation.test.ts \
  src/ports/__tests__/list-router.test.ts \
  src/ports/__tests__/router-auth.test.ts \
  src/ports/__tests__/resolve-handler.test.ts \
  src/scheduler/__tests__/scheduler.test.ts \
  src/ports/__tests__/source-handler.test.ts \
  src/ports/__tests__/list-integration.test.ts \
  src/ports/__tests__/snooze-handler.test.ts \
  src/ports/__tests__/router-wake-interval.test.ts \
  src/ports/__tests__/router-schedule-stale.test.ts \
  src/ports/__tests__/list-handler.test.ts
git commit -m "feat: add TelegramGateway.editListMessage (text + keyboard edit)"
```

---

### Task 2: `refreshListMessage` helper

**Files:**
- Modify: `src/ports/handlers/list-handler.ts`
- Modify: `src/ports/__tests__/list-handler.test.ts`

**Interfaces:**
- Consumes: `TelegramGateway.editListMessage` (Task 1); `ListActiveReminders.execute(): Promise<ActiveListViewModel>` (existing); `ReminderRepository.getOwnerSettings(): Promise<OwnerSettingsRow | null>` (existing); `renderListMessage(vm, timezone): { text: string; inlineKeyboard: any[][] }` (existing, same file).
- Produces: `refreshListMessage(gateway: TelegramGateway, listUC: ListActiveReminders, repo: ReminderRepository, chatId: number, messageId: number): Promise<void>` — consumed by Task 3's `handleListCancel` and Task 4's `handleListDelete`.

- [ ] **Step 1: Write the failing tests**

Add to `src/ports/__tests__/list-handler.test.ts`, a new top-level `describe` block (after the existing `handleListCancel` block, before `"go-to-source from the list reuses..."`):

```ts
import { refreshListMessage } from "../handlers/list-handler.js";

describe("refreshListMessage — in-place /list edit (issue #8)", () => {
  let repo: InMemoryReminderRepository;
  let listUC: ListActiveReminders;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, TZ);
    listUC = new ListActiveReminders(repo);
  });

  it("edits the message with the freshly rendered list", async () => {
    repo.reminders.set(1, pending(1, Date.UTC(2026, 5, 20, 11, 30), "still here"));
    const gateway = makeGateway();

    await refreshListMessage(gateway, listUC, repo, 777, 42);

    expect(gateway.editListMessage).toHaveBeenCalledTimes(1);
    const [chatId, messageId, text, keyboard] = (gateway.editListMessage as any).mock.calls[0];
    expect(chatId).toBe(777);
    expect(messageId).toBe(42);
    expect(text).toContain("still here");
    expect(keyboard.flat().some((b: any) => b.callback_data === "cancel:1")).toBe(true);
  });

  it("edits to the empty-state text with a null keyboard when nothing is left", async () => {
    const gateway = makeGateway();

    await refreshListMessage(gateway, listUC, repo, 777, 42);

    expect(gateway.editListMessage).toHaveBeenCalledWith(
      777,
      42,
      expect.stringMatching(/немає активних/i),
      null
    );
  });

  it("swallows a gateway edit failure without throwing (best-effort refresh)", async () => {
    repo.reminders.set(1, pending(1, Date.now() + 60_000, "x"));
    const gateway = makeGateway();
    (gateway.editListMessage as any).mockRejectedValue(new Error("edit window expired"));

    await expect(refreshListMessage(gateway, listUC, repo, 777, 42)).resolves.not.toThrow();
  });
});
```

Also add `editListMessage: vi.fn().mockResolvedValue(undefined),` to the `makeGateway()` fixture already in this file (`src/ports/__tests__/list-handler.test.ts:184-192`) — Task 1's Step 6 script only patched `editMessageToPlaceholder`-based fixtures across the *other* 11 files; this file's `makeGateway` was included in that same list, so confirm it already has the line before adding a duplicate.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ports/__tests__/list-handler.test.ts -t "refreshListMessage"`
Expected: FAIL — `refreshListMessage is not exported` / not a function

- [ ] **Step 3: Implement `refreshListMessage`**

In `src/ports/handlers/list-handler.ts`, add the import and the new exported function (after `renderListMessage`, before `handleList`):

```ts
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";
```

```ts
/**
 * Re-runs the Active-list query and edits an existing /list message in place
 * with the fresh result — used after the Owner's own Cancel/Delete tap on
 * that message (issue #8). Best-effort: an edit failure (e.g. Telegram's
 * edit window) is logged and swallowed, never thrown, since the caller has
 * already sent a confirmation reply that must stand on its own.
 */
export async function refreshListMessage(
  gateway: TelegramGateway,
  listUC: ListActiveReminders,
  repo: ReminderRepository,
  chatId: number,
  messageId: number
): Promise<void> {
  try {
    const vm = await listUC.execute();
    if (vm.isEmpty) {
      await gateway.editListMessage(chatId, messageId, EMPTY_MESSAGE, null);
      return;
    }
    const settings = await repo.getOwnerSettings();
    const timezone = settings?.timezone ?? "UTC";
    const { text, inlineKeyboard } = renderListMessage(vm, timezone);
    await gateway.editListMessage(chatId, messageId, text, inlineKeyboard);
  } catch (err) {
    console.warn({ module: "list", event: "refresh_failed", error: String(err) });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ports/__tests__/list-handler.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/ports/handlers/list-handler.ts src/ports/__tests__/list-handler.test.ts
git commit -m "feat: add refreshListMessage helper to re-render /list in place"
```

---

### Task 3: Wire refresh into `handleListCancel`

**Files:**
- Modify: `src/ports/handlers/list-handler.ts`
- Modify: `src/ports/router.ts`
- Modify: `src/ports/__tests__/list-handler.test.ts`
- Modify: `docs/features/list-active-reminders/adr/0002-immutable-snapshot-list.md`

**Interfaces:**
- Consumes: `refreshListMessage` (Task 2).
- Produces: `handleListCancel(ctx, cancelUC: CancelPendingReminder, gateway: TelegramGateway, repo: ReminderRepository, listUC: ListActiveReminders, reminderId: number, ownerChatId: number): Promise<void>` (signature change — 3 new params) — consumed by `router.ts` and Task 4's tests reuse the same `MinimalCallbackCtx` shape.

- [ ] **Step 1: Update the failing/changing tests first**

In `src/ports/__tests__/list-handler.test.ts`, first clean up `makeCallbackCtx()` (defined near the top of the `handleListCancel` section) — its `editMessageText` spy existed only to prove the list was *never* edited (ADR-0002's original, now-superseded default), so remove it:

```ts
function makeCallbackCtx() {
  return {
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
  };
}
```

Then update the `describe("handleListCancel — cancel callback (T7, AC-03/AC-04)", ...)` block:

Replace the `beforeEach`:
```ts
  let repo: InMemoryReminderRepository;
  let cancelUC: CancelPendingReminder;
  let listUC: ListActiveReminders;
  let gateway: TelegramGateway;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, TZ);
    cancelUC = new CancelPendingReminder(repo);
    listUC = new ListActiveReminders(repo);
    gateway = makeGateway();
  });
```

Replace the first test (was: "cancels a pending reminder and confirms in a separate message (AC-03)"):
```ts
  it("cancels a pending reminder, confirms, then refreshes the list message in place (AC-03, issue #8)", async () => {
    repo.reminders.set(1, pending(1, Date.now() + 60_000, "doomed"));
    repo.reminders.set(2, pending(2, Date.now() + 120_000, "survivor"));
    const ctx = { ...makeCallbackCtx(), callbackQuery: { message: { message_id: 42 } } };

    await handleListCancel(ctx as any, cancelUC, gateway, repo, listUC, 1, OWNER_ID);

    expect((await repo.findById(1))!.state).toBe("deleted");
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const [text] = ctx.reply.mock.calls[0]!;
    expect(text.toLowerCase()).toMatch(/скасован/);
    // ADR-0002's immutable-snapshot default now has one deliberate exception:
    // the Owner's own tap on the list refreshes that same message in place
    // (docs/superpowers/specs/2026-07-12-list-live-refresh-design.md).
    expect(gateway.editListMessage).toHaveBeenCalledTimes(1);
    const [chatId, messageId, refreshedText] = (gateway.editListMessage as any).mock.calls[0];
    expect(chatId).toBe(OWNER_ID);
    expect(messageId).toBe(42);
    expect(refreshedText).not.toContain("doomed");
    expect(refreshedText).toContain("survivor");
  });
```

Update the three stale-tap tests to pass the new params (no refresh expected — add one assertion per test):
```ts
  it.each<ReminderState>(["firing", "fired", "done", "deleted", "expired"])(
    "shows the uniform no-longer-active no-op for non-pending state '%s' with no state change (AC-04)",
    async (state) => {
      const r = Reminder.reconstitute({ id: 2, snapshot: snapshot(2, "stale"), state });
      repo.reminders.set(2, r);
      const ctx = { ...makeCallbackCtx(), callbackQuery: { message: { message_id: 42 } } };

      await handleListCancel(ctx as any, cancelUC, gateway, repo, listUC, 2, OWNER_ID);

      expect((await repo.findById(2))!.state).toBe(state);
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledTimes(1);
      const [text] = ctx.reply.mock.calls[0]!;
      expect(text.toLowerCase()).toMatch(/більше не активне/);
      expect(gateway.editListMessage).not.toHaveBeenCalled();
    }
  );

  it("shows the uniform no-op without crashing when the reminder row is absent (AC-04)", async () => {
    const ctx = { ...makeCallbackCtx(), callbackQuery: { message: { message_id: 42 } } };

    await handleListCancel(ctx as any, cancelUC, gateway, repo, listUC, 404, OWNER_ID);

    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const [text] = ctx.reply.mock.calls[0]!;
    expect(text.toLowerCase()).toMatch(/більше не активне/);
    expect(gateway.editListMessage).not.toHaveBeenCalled();
  });

  it("the uniform no-op message is identical for every non-pending end state (AC-04)", async () => {
    const messages: string[] = [];
    for (const state of ["firing", "fired", "done", "deleted", "expired"] as ReminderState[]) {
      repo.reminders.set(3, Reminder.reconstitute({ id: 3, snapshot: snapshot(3, "x"), state }));
      const ctx = { ...makeCallbackCtx(), callbackQuery: { message: { message_id: 42 } } };
      await handleListCancel(ctx as any, cancelUC, gateway, repo, listUC, 3, OWNER_ID);
      messages.push(ctx.reply.mock.calls[0]![0]);
    }
    expect(new Set(messages).size).toBe(1);
  });
```

Add one new test confirming the "no `callbackQuery.message`" fallback (matches `list-router.test.ts`'s existing bare `cancelCtx`, which has no `message` field):
```ts
  it("skips the refresh (but still confirms) when the ctx has no callbackQuery.message", async () => {
    repo.reminders.set(5, pending(5, Date.now() + 60_000, "doomed"));
    const ctx = makeCallbackCtx(); // no callbackQuery at all

    await handleListCancel(ctx as any, cancelUC, gateway, repo, listUC, 5, OWNER_ID);

    expect((await repo.findById(5))!.state).toBe("deleted");
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(gateway.editListMessage).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ports/__tests__/list-handler.test.ts -t "handleListCancel"`
Expected: FAIL — `handleListCancel` called with wrong number of arguments / `gateway.editListMessage` never called

- [ ] **Step 3: Widen the shared callback ctx type and update `handleListCancel`**

In `src/ports/handlers/list-handler.ts`, update the type and function:

```ts
type MinimalCallbackCtx = {
  answerCallbackQuery: (text?: string) => Promise<any>;
  reply: (text: string, opts?: any) => Promise<any>;
  callbackQuery?: { message?: { message_id: number } };
};
```

```ts
/**
 * Cancel callback from the Active list. On success the reminder moves
 * pending→deleted, the Owner is confirmed in a separate message, then the
 * tapped /list message itself is refreshed in place to drop the row
 * (issue #8 — supersedes ADR-0002's default for the Owner's own action, see
 * that ADR's Update note). A tap on a reminder that is no longer pending
 * surfaces the uniform no-op (AC-03 / AC-04) without any refresh.
 */
export async function handleListCancel(
  ctx: MinimalCallbackCtx,
  cancelUC: CancelPendingReminder,
  gateway: TelegramGateway,
  repo: ReminderRepository,
  listUC: ListActiveReminders,
  reminderId: number,
  ownerChatId: number
): Promise<void> {
  try {
    await cancelUC.execute({ reminderId });
    await ctx.answerCallbackQuery();
    await ctx.reply(CANCEL_CONFIRM_MESSAGE);
  } catch (err) {
    if (
      err instanceof InvalidStateTransitionError ||
      err instanceof ReminderNotFoundError
    ) {
      await ctx.answerCallbackQuery();
      await ctx.reply(NOT_ACTIVE_MESSAGE);
      return;
    }
    throw err;
  }

  const messageId = ctx.callbackQuery?.message?.message_id;
  if (messageId !== undefined) {
    await refreshListMessage(gateway, listUC, repo, ownerChatId, messageId);
  }
}
```

- [ ] **Step 4: Update the router call site**

In `src/ports/router.ts`, change:
```ts
        if (action === "cancel") {
          return handleListCancel(ctx, cancelUC, reminderId);
        }
```
to:
```ts
        if (action === "cancel") {
          return handleListCancel(ctx, cancelUC, gateway, repo, listUC, reminderId, ownerChatId);
        }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/ports/__tests__/list-handler.test.ts`
Expected: PASS (all tests in the file)

Then run the full suite to catch any other caller of `handleListCancel`:
Run: `npm run build && npm test`
Expected: PASS. If `src/ports/__tests__/list-router.test.ts`'s `"cancels a pending reminder via the cancel callback for the Owner (AC-03)"` test fails, it's because its `cancelCtx()` fixture has no `callbackQuery.message` — this is expected and handled by the `messageId !== undefined` guard (refresh is skipped, confirmation still sent), so the test should still pass unmodified. If it doesn't, inspect the failure before changing anything.

- [ ] **Step 6: Append the ADR-0002 update note**

Append to the end of `docs/features/list-active-reminders/adr/0002-immutable-snapshot-list.md`:

```markdown

## Update — 2026-07-12

Partially superseded by `docs/superpowers/specs/2026-07-12-list-live-refresh-design.md`
(GitHub issue #8): the Owner's own Cancel/Delete tap on a `/list` message now
edits that same message in place to drop the row — the "Live-edit" option
this ADR considered and deferred (see Consequences, Neutral). The core
decision still holds for every other case: a `/list` message is never edited
for reasons other than the Owner's own action on it (e.g. another reminder
firing in the background never pushes a live update to an open list).
```

- [ ] **Step 7: Commit**

```bash
git add src/ports/handlers/list-handler.ts src/ports/router.ts src/ports/__tests__/list-handler.test.ts \
  docs/features/list-active-reminders/adr/0002-immutable-snapshot-list.md
git commit -m "feat: refresh /list message in place after Cancel (issue #8)"
```

---

### Task 4: `handleListDelete` handler + shared cleanup extraction

**Files:**
- Modify: `src/ports/handlers/resolve-handler.ts`
- Modify: `src/ports/handlers/list-handler.ts`
- Modify: `src/ports/dto/index.ts`
- Modify: `src/ports/__tests__/list-handler.test.ts`

**Interfaces:**
- Consumes: `refreshListMessage` (Task 2); `ResolveReminder.execute({ reminderId, action: "delete" }): Promise<Reminder>` (existing, unchanged).
- Produces: `cleanupFiredNotification(gateway: TelegramGateway, chatId: number, firedMessageId: number | null): Promise<void>` (exported from `resolve-handler.ts`, consumed by Task 4's own `handleListDelete`); `handleListDelete(ctx, resolveUC: ResolveReminder, gateway: TelegramGateway, repo: ReminderRepository, listUC: ListActiveReminders, reminderId: number, ownerChatId: number): Promise<void>` (consumed by Task 5's router wiring).

- [ ] **Step 1: Extract `cleanupFiredNotification` from `handleResolve` (refactor, no behavior change)**

In `src/ports/handlers/resolve-handler.ts`, replace the body of `handleResolve` from `if (reminder.firedMessageId) {` through the closing brace with a call to a new exported function, and define that function above `handleResolve`:

```ts
/**
 * Clears the original fired-reminder notification in chat: deletes it if
 * still within Telegram's 48h delete window, otherwise replaces its text
 * with a placeholder. No-ops when there is no notification to clean up.
 */
export async function cleanupFiredNotification(
  gateway: TelegramGateway,
  chatId: number,
  firedMessageId: number | null
): Promise<void> {
  if (!firedMessageId) return;
  try {
    await gateway.deleteMessage(chatId, firedMessageId);
  } catch (err) {
    if (err instanceof TelegramDeleteWindowError) {
      await gateway.editMessageToPlaceholder(chatId, firedMessageId, "🗑 Нагадування видалено");
    } else {
      throw err;
    }
  }
}
```

`handleResolve`'s body becomes:
```ts
export async function handleResolve(
  ctx: MinimalCtx,
  resolveUC: ResolveReminder,
  gateway: TelegramGateway,
  reminderId: number,
  action: "done" | "delete",
  ownerChatId: number
): Promise<void> {
  let reminder;
  try {
    reminder = await resolveUC.execute({ reminderId, action });
  } catch (err) {
    if (
      action === "done" &&
      (err instanceof InvalidStateTransitionError || err instanceof ReminderNotFoundError)
    ) {
      await ctx.answerCallbackQuery(DONE_RETIRED_MESSAGE);
      return;
    }
    throw err;
  }

  await cleanupFiredNotification(gateway, ownerChatId, reminder.firedMessageId);

  await ctx.answerCallbackQuery();
}
```

- [ ] **Step 2: Run `resolve-handler.test.ts` to confirm the refactor is behavior-preserving**

Run: `npx vitest run src/ports/__tests__/resolve-handler.test.ts`
Expected: PASS — all 4 existing tests, unchanged, still green (pure refactor, no new tests needed here)

- [ ] **Step 3: Write the failing tests for `handleListDelete`**

Add to `src/ports/__tests__/list-handler.test.ts`, a new `describe` block (after the `refreshListMessage` block added in Task 2):

```ts
import { handleListDelete } from "../handlers/list-handler.js";
import { ResolveReminder } from "../../app/use-cases/resolve-reminder.js";

describe("handleListDelete — delete callback from the list (issue #8)", () => {
  let repo: InMemoryReminderRepository;
  let resolveUC: ResolveReminder;
  let listUC: ListActiveReminders;
  let gateway: TelegramGateway;

  beforeEach(() => {
    repo = new InMemoryReminderRepository(OWNER_ID, TZ);
    resolveUC = new ResolveReminder(repo);
    listUC = new ListActiveReminders(repo);
    gateway = makeGateway();
  });

  it("deletes a fired reminder, cleans up its notification, confirms, then refreshes the list", async () => {
    const r = Reminder.reconstitute({
      id: 1, snapshot: snapshot(1, "gone"), state: "fired", firedMessageId: 909,
    });
    repo.reminders.set(1, r);
    repo.reminders.set(2, pending(2, Date.now() + 60_000, "survivor"));
    const ctx = { ...makeCallbackCtx(), callbackQuery: { message: { message_id: 42 } } };

    await handleListDelete(ctx as any, resolveUC, gateway, repo, listUC, 1, OWNER_ID);

    expect((await repo.findById(1))!.state).toBe("deleted");
    expect(gateway.deleteMessage).toHaveBeenCalledWith(OWNER_ID, 909);
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(ctx.reply.mock.calls[0]![0].toLowerCase()).toMatch(/видален/);
    expect(gateway.editListMessage).toHaveBeenCalledTimes(1);
    const [, , refreshedText] = (gateway.editListMessage as any).mock.calls[0];
    expect(refreshedText).not.toContain("gone");
    expect(refreshedText).toContain("survivor");
  });

  it("shows the uniform no-op and skips cleanup/refresh on a stale tap (not fired)", async () => {
    const r = Reminder.reconstitute({ id: 2, snapshot: snapshot(2, "still pending"), state: "pending", scheduledAt: Date.now() + 1000 });
    repo.reminders.set(2, r);
    const ctx = { ...makeCallbackCtx(), callbackQuery: { message: { message_id: 42 } } };

    await handleListDelete(ctx as any, resolveUC, gateway, repo, listUC, 2, OWNER_ID);

    expect((await repo.findById(2))!.state).toBe("pending");
    expect(gateway.deleteMessage).not.toHaveBeenCalled();
    expect(gateway.editListMessage).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(ctx.reply.mock.calls[0]![0].toLowerCase()).toMatch(/більше не активне/);
  });

  it("shows the uniform no-op without crashing when the reminder row is absent", async () => {
    const ctx = { ...makeCallbackCtx(), callbackQuery: { message: { message_id: 42 } } };

    await expect(
      handleListDelete(ctx as any, resolveUC, gateway, repo, listUC, 404, OWNER_ID)
    ).resolves.not.toThrow();

    expect(ctx.reply.mock.calls[0]![0].toLowerCase()).toMatch(/більше не активне/);
    expect(gateway.editListMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/ports/__tests__/list-handler.test.ts -t "handleListDelete"`
Expected: FAIL — `handleListDelete is not exported`

- [ ] **Step 5: Implement `handleListDelete`**

In `src/ports/handlers/list-handler.ts`:
- Add imports: `import type { ResolveReminder } from "../../app/use-cases/resolve-reminder.js";` and `import { cleanupFiredNotification } from "./resolve-handler.js";`
- Add a new constant next to `CANCEL_CONFIRM_MESSAGE`: `const DELETE_CONFIRM_MESSAGE = "✅ Нагадування видалено.";`
- Add the function (after `handleListCancel`):

```ts
/**
 * Delete callback from the Active list, for an already-fired row. On success
 * the reminder moves fired→deleted, the original fired-notification message
 * is cleaned up, the Owner is confirmed, then the tapped /list message is
 * refreshed in place to drop the row (issue #8). Routed separately from the
 * fired-notification's own Delete button (`action: "delete"`, handled by
 * `handleResolve`) via the distinct `list_delete` callback — see
 * `src/ports/dto/index.ts`.
 */
export async function handleListDelete(
  ctx: MinimalCallbackCtx,
  resolveUC: ResolveReminder,
  gateway: TelegramGateway,
  repo: ReminderRepository,
  listUC: ListActiveReminders,
  reminderId: number,
  ownerChatId: number
): Promise<void> {
  let reminder;
  try {
    reminder = await resolveUC.execute({ reminderId, action: "delete" });
  } catch (err) {
    if (
      err instanceof InvalidStateTransitionError ||
      err instanceof ReminderNotFoundError
    ) {
      await ctx.answerCallbackQuery();
      await ctx.reply(NOT_ACTIVE_MESSAGE);
      return;
    }
    throw err;
  }

  await cleanupFiredNotification(gateway, ownerChatId, reminder.firedMessageId);

  await ctx.answerCallbackQuery();
  await ctx.reply(DELETE_CONFIRM_MESSAGE);

  const messageId = ctx.callbackQuery?.message?.message_id;
  if (messageId !== undefined) {
    await refreshListMessage(gateway, listUC, repo, ownerChatId, messageId);
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/ports/__tests__/list-handler.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 7: Rename the list callback and update the render-side tests**

In `src/ports/dto/index.ts`, change:
```ts
export const LIST_CALLBACK = {
  CANCEL: "cancel",
  SOURCE: "source",
  DELETE: "delete",
} as const;
```
to:
```ts
/**
 * Callback-action tags for the Active-list inline buttons, encoded as
 * `<tag>:<reminderId>` in callback_data (≤ 64 bytes, sad §8). Shared between
 * the list handler that renders them and the router that routes them.
 * `SOURCE` reuses the existing fired-reminder source action. `DELETE` has
 * its own `list_delete` tag, distinct from the fired-reminder notification's
 * own `delete` callback — the two need different post-action behavior
 * (issue #8: only the list's own Delete refreshes a /list message).
 */
export const LIST_CALLBACK = {
  CANCEL: "cancel",
  SOURCE: "source",
  DELETE: "list_delete",
} as const;
```

In `src/ports/__tests__/list-handler.test.ts`, in the `describe("handleList — /list command handler (T6)", ...)` block, update the AC-09 test's hardcoded callback_data strings:
```ts
    expect(keyboard.some((b: any) => b.callback_data === "list_delete:2")).toBe(true);
    // A still-scheduled row has no Delete — it isn't resolved yet, Cancel is
    // its only exit.
    expect(keyboard.some((b: any) => b.callback_data === "list_delete:1")).toBe(false);
```
(replacing the two `"delete:2"` / `"delete:1"` occurrences at what was originally lines 151 and 154).

- [ ] **Step 8: Run the full file's tests, then the full suite**

Run: `npx vitest run src/ports/__tests__/list-handler.test.ts`
Expected: PASS (all tests)

Run: `npm run build && npm test`
Expected: PASS — note `src/ports/router.ts` does not yet route `list_delete` anywhere (Task 5), so the button is temporarily inert in a running bot between this commit and the next; no test in the suite exercises that end-to-end path yet.

- [ ] **Step 9: Commit**

```bash
git add src/ports/handlers/resolve-handler.ts src/ports/handlers/list-handler.ts \
  src/ports/dto/index.ts src/ports/__tests__/list-handler.test.ts
git commit -m "feat: add handleListDelete, split list_delete from the notification's delete callback"
```

---

### Task 5: Route `list_delete` in the router + regression coverage

**Files:**
- Modify: `src/ports/router.ts`
- Modify: `src/ports/__tests__/list-router.test.ts`
- Modify: `src/ports/__tests__/resolve-handler.test.ts`

**Interfaces:**
- Consumes: `handleListDelete` (Task 4).

- [ ] **Step 1: Write the failing router tests**

Add to `src/ports/__tests__/list-router.test.ts`, inside `describe("Router: /list wiring (T8, AC-05/AC-07)", ...)`:

```ts
  function listDeleteCtx(fromId: number, messageId = 55) {
    return {
      from: { id: fromId },
      callbackQuery: { id: "cq", data: "list_delete:1", message: { message_id: messageId } },
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
    };
  }

  function fired(id: number, text: string, firedMessageId: number): Reminder {
    return Reminder.reconstitute({
      id, snapshot: snapshot(id, text), state: "fired", firedMessageId,
    });
  }
```

(`Reminder` and `snapshot` are already imported/defined at the top of this file.)

```ts
  it("deletes a fired reminder via the list_delete callback, confirms, and refreshes the tapped list message (issue #8)", async () => {
    repo.reminders.set(1, fired(1, "gone", 909));
    const gateway = makeGateway();
    const routerWithGateway = buildRouter(repo, gateway, OWNER_ID, new InMemoryPendingPromptRepository());
    const ctx = listDeleteCtx(OWNER_ID);

    await routerWithGateway.handleUpdate(ctx as any);

    expect((await repo.findById(1))!.state).toBe("deleted");
    expect(ctx.reply).toHaveBeenCalled();
    expect((gateway.editListMessage as any)).toHaveBeenCalledWith(
      OWNER_ID, 55, expect.any(String), expect.anything()
    );
  });

  it("ignores the list_delete callback from a non-Owner — no mutation", async () => {
    repo.reminders.set(1, fired(1, "gone", 909));
    const ctx = listDeleteCtx(NON_OWNER_ID);
    await router.handleUpdate(ctx as any);

    expect((await repo.findById(1))!.state).toBe("fired");
    expect(ctx.reply).not.toHaveBeenCalled();
  });
```

Note: the file's top-level `router` (built in `beforeEach` with the plain `makeGateway()`) is reused for the non-Owner test since no gateway assertions are needed there; the Owner-path test builds its own router with a fresh gateway instance so `editListMessage` can be asserted on directly.

Also add a regression test to `src/ports/__tests__/resolve-handler.test.ts`, at the end of the `describe("handleResolve callback handler", ...)` block:

```ts
  it("never touches any /list message — delete on the fired-notification's own button stays isolated (issue #8)", async () => {
    const r = Reminder.reconstitute({ id: 5, snapshot: makeSnapshot(5), state: "fired", firedMessageId: 55 });
    repo.reminders.set(5, r);
    const gateway = makeFakeGateway();
    const ctx = { answerCallbackQuery: vi.fn().mockResolvedValue(undefined) };

    await handleResolve(ctx as any, resolveUC, gateway, 5, "delete", CHAT_ID);

    expect((gateway as any).editListMessage).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ports/__tests__/list-router.test.ts src/ports/__tests__/resolve-handler.test.ts`
Expected: the two new `list-router.test.ts` cases FAIL (router doesn't recognize `list_delete` yet, so `ctx.reply`/state stay untouched); the new `resolve-handler.test.ts` case already PASSes (nothing calls `editListMessage` yet regardless) — that's fine, it's a regression guard for the next step.

- [ ] **Step 3: Add the router branch**

In `src/ports/router.ts`, change:
```ts
        if (action === "done" || action === "delete") {
          return handleResolve(ctx, resolveUC, gateway, reminderId, action as "done" | "delete", ownerChatId);
        }
        if (action === "cancel") {
          return handleListCancel(ctx, cancelUC, gateway, repo, listUC, reminderId, ownerChatId);
        }
```
to:
```ts
        if (action === "done" || action === "delete") {
          return handleResolve(ctx, resolveUC, gateway, reminderId, action as "done" | "delete", ownerChatId);
        }
        if (action === "list_delete") {
          return handleListDelete(ctx, resolveUC, gateway, repo, listUC, reminderId, ownerChatId);
        }
        if (action === "cancel") {
          return handleListCancel(ctx, cancelUC, gateway, repo, listUC, reminderId, ownerChatId);
        }
```

And update the import line:
```ts
import { handleList, handleListCancel, handleListDelete } from "./handlers/list-handler.js";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ports/__tests__/list-router.test.ts src/ports/__tests__/resolve-handler.test.ts`
Expected: PASS (all tests in both files)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm run build && npm test`
Expected: PASS — every test in the repo green

- [ ] **Step 6: Commit**

```bash
git add src/ports/router.ts src/ports/__tests__/list-router.test.ts src/ports/__tests__/resolve-handler.test.ts
git commit -m "feat: route list_delete to handleListDelete, closing issue #8"
```

---

## Manual verification (after Task 5)

Not automatable in this codebase's test suite (no live Telegram integration test harness) — after implementation, manually verify against a real bot per the repo's existing manual-check convention:
1. `/list` with at least one pending and one fired reminder.
2. Tap Cancel on the pending row → confirmation message appears, then the list message itself updates to drop that row within the same view.
3. Tap Delete on the fired row → confirmation message appears, then the list message updates to drop that row; the original fired-notification message elsewhere in the chat is still cleaned up as before.
4. Delete the last remaining row → list message switches to the empty-state text with no buttons.
5. Tap Delete directly on a fired-notification message in chat (not from `/list`) → behaves exactly as before, no `/list` message is touched.
