---
id: T3
title: "Lock typed-origin source-lookup fallback with a regression test"
layer: "tests"
deps: []
acs: ["AC-06"]
files_hint: ["src/ports/__tests__/source-handler.test.ts"]
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T3 — Lock typed-origin source-lookup fallback with a regression test

## Why

Derives from [spec §AC-06](../spec.md) and [sad §4 pillar 3 / §6 Flow 2](../sad.md): `hasPublicDeepLink()` already returns `false` whenever `chatUsername` is `null`, so the existing fallback branch in `source-handler.ts` (show `snapshot.messageText` instead of a link) fires for a typed-origin reminder with **zero production-code change**. This task only adds the test that locks that behavior in place, using the sentinel-override fixture documented in [data-model.md](../data-model.md).

## What

Add a test to `src/ports/__tests__/source-handler.test.ts` that builds a `source_snapshots` fixture with the typed-origin sentinel (`chat_id: 0, message_id: 0, chat_username: null, message_text: "<some text>"`) via `buildSourceSnapshot({...})` overrides, attaches it to a fired reminder, taps "🔗 Джерело", and asserts the bot sends back the stored `messageText` — never a link, even if some other field happens to be truthy.

No production code changes in this task (the fallback already exists) — this is pure test coverage for AC-06.

## Definition of Done

- [ ] New test asserts a typed-origin reminder's source lookup returns the stored text, not a deep link (AC-06).
- [ ] Test passes against the current, unmodified `source-handler.ts`.
- [ ] lint + vet clean.

## Notes

Independent of T1/T2 — this task exercises the existing fallback directly via a fixture, so it can run in parallel with the capture-path work. Uses the existing `buildSourceSnapshot()` factory (`test/helpers/factories.ts`) with overrides — no new fixture builder needed (per data-model.md).
