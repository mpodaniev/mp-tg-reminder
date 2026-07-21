---
status: Living
updated_at: "2026-07-20"
---

# Domain Context — plain-typed-message-capture

## Glossary

- **Typed capture** — a reminder created directly from plain text the Owner types into the bot chat, with no separate source chat or source message to point back to. NOT a "Source message" (`docs/features/telegram-reminder/CONTEXT.md`), which is always a forwarded message originating in another chat.

## Invariants

- A reminder's "🔗 Джерело" action always must resolve to *something* shown to the Owner — either a deep link to the original chat (forwarded origin) or the stored text itself (typed origin) — never a dead button.

## Out of scope

- Directly-sent photos / videos / documents (not forwarded, not typed text) — captured only by a future feature; this feature covers plain text only.
