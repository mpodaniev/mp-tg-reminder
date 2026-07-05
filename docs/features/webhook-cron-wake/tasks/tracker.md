# Tracker — webhook-cron-wake

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Promote and validate the staged `pending_prompt` migration | migration | Mykhailo Podaniev | S | — | done |
| T2 | Add the `PendingPromptRepository` port interface | app | Mykhailo Podaniev | S | — | done |
| T3 | Implement `PendingPromptRepository` against SQLite | infra | Mykhailo Podaniev | M | T1, T2 | done |
| T4 | Make `Scheduler.tick()` public + awaitable; `stop()` drains | app | Mykhailo Podaniev | S | — | done |
| T5 | Idempotent-retry tests for `FireDueReminders` | tests | Mykhailo Podaniev | M | T4 | done |
| T6 | Characterize today's router dispatch/auth behavior | tests | Mykhailo Podaniev | M | — | done |
| T7 | Centralize Owner-auth gate at router dispatch | ports | Mykhailo Podaniev | M | T6 | done |
| T8 | Durable pending-prompt in router (replace in-memory map) | ports | Mykhailo Podaniev | M | T3, T7 | todo |
| T9 | Wake-interval delay estimate on confirmation | app | Mykhailo Podaniev | S | — | todo |
| T10 | `node:http` server skeleton + route dispatch | ports | Mykhailo Podaniev | M | — | todo |
| T11 | Webhook handler (secretToken verification) | ports | Mykhailo Podaniev | M | T7, T10 | todo |
| T12 | Wake handler (constant-time bearer verification) | ports | Mykhailo Podaniev | M | T4, T10 | todo |
| T13 | Wire composition root + webhook mode + graceful shutdown | wiring | Mykhailo Podaniev | M | T8, T9, T11, T12 | todo |
| T14 | Integration tests: perimeter + catch-up | tests | Mykhailo Podaniev | M | T13 | todo |
| T15 | Document the deployment setup | docs | Mykhailo Podaniev | S | T13 | todo |

**Total:** 15 tasks, ~9 person-days (solo, per sad.md §2 "no team" — feature_size M, 1–2 sprints).
