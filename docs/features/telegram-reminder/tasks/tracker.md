# Tracker — telegram-reminder

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T01 | Project scaffold | wiring | Mykhailo Podaniev | S | — | todo |
| T02 | Promote staged migrations + migration runner | migration | Mykhailo Podaniev | S | T01 | todo |
| T03 | Reminder entity + state machine + value objects + errors | domain | Mykhailo Podaniev | M | T01 | todo |
| T04 | Port interfaces: ReminderRepository + TelegramGateway | app | Mykhailo Podaniev | S | T03 | todo |
| T05 | Use cases: CaptureMessage + ScheduleReminder | app | Mykhailo Podaniev | M | T04 | todo |
| T06 | Use cases: FireDueReminders + ExpireStalePrompts | app | Mykhailo Podaniev | M | T04 | todo |
| T07 | Use cases: SnoozeReminder + ResolveReminder | app | Mykhailo Podaniev | S | T04 | todo |
| T08 | SqliteReminderRepository + test factories | infra | Mykhailo Podaniev | M | T02, T04 | todo |
| T09 | GrammyTelegramGateway | infra | Mykhailo Podaniev | S | T04 | todo |
| T10 | grammY router + capture conversation + /settings | ports | Mykhailo Podaniev | M | T05, T09 | todo |
| T11 | Callback handlers: Snooze, Done, Delete, Go-to-source | ports | Mykhailo Podaniev | M | T07, T09 | todo |
| T12 | In-process polling-tick scheduler worker | ports | Mykhailo Podaniev | S | T06, T09 | todo |
| T13 | Composition root main.ts + startup wiring | wiring | Mykhailo Podaniev | S | T08, T10, T11, T12 | todo |
| T14 | Integration tests: restart durability + fire accuracy + E2E | tests | Mykhailo Podaniev | M | T13 | todo |

**Total:** 14 tasks, ~7–9 person-days.
