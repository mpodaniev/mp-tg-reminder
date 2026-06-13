import type { ReminderRepository } from "../../app/ports/reminder-repository.js";

export async function isOwner(
  senderId: number | undefined,
  repo: ReminderRepository
): Promise<boolean> {
  if (!senderId) return false;
  const settings = await repo.getOwnerSettings();
  return settings?.ownerTelegramId === senderId;
}
