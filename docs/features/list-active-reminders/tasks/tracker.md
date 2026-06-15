# Tracker — list-active-reminders

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | pending→deleted transition + sentinel | domain | Mykhailo Podaniev | S | — | done |
| T2 | findActivePendingOrdered() on repo port | app | Mykhailo Podaniev | S | — | done |
| T3 | implement findActivePendingOrdered (SQLite) | infra | Mykhailo Podaniev | S | T2 | done |
| T4 | ListActiveReminders use-case (truncate + overflow) | app | Mykhailo Podaniev | M | T2 | done |
| T5 | CancelPendingReminder use-case | app | Mykhailo Podaniev | S | T1, T2 | done |
| T6 | /list command handler (+ empty) | ports | Mykhailo Podaniev | M | T4 | done |
| T7 | cancel + go-to-source callbacks | ports | Mykhailo Podaniev | M | T5, T6 | done |
| T8 | wire /list + command-menu + DI | wiring | Mykhailo Podaniev | S | T6, T7 | done |

**Total:** 8 tasks, ~5–6 person-days.

## Review follow-ups (review-2026-06-15 — CHANGES REQUESTED)

| Finding | Sev | Fix | AC | Status |
|---|---|---|---|---|
| #1 | medium | Restore real-ephemeral-SQLite integration tier (cancel-persist + source JOIN) | AC-03/04/06 | done |
| #2 | low | Structured timing log around the list use-case (NFR §6 / QG-3) | AC-01 | done |
| #3 | low | Map not-found cancel to the uniform no-op (no bot.catch crash) | AC-04 | done |
| #4 | low | Assert the cancel path never edits the list message (ADR-0002) | AC-03 | done |
| #5 | info | AC-08 char-budget two-sources-of-truth — dismissed (conservative, no risk) | AC-08 | n/a |
