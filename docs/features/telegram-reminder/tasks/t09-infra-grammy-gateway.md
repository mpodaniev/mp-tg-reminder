---
id: T09
title: "GrammyTelegramGateway"
layer: "infra"
deps: ["T04"]
acs: []
files_hint:
  - src/infra/telegram/grammy-telegram-gateway.ts
  - src/infra/telegram/index.ts
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T09 — GrammyTelegramGateway

## Why

The concrete implementation of the `TelegramGateway` port (T04) using the grammY Bot API client ([ADR-0001](../adr/0001-node-typescript-grammy-runtime.md)). Isolates all Telegram API calls behind the port so use cases and tests never touch the real network.

## What

**`GrammyTelegramGateway`** implements `TelegramGateway`:
- `sendReminder(chatId, snapshot, reminderId)` — sends a message with the snapshot content (text + media if `media_file_id` present and not protected), attaches inline keyboard: Snooze · Done · Delete · Go-to-source (AC-04). Returns `{ messageId }` from the Telegram response.
- `sendPrompt(chatId, message, keyboard?)` — sends a plain text message, optionally with an inline keyboard.
- `editMessage(chatId, messageId, text, keyboard?)` — edits an existing message; used as the fallback when `deleteMessage` fails due to Telegram's 48h delete window (AC-06, AC-07).
- `deleteMessage(chatId, messageId)` — wraps `bot.api.deleteMessage`; throws `MessageDeleteWindowExpiredError` if Telegram returns `MESSAGE_CANT_BE_DELETED` (allows T11 to switch to edit fallback).
- `answerCallback(callbackQueryId, text?)` — answers a callback query to dismiss the loading spinner.

Constructor takes a grammY `Bot` instance (injected at wiring time, T13).

## Definition of Done

- [ ] `GrammyTelegramGateway` compiles against grammY types with `tsc --noEmit`
- [ ] Smoke test with a fake grammY `Bot` mock: `sendReminder` passes correct chat_id, text, and 4-button inline keyboard
- [ ] `deleteMessage` throws `MessageDeleteWindowExpiredError` when grammY error matches `MESSAGE_CANT_BE_DELETED`
- [ ] No business logic in the gateway — pure API translation
- [ ] lint + vet clean

## Notes

Derives from [contracts/cli.md §inline keyboard](../contracts/cli.md), [sad §5](../sad.md), [ADR-0001](../adr/0001-node-typescript-grammy-runtime.md). Callback data format for buttons must be consistent with T11 (e.g. `snooze:${reminderId}`, `done:${reminderId}`, `delete:${reminderId}`, `source:${reminderId}`). Agree on the format here in the gateway, reference it in T11. Can start in parallel with T05–T07 once T04 is done.
