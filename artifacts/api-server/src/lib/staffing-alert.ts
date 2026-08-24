import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  staffingAlertsTable,
  employeesTable,
  vacanciesTable,
  candidatesTable,
} from "@workspace/db";
import { notifyByRoles } from "./notify";
import { HR_ROLES } from "./roles";

const EMP_STATUS_LABEL: Record<string, string> = {
  new: "Yangi",
  dismissed: "Bo'shatilgan",
  need_hire: "Xodim kerak",
  searching: "Qidirilmoqda",
  working: "Ishlamoqda",
  no_manager: "Mudir yo‘q",
  closed: "Yopilgan",
};

/** Xodim holati o‘zgarganda ogohlantirish yaratish/yopish */
export async function syncStaffingAlertForEmployee(opts: {
  employee: typeof employeesTable.$inferSelect;
  previousStatus: string | null | undefined;
  newStatus: string;
  userId: number | null | undefined;
}): Promise<void> {
  const { employee, previousStatus, newStatus, userId } = opts;
  if (previousStatus === newStatus) return;

  // Mudir yo‘q — faqat belgi, yollash pipeline ochilmasin
  if (newStatus === "no_manager") return;
  // Filial yopilgan — ro‘yxatda qoladi, yollash ochilmaydi
  if (newStatus === "closed") {
    await db
      .update(staffingAlertsTable)
      .set({ workflowStatus: "cancelled" })
      .where(
        and(eq(staffingAlertsTable.employeeId, employee.id), eq(staffingAlertsTable.workflowStatus, "pending")),
      );
    return;
  }

  if (newStatus === "working") {
    await db
      .update(staffingAlertsTable)
      .set({ workflowStatus: "cancelled" })
      .where(
        and(eq(staffingAlertsTable.employeeId, employee.id), eq(staffingAlertsTable.workflowStatus, "pending")),
      );
    return;
  }

  // Qidirilmoqda — faqat mavjud ochiq alertni yangilash, yangi ogohlantirish ochilmasin
  if (newStatus === "searching") {
    await db
      .update(staffingAlertsTable)
      .set({ employmentStatus: "searching" })
      .where(
        and(
          eq(staffingAlertsTable.employeeId, employee.id),
          inArray(staffingAlertsTable.workflowStatus, ["pending", "confirmed"]),
        ),
      );
    return;
  }

  const [pending] = await db
    .select()
    .from(staffingAlertsTable)
    .where(
      and(eq(staffingAlertsTable.employeeId, employee.id), eq(staffingAlertsTable.workflowStatus, "pending")),
    )
    .limit(1);

  let managerId = employee.orgRole === "manager" ? employee.id : employee.reportsToId;
  let branch = employee.location;
  if (!branch && managerId) {
    const [mgr] = await db.select().from(employeesTable).where(eq(employeesTable.id, managerId));
    branch = mgr?.location ?? null;
  }

  const payload = {
    employeeId: employee.id,
    managerEmployeeId: managerId ?? null,
    branchLocation: branch,
    shiftType: employee.shiftType,
    shiftLabel: employee.shiftLabel,
    employmentStatus: newStatus,
    createdById: userId ?? null,
  };

  if (pending) {
    await db.update(staffingAlertsTable).set(payload).where(eq(staffingAlertsTable.id, pending.id));
  } else {
    await db.insert(staffingAlertsTable).values({
      ...payload,
      workflowStatus: "pending",
    });
  }

  const statusLabel = EMP_STATUS_LABEL[newStatus] ?? newStatus;
  await notifyByRoles({
    roles: ["koordinator", "admin"],
    text: `Ogohlantirish: ${branch || "Filial"} — ${employee.fullName} (${statusLabel})`,
    type: "stage_change",
    linkUrl: "/pharmacy-network",
  });
}

/** Rekruter eʼlonni qabul qilgach — Xodim kerak → Qidirilmoqda */
export async function markStaffingSearchingByRequestId(requestId: number): Promise<void> {
  const alerts = await db
    .select()
    .from(staffingAlertsTable)
    .where(
      and(
        eq(staffingAlertsTable.requestId, requestId),
        inArray(staffingAlertsTable.workflowStatus, ["pending", "confirmed"]),
      ),
    );

  for (const alert of alerts) {
    await db
      .update(staffingAlertsTable)
      .set({ employmentStatus: "searching", workflowStatus: "confirmed" })
      .where(eq(staffingAlertsTable.id, alert.id));

    await db
      .update(employeesTable)
      .set({ employmentStatus: "searching" })
      .where(eq(employeesTable.id, alert.employeeId));
  }

  if (alerts.length) {
    const first = alerts[0];
    await notifyByRoles({
      roles: ["koordinator", "mudir", ...HR_ROLES, "admin", "director"],
      text: `Qidirilmoqda: ${first.branchLocation || "Filial"} — eʼlon faol`,
      type: "stage_change",
      linkUrl: "/pharmacy-network",
    });
  }
}

/** Ishga qabul qilinganda — Qidirilmoqda yopiladi, xodim Ishlamoqda */
export async function resolveStaffingHireByVacancyId(vacancyId: number): Promise<void> {
  const [vac] = await db.select().from(vacanciesTable).where(eq(vacanciesTable.id, vacancyId));
  if (!vac?.requestId) return;

  const alerts = await db
    .select()
    .from(staffingAlertsTable)
    .where(
      and(
        eq(staffingAlertsTable.requestId, vac.requestId),
        inArray(staffingAlertsTable.workflowStatus, ["pending", "confirmed"]),
      ),
    );

  for (const alert of alerts) {
    await db
      .update(staffingAlertsTable)
      .set({ workflowStatus: "closed", employmentStatus: "working" })
      .where(eq(staffingAlertsTable.id, alert.id));

    await db
      .update(employeesTable)
      .set({ employmentStatus: "working" })
      .where(eq(employeesTable.id, alert.employeeId));
  }
}

export async function resolveStaffingHireByCandidateId(candidateId: number): Promise<void> {
  const [cand] = await db
    .select({ vacancyId: candidatesTable.vacancyId })
    .from(candidatesTable)
    .where(eq(candidatesTable.id, candidateId));
  if (cand?.vacancyId) {
    await resolveStaffingHireByVacancyId(cand.vacancyId);
  }
}
