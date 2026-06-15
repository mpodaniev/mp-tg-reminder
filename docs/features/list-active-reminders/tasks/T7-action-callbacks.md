---
id: T7
title: "Cancel + go-to-source callback handlers (uniform no-op; deep-link/inline fallback)"
layer: "ports"
deps: ["T5", "T6"]
acs: ["AC-03", "AC-04", "AC-05", "AC-06"]
files_hint: ["src/ports/handlers/list-handler.ts", "src/ports/handlers/source-handler.ts"]
owner: "Mykhailo Podaniev"
estimate: "M"
status: "todo"
---

# T7 — cancel + go-to-source callbacks

## Why

The two inline actions on each list row. Derives from [spec §AC-03/AC-04/AC-05/AC-06](../spec.md), [sad §6 flow 2 + flow 4](../sad.md), [ADR-0002](../adr/0002-immutable-snapshot-list.md).

## What

In `src/ports/handlers/list-handler.ts`, add the callback handlers:
- **Cancel** → call T5; on success confirm in a **separate** message; on the sentinel show the uniform "no longer active" reply (AC-04). Never edit the rendered list (ADR-0002).
- **Go-to-source** → reuse the fired-reminder fallback rule in `src/ports/handlers/source-handler.ts`: deep link when the source chat has a public username, else the inline captured content (AC-06).

Owner-gate both callbacks (AC-05). Decode the action tag + `reminder_id` from `callback_data`.

## Definition of Done

- [ ] Unit test: cancel success → separate confirmation message.
- [ ] Unit test: cancel on a stale entry → uniform no-op, no second action.
- [ ] Unit test: source with public username → deep link; without → inline content.
- [ ] Unit/integration: non-Owner callback rejected, no state change.
- [ ] lint + vet clean.

## Notes

Shares the `list-handler.ts` lane with T6. Extends, does not duplicate, `source-handler.ts`'s availability rule.
