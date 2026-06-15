# Tracker — list-active-reminders

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | pending→deleted transition + sentinel | domain | Mykhailo Podaniev | S | — | todo |
| T2 | findActivePendingOrdered() on repo port | app | Mykhailo Podaniev | S | — | todo |
| T3 | implement findActivePendingOrdered (SQLite) | infra | Mykhailo Podaniev | S | T2 | todo |
| T4 | ListActiveReminders use-case (truncate + overflow) | app | Mykhailo Podaniev | M | T2 | todo |
| T5 | CancelPendingReminder use-case | app | Mykhailo Podaniev | S | T1, T2 | todo |
| T6 | /list command handler (+ empty) | ports | Mykhailo Podaniev | M | T4 | todo |
| T7 | cancel + go-to-source callbacks | ports | Mykhailo Podaniev | M | T5, T6 | todo |
| T8 | wire /list + command-menu + DI | wiring | Mykhailo Podaniev | S | T6, T7 | todo |

**Total:** 8 tasks, ~5–6 person-days.
