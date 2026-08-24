import { and, eq, gt, isNotNull, sql } from "drizzle-orm";
import { db, vacanciesTable, notificationsTable } from "@workspace/db";
import { logger } from "../lib/logger";

const TEN_MINUTES_MS = 10 * 60 * 1000;

/**
 * Muddat oralig'ida biriktirilgan rekruterga har 10 daqiqada ogohlantirish.
 */
export async function sendVacancyReminders(): Promise<number> {
  const now = new Date();

  const open = await db
    .select()
    .from(vacanciesTable)
    .where(
      and(
        isNotNull(vacanciesTable.recruiterId),
        isNotNull(vacanciesTable.deadline),
        gt(vacanciesTable.deadline, now),
        sql`${vacanciesTable.status} IN ('draft', 'published')`,
      ),
    );

  let sent = 0;
  for (const v of open) {
    if (!v.recruiterId || !v.deadline) continue;

    const last = v.lastReminderAt ? new Date(v.lastReminderAt).getTime() : 0;
    if (last && now.getTime() - last < TEN_MINUTES_MS - 5000) continue;

    const deadlineStr = v.deadline.toLocaleString("uz-UZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    await db.insert(notificationsTable).values({
      userId: v.recruiterId,
      text: `"${v.title}" ish o'rniga kadr topishingiz uchun vaqt qoldi. Muddat: ${deadlineStr}`,
      type: "expired_task",
      linkUrl: `/vacancies/${v.id}`,
    });

    await db
      .update(vacanciesTable)
      .set({ lastReminderAt: now })
      .where(eq(vacanciesTable.id, v.id));

    sent += 1;
  }

  if (sent > 0) {
    logger.info({ sent }, "Vacancy recruiter reminders sent");
  }
  return sent;
}

export function startVacancyReminderJob(): void {
  // Darhol bir marta, keyin har 10 daqiqa
  sendVacancyReminders().catch((err) => logger.error({ err }, "Reminder job failed"));
  setInterval(() => {
    sendVacancyReminders().catch((err) => logger.error({ err }, "Reminder job failed"));
  }, TEN_MINUTES_MS);
  logger.info("Vacancy reminder job started (every 10 minutes)");
}
