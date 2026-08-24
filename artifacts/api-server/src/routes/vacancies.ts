import { Router, type IRouter } from "express";
import { eq, and, ilike, sql } from "drizzle-orm";
import {
  db,
  vacanciesTable,
  channelsTable,
  candidatesTable,
  requestsTable,
  usersTable,
  departmentsTable,
  notificationsTable,
} from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import { canDeleteHrRecords, deleteVacancyCascade } from "../lib/delete-candidate";
import { isHrManager, isHrRole, canExtendVacancy } from "../lib/roles";
import { notifyUser } from "../lib/notify";

const router: IRouter = Router();

async function enrichVacancy(v: typeof vacanciesTable.$inferSelect) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(candidatesTable)
    .where(eq(candidatesTable.vacancyId, v.id));

  let recruiterName: string | null = null;
  if (v.recruiterId) {
    const [rec] = await db
      .select({ fullName: usersTable.fullName })
      .from(usersTable)
      .where(eq(usersTable.id, v.recruiterId));
    recruiterName = rec?.fullName ?? null;
  }

  let requestPosition: string | null = null;
  let departmentName: string | null = null;
  let requestCount: number | null = null;
  let requestRequirements: string | null = null;
  let requestDescription: string | null = null;
  let requestPriority: string | null = null;
  let requestCreatedById: number | null = null;

  const [req] = await db
    .select({
      position: requestsTable.position,
      count: requestsTable.count,
      requirements: requestsTable.requirements,
      description: requestsTable.description,
      priority: requestsTable.priority,
      createdById: requestsTable.createdById,
      departmentName: departmentsTable.name,
    })
    .from(requestsTable)
    .leftJoin(departmentsTable, eq(requestsTable.departmentId, departmentsTable.id))
    .where(eq(requestsTable.id, v.requestId));

  if (req) {
    requestPosition = req.position;
    departmentName = req.departmentName ?? null;
    requestCount = req.count;
    requestRequirements = req.requirements;
    requestDescription = req.description;
    requestPriority = req.priority;
    requestCreatedById = req.createdById ?? null;
  }

  return {
    ...v,
    deadline: v.deadline?.toISOString?.() ?? v.deadline ?? null,
    assignedAt: v.assignedAt?.toISOString?.() ?? v.assignedAt ?? null,
    acceptedAt: v.acceptedAt?.toISOString?.() ?? v.acceptedAt ?? null,
    publishedAt: v.publishedAt?.toISOString?.() ?? v.publishedAt ?? null,
    lastReminderAt: undefined,
    createdAt: v.createdAt?.toISOString?.() ?? v.createdAt,
    updatedAt: v.updatedAt?.toISOString?.() ?? v.updatedAt,
    candidatesCount: count,
    recruiterName,
    requestPosition,
    departmentName,
    requestCount,
    requestRequirements,
    requestDescription,
    requestPriority,
    requestCreatedById,
  };
}

router.get("/vacancies", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { status, requestId, search } = req.query as Record<string, string>;
  const role = req.userRole ?? "";
  const userId = req.userId!;

  const conditions = [];
  if (status) conditions.push(eq(vacanciesTable.status, status));
  if (requestId) conditions.push(eq(vacanciesTable.requestId, parseInt(requestId, 10)));
  if (search) conditions.push(ilike(vacanciesTable.title, `%${search}%`));

  // Rekruter faqat o'ziga biriktirilgan vakansiyalarni ko'radi
  if (role === "recruiter") {
    conditions.push(eq(vacanciesTable.recruiterId, userId));
  }

  const baseQuery = db.select().from(vacanciesTable);
  const rows = conditions.length
    ? await baseQuery.where(and(...conditions)).orderBy(vacanciesTable.createdAt)
    : await baseQuery.orderBy(vacanciesTable.createdAt);

  // Admin / HR / direktor — hammasi; boshqalar ham (dept_head va h.k.) filterdan tashqari to'liq
  // Faqat recruiter cheklangan
  const withMeta = await Promise.all(rows.map((v) => enrichVacancy(v)));
  res.json(withMeta);
});

router.post("/vacancies", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole ?? "";
  if (!isHrManager(role)) {
    res.status(403).json({ error: "Ish o'rnini faqat HR yoki admin yaratishi mumkin" });
    return;
  }

  const {
    requestId,
    title,
    description,
    salaryRange,
    location,
    schedule,
    benefits,
    recruiterId,
    deadline,
  } = req.body ?? {};

  if (!requestId || !title) {
    res.status(400).json({ error: "Majburiy maydonlar to'ldirilmagan" });
    return;
  }
  if (!recruiterId) {
    res.status(400).json({ error: "Rekruterni tanlang" });
    return;
  }
  if (!deadline) {
    res.status(400).json({ error: "Muddatni belgilang" });
    return;
  }

  const reqId = parseInt(requestId, 10);
  const recId = parseInt(recruiterId, 10);

  const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, reqId));
  if (!request) {
    res.status(404).json({ error: "Ariza topilmadi" });
    return;
  }
  if (request.status !== "accepted") {
    res.status(400).json({ error: "Faqat qabul qilingan ariza asosida ish o'rni yaratiladi" });
    return;
  }

  const [recruiter] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, recId), eq(usersTable.role, "recruiter"), eq(usersTable.status, "active")));
  if (!recruiter) {
    res.status(400).json({ error: "Faqat faol rekruter biriktiriladi" });
    return;
  }

  const deadlineDate = new Date(deadline);
  if (Number.isNaN(deadlineDate.getTime())) {
    res.status(400).json({ error: "Muddat noto'g'ri" });
    return;
  }

  const assignedAt = new Date();
  const [created] = await db
    .insert(vacanciesTable)
    .values({
      requestId: reqId,
      title,
      description: description ?? null,
      salaryRange: salaryRange ?? null,
      location: location ?? null,
      schedule: schedule ?? null,
      benefits: benefits ?? null,
      channels: [],
      status: "draft",
      recruiterId: recId,
      deadline: deadlineDate,
      assignedAt,
    })
    .returning();

  await db
    .update(requestsTable)
    .set({ status: "announced", assignedToId: recId, assignedAt })
    .where(eq(requestsTable.id, reqId));

  // Biriktirilgan rekruterga darhol xabar
  await db.insert(notificationsTable).values({
    userId: recId,
    text: `Sizga yangi ish o'rni biriktirildi: "${title}". Qabul qiling va e'lon kanallarini tanlang.`,
    type: "expired_task",
    linkUrl: `/vacancies/${created.id}?publish=1`,
  });

  const full = await enrichVacancy(created);
  res.status(201).json(full);
});

router.get("/vacancies/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [row] = await db.select().from(vacanciesTable).where(eq(vacanciesTable.id, id));
  if (!row) { res.status(404).json({ error: "Topilmadi" }); return; }

  const role = req.userRole ?? "";
  if (role === "recruiter" && row.recruiterId !== req.userId) {
    res.status(403).json({ error: "Bu ish o'rni sizga biriktirilmagan" });
    return;
  }

  res.json(await enrichVacancy(row));
});

router.patch("/vacancies/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [existing] = await db.select().from(vacanciesTable).where(eq(vacanciesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }

  const role = req.userRole ?? "";
  const closing = req.body?.status === "closed";

  if (closing) {
    const canClose =
      role === "admin" ||
      isHrRole(role) ||
      role === "director" ||
      (role === "recruiter" && existing.recruiterId === req.userId);
    if (!canClose) {
      res.status(403).json({ error: "Ish o'rinini yopishga ruxsat yo'q" });
      return;
    }
    if (existing.status === "closed") {
      res.status(400).json({ error: "Ish o'rni allaqachon bajarilgan" });
      return;
    }
  } else if (req.body?.deadline !== undefined || req.body?.extendDays !== undefined) {
    if (!canExtendVacancy(role)) {
      res.status(403).json({ error: "Ish o‘rnini cho‘zishga ruxsat yo‘q" });
      return;
    }
    if (existing.status === "closed") {
      res.status(400).json({ error: "Yopilgan ish o‘rnini cho‘zib bo‘lmaydi" });
      return;
    }
  } else if (role === "recruiter" && existing.recruiterId !== req.userId) {
    res.status(403).json({ error: "Bu ish o'rni sizga biriktirilmagan" });
    return;
  }

  let nextDeadline: Date | undefined;
  if (req.body?.extendDays !== undefined) {
    const days = parseInt(String(req.body.extendDays), 10);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      res.status(400).json({ error: "Cho‘zish 1–365 kun oralig‘ida bo‘lsin" });
      return;
    }
    const base =
      existing.deadline && existing.deadline.getTime() > Date.now()
        ? existing.deadline
        : new Date();
    nextDeadline = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  } else if (req.body?.deadline !== undefined) {
    nextDeadline = new Date(req.body.deadline);
    if (Number.isNaN(nextDeadline.getTime())) {
      res.status(400).json({ error: "Muddat noto‘g‘ri" });
      return;
    }
    const min = existing.deadline ?? new Date();
    if (nextDeadline.getTime() <= min.getTime()) {
      res.status(400).json({ error: "Yangi muddat joriy muddatdan keyin bo‘lishi kerak" });
      return;
    }
  }

  const allowed = ["title", "description", "salaryRange", "location", "schedule", "benefits", "status", "recruiterId", "deadline"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key === "deadline") continue;
    if (req.body[key] !== undefined) {
      if (key === "recruiterId") updates[key] = parseInt(req.body[key], 10);
      else updates[key] = req.body[key];
    }
  }
  if (nextDeadline) updates.deadline = nextDeadline;

  const [updated] = await db.update(vacanciesTable).set(updates).where(eq(vacanciesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Topilmadi" }); return; }

  // Odam olinganda bog‘liq ariza ham yopiladi
  if (closing && existing.requestId) {
    await db
      .update(requestsTable)
      .set({ status: "closed" })
      .where(eq(requestsTable.id, existing.requestId));
  }

  if (nextDeadline && existing.requestId) {
    await db
      .update(requestsTable)
      .set({ deadline: nextDeadline.toISOString() })
      .where(eq(requestsTable.id, existing.requestId));
    const when = nextDeadline.toLocaleString("uz-UZ", {
      timeZone: "Asia/Tashkent",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    await notifyUser({
      userId: existing.recruiterId,
      text: `"${existing.title}" ish o‘rni muddati cho‘zildi. Yangi muddat: ${when}`,
      type: "vacancy_extended",
      linkUrl: `/vacancies/${id}`,
    });
  }

  res.json(await enrichVacancy(updated));
});

router.post("/vacancies/:id/close", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [existing] = await db.select().from(vacanciesTable).where(eq(vacanciesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }

  const role = req.userRole ?? "";
  const canClose =
    role === "admin" ||
    isHrRole(role) ||
    role === "director" ||
    (role === "recruiter" && existing.recruiterId === req.userId);
  if (!canClose) {
    res.status(403).json({ error: "Ish o'rinini yopishga ruxsat yo'q" });
    return;
  }
  if (existing.status === "closed") {
    res.status(400).json({ error: "Ish o'rni allaqachon bajarilgan" });
    return;
  }

  const [updated] = await db
    .update(vacanciesTable)
    .set({ status: "closed" })
    .where(eq(vacanciesTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }

  if (existing.requestId) {
    await db
      .update(requestsTable)
      .set({ status: "closed" })
      .where(eq(requestsTable.id, existing.requestId));
  }

  res.json(await enrichVacancy(updated));
});

router.delete("/vacancies/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canDeleteHrRecords(req.userRole)) {
    res.status(403).json({ error: "Faqat HR va Direktor o'chira oladi" });
    return;
  }

  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const ok = await deleteVacancyCascade(id);
  if (!ok) { res.status(404).json({ error: "Topilmadi" }); return; }
  res.status(204).send();
});

router.post("/vacancies/:id/publish", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { channelIds } = req.body ?? {};
  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    res.status(400).json({ error: "Kamida bitta kanal tanlang" });
    return;
  }

  const [existing] = await db.select().from(vacanciesTable).where(eq(vacanciesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }

  const role = req.userRole ?? "";
  if (role === "recruiter" && existing.recruiterId !== req.userId) {
    res.status(403).json({ error: "Bu ish o'rni sizga biriktirilmagan" });
    return;
  }
  if (role !== "recruiter" && !isHrManager(role)) {
    res.status(403).json({ error: "Ruxsat yo'q" });
    return;
  }
  if (existing.status === "published") {
    res.status(400).json({ error: "Ish o'rni allaqachon faol" });
    return;
  }
  if (existing.status === "closed") {
    res.status(400).json({ error: "Yopilgan ish o'rnini e'lon qilib bo'lmaydi" });
    return;
  }

  const FALLBACK_CHANNELS: Record<number, { name: string; icon: string }> = {
    1: { name: "HeadHunter (hh.uz)", icon: "hh" },
    2: { name: "OLX.uz", icon: "olx" },
    3: { name: "Telegram Kanal", icon: "telegram" },
    4: { name: "Instagram", icon: "instagram" },
    5: { name: "Kompaniya sayti", icon: "web" },
  };

  let allChannels = await db.select().from(channelsTable);
  if (allChannels.length === 0) {
    await db.insert(channelsTable).values(
      Object.values(FALLBACK_CHANNELS).map((meta) => ({
        name: meta.name,
        icon: meta.icon,
        isActive: 1,
      })),
    );
    allChannels = await db.select().from(channelsTable);
  }

  const publishedChannels = channelIds.map((cId: number) => {
    const ch = allChannels.find((c) => c.id === cId);
    const fallback = FALLBACK_CHANNELS[cId];
    return {
      channelId: cId,
      channelName: ch?.name ?? fallback?.name ?? "Noma'lum",
      channelIcon: ch?.icon ?? fallback?.icon ?? "",
      publishedAt: new Date().toISOString(),
      views: 0,
      applications: 0,
    };
  });

  const now = new Date();
  const [updated] = await db
    .update(vacanciesTable)
    .set({
      channels: publishedChannels,
      status: "published",
      acceptedAt: existing.acceptedAt ?? now,
      publishedAt: now,
      updatedAt: now,
    })
    .where(eq(vacanciesTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Topilmadi" }); return; }

  await db
    .update(requestsTable)
    .set({ status: "announced" })
    .where(eq(requestsTable.id, updated.requestId));

  const { markStaffingSearchingByRequestId } = await import("../lib/staffing-alert");
  await markStaffingSearchingByRequestId(updated.requestId);

  res.json(await enrichVacancy(updated));
});

export default router;
