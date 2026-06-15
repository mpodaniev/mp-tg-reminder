# Context — list-active-reminders

Glossary terms reused from [telegram-reminder/CONTEXT.md](../telegram-reminder/CONTEXT.md) remain canonical
(Owner, Reminder, Source message, Source chat, Deep link, Fire, Snooze). This file adds the terms this
feature introduces.

## Glossary

| Term | Definition |
|---|---|
| **Owner** | The single Telegram user who owns and interacts with the personal bot instance. Only the Owner's messages are processed; all other Telegram users are rejected. (Canonical — same as telegram-reminder.) |
| **Reminder** | A captured source message paired with a scheduled notification time and a lifecycle state: `awaiting_time` → `pending` → `firing` → `fired` → `done`/`deleted` (or `awaiting_time` → `expired`). (Canonical.) |
| **Active reminder** | A Reminder in the `pending` state — scheduled and still waiting for its fire time, not yet delivered, cancelled, or resolved. The unit the active list shows. NOT a `fired`, `firing`, `done`, `deleted`, or `expired` reminder. |
| **Active list** | The bot's response to the list command: a single message enumerating all of the Owner's Active reminders ordered by their fire time, each with its own action buttons. NOT a per-reminder broadcast and NOT the cleared-inbox chat view of fired messages. |
| **Cancel** | An Owner action on an Active reminder that transitions it `pending` → `deleted` (a terminal lifecycle state) so it never fires. Distinct from **resolve-delete**, which acts on an already-`fired` reminder. |
