import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  branchNeedsTable,
  employeesTable,
  usersTable,
  tasksTable,
} from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import { notifyByRoles, notifyUser } from "../lib/notify";
import { HR_ROLES } from "../lib/roles";

const router: IRouter = Router();

const VIEW_ROLES = new Set([
  "mudir",
  "koordinator",
  ...HR_ROLES,
  "admin",
  "director",
  "recruiter",
  "texnik",
  "ombor",
]);
const WRITE_ROLES = new Set(["mudir", "koordinator", ...HR_ROLES, "admin"]);
const CONFIRM_ROLES = new Set(["koordinator", ...HR_ROLES, "admin"]);

const VERIFY_ROLES = new Set(["mudir", "koordinator", ...HR_ROLES, "admin"]);

async function enrichNeed(row: typeof branchNeedsTable.$inferSelect) {
  let managerName: string | null = null;
  if (row.managerEmployeeId) {
    try {
      const [m] = await db
        .select({ fullName: employeesTable.fullName, location: employeesTable.location })
        .from(employeesTable)
        .where(eq(employeesTable.id, row.managerEmployeeId));
      managerName = m?.fullName ?? null;
      if (!row.branchLocation && m?.location) {
        row = { ...row, branchLocation: m.location };
      }
    } catch {
      managerName = null;
    }
  }

  let createdByName: string | null = null;
  let createdByRole: string | null = null;
  if (row.createdById) {
    try {
      const [u] = await db
        .select({ fullName: usersTable.fullName, role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, row.createdById));
      createdByName = u?.fullName ?? null;
      createdByRole = u?.role ?? null;
    } catch {
      /* ignore */
    }
  }

  let assignedUserName: string | null = null;
  let assignedUserRole: string | null = null;
  if (row.assignedUserId) {
    try {
      const [u] = await db
        .select({ fullName: usersTable.fullName, role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, row.assignedUserId));
      assignedUserName = u?.fullName ?? null;
      assignedUserRole = u?.role ?? null;
    } catch {
      /* ignore */
    }
  }

  let confirmedByName: string | null = null;
  if (row.confirmedById) {
    try {
      const [u] = await db
        .select({ fullName: usersTable.fullName })
        .from(usersTable)
        .where(eq(usersTable.id, row.confirmedById));
      confirmedByName = u?.fullName ?? null;
    } catch {
      /* ignore */
    }
  }

  let verifiedByName: string | null = null;
  if (row.verifiedById) {
    try {
      const [u] = await db
        .select({ fullName: usersTable.fullName })
        .from(usersTable)
        .where(eq(usersTable.id, row.verifiedById));
      verifiedByName = u?.fullName ?? null;
    } catch {
      /* ignore */
    }
  }

  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    assignedAt: row.assignedAt?.toISOString() ?? null,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    managerName,
    createdByName,
    createdByRole,
    assignedUserName,
    assignedUserRole,
    confirmedByName,
    verifiedByName,
  };
}

router.get("/branch-needs", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole ?? "";
  if (!VIEW_ROLES.has(role)) {
    res.status(403).json({ error: "Ruxsat yoʻq" });
    return;
  }

  const { status } = req.query as Record<string, string>;
  const conditions = [];

  if (
    status === "pending" ||
    status === "assigned" ||
    status === "in_progress" ||
    status === "done" ||
    status === "verified" ||
    status === "closed"
  ) {
    conditions.push(eq(branchNeedsTable.status, status));
  } else if (status === "history") {
    conditions.push(inArray(branchNeedsTable.status, ["verified", "closed"]));
  } else if (status === "active" || !status) {
    conditions.push(
      inArray(branchNeedsTable.status, ["pending", "assigned", "in_progress", "done"]),
    );
  }

  // Mudir — faqat o‘z filiali
  if (role === "mudir" && req.userId) {
    const myMgr = (
      await db.select().from(employeesTable).where(eq(employeesTable.userId, req.userId))
    ).find((e) => e.orgRole === "manager");
    if (!myMgr) {
      res.json([]);
      return;
    }
    conditions.push(eq(branchNeedsTable.managerEmployeeId, myMgr.id));
  }

  // Texnik / ombor — faqat o‘ziga biriktirilgan
  if ((role === "texnik" || role === "ombor") && req.userId) {
    conditions.push(eq(branchNeedsTable.assignedUserId, req.userId));
  }

  const rows = await db
    .select()
    .from(branchNeedsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(branchNeedsTable.createdAt));

  res.json(await Promise.all(rows.map(enrichNeed)));
});

/** Koordinator tasdiqlash uchun ijrochilar ro‘yxati */
router.get("/branch-needs/assignees", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole ?? "";
  if (!CONFIRM_ROLES.has(role)) {
    res.status(403).json({ error: "Ruxsat yoʻq" });
    return;
  }

  const rows = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      role: usersTable.role,
      login: usersTable.login,
    })
    .from(usersTable)
    .where(eq(usersTable.status, "active"))
    .orderBy(usersTable.fullName);

  // Texnik / ombor birinchi, keyin boshqalar (mudir/koordinator/admin dan tashqari ixtiyoriy)
  const preferred = new Set(["texnik", "ombor"]);
  const list = rows
    .filter((u) => u.role !== "director")
    .sort((a, b) => {
      const ap = preferred.has(a.role) ? 0 : 1;
      const bp = preferred.has(b.role) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.fullName.localeCompare(b.fullName, "uz");
    });

  res.json(list);
});

router.post("/branch-needs", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole ?? "";
  if (!WRITE_ROLES.has(role)) {
    res.status(403).json({ error: "Ruxsat yoʻq" });
    return;
  }

  const { needType, branchLocation, managerEmployeeId, note, assigneeUserId } = req.body ?? {};
  const title = typeof needType === "string" ? needType.trim() : "";
  if (!title) {
    res.status(400).json({ error: "Ehtiyoj matni kerak" });
    return;
  }
  if (title.length > 120) {
    res.status(400).json({ error: "Ehtiyoj matni juda uzun (max 120)" });
    return;
  }

  let mgrId = managerEmployeeId ? Number(managerEmployeeId) : null;
  let branch = typeof branchLocation === "string" ? branchLocation.trim() : "";

  if (role === "mudir" && req.userId) {
    const myMgr = (
      await db.select().from(employeesTable).where(eq(employeesTable.userId, req.userId))
    ).find((e) => e.orgRole === "manager");
    if (!myMgr) {
      res.status(400).json({ error: "Filial bogʻlanmagan" });
      return;
    }
    mgrId = myMgr.id;
    branch = myMgr.location || branch;
  }

  // Koordinator o‘zi ehtiyoj belgilaydi — filial + ijrochi majburiy, darhol topshiriq
  if (role === "koordinator") {
    if (!mgrId) {
      res.status(400).json({ error: "Filial / mudirni tanlang" });
      return;
    }
    if (assigneeUserId == null || String(assigneeUserId).trim() === "") {
      res.status(400).json({ error: "Ijrochini tanlang — vazifa darhol ochiladi" });
      return;
    }

    const coordRows = await db
      .select({ id: employeesTable.id, orgRole: employeesTable.orgRole })
      .from(employeesTable)
      .where(eq(employeesTable.userId, req.userId!));
    const coord =
      coordRows.find((r) => r.orgRole === "coordinator") ?? coordRows[0];
    const [mgr] = await db
      .select({
        id: employeesTable.id,
        location: employeesTable.location,
        reportsToId: employeesTable.reportsToId,
        orgRole: employeesTable.orgRole,
      })
      .from(employeesTable)
      .where(eq(employeesTable.id, mgrId));
    if (!mgr || mgr.orgRole !== "manager") {
      res.status(400).json({ error: "Filial (mudir) topilmadi" });
      return;
    }
    if (coord && mgr.reportsToId !== coord.id) {
      res.status(403).json({ error: "Bu filial sizga biriktirilmagan" });
      return;
    }
    if (!branch) branch = mgr.location || "";
  }

  if (mgrId && !branch) {
    const [m] = await db.select().from(employeesTable).where(eq(employeesTable.id, mgrId));
    branch = m?.location ?? "";
  }

  // Koordinator bir vaqtda ijrochi tanlasa — darhol topshiriq
  const wantAssign =
    CONFIRM_ROLES.has(role) && assigneeUserId != null && String(assigneeUserId).trim() !== "";

  if (wantAssign) {
    const aid = parseInt(String(assigneeUserId), 10);
    const [assignee] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, aid), eq(usersTable.status, "active")));
    if (!assignee) {
      res.status(400).json({ error: "Ijrochi topilmadi" });
      return;
    }

    const descParts = [
      `Filial: ${branch || "—"}`,
      note ? `Izoh: ${String(note).trim()}` : null,
      `Yuboruvchi: ${role}`,
    ].filter(Boolean);

    const [task] = await db
      .insert(tasksTable)
      .values({
        title: `Ehtiyoj: ${title}`,
        description: descParts.join("\n"),
        status: "todo",
        priority: "normal",
        dueAt: new Date(),
        assigneeKind: "user",
        assigneeId: aid,
        createdById: req.userId!,
      })
      .returning();

    const [created] = await db
      .insert(branchNeedsTable)
      .values({
        needType: title,
        branchLocation: branch || null,
        managerEmployeeId: mgrId,
        note: typeof note === "string" ? note.trim() || null : null,
        status: "assigned",
        createdById: req.userId ?? null,
        confirmedById: req.userId ?? null,
        confirmedAt: new Date(),
        assignedUserId: aid,
        assignedAt: new Date(),
        taskId: task.id,
      })
      .returning();

    await notifyUser({
      userId: aid,
      text: `Sizga ehtiyoj topshirigʻi: «${title}» — ${branch || "Filial"}`,
      type: "expired_task",
      linkUrl: "/vazifalar",
    });

    res.status(201).json(await enrichNeed(created));
    return;
  }

  // Oddiy yaratish — pending (koordinator tasdiǧi)
  const [created] = await db
    .insert(branchNeedsTable)
    .values({
      needType: title,
      branchLocation: branch || null,
      managerEmployeeId: mgrId,
      note: typeof note === "string" ? note.trim() || null : null,
      status: "pending",
      createdById: req.userId ?? null,
    })
    .returning();

  await notifyByRoles({
    roles: ["koordinator", "admin"],
    text: `Yangi ehtiyoj (tasdiq kutilmoqda): ${title} — ${branch || "Filial"}`,
    type: "stage_change",
    linkUrl: "/ehtiyoj",
  });

  res.status(201).json(await enrichNeed(created));
});

/** Koordinator tasdiqlaydi → tanlangan xodimga topshiriq */
router.post("/branch-needs/:id/confirm", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole ?? "";
  if (!CONFIRM_ROLES.has(role)) {
    res.status(403).json({ error: "Faqat koordinator tasdiqlashi mumkin" });
    return;
  }

  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [row] = await db.select().from(branchNeedsTable).where(eq(branchNeedsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }
  if (row.status !== "pending") {
    res.status(400).json({ error: "Bu ehtiyoj allaqachon koʻrib chiqilgan" });
    return;
  }

  const { assigneeUserId } = req.body ?? {};
  const aid = parseInt(String(assigneeUserId), 10);
  if (!aid) {
    res.status(400).json({ error: "Ijrochi (texnik / ombor / boshqa) tanlang" });
    return;
  }

  const [assignee] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, aid), eq(usersTable.status, "active")));
  if (!assignee) {
    res.status(400).json({ error: "Ijrochi topilmadi" });
    return;
  }

  const descParts = [
    `Filial: ${row.branchLocation || "—"}`,
    row.note ? `Izoh: ${row.note}` : null,
  ].filter(Boolean);

  const [task] = await db
    .insert(tasksTable)
    .values({
      title: `Ehtiyoj: ${row.needType}`,
      description: descParts.join("\n"),
      status: "todo",
      priority: "normal",
      dueAt: new Date(),
      assigneeKind: "user",
      assigneeId: aid,
      createdById: req.userId!,
    })
    .returning();

  const now = new Date();
  const [updated] = await db
    .update(branchNeedsTable)
    .set({
      status: "assigned",
      confirmedById: req.userId ?? null,
      confirmedAt: now,
      assignedUserId: aid,
      assignedAt: now,
      taskId: task.id,
    })
    .where(eq(branchNeedsTable.id, id))
    .returning();

  await notifyUser({
    userId: aid,
    text: `Sizga ehtiyoj topshirigʻi: «${row.needType}» — ${row.branchLocation || "Filial"}`,
    type: "expired_task",
    linkUrl: "/vazifalar",
  });

  if (row.createdById && row.createdById !== req.userId) {
    await notifyUser({
      userId: row.createdById,
      text: `Ehtiyojingiz tasdiqlandi: «${row.needType}» → ${assignee.fullName}`,
      type: "stage_change",
      linkUrl: "/ehtiyoj",
    });
  }

  res.json({
    need: await enrichNeed(updated),
    taskId: task.id,
  });
});

/** Mudir yoki koordinator — xodim bajarganini yakuniy tasdiqlaydi (baza saqlanadi) */
router.post("/branch-needs/:id/verify", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole ?? "";
  if (!VERIFY_ROLES.has(role)) {
    res.status(403).json({ error: "Faqat mudir yoki koordinator yakuniy tasdiqlashi mumkin" });
    return;
  }

  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [row] = await db.select().from(branchNeedsTable).where(eq(branchNeedsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }
  if (row.status !== "done") {
    res.status(400).json({
      error:
        row.status === "verified"
          ? "Allaqachon tasdiqlangan"
          : "Avval xodim bajarishi kerak",
    });
    return;
  }

  if (role === "mudir" && req.userId) {
    const myMgr = (
      await db.select().from(employeesTable).where(eq(employeesTable.userId, req.userId))
    ).find((e) => e.orgRole === "manager");
    if (!myMgr || row.managerEmployeeId !== myMgr.id) {
      res.status(403).json({ error: "Faqat o‘z filial ehtiyojini tasdiqlashingiz mumkin" });
      return;
    }
  }

  const now = new Date();
  const [updated] = await db
    .update(branchNeedsTable)
    .set({
      status: "verified",
      verifiedById: req.userId ?? null,
      verifiedAt: now,
    })
    .where(eq(branchNeedsTable.id, id))
    .returning();

  if (row.taskId) {
    await db
      .update(tasksTable)
      .set({ status: "verified" })
      .where(eq(tasksTable.id, row.taskId));
  }

  if (row.assignedUserId) {
    await notifyUser({
      userId: row.assignedUserId,
      text: `Ehtiyoj yakuniy tasdiqlandi: «${row.needType}»`,
      type: "stage_change",
      linkUrl: "/ehtiyoj",
    });
  }

  res.json(await enrichNeed(updated));
});

router.post("/branch-needs/:id/close", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole ?? "";
  if (!WRITE_ROLES.has(role) && role !== "director") {
    res.status(403).json({ error: "Ruxsat yoʻq" });
    return;
  }

  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [row] = await db.select().from(branchNeedsTable).where(eq(branchNeedsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }
  if (row.status === "closed" || row.status === "verified") {
    res.status(400).json({ error: "Allaqachon yakunlangan" });
    return;
  }

  if (role === "mudir" && req.userId) {
    const myMgr = (
      await db.select().from(employeesTable).where(eq(employeesTable.userId, req.userId))
    ).find((e) => e.orgRole === "manager");
    if (!myMgr || row.managerEmployeeId !== myMgr.id) {
      res.status(403).json({ error: "Faqat o‘z filial ehtiyojini yopishingiz mumkin" });
      return;
    }
    if (row.status !== "pending") {
      res.status(400).json({ error: "Tasdiqlangan ehtiyojni faqat koordinator yopadi" });
      return;
    }
  }

  const [updated] = await db
    .update(branchNeedsTable)
    .set({
      status: "closed",
      closedById: req.userId ?? null,
      closedAt: new Date(),
    })
    .where(eq(branchNeedsTable.id, id))
    .returning();

  res.json(await enrichNeed(updated));
});

export default router;
