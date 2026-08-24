import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  db,
  tasksTable,
  usersTable,
  employeesTable,
  vacanciesTable,
  candidatesTable,
  phoneInterviewsTable,
  offlineInterviewsTable,
  onlineInterviewsTable,
  requestsTable,
  departmentsTable,
  branchAuditsTable,
  branchNeedsTable,
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { isHrDirektor, isHrOversight } from "../lib/roles";

const router: IRouter = Router();

const ROLE_LABEL_UZ: Record<string, string> = {
  admin: "Admin",
  hr: "HR",
  hr_direktor: "HR Direktor",
  hr_auditor: "HR Auditor",
  hr_menejer: "HR Menejer",
  recruiter: "Rekruter",
  trainer: "Trener",
  mentor: "Mentor",
  director: "Direktor",
  department_head: "Bo‘lim boshlig‘i",
  mudir: "Mudir",
  koordinator: "Koordinator",
  texnik: "Texnik",
  ombor: "Ombor",
  farmasevt: "Farmasevt",
  stajyor: "Stajyor",
};

const EMP_STATUS_UZ: Record<string, string> = {
  working: "Ishlamoqda",
  new: "Yangi",
  dismissed: "Bo‘shatilgan",
  need_hire: "Xodim kerak",
  searching: "Qidirilmoqda",
  no_manager: "Mudir yo‘q",
};

const ORG_ROLE_UZ: Record<string, string> = {
  coordinator: "Koordinator",
  manager: "Filial mudiri",
  pharmacist: "Farmasevt",
  intern: "Stajyor",
  supervisor: "Boshqaruvchi",
};

const SHIFT_UZ: Record<string, string> = {
  one: "1-smena",
  two: "2-smena",
  custom: "Maxsus",
};

function safeIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function mapOrgEmployee(e: typeof employeesTable.$inferSelect) {
  const status = e.employmentStatus || "working";
  return {
    id: e.id,
    fullName: e.fullName,
    position: e.position,
    orgRole: e.orgRole,
    orgRoleLabel: e.orgRole ? ORG_ROLE_UZ[e.orgRole] || e.orgRole : "—",
    location: e.location,
    employmentStatus: status,
    employmentStatusLabel: EMP_STATUS_UZ[status] || status,
    shiftType: e.shiftType,
    shiftLabel: e.shiftLabel,
    shiftDisplay:
      e.shiftType === "custom" && e.shiftLabel
        ? e.shiftLabel
        : SHIFT_UZ[e.shiftType || ""] || e.shiftType || "—",
    userId: e.userId ?? null,
    hiredAt: e.hiredAt,
    reportsToId: e.reportsToId,
    createdAt: safeIso(e.createdAt) ?? new Date(0).toISOString(),
  };
}

async function loadOrgTree(
  personId: number,
  person: { fullName: string; role: string },
): Promise<{
  myEmployee: typeof employeesTable.$inferSelect | null;
  managedManagers: ReturnType<typeof mapOrgEmployee>[];
  managedStaff: Array<ReturnType<typeof mapOrgEmployee> & { managerName?: string | null }>;
  reportsTo: ReturnType<typeof mapOrgEmployee> | null;
}> {
  let myEmployee: typeof employeesTable.$inferSelect | null = null;
  let managedManagers: ReturnType<typeof mapOrgEmployee>[] = [];
  let managedStaff: Array<
    ReturnType<typeof mapOrgEmployee> & { managerName?: string | null }
  > = [];
  let reportsTo: ReturnType<typeof mapOrgEmployee> | null = null;

  try {
    const [byUser] = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.userId, personId))
      .limit(1);
    myEmployee = byUser ?? null;

    if (!myEmployee) {
      const orgGuess =
        person.role === "koordinator"
          ? "coordinator"
          : person.role === "mudir"
            ? "manager"
            : person.role === "farmasevt"
              ? "pharmacist"
              : person.role === "stajyor"
                ? "intern"
                : null;
      if (orgGuess) {
        const [byName] = await db
          .select()
          .from(employeesTable)
          .where(
            and(eq(employeesTable.fullName, person.fullName), eq(employeesTable.orgRole, orgGuess)),
          )
          .limit(1);
        if (byName) myEmployee = byName;
      }
      // Familiya/ism qisman mosligi
      if (!myEmployee && orgGuess) {
        const parts = person.fullName.trim().split(/\s+/).filter((p) => p.length >= 4);
        if (parts.length) {
          const [fuzzy] = await db
            .select()
            .from(employeesTable)
            .where(
              and(
                eq(employeesTable.orgRole, orgGuess),
                or(...parts.map((p) => ilike(employeesTable.fullName, `%${p}%`))),
              ),
            )
            .limit(1);
          if (fuzzy) myEmployee = fuzzy;
        }
      }
    }

    // Koordinator employee yo‘q — checklist tarixidan mudirlarni tiklash
    if (!myEmployee && person.role === "koordinator") {
      const auditMgrIds = await db
        .select({ id: branchAuditsTable.managerEmployeeId })
        .from(branchAuditsTable)
        .where(eq(branchAuditsTable.coordinatorId, personId))
        .groupBy(branchAuditsTable.managerEmployeeId);
      const ids = auditMgrIds.map((r) => r.id).filter(Boolean);
      if (ids.length) {
        const managers = await db
          .select()
          .from(employeesTable)
          .where(inArray(employeesTable.id, ids))
          .orderBy(asc(employeesTable.fullName));
        managedManagers = managers.map(mapOrgEmployee);
        const managerIds = managers.map((m) => m.id);
        if (managerIds.length) {
          const staff = await db
            .select()
            .from(employeesTable)
            .where(inArray(employeesTable.reportsToId, managerIds))
            .orderBy(asc(employeesTable.fullName));
          const mgrName = new Map(managers.map((m) => [m.id, m.fullName]));
          managedStaff = staff.map((s) => ({
            ...mapOrgEmployee(s),
            managerName: s.reportsToId ? mgrName.get(s.reportsToId) ?? null : null,
          }));
        }
        return { myEmployee: null, managedManagers, managedStaff, reportsTo };
      }
    }

    if (!myEmployee) {
      return { myEmployee: null, managedManagers, managedStaff, reportsTo };
    }

    if (myEmployee.reportsToId) {
      const [boss] = await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.id, myEmployee.reportsToId))
        .limit(1);
      if (boss) reportsTo = mapOrgEmployee(boss);
    }

    // Mudir: reportsTo yo‘q bo‘lsa — checklist orqali koordinatorni topish
    if (
      !reportsTo &&
      myEmployee &&
      (person.role === "mudir" || myEmployee.orgRole === "manager")
    ) {
      const [auditLink] = await db
        .select({
          coordinatorId: branchAuditsTable.coordinatorId,
          coordinatorName: branchAuditsTable.coordinatorName,
        })
        .from(branchAuditsTable)
        .where(eq(branchAuditsTable.managerEmployeeId, myEmployee.id))
        .orderBy(desc(branchAuditsTable.id))
        .limit(1);
      if (auditLink?.coordinatorId) {
        const [coordEmp] = await db
          .select()
          .from(employeesTable)
          .where(eq(employeesTable.userId, auditLink.coordinatorId))
          .limit(1);
        if (coordEmp) {
          reportsTo = mapOrgEmployee(coordEmp);
        } else {
          const [coordUser] = await db
            .select({
              id: usersTable.id,
              fullName: usersTable.fullName,
            })
            .from(usersTable)
            .where(eq(usersTable.id, auditLink.coordinatorId))
            .limit(1);
          if (coordUser) {
            reportsTo = {
              id: 0,
              fullName: coordUser.fullName || auditLink.coordinatorName || "Koordinator",
              position: "Koordinator",
              orgRole: "coordinator",
              orgRoleLabel: "Koordinator",
              location: null,
              employmentStatus: "working",
              employmentStatusLabel: "—",
              shiftType: null,
              shiftLabel: null,
              shiftDisplay: "—",
              userId: coordUser.id,
              hiredAt: null,
              reportsToId: null,
              createdAt: new Date(0).toISOString(),
            };
          }
        }
      }
    }

    const isCoordinator =
      myEmployee.orgRole === "coordinator" || person.role === "koordinator";
    const isManager = myEmployee.orgRole === "manager" || person.role === "mudir";

    if (isCoordinator) {
      const managers = await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.reportsToId, myEmployee.id))
        .orderBy(asc(employeesTable.fullName));
      managedManagers = managers
        .filter((m) => m.orgRole === "manager" || !m.orgRole)
        .map(mapOrgEmployee);

      const managerIds = managers.map((m) => m.id);
      if (managerIds.length) {
        const staff = await db
          .select()
          .from(employeesTable)
          .where(inArray(employeesTable.reportsToId, managerIds))
          .orderBy(asc(employeesTable.fullName));
        const mgrName = new Map(managers.map((m) => [m.id, m.fullName]));
        managedStaff = staff.map((s) => ({
          ...mapOrgEmployee(s),
          managerName: s.reportsToId ? mgrName.get(s.reportsToId) ?? null : null,
        }));
        for (const s of managers.filter(
          (m) => m.orgRole === "pharmacist" || m.orgRole === "intern",
        )) {
          managedStaff.push({
            ...mapOrgEmployee(s),
            managerName: "To‘g‘ridan-to‘g‘ri",
          });
        }
      }
    } else if (isManager) {
      const staff = await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.reportsToId, myEmployee.id))
        .orderBy(asc(employeesTable.fullName));
      managedStaff = staff.map((s) => ({
        ...mapOrgEmployee(s),
        managerName: myEmployee!.fullName,
      }));
    }
  } catch (err) {
    console.error("kuzatuv org tree error:", err);
    return { myEmployee: null, managedManagers: [], managedStaff: [], reportsTo: null };
  }

  return { myEmployee, managedManagers, managedStaff, reportsTo };
}

const NEED_STATUS_UZ: Record<string, string> = {
  pending: "Kutilmoqda",
  assigned: "Topshirilgan",
  in_progress: "Jarayonda",
  done: "Bajarildi",
  verified: "Tasdiqlangan",
  closed: "Yopilgan",
};

const TASK_STATUS_UZ: Record<string, string> = {
  todo: "Yangi",
  in_progress: "Jarayonda",
  done: "Bajarildi",
  verified: "Tasdiqlangan",
  cancelled: "Bekor",
};

const TASK_SELECT = {
  id: tasksTable.id,
  title: tasksTable.title,
  description: tasksTable.description,
  status: tasksTable.status,
  priority: tasksTable.priority,
  dueAt: tasksTable.dueAt,
  assigneeKind: tasksTable.assigneeKind,
  assigneeId: tasksTable.assigneeId,
  createdById: tasksTable.createdById,
  completionNote: tasksTable.completionNote,
  completedAt: tasksTable.completedAt,
  acceptedAt: tasksTable.acceptedAt,
  createdAt: tasksTable.createdAt,
  updatedAt: tasksTable.updatedAt,
};

/** Koordinatorga bog‘liq filiallar: checklist, ehtiyoj, mudir topshiriqlari */
async function loadCoordinatorOps(
  personId: number,
  personRole: string,
  managedManagers: ReturnType<typeof mapOrgEmployee>[],
  managedStaff: Array<ReturnType<typeof mapOrgEmployee> & { managerName?: string | null }>,
) {
  const empty = {
    branches: [] as Array<Record<string, unknown>>,
    audits: [] as Array<Record<string, unknown>>,
    needs: [] as Array<Record<string, unknown>>,
    networkTasks: [] as Array<Record<string, unknown>>,
    summary: {
      branchesCount: 0,
      auditsCount: 0,
      auditsAvgScore: null as number | null,
      needsOpen: 0,
      needsTotal: 0,
      networkTasksOpen: 0,
      networkTasksDone: 0,
    },
  };

  if (personRole !== "koordinator" && personRole !== "mudir") {
    return empty;
  }

  try {
    let managers = managedManagers;
    // Mudir o‘zi — bitta filial
    if (personRole === "mudir" && managers.length === 0) {
      // managedManagers bo‘sh; employee o‘zi filial — caller da employee bor emas shu yerda
    }

    const managerIds = managers.map((m) => m.id);

    // Checklist — bu koordinatorning tashriflari
    const auditRows =
      personRole === "koordinator"
        ? await db
            .select({
              id: branchAuditsTable.id,
              managerEmployeeId: branchAuditsTable.managerEmployeeId,
              branchLocation: branchAuditsTable.branchLocation,
              managerName: branchAuditsTable.managerName,
              visitDate: branchAuditsTable.visitDate,
              visitName: branchAuditsTable.visitName,
              scorePercent: branchAuditsTable.scorePercent,
              yesCount: branchAuditsTable.yesCount,
              noCount: branchAuditsTable.noCount,
              answeredCount: branchAuditsTable.answeredCount,
              totalCount: branchAuditsTable.totalCount,
              status: branchAuditsTable.status,
              createdAt: branchAuditsTable.createdAt,
            })
            .from(branchAuditsTable)
            .where(eq(branchAuditsTable.coordinatorId, personId))
            .orderBy(desc(branchAuditsTable.visitDate), desc(branchAuditsTable.id))
            .limit(80)
        : managerIds.length
          ? await db
              .select({
                id: branchAuditsTable.id,
                managerEmployeeId: branchAuditsTable.managerEmployeeId,
                branchLocation: branchAuditsTable.branchLocation,
                managerName: branchAuditsTable.managerName,
                visitDate: branchAuditsTable.visitDate,
                visitName: branchAuditsTable.visitName,
                scorePercent: branchAuditsTable.scorePercent,
                yesCount: branchAuditsTable.yesCount,
                noCount: branchAuditsTable.noCount,
                answeredCount: branchAuditsTable.answeredCount,
                totalCount: branchAuditsTable.totalCount,
                status: branchAuditsTable.status,
                createdAt: branchAuditsTable.createdAt,
              })
              .from(branchAuditsTable)
              .where(inArray(branchAuditsTable.managerEmployeeId, managerIds))
              .orderBy(desc(branchAuditsTable.visitDate), desc(branchAuditsTable.id))
              .limit(40)
          : [];

    // Agar mudirlar employee daraxtidan kelmagan bo‘lsa — auditlardan to‘ldirish
    if (managers.length === 0 && auditRows.length) {
      const ids = [...new Set(auditRows.map((a) => a.managerEmployeeId))];
      const rows = await db
        .select()
        .from(employeesTable)
        .where(inArray(employeesTable.id, ids))
        .orderBy(asc(employeesTable.fullName));
      managers = rows.map(mapOrgEmployee);
    }

    const mgrIds = managers.map((m) => m.id);

    const needRows =
      mgrIds.length > 0
        ? await db
            .select({
              id: branchNeedsTable.id,
              needType: branchNeedsTable.needType,
              branchLocation: branchNeedsTable.branchLocation,
              managerEmployeeId: branchNeedsTable.managerEmployeeId,
              note: branchNeedsTable.note,
              status: branchNeedsTable.status,
              taskId: branchNeedsTable.taskId,
              createdAt: branchNeedsTable.createdAt,
              confirmedAt: branchNeedsTable.confirmedAt,
              completedAt: branchNeedsTable.completedAt,
              verifiedAt: branchNeedsTable.verifiedAt,
            })
            .from(branchNeedsTable)
            .where(inArray(branchNeedsTable.managerEmployeeId, mgrIds))
            .orderBy(desc(branchNeedsTable.updatedAt))
            .limit(100)
        : [];

    const mudirUserIds = managers.map((m) => m.userId).filter((id): id is number => id != null);
    const networkTaskRows =
      mudirUserIds.length > 0
        ? await db
            .select(TASK_SELECT)
            .from(tasksTable)
            .where(
              and(eq(tasksTable.assigneeKind, "user"), inArray(tasksTable.assigneeId, mudirUserIds)),
            )
            .orderBy(desc(tasksTable.updatedAt))
            .limit(80)
        : [];

    const nameByUser = new Map<number, string>();
    for (const m of managers) {
      if (m.userId) nameByUser.set(m.userId, m.fullName);
    }
    if (mudirUserIds.length) {
      const creators = [
        ...new Set(networkTaskRows.map((t) => t.createdById).filter((id) => !nameByUser.has(id))),
      ];
      if (creators.length) {
        const users = await db
          .select({ id: usersTable.id, fullName: usersTable.fullName })
          .from(usersTable)
          .where(inArray(usersTable.id, creators));
        for (const u of users) nameByUser.set(u.id, u.fullName);
      }
    }

    const staffByMgr = new Map<number, number>();
    for (const s of managedStaff) {
      if (s.reportsToId != null) {
        staffByMgr.set(s.reportsToId, (staffByMgr.get(s.reportsToId) ?? 0) + 1);
      }
    }

    const latestAuditByMgr = new Map<number, (typeof auditRows)[number]>();
    const auditsCountByMgr = new Map<number, number>();
    for (const a of auditRows) {
      auditsCountByMgr.set(a.managerEmployeeId, (auditsCountByMgr.get(a.managerEmployeeId) ?? 0) + 1);
      if (!latestAuditByMgr.has(a.managerEmployeeId)) {
        latestAuditByMgr.set(a.managerEmployeeId, a);
      }
    }

    const needsOpenByMgr = new Map<number, number>();
    const needsTotalByMgr = new Map<number, number>();
    for (const n of needRows) {
      if (n.managerEmployeeId == null) continue;
      needsTotalByMgr.set(
        n.managerEmployeeId,
        (needsTotalByMgr.get(n.managerEmployeeId) ?? 0) + 1,
      );
      if (!["verified", "closed"].includes(n.status)) {
        needsOpenByMgr.set(
          n.managerEmployeeId,
          (needsOpenByMgr.get(n.managerEmployeeId) ?? 0) + 1,
        );
      }
    }

    const tasksOpenByUser = new Map<number, number>();
    const tasksDoneByUser = new Map<number, number>();
    for (const t of networkTaskRows) {
      if (["done", "verified"].includes(t.status)) {
        tasksDoneByUser.set(t.assigneeId, (tasksDoneByUser.get(t.assigneeId) ?? 0) + 1);
      } else if (t.status !== "cancelled") {
        tasksOpenByUser.set(t.assigneeId, (tasksOpenByUser.get(t.assigneeId) ?? 0) + 1);
      }
    }

    const branches = managers.map((m) => {
      const latest = latestAuditByMgr.get(m.id) ?? null;
      return {
        managerEmployeeId: m.id,
        managerName: m.fullName,
        location: m.location,
        orgRoleLabel: m.orgRoleLabel,
        employmentStatus: m.employmentStatus,
        employmentStatusLabel: m.employmentStatusLabel,
        shiftDisplay: m.shiftDisplay,
        userId: m.userId,
        staffCount: staffByMgr.get(m.id) ?? 0,
        auditsCount: auditsCountByMgr.get(m.id) ?? 0,
        needsOpen: needsOpenByMgr.get(m.id) ?? 0,
        needsTotal: needsTotalByMgr.get(m.id) ?? 0,
        tasksOpen: m.userId ? tasksOpenByUser.get(m.userId) ?? 0 : 0,
        tasksDone: m.userId ? tasksDoneByUser.get(m.userId) ?? 0 : 0,
        latestAudit: latest
          ? {
              id: latest.id,
              visitDate: latest.visitDate,
              visitName: latest.visitName,
              scorePercent: latest.scorePercent,
              yesCount: latest.yesCount,
              noCount: latest.noCount,
              totalCount: latest.totalCount,
              status: latest.status,
            }
          : null,
      };
    });

    // Auditda bor, lekin managers ro‘yxatida yo‘q filiallar
    for (const a of auditRows) {
      if (branches.some((b) => b.managerEmployeeId === a.managerEmployeeId)) continue;
      branches.push({
        managerEmployeeId: a.managerEmployeeId,
        managerName: a.managerName || "Mudir",
        location: a.branchLocation,
        orgRoleLabel: "Filial mudiri",
        employmentStatus: "working",
        employmentStatusLabel: "—",
        shiftDisplay: "—",
        userId: null,
        staffCount: 0,
        auditsCount: auditsCountByMgr.get(a.managerEmployeeId) ?? 0,
        needsOpen: needsOpenByMgr.get(a.managerEmployeeId) ?? 0,
        needsTotal: needsTotalByMgr.get(a.managerEmployeeId) ?? 0,
        tasksOpen: 0,
        tasksDone: 0,
        latestAudit: {
          id: a.id,
          visitDate: a.visitDate,
          visitName: a.visitName,
          scorePercent: a.scorePercent,
          yesCount: a.yesCount,
          noCount: a.noCount,
          totalCount: a.totalCount,
          status: a.status,
        },
      });
    }

    const audits = auditRows.map((a) => ({
      id: a.id,
      managerEmployeeId: a.managerEmployeeId,
      branchLocation: a.branchLocation,
      managerName: a.managerName,
      visitDate: a.visitDate,
      visitName: a.visitName,
      scorePercent: a.scorePercent,
      yesCount: a.yesCount,
      noCount: a.noCount,
      answeredCount: a.answeredCount,
      totalCount: a.totalCount,
      status: a.status,
      createdAt: safeIso(a.createdAt),
    }));

    const mgrNameById = new Map(managers.map((m) => [m.id, m.fullName]));
    const needs = needRows.map((n) => ({
      id: n.id,
      needType: n.needType,
      branchLocation: n.branchLocation,
      managerEmployeeId: n.managerEmployeeId,
      managerName: n.managerEmployeeId ? mgrNameById.get(n.managerEmployeeId) ?? null : null,
      note: n.note,
      status: n.status,
      statusLabel: NEED_STATUS_UZ[n.status] || n.status,
      taskId: n.taskId,
      createdAt: safeIso(n.createdAt),
      confirmedAt: safeIso(n.confirmedAt),
      completedAt: safeIso(n.completedAt),
      verifiedAt: safeIso(n.verifiedAt),
    }));

    const networkTasks = networkTaskRows.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      statusLabel: TASK_STATUS_UZ[t.status] || t.status,
      priority: t.priority,
      dueAt: safeIso(t.dueAt),
      assigneeId: t.assigneeId,
      assigneeName: nameByUser.get(t.assigneeId) ?? "—",
      createdByName: nameByUser.get(t.createdById) ?? "—",
      completionNote: t.completionNote,
      completedAt: safeIso(t.completedAt),
      createdAt: safeIso(t.createdAt),
    }));

    const scored = audits.filter((a) => a.totalCount > 0);
    const auditsAvgScore =
      scored.length > 0
        ? Math.round(scored.reduce((s, a) => s + a.scorePercent, 0) / scored.length)
        : null;

    return {
      branches,
      audits,
      needs,
      networkTasks,
      summary: {
        branchesCount: branches.length,
        auditsCount: audits.length,
        auditsAvgScore,
        needsOpen: needs.filter((n) => !["verified", "closed"].includes(n.status)).length,
        needsTotal: needs.length,
        networkTasksOpen: networkTasks.filter(
          (t) => !["done", "verified", "cancelled"].includes(t.status),
        ).length,
        networkTasksDone: networkTasks.filter((t) =>
          ["done", "verified"].includes(t.status),
        ).length,
      },
    };
  } catch (err) {
    console.error("kuzatuv coordinator ops error:", err);
    return empty;
  }
}

/** Barcha faol foydalanuvchilar — ism + lavozim bo‘yicha tanlash */
router.get("/kuzatuv/people", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!isHrOversight(req.userRole) && req.userRole !== "admin") {
    res.status(403).json({ error: "Faqat HR Direktor yoki HR Auditor ko‘ra oladi" });
    return;
  }

  const q = String(req.query.q ?? "").trim().toLowerCase();
  const roleFilter = String(req.query.role ?? "").trim();

  let people = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      login: usersTable.login,
      role: usersTable.role,
      status: usersTable.status,
      phone: usersTable.phone,
      departmentId: usersTable.departmentId,
      departmentName: departmentsTable.name,
    })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(eq(usersTable.status, "active"))
    .orderBy(asc(usersTable.fullName));

  if (roleFilter && roleFilter !== "all") {
    people = people.filter((p) => p.role === roleFilter);
  }
  if (q) {
    people = people.filter((p) => {
      const label = ROLE_LABEL_UZ[p.role] || p.role;
      return (
        p.fullName.toLowerCase().includes(q) ||
        (p.login || "").toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q) ||
        label.toLowerCase().includes(q) ||
        (p.departmentName || "").toLowerCase().includes(q)
      );
    });
  }

  const ids = people.map((p) => p.id);

  const taskCounts =
    ids.length > 0
      ? await db
          .select({
            assigneeId: tasksTable.assigneeId,
            status: tasksTable.status,
            count: sql<number>`count(*)::int`,
          })
          .from(tasksTable)
          .where(and(eq(tasksTable.assigneeKind, "user"), inArray(tasksTable.assigneeId, ids)))
          .groupBy(tasksTable.assigneeId, tasksTable.status)
      : [];

  const taskMap = new Map<number, { open: number; done: number }>();
  for (const row of taskCounts) {
    const cur = taskMap.get(row.assigneeId) ?? { open: 0, done: 0 };
    if (row.status === "done" || row.status === "verified") cur.done += row.count;
    else if (row.status !== "cancelled") cur.open += row.count;
    taskMap.set(row.assigneeId, cur);
  }

  res.json({
    people: people.map((p) => {
      const t = taskMap.get(p.id) ?? { open: 0, done: 0 };
      return {
        id: p.id,
        fullName: p.fullName,
        login: p.login,
        role: p.role,
        roleLabel: ROLE_LABEL_UZ[p.role] || p.role,
        phone: p.phone,
        departmentId: p.departmentId,
        departmentName: p.departmentName,
        tasksOpen: t.open,
        tasksDone: t.done,
      };
    }),
    roles: Object.entries(ROLE_LABEL_UZ).map(([value, label]) => ({ value, label })),
  });
});

router.get("/kuzatuv", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!isHrOversight(req.userRole) && req.userRole !== "admin") {
    res.status(403).json({ error: "Faqat HR Direktor yoki HR Auditor ko‘ra oladi" });
    return;
  }

  const full = isHrDirektor(req.userRole) || req.userRole === "admin";

  const recruiters = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      login: usersTable.login,
      status: usersTable.status,
    })
    .from(usersTable)
    .where(and(eq(usersTable.role, "recruiter"), eq(usersTable.status, "active")));

  const recruiterIds = recruiters.map((r) => r.id);

  const vacRows =
    recruiterIds.length > 0
      ? await db
          .select({
            recruiterId: vacanciesTable.recruiterId,
            status: vacanciesTable.status,
            count: sql<number>`count(*)::int`,
          })
          .from(vacanciesTable)
          .where(inArray(vacanciesTable.recruiterId, recruiterIds))
          .groupBy(vacanciesTable.recruiterId, vacanciesTable.status)
      : [];

  const candRows =
    recruiterIds.length > 0
      ? await db
          .select({
            recruiterId: candidatesTable.recruiterId,
            status: candidatesTable.status,
            count: sql<number>`count(*)::int`,
          })
          .from(candidatesTable)
          .where(inArray(candidatesTable.recruiterId, recruiterIds))
          .groupBy(candidatesTable.recruiterId, candidatesTable.status)
      : [];

  const phoneRows =
    recruiterIds.length > 0
      ? await db
          .select({
            recruiterId: phoneInterviewsTable.recruiterId,
            count: sql<number>`count(*)::int`,
          })
          .from(phoneInterviewsTable)
          .where(inArray(phoneInterviewsTable.recruiterId, recruiterIds))
          .groupBy(phoneInterviewsTable.recruiterId)
      : [];

  const offlineByHr =
    recruiterIds.length > 0
      ? await db
          .select({
            hrId: offlineInterviewsTable.hrId,
            count: sql<number>`count(*)::int`,
          })
          .from(offlineInterviewsTable)
          .where(inArray(offlineInterviewsTable.hrId, recruiterIds))
          .groupBy(offlineInterviewsTable.hrId)
      : [];

  const tasksByAssignee =
    recruiterIds.length > 0
      ? await db
          .select({
            assigneeId: tasksTable.assigneeId,
            status: tasksTable.status,
            count: sql<number>`count(*)::int`,
          })
          .from(tasksTable)
          .where(
            and(
              eq(tasksTable.assigneeKind, "user"),
              inArray(tasksTable.assigneeId, recruiterIds),
            ),
          )
          .groupBy(tasksTable.assigneeId, tasksTable.status)
      : [];

  const vacMap = new Map<number, { total: number; published: number; closed: number }>();
  for (const row of vacRows) {
    if (row.recruiterId == null) continue;
    const cur = vacMap.get(row.recruiterId) ?? { total: 0, published: 0, closed: 0 };
    cur.total += row.count;
    if (row.status === "published") cur.published += row.count;
    if (row.status === "closed") cur.closed += row.count;
    vacMap.set(row.recruiterId, cur);
  }

  const candMap = new Map<
    number,
    { active: number; hired: number; rejected: number; total: number }
  >();
  for (const row of candRows) {
    if (row.recruiterId == null) continue;
    const cur = candMap.get(row.recruiterId) ?? {
      active: 0,
      hired: 0,
      rejected: 0,
      total: 0,
    };
    cur.total += row.count;
    if (row.status === "active") cur.active += row.count;
    if (row.status === "hired") cur.hired += row.count;
    if (row.status === "rejected") cur.rejected += row.count;
    candMap.set(row.recruiterId, cur);
  }

  const phoneMap = new Map(phoneRows.map((r) => [r.recruiterId ?? 0, r.count]));
  const offlineMap = new Map(offlineByHr.map((r) => [r.hrId ?? 0, r.count]));

  const taskMap = new Map<number, { open: number; done: number; total: number }>();
  for (const row of tasksByAssignee) {
    const cur = taskMap.get(row.assigneeId) ?? { open: 0, done: 0, total: 0 };
    cur.total += row.count;
    if (row.status === "done" || row.status === "verified") cur.done += row.count;
    else if (row.status !== "cancelled") cur.open += row.count;
    taskMap.set(row.assigneeId, cur);
  }

  const recruiterStats = recruiters.map((r) => {
    const vac = vacMap.get(r.id) ?? { total: 0, published: 0, closed: 0 };
    const cand = candMap.get(r.id) ?? { active: 0, hired: 0, rejected: 0, total: 0 };
    const tasks = taskMap.get(r.id) ?? { open: 0, done: 0, total: 0 };
    const base = {
      id: r.id,
      fullName: r.fullName,
      vacanciesTotal: vac.total,
      vacanciesPublished: vac.published,
      candidatesActive: cand.active,
      candidatesHired: cand.hired,
      phoneInterviews: phoneMap.get(r.id) ?? 0,
      tasksOpen: tasks.open,
      tasksDone: tasks.done,
    };
    if (!full) return base;
    return {
      ...base,
      login: r.login,
      vacanciesClosed: vac.closed,
      candidatesRejected: cand.rejected,
      candidatesTotal: cand.total,
      offlineInterviews: offlineMap.get(r.id) ?? 0,
      tasksTotal: tasks.total,
    };
  });

  const [openReqs] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(requestsTable)
    .where(sql`status NOT IN ('closed')`);

  const [activeVacs] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vacanciesTable)
    .where(eq(vacanciesTable.status, "published"));

  const [activeCands] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(candidatesTable)
    .where(eq(candidatesTable.status, "active"));

  const [hiredCands] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(candidatesTable)
    .where(eq(candidatesTable.status, "hired"));

  const [phoneTotal] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(phoneInterviewsTable);

  const [onlineTotal] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(onlineInterviewsTable);

  const [offlineTotal] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(offlineInterviewsTable);

  const [tasksOpen] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasksTable)
    .where(sql`status NOT IN ('done', 'verified', 'cancelled')`);

  const [tasksDone] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasksTable)
    .where(sql`status IN ('done', 'verified')`);

  const taskRows = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      description: tasksTable.description,
      status: tasksTable.status,
      priority: tasksTable.priority,
      dueAt: tasksTable.dueAt,
      assigneeKind: tasksTable.assigneeKind,
      assigneeId: tasksTable.assigneeId,
      createdById: tasksTable.createdById,
      completionNote: tasksTable.completionNote,
      completedAt: tasksTable.completedAt,
      acceptedAt: tasksTable.acceptedAt,
      createdAt: tasksTable.createdAt,
      updatedAt: tasksTable.updatedAt,
    })
    .from(tasksTable)
    .orderBy(desc(tasksTable.updatedAt))
    .limit(full ? 80 : 25);

  const userIds = new Set<number>();
  for (const t of taskRows) {
    userIds.add(t.createdById);
    if (t.assigneeKind === "user") userIds.add(t.assigneeId);
  }
  const idList = [...userIds];
  const userNameRows =
    idList.length > 0
      ? await db
          .select({ id: usersTable.id, fullName: usersTable.fullName })
          .from(usersTable)
          .where(inArray(usersTable.id, idList))
      : [];
  const nameById = new Map(userNameRows.map((u) => [u.id, u.fullName]));

  const empIds = [
    ...new Set(
      taskRows.filter((t) => t.assigneeKind === "employee").map((t) => t.assigneeId),
    ),
  ];
  const empRows =
    empIds.length > 0
      ? await db
          .select({ id: employeesTable.id, fullName: employeesTable.fullName })
          .from(employeesTable)
          .where(inArray(employeesTable.id, empIds))
      : [];
  const empNameById = new Map(empRows.map((e) => [e.id, e.fullName]));

  const tasks = taskRows.map((t) => {
    const assigneeName =
      t.assigneeKind === "employee"
        ? empNameById.get(t.assigneeId) ?? "—"
        : nameById.get(t.assigneeId) ?? "—";
    const base = {
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
      assigneeId: t.assigneeKind === "user" ? t.assigneeId : null,
      assigneeName,
      assigneeKind: t.assigneeKind,
      createdById: t.createdById,
      createdByName: nameById.get(t.createdById) ?? "—",
      updatedAt: t.updatedAt.toISOString(),
    };
    if (!full) return base;
    return {
      ...base,
      description: t.description,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      completionNote: t.completionNote,
      createdAt: t.createdAt.toISOString(),
    };
  });

  const pipeline =
    full
      ? await db
          .select({
            stage: candidatesTable.stage,
            count: sql<number>`count(*)::int`,
          })
          .from(candidatesTable)
          .where(eq(candidatesTable.status, "active"))
          .groupBy(candidatesTable.stage)
      : [];

  res.json({
    level: full ? "full" : "summary",
    summary: {
      openRequests: openReqs?.count ?? 0,
      activeVacancies: activeVacs?.count ?? 0,
      activeCandidates: activeCands?.count ?? 0,
      hiredCandidates: hiredCands?.count ?? 0,
      phoneInterviews: phoneTotal?.count ?? 0,
      onlineInterviews: full ? (onlineTotal?.count ?? 0) : undefined,
      offlineInterviews: full ? (offlineTotal?.count ?? 0) : undefined,
      tasksOpen: tasksOpen?.count ?? 0,
      tasksDone: tasksDone?.count ?? 0,
      recruitersCount: recruiters.length,
    },
    recruiters: recruiterStats.sort(
      (a, b) => b.vacanciesPublished + b.phoneInterviews - (a.vacanciesPublished + a.phoneInterviews),
    ),
    tasks,
    pipeline: full
      ? pipeline.map((p) => ({ stage: p.stage || "noma'lum", count: p.count }))
      : undefined,
  });
});

const VAC_STATUS: Record<string, string> = {
  draft: "Qoralama",
  published: "Faol",
  closed: "Yopilgan / Bajarildi",
};
const CAND_STATUS: Record<string, string> = {
  active: "Faol",
  hired: "Ishga olingan",
  rejected: "Rad etilgan",
};
const STAGE_UZ: Record<string, string> = {
  phone_interview: "Tanishuv",
  online_interview: "Onlayn suhbat",
  preboarding: "Pre-boarding",
  offline_interview: "Offline suhbat",
  final_decision: "Yakuniy qaror",
  offer: "Job offer",
  documents: "Hujjatlar",
  internship: "Stajirovka",
  hired: "Ishga qabul",
};
const TASK_STATUS: Record<string, string> = {
  todo: "Yangi",
  in_progress: "Jarayonda",
  done: "Bajarildi",
  verified: "Tasdiqlangan",
  cancelled: "Bekor",
};
const PHONE_STATUS: Record<string, string> = {
  pending: "Kutilmoqda",
  suitable: "Mos",
  not_suitable: "Mos emas",
};

router.get("/kuzatuv/person/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  try {
  if (!isHrOversight(req.userRole) && req.userRole !== "admin") {
    res.status(403).json({ error: "Faqat HR Direktor yoki HR Auditor ko‘ra oladi" });
    return;
  }

  const full = isHrDirektor(req.userRole) || req.userRole === "admin";
  const personId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (!personId || Number.isNaN(personId)) {
    res.status(400).json({ error: "Noto‘g‘ri ID" });
    return;
  }

  let person: {
    id: number;
    fullName: string;
    login: string;
    role: string;
    status: string;
    phone: string | null;
    departmentId: number | null;
    departmentName: string | null;
  } | undefined;

  try {
    const rows = await db
      .select({
        id: usersTable.id,
        fullName: usersTable.fullName,
        login: usersTable.login,
        role: usersTable.role,
        status: usersTable.status,
        phone: usersTable.phone,
        departmentId: usersTable.departmentId,
        departmentName: departmentsTable.name,
      })
      .from(usersTable)
      .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
      .where(eq(usersTable.id, personId));
    person = rows[0];
  } catch (err) {
    console.error("kuzatuv person+dept join error, fallback:", err);
    const rows = await db
      .select({
        id: usersTable.id,
        fullName: usersTable.fullName,
        login: usersTable.login,
        role: usersTable.role,
        status: usersTable.status,
        phone: usersTable.phone,
      })
      .from(usersTable)
      .where(eq(usersTable.id, personId));
    const p0 = rows[0];
    if (p0) {
      person = { ...p0, departmentId: null, departmentName: null };
    }
  }

  if (!person) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return;
  }

  const { myEmployee, managedManagers, managedStaff, reportsTo } = await loadOrgTree(
    personId,
    person,
  );

  const managersInput =
    managedManagers.length > 0
      ? managedManagers
      : myEmployee && (myEmployee.orgRole === "manager" || person.role === "mudir")
        ? [mapOrgEmployee(myEmployee)]
        : [];

  const coordinatorOps = await loadCoordinatorOps(
    personId,
    person.role,
    managersInput,
    managedStaff,
  );

  // Agar daraxt bo‘sh, lekin ops mudirlarni topgan bo‘lsa — UI uchun to‘ldirish
  const managersForUi =
    managersInput.length > 0
      ? managersInput
      : coordinatorOps.branches.map((b) => ({
          id: b.managerEmployeeId as number,
          fullName: String(b.managerName),
          position: "Mudir",
          orgRole: "manager",
          orgRoleLabel: String(b.orgRoleLabel || "Filial mudiri"),
          location: (b.location as string | null) ?? null,
          employmentStatus: String(b.employmentStatus || "working"),
          employmentStatusLabel: String(b.employmentStatusLabel || "—"),
          shiftType: null,
          shiftLabel: null,
          shiftDisplay: String(b.shiftDisplay || "—"),
          userId: (b.userId as number | null) ?? null,
          hiredAt: null as string | null,
          reportsToId: null as number | null,
          createdAt: new Date(0).toISOString(),
        }));

  const vacancies = await db
    .select({
      id: vacanciesTable.id,
      title: vacanciesTable.title,
      status: vacanciesTable.status,
      location: vacanciesTable.location,
      deadline: vacanciesTable.deadline,
      publishedAt: vacanciesTable.publishedAt,
      assignedAt: vacanciesTable.assignedAt,
      acceptedAt: vacanciesTable.acceptedAt,
      createdAt: vacanciesTable.createdAt,
    })
    .from(vacanciesTable)
    .where(eq(vacanciesTable.recruiterId, personId))
    .orderBy(desc(vacanciesTable.updatedAt));

  const candidates = await db
    .select({
      id: candidatesTable.id,
      fullName: candidatesTable.fullName,
      phone: candidatesTable.phone,
      stage: candidatesTable.stage,
      status: candidatesTable.status,
      vacancyId: candidatesTable.vacancyId,
      createdAt: candidatesTable.createdAt,
      updatedAt: candidatesTable.updatedAt,
    })
    .from(candidatesTable)
    .where(eq(candidatesTable.recruiterId, personId))
    .orderBy(desc(candidatesTable.updatedAt));

  const candIds = candidates.map((c) => c.id);
  const vacTitleById = new Map(vacancies.map((v) => [v.id, v.title]));
  // titles for candidates whose vacancy not in list
  const missingVacIds = [
    ...new Set(candidates.map((c) => c.vacancyId).filter((id) => !vacTitleById.has(id))),
  ];
  if (missingVacIds.length) {
    const extraVacs = await db
      .select({ id: vacanciesTable.id, title: vacanciesTable.title })
      .from(vacanciesTable)
      .where(inArray(vacanciesTable.id, missingVacIds));
    for (const v of extraVacs) vacTitleById.set(v.id, v.title);
  }

  const phoneInterviews = await db
    .select({
      id: phoneInterviewsTable.id,
      candidateId: phoneInterviewsTable.candidateId,
      interviewDate: phoneInterviewsTable.interviewDate,
      status: phoneInterviewsTable.status,
      notes: phoneInterviewsTable.notes,
      rejectReason: phoneInterviewsTable.rejectReason,
      createdAt: phoneInterviewsTable.createdAt,
    })
    .from(phoneInterviewsTable)
    .where(eq(phoneInterviewsTable.recruiterId, personId))
    .orderBy(desc(phoneInterviewsTable.updatedAt));

  const onlineInterviews =
    candIds.length > 0
      ? await db
          .select({
            id: onlineInterviewsTable.id,
            candidateId: onlineInterviewsTable.candidateId,
            interviewDate: onlineInterviewsTable.interviewDate,
            score: onlineInterviewsTable.score,
            experienceLevel: onlineInterviewsTable.experienceLevel,
            notes: onlineInterviewsTable.notes,
            createdAt: onlineInterviewsTable.createdAt,
          })
          .from(onlineInterviewsTable)
          .where(inArray(onlineInterviewsTable.candidateId, candIds))
          .orderBy(desc(onlineInterviewsTable.updatedAt))
      : [];

  const offlineAsHr = await db
    .select({
      id: offlineInterviewsTable.id,
      candidateId: offlineInterviewsTable.candidateId,
      scheduledDate: offlineInterviewsTable.scheduledDate,
      scheduledTime: offlineInterviewsTable.scheduledTime,
      attendanceStatus: offlineInterviewsTable.attendanceStatus,
      result: offlineInterviewsTable.result,
      hrScore: offlineInterviewsTable.hrScore,
      trainerScore: offlineInterviewsTable.trainerScore,
      resultNotes: offlineInterviewsTable.resultNotes,
      createdAt: offlineInterviewsTable.createdAt,
    })
    .from(offlineInterviewsTable)
    .where(eq(offlineInterviewsTable.hrId, personId))
    .orderBy(desc(offlineInterviewsTable.updatedAt));

  const offlineAsTrainer = await db
    .select({
      id: offlineInterviewsTable.id,
      candidateId: offlineInterviewsTable.candidateId,
      scheduledDate: offlineInterviewsTable.scheduledDate,
      scheduledTime: offlineInterviewsTable.scheduledTime,
      attendanceStatus: offlineInterviewsTable.attendanceStatus,
      result: offlineInterviewsTable.result,
      hrScore: offlineInterviewsTable.hrScore,
      trainerScore: offlineInterviewsTable.trainerScore,
      resultNotes: offlineInterviewsTable.resultNotes,
      createdAt: offlineInterviewsTable.createdAt,
    })
    .from(offlineInterviewsTable)
    .where(eq(offlineInterviewsTable.trainerId, personId))
    .orderBy(desc(offlineInterviewsTable.updatedAt));

  const nameByCand = new Map(candidates.map((c) => [c.id, c.fullName]));
  const extraCandIds = [
    ...new Set(
      [
        ...phoneInterviews.map((p) => p.candidateId),
        ...onlineInterviews.map((o) => o.candidateId),
        ...offlineAsHr.map((o) => o.candidateId),
        ...offlineAsTrainer.map((o) => o.candidateId),
      ].filter((id) => !nameByCand.has(id)),
    ),
  ];
  if (extraCandIds.length) {
    const extra = await db
      .select({ id: candidatesTable.id, fullName: candidatesTable.fullName })
      .from(candidatesTable)
      .where(inArray(candidatesTable.id, extraCandIds));
    for (const c of extra) nameByCand.set(c.id, c.fullName);
  }

  const assignedTasks = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      description: tasksTable.description,
      status: tasksTable.status,
      priority: tasksTable.priority,
      dueAt: tasksTable.dueAt,
      assigneeKind: tasksTable.assigneeKind,
      assigneeId: tasksTable.assigneeId,
      createdById: tasksTable.createdById,
      completionNote: tasksTable.completionNote,
      completedAt: tasksTable.completedAt,
      acceptedAt: tasksTable.acceptedAt,
      createdAt: tasksTable.createdAt,
      updatedAt: tasksTable.updatedAt,
    })
    .from(tasksTable)
    .where(and(eq(tasksTable.assigneeKind, "user"), eq(tasksTable.assigneeId, personId)))
    .orderBy(desc(tasksTable.updatedAt));

  const createdTasks = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      description: tasksTable.description,
      status: tasksTable.status,
      priority: tasksTable.priority,
      dueAt: tasksTable.dueAt,
      assigneeKind: tasksTable.assigneeKind,
      assigneeId: tasksTable.assigneeId,
      createdById: tasksTable.createdById,
      completionNote: tasksTable.completionNote,
      completedAt: tasksTable.completedAt,
      acceptedAt: tasksTable.acceptedAt,
      createdAt: tasksTable.createdAt,
      updatedAt: tasksTable.updatedAt,
    })
    .from(tasksTable)
    .where(eq(tasksTable.createdById, personId))
    .orderBy(desc(tasksTable.updatedAt));

  const taskUserIds = new Set<number>();
  for (const t of [...assignedTasks, ...createdTasks]) {
    taskUserIds.add(t.createdById);
    if (t.assigneeKind === "user") taskUserIds.add(t.assigneeId);
  }
  const taskUsers =
    taskUserIds.size > 0
      ? await db
          .select({ id: usersTable.id, fullName: usersTable.fullName })
          .from(usersTable)
          .where(inArray(usersTable.id, [...taskUserIds]))
      : [];
  const taskNameById = new Map(taskUsers.map((u) => [u.id, u.fullName]));

  const mapTask = (t: (typeof assignedTasks)[number]) => ({
    id: t.id,
    title: t.title,
    description: full ? t.description : undefined,
    status: t.status,
    statusLabel: TASK_STATUS[t.status] || t.status,
    priority: t.priority,
    dueAt: safeIso(t.dueAt),
    assigneeName: taskNameById.get(t.assigneeId) ?? "—",
    createdByName: taskNameById.get(t.createdById) ?? "—",
    completionNote: full ? t.completionNote : undefined,
    completedAt: safeIso(t.completedAt),
    acceptedAt: safeIso(t.acceptedAt),
    createdAt: safeIso(t.createdAt) ?? new Date(0).toISOString(),
    updatedAt: safeIso(t.updatedAt) ?? new Date(0).toISOString(),
  });

  const tasksAssigned = assignedTasks.map(mapTask);
  const tasksCreated = createdTasks
    .filter((t) => !(t.assigneeKind === "user" && t.assigneeId === personId))
    .map(mapTask);

  const summary = {
    vacanciesTotal: vacancies.length,
    vacanciesPublished: vacancies.filter((v) => v.status === "published").length,
    vacanciesClosed: vacancies.filter((v) => v.status === "closed").length,
    vacanciesDraft: vacancies.filter((v) => v.status === "draft").length,
    candidatesTotal: candidates.length,
    candidatesActive: candidates.filter((c) => c.status === "active").length,
    candidatesHired: candidates.filter((c) => c.status === "hired").length,
    candidatesRejected: candidates.filter((c) => c.status === "rejected").length,
    phoneInterviews: phoneInterviews.length,
    onlineInterviews: onlineInterviews.length,
    offlineInterviews: offlineAsHr.length + offlineAsTrainer.length,
    tasksAssignedOpen: assignedTasks.filter(
      (t) => !["done", "verified", "cancelled"].includes(t.status),
    ).length,
    tasksAssignedDone: assignedTasks.filter((t) =>
      ["done", "verified"].includes(t.status),
    ).length,
    tasksCreated: createdTasks.length,
    mudirsCount: managersForUi.length,
    staffCount: managedStaff.length,
    staffWorking: managedStaff.filter((s) => s.employmentStatus === "working").length,
    staffNeedHire: managedStaff.filter(
      (s) => s.employmentStatus === "need_hire" || s.employmentStatus === "searching",
    ).length,
    branchesCount: coordinatorOps.summary.branchesCount,
    auditsCount: coordinatorOps.summary.auditsCount,
    auditsAvgScore: coordinatorOps.summary.auditsAvgScore,
    needsOpen: coordinatorOps.summary.needsOpen,
    needsTotal: coordinatorOps.summary.needsTotal,
    networkTasksOpen: coordinatorOps.summary.networkTasksOpen,
    networkTasksDone: coordinatorOps.summary.networkTasksDone,
  };

  res.json({
    level: full ? "full" : "summary",
    person: {
      id: person.id,
      fullName: person.fullName,
      login: full ? person.login : undefined,
      role: person.role,
      roleLabel: ROLE_LABEL_UZ[person.role] || person.role,
      status: person.status,
      phone: full ? person.phone : undefined,
      departmentId: person.departmentId,
      departmentName: person.departmentName,
    },
    employee: myEmployee
      ? {
          ...mapOrgEmployee(myEmployee),
          departmentId: myEmployee.departmentId,
        }
      : null,
    reportsTo,
    coordinator:
      person.role === "mudir" || myEmployee?.orgRole === "manager"
        ? reportsTo
          ? {
              ...reportsTo,
              label: "Koordinator",
            }
          : null
        : undefined,
    managedManagers: managersForUi,
    managedStaff,
    branches: coordinatorOps.branches,
    audits: coordinatorOps.audits,
    needs: coordinatorOps.needs,
    networkTasks: coordinatorOps.networkTasks,
    summary,
    vacancies: vacancies.map((v) => ({
      id: v.id,
      title: v.title,
      status: v.status,
      statusLabel: VAC_STATUS[v.status] || v.status,
      location: v.location,
      deadline: safeIso(v.deadline),
      publishedAt: safeIso(v.publishedAt),
      assignedAt: safeIso(v.assignedAt),
      acceptedAt: safeIso(v.acceptedAt),
      createdAt: safeIso(v.createdAt) ?? new Date(0).toISOString(),
    })),
    candidates: candidates.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      phone: full ? c.phone : undefined,
      stage: c.stage,
      stageLabel: STAGE_UZ[c.stage] || c.stage,
      status: c.status,
      statusLabel: CAND_STATUS[c.status] || c.status,
      vacancyTitle: vacTitleById.get(c.vacancyId) ?? `Vakansiya #${c.vacancyId}`,
      vacancyId: c.vacancyId,
      createdAt: safeIso(c.createdAt) ?? new Date(0).toISOString(),
      updatedAt: safeIso(c.updatedAt) ?? new Date(0).toISOString(),
    })),
    phoneInterviews: phoneInterviews.map((p) => ({
      id: p.id,
      candidateName: nameByCand.get(p.candidateId) ?? `Nomzod #${p.candidateId}`,
      candidateId: p.candidateId,
      interviewDate: p.interviewDate,
      status: p.status,
      statusLabel: PHONE_STATUS[p.status] || p.status,
      notes: full ? p.notes : undefined,
      rejectReason: full ? p.rejectReason : undefined,
      createdAt: safeIso(p.createdAt) ?? new Date(0).toISOString(),
    })),
    onlineInterviews: onlineInterviews.map((o) => ({
      id: o.id,
      candidateName: nameByCand.get(o.candidateId) ?? `Nomzod #${o.candidateId}`,
      candidateId: o.candidateId,
      interviewDate: o.interviewDate,
      score: o.score,
      experienceLevel: o.experienceLevel,
      notes: full ? o.notes : undefined,
      createdAt: safeIso(o.createdAt) ?? new Date(0).toISOString(),
    })),
    offlineInterviews: [
      ...offlineAsHr.map((o) => ({
        id: o.id,
        roleInInterview: "hr" as const,
        candidateName: nameByCand.get(o.candidateId) ?? `Nomzod #${o.candidateId}`,
        candidateId: o.candidateId,
        scheduledDate: o.scheduledDate,
        scheduledTime: o.scheduledTime,
        attendanceStatus: o.attendanceStatus,
        result: o.result,
        hrScore: o.hrScore,
        trainerScore: full ? o.trainerScore : undefined,
        resultNotes: full ? o.resultNotes : undefined,
        createdAt: safeIso(o.createdAt) ?? new Date(0).toISOString(),
      })),
      ...offlineAsTrainer.map((o) => ({
        id: o.id,
        roleInInterview: "trainer" as const,
        candidateName: nameByCand.get(o.candidateId) ?? `Nomzod #${o.candidateId}`,
        candidateId: o.candidateId,
        scheduledDate: o.scheduledDate,
        scheduledTime: o.scheduledTime,
        attendanceStatus: o.attendanceStatus,
        result: o.result,
        hrScore: full ? o.hrScore : undefined,
        trainerScore: o.trainerScore,
        resultNotes: full ? o.resultNotes : undefined,
        createdAt: safeIso(o.createdAt) ?? new Date(0).toISOString(),
      })),
    ],
    tasksAssigned,
    tasksCreated,
  });
  } catch (err) {
    console.error("kuzatuv/person error:", err);
    if (!res.headersSent) {
      res.status(503).json({ error: "Server xatosi — shu odam ma'lumoti yuklanmadi" });
    }
  }
});

export default router;
