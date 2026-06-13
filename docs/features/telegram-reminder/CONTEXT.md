---
feature: telegram-reminder
updated_at: "2026-06-13"
---

# Context — telegram-reminder

## Glossary

| Term | Definition |
|---|---|
| **Owner** | The single Telegram user who owns and interacts with the personal bot instance. Only the Owner's messages are processed; all other Telegram users are rejected. |
| **Source message** | The original Telegram message that the Owner forwards to the bot, triggering reminder creation. May contain text, media, or both. |
| **Source chat** | The Telegram chat (group, channel, DM, or supergroup) from which the source message originated. |
| **Reminder** | A captured source message paired with a scheduled notification time and a lifecycle state: `pending` → `fired` → `done` or `deleted`. |
| **Quick-pick** | A preset time-offset button offered by the bot after receiving a source message (e.g. "In 1 hour", "This evening 19:00", "Tomorrow morning 07:00", "In a week"). Accelerates scheduling without typing. |
| **Custom time** | A manually entered date and/or time the Owner types when no quick-pick fits. |
| **Snooze** | An Owner action on a fired reminder that reschedules it to a new time without marking it done. The reminder returns to `pending` state with the new scheduled time. |
| **Fire** | The moment the bot delivers a reminder to the Owner's chat at the scheduled time, transitioning the reminder from `pending` to `fired`. |
| **Protected-content message** | A source message from a channel or group that has disabled forwarding (Telegram's "protect content" setting). Media cannot be stored; only text is preserved. |
| **Deep link** | A Telegram URL that navigates the Owner directly to the source message in its original chat. Only available for public chats or private chats the Owner remains a member of. |
