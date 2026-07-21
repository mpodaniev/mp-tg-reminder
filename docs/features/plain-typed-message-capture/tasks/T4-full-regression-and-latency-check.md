---
id: T4
title: "Run full regression suite and verify manual latency budget"
layer: "tests"
deps: ["T1", "T2", "T3"]
acs: []
files_hint: []
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T4 — Run full regression suite and verify manual latency budget

## Why

Derives from [sad §10 QG-2/QG-3](../sad.md) and [spec §6 NFR / §7 KPI](../spec.md) — this feature's two non-functional quality gates: the "When to remind?" reply appears ≤1000ms after a typed message, and the existing forwarded-capture suite stays at 100% pass rate after this ships.

## What

Not new production code — the closing verification task for the feature:

- run the full `npm test` suite and confirm the pre-existing forwarded-capture tests are still 100% green (QG-3);
- manually time the "When to remind?" prompt after sending a typed message to the bot in a real/staging chat, using the same manual method already used for the forwarded-capture path (QG-2, ≤1000ms — spec §6 NFR).

## Definition of Done

- [ ] `npm test` green, including every pre-existing forwarded-capture test (QG-3, spec §7 KPI).
- [ ] Manual timing confirms the "When to remind?" reply appears ≤1000ms after a typed message (QG-2).
- [ ] No regression in `/settings`, `/list`, `/stats`, or the pending-custom-time flow.

## Notes

Depends on T1, T2, T3 all landing — this is the feature's closing gate, not an independent unit of work. No `acs` of its own: every AC is already covered by T1–T3; this task verifies the NFRs (QG-2/QG-3) sit on top of them.
