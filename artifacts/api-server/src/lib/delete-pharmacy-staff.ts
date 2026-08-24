import { and, eq, inArray, or } from "drizzle-orm";
import {
  db,
  usersTable,
  employeesTable,
  attendanceRecordsTable,
  internshipsTable,
  staffingAlertsTable,
  branchAuditsTable,
  branchNeedsTable,
  faceProfilesTable,
  webauthnCredentialsTable,
  webauthnChallengesTable,
  kirishProgressTable,
  notificationsTable,
  userGoalsTable,
  goalDailyLogsTable,
  remindersTable,
  reminderEventsTable,
  telegramAuthTokensTable,
  chatMembersTable,
  chatMessagesTable,
  departmentsTable,
  tasksTable,
} from "@workspace/db";

const STAFF_ORG = new Set(["pharmacist", "intern", "supervisor", "manager"]);

export function canHardDeletePharmacyNetwork(role?: string): boolean {
  return (
    role === "admin" ||
    role === "hr" ||
    role === "hr_menejer" ||
    role === "hr_direktor" ||
    role === "director"
  );
}

async function purgeUserSideEffects(userIds: number[]) {
  if (!userIds.length) return;

  await db.delete(faceProfilesTable).where(inArray(faceProfilesTable.userId, userIds));
  await db.delete(webauthnCredentialsTable).where(inArray(webauthnCredentialsTable.userId, userIds));
  await db.delete(webauthnChallengesTable).where(inArray(webauthnChallengesTable.userId, userIds));
  await db.delete(kirishProgressTable).where(inArray(kirishProgressTable.userId, userIds));
  await db.delete(notificationsTable).where(inArray(notificationsTable.userId, userIds));
  await db.delete(goalDailyLogsTable).where(inArray(goalDailyLogsTable.userId, userIds));
  await db.delete(userGoalsTable).where(inArray(userGoalsTable.userId, userIds));
  await db.delete(remindersTable).where(inArray(remindersTable.userId, userIds));
  await db.delete(telegramAuthTokensTable).where(inArray(telegramAuthTokensTable.userId, userIds));
  await db.delete(chatMembersTable).where(inArray(chatMembersTable.userId, userIds));
  await db.delete(chatMessagesTable).where(inArray(chatMessagesTable.senderId, userIds));

  await db
    .update(departmentsTable)
    .set({ headId: null })
    .where(inArray(departmentsTable.headId, userIds));

  await db
    .update(branchNeedsTable)
    .set({ assignedUserId: null })
    .where(inArray(branchNeedsTable.assignedUserId, userIds));

  await db
    .delete(tasksTable)
    .where(
      and(eq(tasksTable.assigneeKind, "user"), inArray(tasksTable.assigneeId, userIds)),
    );
}

async function purgeEmployeeSideEffects(employeeIds: number[]) {
  if (!employeeIds.length) return;

  await db
    .delete(attendanceRecordsTable)
    .where(inArray(attendanceRecordsTable.employeeId, employeeIds));
  await db.delete(internshipsTable).where(inArray(internshipsTable.employeeId, employeeIds));
  await db
    .delete(staffingAlertsTable)
    .where(
      or(
        inArray(staffingAlertsTable.employeeId, employeeIds),
        inArray(staffingAlertsTable.managerEmployeeId, employeeIds),
      ),
    );
  await db
    .delete(branchAuditsTable)
    .where(inArray(branchAuditsTable.managerEmployeeId, employeeIds));
  await db
    .delete(branchNeedsTable)
    .where(inArray(branchNeedsTable.managerEmployeeId, employeeIds));

  // Boshqalar shu mudirga bog‘langan bo‘lsa — bog‘lanishni uzamiz
  await db
    .update(employeesTable)
    .set({ reportsToId: null })
    .where(inArray(employeesTable.reportsToId, employeeIds));

  // employee assignee vazifalari
  await db
    .delete(tasksTable)
    .where(
      and(eq(tasksTable.assigneeKind, "employee"), inArray(tasksTable.assigneeId, employeeIds)),
    );
}

/**
 * Filial mudiri yoki xodimni butunlay o‘chiradi.
 * Mudir bo‘lsa — ostidagi barcha farmasevt/stajyorlar ham o‘chadi (filial).
 *
 * ID eski cache dan noto‘g‘ri kelishi mumkin — userId / fullName bilan ham qidiriladi.
 */
export async function hardDeletePharmacyEmployee(
  employeeId: number,
  opts?: { userId?: number | null; fullName?: string | null },
): Promise<{
  ok: true;
  deletedEmployees: number;
  deletedUsers: number;
  kind: "filial" | "staff";
  fullName: string;
} | { ok: false; status: number; error: string }> {
  const selectCols = {
    id: employeesTable.id,
    fullName: employeesTable.fullName,
    orgRole: employeesTable.orgRole,
    userId: employeesTable.userId,
  };

  let target:
    | {
        id: number;
        fullName: string;
        orgRole: string | null;
        userId: number | null;
      }
    | undefined;

  if (Number.isFinite(employeeId) && employeeId > 0) {
    const [byId] = await db
      .select(selectCols)
      .from(employeesTable)
      .where(eq(employeesTable.id, employeeId));
    target = byId;
  }

  const wantName = String(opts?.fullName || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  // Eski cache: UI userId yuborgan bo‘lishi mumkin
  if (!target && opts?.userId && Number.isFinite(opts.userId)) {
    const [byUser] = await db
      .select(selectCols)
      .from(employeesTable)
      .where(eq(employeesTable.userId, opts.userId));
    if (byUser) {
      if (!wantName || byUser.fullName.trim().replace(/\s+/g, " ").toLowerCase() === wantName) {
        target = byUser;
      }
    }
  }

  // Ism bo‘yicha (faqat aniq moslik)
  if (!target && wantName) {
    const byName = await db.select(selectCols).from(employeesTable);
    const matches = byName.filter(
      (r) =>
        STAFF_ORG.has(r.orgRole || "") &&
        r.fullName.trim().replace(/\s+/g, " ").toLowerCase() === wantName,
    );
    target =
      matches.find((r) => r.orgRole === "manager") ??
      matches[0];
  }

  if (!target) {
    return {
      ok: false,
      status: 404,
      error:
        "Xodim topilmadi — ro‘yxat eskirgan bo‘lishi mumkin. Sahifani yangilab qayta urinib ko‘ring",
    };
  }
  if (target.orgRole === "coordinator") {
    return { ok: false, status: 400, error: "Koordinatorni shu yo‘l bilan o‘chirib bo‘lmaydi" };
  }
  if (!STAFF_ORG.has(target.orgRole || "")) {
    return { ok: false, status: 400, error: "Faqat filial mudiri yoki filial xodimini o‘chirish mumkin" };
  }

  const toDelete: Array<{ id: number; userId: number | null }> = [];
  let kind: "filial" | "staff" = "staff";

  if (target.orgRole === "manager") {
    kind = "filial";
    const staff = await db
      .select({
        id: employeesTable.id,
        userId: employeesTable.userId,
      })
      .from(employeesTable)
      .where(eq(employeesTable.reportsToId, target.id));
    toDelete.push(...staff);
  }
  toDelete.push({ id: target.id, userId: target.userId });

  const empIds = [...new Set(toDelete.map((e) => e.id))];
  const userIds = [
    ...new Set(toDelete.map((e) => e.userId).filter((id): id is number => id != null)),
  ];

  if (userIds.length) {
    const rem = await db
      .select({ id: remindersTable.id })
      .from(remindersTable)
      .where(inArray(remindersTable.userId, userIds));
    const remIds = rem.map((r) => r.id);
    if (remIds.length) {
      await db.delete(reminderEventsTable).where(inArray(reminderEventsTable.reminderId, remIds));
    }
  }

  await purgeEmployeeSideEffects(empIds);
  await purgeUserSideEffects(userIds);

  await db.delete(employeesTable).where(inArray(employeesTable.id, empIds));
  if (userIds.length) {
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }

  return {
    ok: true,
    deletedEmployees: empIds.length,
    deletedUsers: userIds.length,
    kind,
    fullName: target.fullName,
  };
}
