import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  staffingAlertsTable,
  requestClaimsTable,
  employeesTable,
  requestsTable,
  usersTable,
  departmentsTable,
  vacanciesTable,
} from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import { notifyByRoles } from "../lib/notify";
import { HR_ROLES, isHrManager } from "../lib/roles";

const router: IRouter = Router();

const EMP_STATUS_LABEL: Record<string, string> = {
  new: "Yangi",
  dismissed: "Bo'shatilgan",
  need_hire: "Xodim kerak",
  searching: "Qidirilmoqda",
  working: "Ishlamoqda",
  no_manager: "Mudir yo‘q",
};

/** Koordinator tasdiqi uchun default muddat — 48 soat */
const CONFIRM_SLA_MS = 48 * 60 * 60 * 1000;

function pipelineStage(opts: {
  workflowStatus: string;
  vacancyStatus?: string | null;
  hasVacancy?: boolean;
  employmentStatus?: string | null;
}): { key: string; label: string; step: number } {
  if (opts.workflowStatus === "cancelled") return { key: "cancelled", label: "Bekor", step: 0 };
  if (opts.workflowStatus === "closed" || opts.vacancyStatus === "closed") {
    return { key: "closed", label: "Yopilgan", step: 6 };
  }
  // Rekruter eʼlonni olgach — ishga qabulgacha Qidirilmoqda
  if (opts.vacancyStatus === "published" || opts.employmentStatus === "searching") {
    return { key: "searching", label: "Qidirilmoqda", step: 5 };
  }
  if (opts.hasVacancy || opts.vacancyStatus === "draft") {
    return { key: "assigned", label: "Rekruter", step: 3 };
  }
  if (opts.workflowStatus === "confirmed") return { key: "confirmed", label: "Ariza", step: 2 };
  if (opts.workflowStatus === "pending") return { key: "pending", label: "Ogohlantirish", step: 1 };
  // Xodim kerak / bo'shatilgan / yangi — kamida ogohlantirish bosqichi
  if (opts.employmentStatus && opts.employmentStatus !== "working") {
    return { key: "pending", label: "Ogohlantirish", step: 1 };
  }
  return { key: "normal", label: "Ishlamoqda", step: 0 };
}

async function enrichAlert(row: typeof staffingAlertsTable.$inferSelect) {
  const [emp] = await db
    .select({ fullName: employeesTable.fullName, position: employeesTable.position })
    .from(employeesTable)
    .where(eq(employeesTable.id, row.employeeId));
  const [mgr] = row.managerEmployeeId
    ? await db
        .select({ fullName: employeesTable.fullName })
        .from(employeesTable)
        .where(eq(employeesTable.id, row.managerEmployeeId))
    : [null];
  const [creator] = row.createdById
    ? await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, row.createdById))
    : [null];
  const [confirmer] = row.confirmedById
    ? await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, row.confirmedById))
    : [null];

  let requestDeadline: string | null = null;
  let vacancyId: number | null = null;
  let vacancyDeadline: string | null = null;
  let vacancyStatus: string | null = null;
  let vacancyTitle: string | null = null;
  let employmentStatus = row.employmentStatus;

  if (row.requestId) {
    const [req] = await db
      .select({ deadline: requestsTable.deadline })
      .from(requestsTable)
      .where(eq(requestsTable.id, row.requestId));
    requestDeadline = req?.deadline ?? null;

    const [vac] = await db
      .select({
        id: vacanciesTable.id,
        deadline: vacanciesTable.deadline,
        status: vacanciesTable.status,
        title: vacanciesTable.title,
      })
      .from(vacanciesTable)
      .where(eq(vacanciesTable.requestId, row.requestId));
    if (vac) {
      vacancyId = vac.id;
      vacancyDeadline = vac.deadline ? vac.deadline.toISOString() : null;
      vacancyStatus = vac.status;
      vacancyTitle = vac.title;
    }
  }

  // Eʼlon faol boʻlsa — Qidirilmoqda
  if (
    vacancyStatus === "published" &&
    (row.workflowStatus === "confirmed" || row.workflowStatus === "pending") &&
    employmentStatus !== "searching"
  ) {
    employmentStatus = "searching";
    await db
      .update(staffingAlertsTable)
      .set({ employmentStatus: "searching", workflowStatus: "confirmed" })
      .where(eq(staffingAlertsTable.id, row.id));
    await db
      .update(employeesTable)
      .set({ employmentStatus: "searching" })
      .where(eq(employeesTable.id, row.employeeId));
  }

  const confirmDeadline =
    row.workflowStatus === "pending" && employmentStatus !== "searching"
      ? new Date(new Date(row.createdAt).getTime() + CONFIRM_SLA_MS).toISOString()
      : null;

  const displayDeadline = vacancyDeadline || requestDeadline || confirmDeadline;
  const deadlineKind = vacancyDeadline
    ? "vacancy"
    : requestDeadline
      ? "request"
      : confirmDeadline
        ? "confirm"
        : null;

  const pipeline = pipelineStage({
    workflowStatus: employmentStatus === "searching" ? "confirmed" : row.workflowStatus,
    vacancyStatus,
    hasVacancy: !!vacancyId,
    employmentStatus,
  });

  return {
    ...row,
    employmentStatus,
    employeeName: emp?.fullName ?? null,
    employeePosition: emp?.position ?? null,
    managerName: mgr?.fullName ?? null,
    createdByName: creator?.fullName ?? null,
    confirmedByName: confirmer?.fullName ?? null,
    employmentStatusLabel: EMP_STATUS_LABEL[employmentStatus] ?? employmentStatus,
    requestDeadline,
    vacancyId,
    vacancyDeadline,
    vacancyStatus,
    vacancyTitle,
    confirmDeadline,
    displayDeadline,
    deadlineKind,
    pipelineKey: pipeline.key,
    pipelineLabel: pipeline.label,
    pipelineStep: pipeline.step,
  };
}

router.get("/staffing-alerts", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { status } = req.query as Record<string, string>;
  let rows;
  if (status === "open") {
    rows = await db
      .select()
      .from(staffingAlertsTable)
      .where(inArray(staffingAlertsTable.workflowStatus, ["pending", "confirmed"]))
      .orderBy(desc(staffingAlertsTable.createdAt));
  } else if (status) {
    rows = await db
      .select()
      .from(staffingAlertsTable)
      .where(eq(staffingAlertsTable.workflowStatus, status))
      .orderBy(desc(staffingAlertsTable.createdAt));
  } else {
    rows = await db.select().from(staffingAlertsTable).orderBy(desc(staffingAlertsTable.createdAt));
  }

  // Mudir faqat o‘z filiali ogohlantirishlarini ko‘radi
  if (req.userRole === "mudir" && req.userId) {
    const myMgr = (
      await db.select().from(employeesTable).where(eq(employeesTable.userId, req.userId))
    ).find((e) => e.orgRole === "manager");
    if (!myMgr) {
      res.json([]);
      return;
    }
    const teamIds = new Set<number>([myMgr.id]);
    const pharms = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(and(eq(employeesTable.orgRole, "pharmacist"), eq(employeesTable.reportsToId, myMgr.id)));
    for (const p of pharms) teamIds.add(p.id);
    rows = rows.filter(
      (r) => teamIds.has(r.employeeId) || r.managerEmployeeId === myMgr.id,
    );
  }

  res.json(await Promise.all(rows.map(enrichAlert)));
});

router.post("/staffing-alerts/:id/confirm", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole ?? "";
  if (role !== "koordinator" && !isHrManager(role)) {
    res.status(403).json({ error: "Faqat koordinator tasdiqlashi mumkin" });
    return;
  }

  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [alert] = await db.select().from(staffingAlertsTable).where(eq(staffingAlertsTable.id, id));
  if (!alert) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }
  if (alert.workflowStatus !== "pending") {
    res.status(400).json({ error: "Bu ogohlantirish allaqachon koʻrib chiqilgan" });
    return;
  }

  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, alert.employeeId));
  if (!employee) {
    res.status(404).json({ error: "Xodim topilmadi" });
    return;
  }

  const statusLabel = EMP_STATUS_LABEL[alert.employmentStatus] ?? alert.employmentStatus;
  const branch = alert.branchLocation || employee.location || "Filial";
  const shiftLabel =
    alert.shiftType === "two"
      ? "2-smena"
      : alert.shiftType === "custom"
        ? alert.shiftLabel || "Maxsus"
        : "1-smena";

  const [dept] = await db
    .select({ name: departmentsTable.name })
    .from(departmentsTable)
    .where(eq(departmentsTable.id, employee.departmentId));

  const position = employee.orgRole === "pharmacist" ? "Farmatsevt" : employee.position;
  const reason = `Filial: ${branch}. Smena: ${shiftLabel}. Holat: ${statusLabel}. Xodim: ${employee.fullName}.`;

  const [createdReq] = await db
    .insert(requestsTable)
    .values({
      departmentId: employee.departmentId,
      position,
      count: 1,
      description: `${branch} filiali uchun kadr ehtiyoji (${statusLabel}).`,
      requirements: null,
      salaryRange: null,
      deadline: null,
      reason,
      city: branch,
      district: dept?.name || "Farmatsiya",
      priority:
        alert.employmentStatus === "need_hire" || alert.employmentStatus === "dismissed" ? "urgent" : "normal",
      status: "submitted",
      createdById: req.userId ?? null,
    })
    .returning();

  const [updated] = await db
    .update(staffingAlertsTable)
    .set({
      workflowStatus: "confirmed",
      confirmedById: req.userId ?? null,
      confirmedAt: new Date(),
      requestId: createdReq.id,
    })
    .where(eq(staffingAlertsTable.id, id))
    .returning();

  await notifyByRoles({
    roles: [...HR_ROLES, "admin", "director", "recruiter"],
    text: `Filial ehtiyoji tasdiqlandi: ${branch} — ${position} (${statusLabel})`,
    type: "new_request",
    linkUrl: `/requests/${createdReq.id}`,
  });

  res.json({
    alert: await enrichAlert(updated),
    requestId: createdReq.id,
  });
});

router.post("/staffing-alerts/:id/cancel", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole ?? "";
  if (!["koordinator", "mudir", "admin", ...HR_ROLES].includes(role)) {
    res.status(403).json({ error: "Ruxsat yoʻq" });
    return;
  }

  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [alert] = await db.select().from(staffingAlertsTable).where(eq(staffingAlertsTable.id, id));
  if (!alert) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }
  if (alert.workflowStatus !== "pending") {
    res.status(400).json({ error: "Faqat kutilayotgan ogohlantirishni bekor qilish mumkin" });
    return;
  }

  const [updated] = await db
    .update(staffingAlertsTable)
    .set({ workflowStatus: "cancelled" })
    .where(eq(staffingAlertsTable.id, id))
    .returning();

  res.json(await enrichAlert(updated));
});

router.get("/requests/:id/claims", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const requestId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const rows = await db
    .select()
    .from(requestClaimsTable)
    .where(eq(requestClaimsTable.requestId, requestId))
    .orderBy(desc(requestClaimsTable.createdAt));

  const enriched = await Promise.all(
    rows.map(async (r) => {
      const [u] = await db
        .select({ fullName: usersTable.fullName })
        .from(usersTable)
        .where(eq(usersTable.id, r.recruiterId));
      return { ...r, recruiterName: u?.fullName ?? null };
    }),
  );
  res.json(enriched);
});

router.post("/requests/:id/claims", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole ?? "";
  if (role !== "recruiter" && role !== "admin") {
    res.status(403).json({ error: "Faqat rekruter soʻrov qoldira oladi" });
    return;
  }

  const requestId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : null;

  const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, requestId));
  if (!request) {
    res.status(404).json({ error: "Ariza topilmadi" });
    return;
  }
  if (request.status === "closed" || request.status === "announced") {
    res.status(400).json({ error: "Bu ariza uchun soʻrov qoldirib boʻlmaydi" });
    return;
  }

  const existing = await db
    .select()
    .from(requestClaimsTable)
    .where(
      and(
        eq(requestClaimsTable.requestId, requestId),
        eq(requestClaimsTable.recruiterId, req.userId!),
        inArray(requestClaimsTable.status, ["pending", "accepted"]),
      ),
    );

  if (existing.length) {
    res.status(400).json({ error: "Siz allaqachon soʻrov qoldirgansiz" });
    return;
  }

  const [created] = await db
    .insert(requestClaimsTable)
    .values({
      requestId,
      recruiterId: req.userId!,
      note,
      status: "pending",
    })
    .returning();

  await notifyByRoles({
    roles: [...HR_ROLES, "admin"],
    text: `Rekruter arizaga soʻrov qoldirdi: "${request.position}" (#${requestId})`,
    type: "new_request",
    linkUrl: `/requests/${requestId}`,
  });

  const [u] = await db
    .select({ fullName: usersTable.fullName })
    .from(usersTable)
    .where(eq(usersTable.id, created.recruiterId));

  res.status(201).json({ ...created, recruiterName: u?.fullName ?? null });
});

export default router;
