import type { GetStats, StatsSummary } from "../../app/use-cases/get-stats.js";

type MinimalCtx = {
  reply: (text: string, opts?: any) => Promise<any>;
};

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days} дн ${hours} год`;
  if (hours > 0) return `${hours} год ${minutes} хв`;
  return `${minutes} хв`;
}

export function formatStatsMessage(stats: StatsSummary): string {
  const c = stats.statusCounts;
  const lines = [
    "📊 Статистика нагадувань",
    "",
    "За статусами:",
    `• Очікує часу: ${c.awaitingTime}`,
    `• Заплановано: ${c.pending}`,
    `• Спрацьовує: ${c.firing}`,
    `• Спрацювало: ${c.fired}`,
    `• Закрито після спрацювання: ${c.closedAfterFiring}`,
    `• Скасовано заздалегідь: ${c.cancelledBeforeFiring}`,
    `• Прострочено: ${c.expired}`,
    "",
    `Середній час реакції: ${
      stats.avgReactionTimeMs === null ? "—, немає даних" : formatDuration(stats.avgReactionTimeMs)
    }`,
    "",
    "Найдовші активні нагадування:",
  ];

  if (stats.longestActive.length === 0) {
    lines.push("Активних нагадувань немає");
  } else {
    stats.longestActive.forEach((item, i) => {
      lines.push(`${i + 1}. ${item.preview} — ${formatDuration(item.ageMs)}`);
    });
  }

  return lines.join("\n");
}

export async function handleStats(ctx: MinimalCtx, statsUC: GetStats): Promise<void> {
  const stats = await statsUC.execute();
  await ctx.reply(formatStatsMessage(stats));
}
