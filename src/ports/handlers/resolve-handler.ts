import type { ResolveReminder } from "../../app/use-cases/resolve-reminder.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";

// Stub — implemented in T11
export async function handleResolve(
  _ctx: any,
  _resolveUC: ResolveReminder,
  _gateway: TelegramGateway,
  _reminderId: number,
  _action: "done" | "delete",
  _ownerChatId: number
): Promise<void> {}
