---
status: Draft
owner: "Mykhailo Podaniev"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-07-08"
feature_size: "S"
target_surfaces: []  # filled in §4 — subset of: backend-service | web-frontend | mobile-app | desktop-app | cli | worker | library-sdk. Read (never re-derived) by api/sequences/tasks/plan-tests/review → _shared/surfaces.md
---

# Software Architecture Document — keep-fired-reminders-visible

<!-- 12 Arc42 sections. Empty section → <!-- N/A: <one-line reason> -->. -->
<!-- C4 Context (L1) lives inline in §3. C4 Container (L2) lives inline in §5. -->
<!-- Numbers in §10 come VERBATIM from spec.md §6 NFR — no inventing, no rounding. -->

## 1. Introduction and goals

**Intent.** The Owner of the reminders bot must be able to trust the list as a complete, accurate picture of everything still unresolved — both scheduled and already-fired reminders — clearly distinguishing the two, holding each entry at a stable position, and offering exactly one way to remove an entry: Delete.

**Top-3 quality goals (1-liners; full scenarios in §10):**

1. **Accuracy** — the list reflects every reminder not yet explicitly deleted (scheduled or fired), ordered by capture time
2. **Owner-only** — no `/list` command response leaks any reminder data to a non-Owner
3. **Latency** — p95 list response ≤ 1000 ms from command receipt to message sent (unchanged from `list-active-reminders`)

**Stakeholders.**

| Role | Interest | Sign-off owner? |
|---|---|---|
| Owner | Uses `/list`, relies on it as the complete picture of everything still outstanding | No |
| Tech Lead | SAD approval | Yes |
| Security Lead | Reviews the absence of a new authorization boundary (spec §6.1) | No |

<!-- Decision overrides (¶4) — populated by the critic resolution loop, empty otherwise. -->

## 2. Constraints

<!-- pending Socratic walk -->

## 3. Context and scope

<!-- pending Socratic walk -->

## 4. Solution strategy

<!-- pending Socratic walk -->

## 5. Building block view

<!-- pending Socratic walk -->

## 6. Runtime view

<!-- pending Socratic walk -->

## 7. Deployment view

<!-- pending Socratic walk -->

## 8. Crosscutting concepts

<!-- pending Socratic walk -->

## 9. Architecture decisions

<!-- pending Socratic walk -->

## 10. Quality requirements

<!-- pending Socratic walk -->

## 11. Risks and technical debt

<!-- pending Socratic walk -->

## 12. Glossary

<!-- pending Socratic walk -->
