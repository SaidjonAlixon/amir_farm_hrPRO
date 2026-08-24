import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  tasksTable,
  usersTable,
  employeesTable,
  type TaskAttachment,
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { notifyUser } from "../lib/notify";
import { syncBranchNeedFromTask } from "../lib/sync-branch-need";

const router: IRouter = Router();

import { HR_ROLES, isHrManager } from "../lib/roles";

/** Rahbar / boshqaruv rollari — vazifa belgilash huquqi */
const MANAGER_ROLES = new Set([
  "admin",
  ...HR_ROLES,
  "director",
  "department_head",
  "recruiter",
  "trainer",
  "mudir",
  "koordinator",
  "sb",
  "sb_boshliq",
]);

function canAssignTasks(role?: string): boolean {
  return !!role && MANAGER_ROLES.has(role);
}

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

function isAssignee(row: typeof tasksTable.$inferSelect, userId?: number) {
  return (
    !!userId && row.assigneeKind === "user" && row.assigneeId === userId
  );
}

function isCreator(row: typeof tasksTable.$inferSelect, userId?: number) {
  return !!userId && row.createdById === userId;
}

function canViewTask(row: typeof tasksTable.$inferSelect, userId?: number, role?: string) {
  if (role === "admin" || isHrManager(role)) return true;
  return isCreator(row, userId) || isAssignee(row, userId);
}

function isAllowedAttachmentUrl(url: string) {
  if (!url) return false;
  if (url.startsWith("https://") || url.startsWith("http://")) return true;
  if (url.startsWith("/api/uploads/")) return true;
  // Eski vazifalar (data URL) — o‘qish uchun qoldiriladi
  if (url.startsWith("data:")) return true;
  return false;
}

function sanitizeAttachments(raw: unknown, max = 10): TaskAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, max)
    .map((a: TaskAttachment, i: number) => {
      const url = String(a.url || "");
      if (!isAllowedAttachmentUrl(url)) return null;
      const maxUrl = url.startsWith("data:") ? 5_000_000 : 2_000;
      return {
        id: a.id || `att-${Date.now()}-${i}`,
        name: String(a.name || "fayl").slice(0, 200),
        mimeType: String(a.mimeType || "application/octet-stream"),
        kind: (a.kind === "image" ? "image" : "file") as "image" | "file",
        url: url.slice(0, maxUrl),
        size: typeof a.size === "number" ? a.size : undefined,
      };
    })
    .filter(Boolean) as TaskAttachment[];
}

async function resolveAssigneeName(
  kind: string,
  assigneeId: number,
): Promise<string | null> {
  if (kind === "employee") {
    const [row] = await db
      .select({ fullName: employeesTable.fullName })
      .from(employeesTable)
      .where(eq(employeesTable.id, assigneeId));
    return row?.fullName ?? null;
  }
  const [row] = await db
    .select({ fullName: usersTable.fullName })
    .from(usersTable)
    .where(eq(usersTable.id, assigneeId));
  return row?.fullName ?? null;
}

async function enrichTask(row: typeof tasksTable.$inferSelect) {
  const [creator] = await db
    .select({ fullName: usersTable.fullName })
    .from(usersTable)
    .where(eq(usersTable.id, row.createdById));

  const assigneeName = await resolveAssigneeName(row.assigneeKind, row.assigneeId);

  return {
    ...row,
    attachments: (row.attachments ?? []) as TaskAttachment[],
    completionAttachments: (row.completionAttachments ?? []) as TaskAttachment[],
    assigneeName,
    createdByName: creator?.fullName ?? null,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    extensionRequestedDueAt: row.extensionRequestedDueAt
      ? row.extensionRequestedDueAt.toISOString()
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/tasks", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { status, board } = req.query as Record<string, string>;

  let rows = await db.select().from(tasksTable).orderBy(desc(tasksTable.dueAt));

  // Faqat o'zi belgilagan yoki o'ziga biriktirilgan (admin — hammasi)
  rows = rows.filter((r) => canViewTask(r, req.userId, req.userRole));

  if (status) rows = rows.filter((r) => r.status === status);
  if (board === "active") {
    rows = rows.filter((r) => r.status !== "cancelled");
  }

  res.json(await Promise.all(rows.map(enrichTask)));
});

router.post("/tasks", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canAssignTasks(req.userRole)) {
    res.status(403).json({ error: "Vazifa belgilash faqat rahbarlar uchun" });
    return;
  }

  const {
    title,
    description,
    status,
    priority,
    dueAt,
    assigneeKind,
    assigneeId,
    attachments,
  } = req.body ?? {};

  if (!title || typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "Sarlavha majburiy" });
    return;
  }
  if (!assigneeId) {
    res.status(400).json({ error: "Ijrochi tanlanishi shart" });
    return;
  }

  const kind = assigneeKind === "employee" ? "employee" : "user";
  const aid = parseInt(String(assigneeId), 10);

  const name = await resolveAssigneeName(kind, aid);
  if (!name) {
    res.status(400).json({ error: "Ijrochi topilmadi" });
    return;
  }

  const [created] = await db
    .insert(tasksTable)
    .values({
      title: title.trim(),
      description: description ? String(description) : null,
      status: status || "todo",
      priority: priority || "normal",
      dueAt: dueAt ? new Date(dueAt) : null,
      assigneeKind: kind,
      assigneeId: aid,
      createdById: req.userId!,
      attachments: sanitizeAttachments(attachments),
    })
    .returning();

  if (kind === "user" && aid !== req.userId) {
    await notifyUser({
      userId: aid,
      text: `Sizga yangi vazifa: «${created.title}» — avval qabul qiling`,
      type: "expired_task",
      linkUrl: "/vazifalar",
    });
  }

  res.status(201).json(await enrichTask(created));
});

router.get("/tasks/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [row] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Vazifa topilmadi" });
    return;
  }
  if (!canViewTask(row, req.userId, req.userRole)) {
    res.status(403).json({ error: "Ruxsat yo'q" });
    return;
  }
  res.json(await enrichTask(row));
});

/** Beruvchi — to'liq tahrirlash */
router.patch("/tasks/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Vazifa topilmadi" });
    return;
  }

  if (!isCreator(existing, req.userId) && req.userRole !== "admin") {
    res.status(403).json({
      error: "Vazifa ma'lumotini faqat belgilagan shaxs o'zgartira oladi",
    });
    return;
  }

  const body = req.body ?? {};
  const updates: Partial<typeof tasksTable.$inferInsert> = {};

  if (body.title !== undefined) updates.title = String(body.title).trim();
  if (body.description !== undefined) {
    updates.description = body.description ? String(body.description) : null;
  }
  if (body.status !== undefined) updates.status = String(body.status);
  if (body.priority !== undefined) updates.priority = String(body.priority);
  if (body.dueAt !== undefined) {
    updates.dueAt = body.dueAt ? new Date(body.dueAt) : null;
  }
  if (body.attachments !== undefined) {
    updates.attachments = sanitizeAttachments(body.attachments);
  }
  if (body.assigneeKind !== undefined || body.assigneeId !== undefined) {
    const kind =
      body.assigneeKind === "employee"
        ? "employee"
        : body.assigneeKind === "user"
          ? "user"
          : existing.assigneeKind;
    const aid =
      body.assigneeId !== undefined
        ? parseInt(String(body.assigneeId), 10)
        : existing.assigneeId;
    const name = await resolveAssigneeName(kind, aid);
    if (!name) {
      res.status(400).json({ error: "Ijrochi topilmadi" });
      return;
    }
    updates.assigneeKind = kind;
    updates.assigneeId = aid;

    if (kind === "user" && aid !== existing.assigneeId && aid !== req.userId) {
      await notifyUser({
        userId: aid,
        text: `Sizga vazifa biriktirildi: «${existing.title}»`,
        type: "expired_task",
        linkUrl: "/vazifalar",
      });
    }
  }

  const [updated] = await db
    .update(tasksTable)
    .set(updates)
    .where(eq(tasksTable.id, id))
    .returning();

  res.json(await enrichTask(updated));
});

/** Ijrochi — vazifani qabul qilish (todo → in_progress) */
router.post("/tasks/:id/accept", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Vazifa topilmadi" });
    return;
  }
  if (!isAssignee(existing, req.userId)) {
    res.status(403).json({ error: "Faqat ijrochi qabul qila oladi" });
    return;
  }
  if (existing.status !== "todo") {
    res.status(400).json({
      error:
        existing.status === "in_progress"
          ? "Vazifa allaqachon qabul qilingan"
          : "Bu vazifani qabul qilib bo'lmaydi",
    });
    return;
  }

  const [updated] = await db
    .update(tasksTable)
    .set({ status: "in_progress", acceptedAt: new Date() })
    .where(eq(tasksTable.id, id))
    .returning();

  await syncBranchNeedFromTask({ taskId: id, event: "accepted" });

  if (existing.createdById !== req.userId) {
    await notifyUser({
      userId: existing.createdById,
      text: `📥 «${existing.title}» qabul qilindi`,
      type: "stage_change",
      linkUrl: "/vazifalar",
    });
  }

  res.json(await enrichTask(updated));
});

/** Ijrochi — natija bilan bajarildi */
router.post("/tasks/:id/complete", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Vazifa topilmadi" });
    return;
  }
  if (!isAssignee(existing, req.userId)) {
    res.status(403).json({ error: "Faqat ijrochi bajarilgan deb yubora oladi" });
    return;
  }
  if (existing.status === "todo") {
    res.status(400).json({ error: "Avval vazifani qabul qiling" });
    return;
  }
  if (
    existing.status === "done" ||
    existing.status === "verified" ||
    existing.status === "cancelled"
  ) {
    res.status(400).json({ error: "Vazifa allaqachon yakunlangan" });
    return;
  }

  const note = req.body?.completionNote ? String(req.body.completionNote) : null;
  const files = sanitizeAttachments(req.body?.completionAttachments);
  if (!note?.trim() && files.length === 0) {
    res.status(400).json({
      error: "Bajarish uchun matn, rasm yoki fayl qo'shing",
    });
    return;
  }

  const [updated] = await db
    .update(tasksTable)
    .set({
      status: "done",
      completionNote: note?.trim() || null,
      completionAttachments: files,
      completedAt: new Date(),
    })
    .where(eq(tasksTable.id, id))
    .returning();

  await syncBranchNeedFromTask({ taskId: id, event: "completed" });

  // Belgilagan odamga har doim xabar
  await notifyUser({
    userId: existing.createdById,
    text: `✅ «${existing.title}» bajarildi — natijani ko‘rib tasdiqlang`,
    type: "stage_change",
    linkUrl: "/vazifalar",
  });

  res.json(await enrichTask(updated));
});

/** Belgilovchi — bajarilganini tasdiqlash yoki qayta ishlashga qaytarish */
router.post("/tasks/:id/verify", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Vazifa topilmadi" });
    return;
  }
  if (!isCreator(existing, req.userId) && req.userRole !== "admin") {
    res.status(403).json({ error: "Faqat belgilagan shaxs tasdiqlay oladi" });
    return;
  }
  if (existing.status !== "done") {
    res.status(400).json({ error: "Faqat bajarilgan vazifani tasdiqlash mumkin" });
    return;
  }

  const action = String(req.body?.action || "");
  const reviewNote = req.body?.note ? String(req.body.note) : null;

  if (action === "approve") {
    const [updated] = await db
      .update(tasksTable)
      .set({ status: "verified" })
      .where(eq(tasksTable.id, id))
      .returning();

    await syncBranchNeedFromTask({
      taskId: id,
      event: "verified",
      verifiedById: req.userId ?? null,
    });

    if (existing.assigneeKind === "user") {
      await notifyUser({
        userId: existing.assigneeId,
        text: `✔ «${existing.title}» tasdiqlandi — vazifa yakunlandi`,
        type: "stage_change",
        linkUrl: "/vazifalar",
      });
    }

    res.json(await enrichTask(updated));
    return;
  }

  if (action === "rework") {
    const [updated] = await db
      .update(tasksTable)
      .set({
        status: "in_progress",
        completionNote: null,
        completionAttachments: [],
        completedAt: null,
      })
      .where(eq(tasksTable.id, id))
      .returning();

    await syncBranchNeedFromTask({ taskId: id, event: "rework" });

    if (existing.assigneeKind === "user") {
      await notifyUser({
        userId: existing.assigneeId,
        text: reviewNote
          ? `↩ «${existing.title}» qayta ishlashga qaytarildi: ${reviewNote}`
          : `↩ «${existing.title}» qayta ishlashga qaytarildi — qayta yuboring`,
        type: "stage_change",
        linkUrl: "/vazifalar",
      });
    }

    res.json(await enrichTask(updated));
    return;
  }

  res.status(400).json({ error: "action: approve yoki rework" });
});

/** Ijrochi — muddatni surish so'rovi */
router.post(
  "/tasks/:id/request-extension",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const id = parseId(req.params.id);
    const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Vazifa topilmadi" });
      return;
    }
    if (!isAssignee(existing, req.userId)) {
      res.status(403).json({ error: "Faqat ijrochi muddat so'ray oladi" });
      return;
    }
    if (existing.status === "todo") {
      res.status(400).json({ error: "Avval vazifani qabul qiling" });
      return;
    }
    if (
      existing.status === "done" ||
      existing.status === "verified" ||
      existing.status === "cancelled"
    ) {
      res.status(400).json({ error: "Yakunlangan vazifa uchun muddat so'ralmaydi" });
      return;
    }

    const { dueAt, note } = req.body ?? {};
    if (!dueAt) {
      res.status(400).json({ error: "Yangi muddat majburiy" });
      return;
    }
    const proposed = new Date(dueAt);
    if (Number.isNaN(proposed.getTime())) {
      res.status(400).json({ error: "Noto'g'ri muddat" });
      return;
    }

    const [updated] = await db
      .update(tasksTable)
      .set({
        extensionRequestedDueAt: proposed,
        extensionNote: note ? String(note) : null,
        extensionStatus: "pending",
      })
      .where(eq(tasksTable.id, id))
      .returning();

    if (existing.createdById !== req.userId) {
      await notifyUser({
        userId: existing.createdById,
        text: `«${existing.title}» uchun muddat uzaytirish so'raldi`,
        type: "expired_task",
        linkUrl: "/vazifalar",
      });
    }

    res.json(await enrichTask(updated));
  },
);

/** Beruvchi — muddat so'rovini tasdiqlash / rad etish */
router.post(
  "/tasks/:id/extension",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const id = parseId(req.params.id);
    const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Vazifa topilmadi" });
      return;
    }
    if (!isCreator(existing, req.userId) && req.userRole !== "admin") {
      res.status(403).json({ error: "Faqat belgilagan shaxs tasdiqlay oladi" });
      return;
    }
    if (existing.extensionStatus !== "pending" || !existing.extensionRequestedDueAt) {
      res.status(400).json({ error: "Kutilayotgan muddat so'rovi yo'q" });
      return;
    }

    const action = String(req.body?.action || "");
    if (action !== "approve" && action !== "reject") {
      res.status(400).json({ error: "action: approve yoki reject" });
      return;
    }

    const updates: Partial<typeof tasksTable.$inferInsert> =
      action === "approve"
        ? {
            dueAt: existing.extensionRequestedDueAt,
            extensionStatus: "approved",
          }
        : { extensionStatus: "rejected" };

    const [updated] = await db
      .update(tasksTable)
      .set(updates)
      .where(eq(tasksTable.id, id))
      .returning();

    if (isAssignee(existing, existing.assigneeId) && existing.assigneeKind === "user") {
      await notifyUser({
        userId: existing.assigneeId,
        text:
          action === "approve"
            ? `«${existing.title}» muddati uzaytirildi`
            : `«${existing.title}» muddat so'rovi rad etildi`,
        type: "expired_task",
        linkUrl: "/vazifalar",
      });
    }

    res.json(await enrichTask(updated));
  },
);

router.delete("/tasks/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Vazifa topilmadi" });
    return;
  }
  if (!isCreator(existing, req.userId) && req.userRole !== "admin") {
    res.status(403).json({ error: "Faqat belgilagan shaxs o'chira oladi" });
    return;
  }

  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  res.status(204).send();
});

export default router;
