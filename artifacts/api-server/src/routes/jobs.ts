import { Router, type IRouter } from "express";
import { sendVacancyReminders } from "../jobs/vacancy-reminders";

const router: IRouter = Router();

/**
 * Vercel Cron: GET /api/jobs/vacancy-reminders
 * Authorization: Bearer $CRON_SECRET
 */
router.get("/jobs/vacancy-reminders", async (req, res): Promise<void> => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization ?? "";
    if (auth !== `Bearer ${secret}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  try {
    const sent = await sendVacancyReminders();
    res.json({ ok: true, sent });
  } catch (err) {
    req.log?.error({ err }, "Vacancy reminder cron failed");
    res.status(500).json({ error: "Reminder job failed" });
  }
});

export default router;
