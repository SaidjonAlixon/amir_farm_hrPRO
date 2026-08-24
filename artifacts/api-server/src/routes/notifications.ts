import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { unreadOnly } = req.query as Record<string, string>;
  const userId = req.userId!;

  const conditions = [eq(notificationsTable.userId, userId)];
  if (unreadOnly === "true") conditions.push(eq(notificationsTable.isRead, false));

  const rows = await db
    .select()
    .from(notificationsTable)
    .where(and(...conditions))
    .orderBy(notificationsTable.createdAt);

  res.json(rows.reverse()); // newest first
});

router.patch("/notifications/:id/read", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [updated] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.userId!)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Topilmadi" }); return; }
  res.json(updated);
});

router.post("/notifications/read-many", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const ids = rawIds
    .map((v: unknown) => Number(v))
    .filter((n: number) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) {
    res.json({ ok: true, updated: 0 });
    return;
  }
  const updated = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(
      and(
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.isRead, false),
        inArray(notificationsTable.id, ids),
      ),
    )
    .returning({ id: notificationsTable.id });
  res.json({ ok: true, updated: updated.length });
});

router.post("/notifications/read-all", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId!;
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.userId, userId));
  res.json({ ok: true });
});

export default router;
