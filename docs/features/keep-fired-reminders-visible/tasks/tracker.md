# Tracker — keep-fired-reminders-visible

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Widen repository query scope to pending+fired, ordered by capture order | infra | Mykhailo Podaniev | S | — | done |
| T2 | List use-case: per-row status flag + capture-order truncation | app | Mykhailo Podaniev | M | T1 | done |
| T3 | List handler: render scheduled/fired flag, suppress Cancel on fired rows | ports | Mykhailo Podaniev | S | T2 | done |
| T4 | Telegram gateway: drop the Done button from the fired-reminder keyboard | infra | Mykhailo Podaniev | S | — | done |
| T5 | Resolve-reminder use-case: guard the done action before any domain call | app | Mykhailo Podaniev | S | — | done |
| T6 | Resolve handler: map guarded done outcome to uniform "no longer active" reply | ports | Mykhailo Podaniev | S | T5, T4 | done |
| T7 | Integration test: position stable across fire/deliver/snooze; only delete removes | tests | Mykhailo Podaniev | S | T2 | done |
| T8 | Integration test: oversized visible set sends exactly one message + overflow indicator | tests | Mykhailo Podaniev | S | T3 | done |
| T9 | Extend owner-gate test: non-Owner sees nothing when fired reminders exist | tests | Mykhailo Podaniev | S | T3 | todo |

**Total:** 9 tasks, ~4 person-days (fits size S — a small handful of PRs).
