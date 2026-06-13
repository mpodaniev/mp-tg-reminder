---
id: T04
title: "Port interfaces: ReminderRepository + TelegramGateway"
layer: "app"
deps: ["T03"]
acs: []
files_hint:
  - src/app/ports/reminder-repository.ts
  - src/app/ports/telegram-gateway.ts
  - src/app/ports/index.ts
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T04 — Port interfaces: ReminderRepository + TelegramGateway

## Why

Ports-and-adapters ([ADR-0006](../adr/0006-ports-and-adapters-layering.md)) requires that the app layer depends only on abstract port interfaces, not on SQLite or grammY. This task defines the two primary ports; all use cases (T05–T07) and the infra adapters (T08, T09) implement against them.

## What

**`ReminderRepository`** (`src/app/ports/reminder-repository.ts`):
```ts
interface ReminderRepository {
  save(reminder: Reminder, snapshot: SourceSnapshot): Promise<void>          // atomic (single tx)
  findById(id: number): Promise<Reminder | null>
  findWithSnapshot(id: number): Promise<{ reminder: Reminder; snapshot: SourceSnapshot } | null>
  update(reminder: Reminder): Promise<void>
  findDuePending(now: number): Promise<Reminder[]>                           // state=pending AND scheduled_at<=now
  findAwaitingExpired(cutoff: number): Promise<Reminder[]>                   // state=awaiting_time AND created_at<cutoff
}
```

**`TelegramGateway`** (`src/app/ports/telegram-gateway.ts`):
```ts
interface TelegramGateway {
  sendReminder(chatId: number, snapshot: SourceSnapshot, reminderId: number): Promise<{ messageId: number }>
  sendPrompt(chatId: number, message: string, keyboard?: InlineKeyboard): Promise<void>
  editMessage(chatId: number, messageId: number, text: string, keyboard?: InlineKeyboard): Promise<void>
  deleteMessage(chatId: number, messageId: number): Promise<void>
  answerCallback(callbackQueryId: string, text?: string): Promise<void>
}
```

Both are TypeScript `interface`s — zero runtime code. Export from `src/app/ports/index.ts`.

## Definition of Done

- [ ] Both interfaces compile with `tsc --noEmit`
- [ ] No imports from `infra/`, `ports/` (Telegram handler layer), or any runtime library
- [ ] `src/app/ports/index.ts` barrel re-exports both interfaces
- [ ] lint + vet clean

## Notes

Derives from [sad §5 module boundaries](../sad.md) and [contracts/cli.md](../contracts/cli.md). `InlineKeyboard` type may be imported from `grammy` (a dev-visible framework type is acceptable in the port if it's a pure structural type) — or define a local structural alias; choose at implementation time.
