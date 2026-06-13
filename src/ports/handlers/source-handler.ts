import type { ReminderRepository } from "../../app/ports/reminder-repository.js";
import type { TelegramGateway } from "../../app/ports/telegram-gateway.js";

// Stub — implemented in T11
export async function handleSource(
  _ctx: any,
  _repo: ReminderRepository,
  _gateway: TelegramGateway,
  _reminderId: number,
  _ownerChatId: number
): Promise<void> {}
