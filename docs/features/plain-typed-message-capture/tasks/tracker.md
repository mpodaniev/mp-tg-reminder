# Tracker — plain-typed-message-capture

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Add plain-text capture handler in capture-conversation.ts | ports | Mykhailo Podaniev | S | — | todo |
| T2 | Wire router precedence branch for plain-text dispatch | ports | Mykhailo Podaniev | S | T1 | todo |
| T3 | Lock typed-origin source-lookup fallback with a regression test | tests | Mykhailo Podaniev | S | — | todo |
| T4 | Run full regression suite and verify manual latency budget | tests | Mykhailo Podaniev | S | T1, T2, T3 | todo |

**Total:** 4 tasks, ~1 person-day (matches `.size` = XS, 1 PR).
