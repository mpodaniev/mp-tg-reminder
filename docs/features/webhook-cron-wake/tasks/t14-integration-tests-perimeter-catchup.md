---
id: T14
title: "Integration tests for the new public perimeter and catch-up semantics"
layer: "tests"
deps: ["T13"]
acs: ["AC-04", "AC-05", "AC-07"]
files_hint: ["src/ports/http/__tests__/webhook-handler.test.ts", "src/ports/http/__tests__/wake-handler.test.ts", "src/app/use-cases/__tests__/fire-due-reminders.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T14 — Integration tests for the new public perimeter and catch-up semantics

## Why

Cross-cutting acceptance criteria that only show up once the whole wired system runs together: the 100% unauthenticated-rejection NFR ([AC-04](../spec.md)), the durable prompt surviving a real restart ([AC-05](../spec.md)), and a missed wake cycle catching up without loss ([AC-07](../spec.md), [sad.md §6 Critical flow 5](../sad.md)).

## What

End-to-end tests running the actual `node:http` server (from T13's wiring) against a real tmpdir SQLite DB:
- Unauthenticated requests to both `/webhook/telegram` and `/wake` are rejected 100% of the time, with zero rows changed in `reminders`/`pending_prompt`/`owner_settings` (AC-04)
- A pending prompt saved via one server instance is recognized by a **second** server instance opened against the same DB file (simulating a stop/restart), confirming AC-05 end-to-end rather than at the repository unit level
- Reminders whose `scheduled_at` falls inside a simulated wake-cycle gap (no `tick()` call for N intervals) all fire exactly once on the next successful wake call — none lost (AC-07, sad.md §6 Critical flow 5)

## Definition of Done

- [ ] All three scenarios above pass as integration tests exercising the real HTTP + DB stack, not mocks
- [ ] The unauthenticated-rejection test asserts zero DB mutation, not just a 401 status code
- [ ] lint + vet clean

## Notes

This task's own tests are the last line of defense before `sdd:review` — it deliberately re-covers AC-04/05/07 at the integration tier even though unit-level tests exist per-task, because these three ACs are explicitly cross-context (spec §5 "cross-context" tag on AC-07).
