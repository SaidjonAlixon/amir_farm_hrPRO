import { Router, type IRouter } from "express";
import { eq, and, ilike, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  db,
  requestsTable,
  departmentsTable,
  usersTable,
  notificationsTable,
  vacanciesTable,
  requestClaimsTable,
} from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import { canDeleteHrRecords, deleteRequestCascade } from "../lib/delete-candidate";
import { HR_ROLES, isHrManager } from "../lib/roles";

const router: IRouter = Router();

const assignee = alias(usersTable, "assignee");
const creator = alias(usersTable, "creator");

const requestSelect = {
  id: requestsTable.id,
  departmentId: requestsTable.departmentId,
  departmentName: departmentsTable.name,
  position: requestsTable.position,
  count: requestsTable.count,
  description: requestsTable.description,
  requirements: requestsTable.requirements,
  salaryRange: requestsTable.salaryRange,
  deadline: requestsTable.deadline,
  reason: requestsTable.reason,
  city: requestsTable.city,
  district: requestsTable.district,
  priority: requestsTable.priority,
  status: requestsTable.status,
  assignedToId: requestsTable.assignedToId,
  assignedToName: assignee.fullName,
  assignedAt: requestsTable.assignedAt,
  createdById: requestsTable.createdById,
  createdByName: creator.fullName,
  createdAt: requestsTable.createdAt,
  vacancyId: vacanciesTable.id,
  vacancyCreatedAt: vacanciesTable.createdAt,
  vacancyAssignedAt: vacanciesTable.assignedAt,
  vacancyAcceptedAt: vacanciesTable.acceptedAt,
  vacancyPublishedAt: vacanciesTable.publishedAt,
};

function requestBaseQuery() {
  return db
    .select(requestSelect)
    .from(requestsTable)
    .leftJoin(departmentsTable, eq(requestsTable.departmentId, departmentsTable.id))
    .leftJoin(assignee, eq(requestsTable.assignedToId, assignee.id))
    .leftJoin(creator, eq(requestsTable.createdById, creator.id))
    .leftJoin(vacanciesTable, eq(vacanciesTable.requestId, requestsTable.id));
}

async function getRequestFull(id: number) {
  const [row] = await requestBaseQuery().where(eq(requestsTable.id, id));
  return row ?? null;
}

function parseDeadline(raw: string | null | undefined): Date | null {
  if (!raw || !String(raw).trim()) return null;
  const d = new Date(String(raw).trim());
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

router.get("/requests", async (req, res): Promise<void> => {
  const { status, departmentId, assignedTo, priority, search } = req.query as Record<string, string>;

  const conditions = [];
  if (status) conditions.push(eq(requestsTable.status, status));
  if (departmentId) conditions.push(eq(requestsTable.departmentId, parseInt(departmentId, 10)));
  if (assignedTo) conditions.push(eq(requestsTable.assignedToId, parseInt(assignedTo, 10)));
  if (priority) conditions.push(eq(requestsTable.priority, priority));
  if (search) conditions.push(ilike(requestsTable.position, `%${search}%`));

  const baseQuery = requestBaseQuery();
  const rows = conditions.length
    ? await baseQuery.where(and(...conditions)).orderBy(requestsTable.createdAt)
    : await baseQuery.orderBy(requestsTable.createdAt);

  res.json(rows);
});

router.post("/requests", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const {
    departmentId, position, count, description, requirements,
    salaryRange, deadline, reason, priority, city, district,
  } = req.body ?? {};
  if (!departmentId || !position || !city?.trim() || !district?.trim()) {
    res.status(400).json({ error: "Majburiy maydonlar to'ldirilmagan (shahar va tuman ham kerak)" });
    return;
  }
  const [created] = await db
    .insert(requestsTable)
    .values({
      departmentId: parseInt(departmentId, 10),
      position,
      count: count ? parseInt(count, 10) : 1,
      description: description ?? null,
      requirements: requirements ?? null,
      salaryRange: salaryRange ?? null,
      deadline: deadline ?? null,
      reason: reason ?? null,
      city: String(city).trim(),
      district: String(district).trim(),
      priority: priority ?? "normal",
      status: "submitted",
      createdById: req.userId ?? null,
    })
    .returning();

  // Notify only active HR and admin
  const hrs = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.status, "active"), inArray(usersTable.role, [...HR_ROLES, "admin"])));
  for (const r of hrs) {
    await db.insert(notificationsTable).values({
      userId: r.id,
      text: `Yangi ariza: "${position}" lavozimi uchun`,
      type: "new_request",
      linkUrl: `/requests/${created.id}`,
    });
  }

  const full = await getRequestFull(created.id);
  res.status(201).json(full);
});

router.get("/requests/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const row = await getRequestFull(id);
  if (!row) { res.status(404).json({ error: "Topilmadi" }); return; }
  res.json(row);
});

router.patch("/requests/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const allowed = ["position", "count", "description", "requirements", "salaryRange", "deadline", "reason", "priority", "status"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  await db.update(requestsTable).set(updates).where(eq(requestsTable.id, id));
  const full = await getRequestFull(id);
  if (!full) { res.status(404).json({ error: "Topilmadi" }); return; }
  res.json(full);
});

router.delete("/requests/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canDeleteHrRecords(req.userRole)) {
    res.status(403).json({ error: "Faqat HR va Direktor o'chira oladi" });
    return;
  }

  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const ok = await deleteRequestCascade(id);
  if (!ok) { res.status(404).json({ error: "Topilmadi" }); return; }
  res.status(204).send();
});

router.post("/requests/:id/assign", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { userId } = req.body ?? {};
  if (!userId) { res.status(400).json({ error: "userId kerak" }); return; }
  await db.update(requestsTable)
    .set({ assignedToId: userId, assignedAt: new Date(), status: "reviewing" })
    .where(eq(requestsTable.id, id));
  const full = await getRequestFull(id);
  if (!full) { res.status(404).json({ error: "Topilmadi" }); return; }
  res.json(full);
});

router.post("/requests/:id/approve", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole ?? "";
  if (!isHrManager(role)) {
    res.status(403).json({ error: "Faqat HR tasdiqlashi mumkin" });
    return;
  }

  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { recruiterId, deadline } = req.body ?? {};

  if (!recruiterId) {
    res.status(400).json({ error: "Rekruterni tanlang" });
    return;
  }

  const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, id));
  if (!request) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }

  if (request.status !== "submitted" && request.status !== "reviewing" && request.status !== "accepted") {
    res.status(400).json({ error: "Bu ariza tasdiqlash uchun mos emas" });
    return;
  }

  const [existingVacancy] = await db
    .select({ id: vacanciesTable.id })
    .from(vacanciesTable)
    .where(eq(vacanciesTable.requestId, id));
  if (existingVacancy) {
    res.status(400).json({ error: "Bu ariza uchun ish o'rni allaqachon yaratilgan" });
    return;
  }

  const recId = parseInt(String(recruiterId), 10);
  const [recruiter] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, recId), eq(usersTable.role, "recruiter"), eq(usersTable.status, "active")));
  if (!recruiter) {
    res.status(400).json({ error: "Faqat faol rekruter biriktiriladi" });
    return;
  }

  const deadlineDate = parseDeadline(deadline) ?? parseDeadline(request.deadline);
  if (!deadlineDate) {
    res.status(400).json({ error: "Muddatni belgilang" });
    return;
  }

  const descParts = [request.description, request.requirements].filter(Boolean);
  const vacancyDescription = descParts.length ? descParts.join("\n\n") : request.position;
  const locationParts = [request.city, request.district].filter(Boolean);
  const vacancyLocation = locationParts.length ? locationParts.join(", ") : null;

  const assignedAt = new Date();
  const [created] = await db
    .insert(vacanciesTable)
    .values({
      requestId: id,
      title: request.position,
      description: vacancyDescription,
      salaryRange: request.salaryRange ?? null,
      location: vacancyLocation,
      schedule: null,
      benefits: null,
      channels: [],
      status: "draft",
      recruiterId: recId,
      deadline: deadlineDate,
      assignedAt,
    })
    .returning();

  await db
    .update(requestsTable)
    .set({
      status: "accepted",
      assignedToId: recId,
      assignedAt,
      deadline: request.deadline || (deadline ? String(deadline) : request.deadline),
    })
    .where(eq(requestsTable.id, id));

  await db.insert(notificationsTable).values({
    userId: recId,
    text: `Sizga yangi ish o'rni biriktirildi: "${request.position}". Qabul qiling va e'lon kanallarini tanlang.`,
    type: "expired_task",
    linkUrl: `/vacancies/${created.id}?publish=1`,
  });

  // Rekruter soʻrovlarini yakunlash
  await db
    .update(requestClaimsTable)
    .set({ status: "accepted" })
    .where(and(eq(requestClaimsTable.requestId, id), eq(requestClaimsTable.recruiterId, recId)));
  await db
    .update(requestClaimsTable)
    .set({ status: "rejected" })
    .where(and(eq(requestClaimsTable.requestId, id), eq(requestClaimsTable.status, "pending")));

  // Alert ochiq qoladi — eʼlon qabulidan keyin Qidirilmoqda, ishga qabulgacha

  const full = await getRequestFull(id);
  res.status(201).json({
    request: full,
    vacancy: {
      id: created.id,
      title: created.title,
      status: created.status,
      recruiterId: created.recruiterId,
      createdAt: created.createdAt,
      deadline: created.deadline,
    },
  });
});

export default router;
