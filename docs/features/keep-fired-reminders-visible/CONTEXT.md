---
status: Living
updated_at: "2026-07-08"
---

# Domain Context — keep-fired-reminders-visible

Glossary terms reused from [telegram-reminder/CONTEXT.md](../telegram-reminder/CONTEXT.md) and
[list-active-reminders/CONTEXT.md](../list-active-reminders/CONTEXT.md) remain canonical (Owner,
Reminder, Quick-pick, Custom time, Snooze, Fire, Deep link, Active reminder, Active list, Cancel).
This file adds the term this feature introduces.

## Glossary

- **Visible reminder** — a Reminder that appears in the list command's output: one in the `pending`, `firing`, or `fired` state that has not yet been explicitly deleted. NOT **Active reminder** (the narrower, `pending`-only term from `list-active-reminders`) — every Active reminder is a Visible reminder, but a Visible reminder may also be past its fire time and already delivered to the Owner's chat.

## Invariants

- A Reminder always leaves the Visible list only through an explicit Owner delete action; firing, delivering, or snoozing a reminder never removes it from the list or changes its position within it.
