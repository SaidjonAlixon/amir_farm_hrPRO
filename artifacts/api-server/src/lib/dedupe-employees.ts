import { eq, inArray, or, sql } from "drizzle-orm";
import {
  db,
  attendanceRecordsTable,
  branchAuditsTable,
  branchNeedsTable,
  employeesTable,
  faceProfilesTable,
  internshipsTable,
  payrollMonthsTable,
  settlementLinesTable,
  staffingAlertsTable,
  usersTable,
  departmentsTable,
} from "@workspace/db";

export function normalizePersonName(raw: string): string {
  return String(raw || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[ʼ'`ʻʹ]/g, "")
    .replace(/[^a-zа-яўқғҳ0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

const ROLE_SCORE: Record<string, number> = {
  coordinator: 50,
  manager: 40,
  supervisor: 20,
  pharmacist: 15,
  intern: 5,
};

function statusScore(st: string | null | undefined) {
  if (st === "working" || st === "new") return 30;
  if (st === "on_leave") return 8;
  if (st === "dismissed" || st === "closed") return -40;
  return 0;
}

export type DedupeRemoved = {
  id: number;
  fullName: string;
  reason: string;
  keptId: number;
};

export type DuplicateMember = {
  id: number;
  fullName: string;
  position: string;
  orgRole: string | null;
  employmentStatus: string;
  location: string | null;
  shiftType: string | null;
  shiftLabel: string | null;
  hiredAt: string;
  departmentId: number;
  departmentName: string | null;
  userId: number | null;
  userLogin: string | null;
  userPhone: string | null;
  userStatus: string | null;
  hasTelegram: boolean;
  hasFace: boolean;
  attendanceCount: number;
  usedSystem: boolean;
  score: number;
  suggestedKeep: boolean;
};

export type DuplicateGroup = {
  key: string;
  keepId: number;
  members: DuplicateMember[];
};

type ScoredEmp = {
  e: typeof employeesTable.$inferSelect;
  score: number;
  usedSystem: boolean;
  attendanceCount: number;
  hasFace: boolean;
  user: { id: number; status: string; telegramId: string | null; login: string; phone: string | null } | undefined;
};

async function loadScoredDuplicateGroups(): Promise<{ key: string; scored: ScoredEmp[]; deptName: Map<number, string> }[]> {
  const [emps, users, attRows, faces, depts] = await Promise.all([
    db.select().from(employeesTable),
    db
      .select({
        id: usersTable.id,
        status: usersTable.status,
        telegramId: usersTable.telegramId,
        login: usersTable.login,
        phone: usersTable.phone,
      })
      .from(usersTable),
    db
      .select({
        employeeId: attendanceRecordsTable.employeeId,
        n: sql<number>`count(*)::int`,
      })
      .from(attendanceRecordsTable)
      .groupBy(attendanceRecordsTable.employeeId),
    db.select({ userId: faceProfilesTable.userId }).from(faceProfilesTable).catch(() => [] as { userId: number }[]),
    db.select({ id: departmentsTable.id, name: departmentsTable.name }).from(departmentsTable).catch(() => []),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const attCount = new Map(attRows.map((r) => [r.employeeId, Number(r.n)]));
  const faceUsers = new Set((Array.isArray(faces) ? faces : []).map((r) => Number(r.userId)));
  const deptName = new Map((Array.isArray(depts) ? depts : []).map((d) => [d.id, d.name]));

  const buckets = new Map<string, typeof emps>();
  for (const e of emps) {
    const key = normalizePersonName(e.fullName);
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push(e);
    buckets.set(key, list);
  }

  const out: { key: string; scored: ScoredEmp[]; deptName: Map<number, string> }[] = [];
  for (const [key, list] of buckets) {
    if (list.length < 2) continue;
    const scored = list.map((e) => {
      const u = e.userId ? userById.get(e.userId) : undefined;
      const attendanceCount = attCount.get(e.id) ?? 0;
      const hasFace = e.userId != null && faceUsers.has(e.userId);
      const usedSystem = hasFace || attendanceCount > 0 || Boolean(u?.telegramId);
      const score =
        statusScore(e.employmentStatus) +
        (ROLE_SCORE[e.orgRole || ""] ?? 0) +
        (e.userId ? 8 : 0) +
        (u?.status === "active" ? 4 : 0) +
        (usedSystem ? 25 : 0) +
        Math.min(15, attendanceCount);
      return { e, score, usedSystem, attendanceCount, hasFace, user: u };
    });
    scored.sort((a, b) => b.score - a.score || a.e.id - b.e.id);
    out.push({ key, scored, deptName });
  }
  return out;
}

function reasonForLoser(loser: ScoredEmp): string {
  const unused = !loser.usedSystem;
  const notWorking = loser.e.employmentStatus !== "working" && loser.e.employmentStatus !== "new";
  if (unused) return "tizimga kirmagan dublikat";
  if (notWorking) return "ishlamayotgan dublikat";
  return "o‘xshash ism — pastroq ustuvorlik";
}

async function dropLoser(winner: ScoredEmp, loser: ScoredEmp): Promise<DedupeRemoved> {
  await mergeThenDeleteEmployee(winner.e.id, loser.e.id);
  if (loser.e.userId && loser.e.userId !== winner.e.userId && !loser.usedSystem) {
    const still = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(eq(employeesTable.userId, loser.e.userId))
      .limit(1);
    if (!still.length) {
      await db.update(usersTable).set({ status: "terminated" }).where(eq(usersTable.id, loser.e.userId));
    }
  }
  return {
    id: loser.e.id,
    fullName: loser.e.fullName,
    reason: reasonForLoser(loser),
    keptId: winner.e.id,
  };
}

export async function listDuplicateGroups(): Promise<DuplicateGroup[]> {
  const groups = await loadScoredDuplicateGroups();
  return groups.map(({ key, scored, deptName }) => {
    const keepId = scored[0]!.e.id;
    return {
      key,
      keepId,
      members: scored.map((s) => ({
        id: s.e.id,
        fullName: s.e.fullName,
        position: s.e.position,
        orgRole: s.e.orgRole,
        employmentStatus: s.e.employmentStatus,
        location: s.e.location,
        shiftType: s.e.shiftType,
        shiftLabel: s.e.shiftLabel,
        hiredAt: s.e.hiredAt,
        departmentId: s.e.departmentId,
        departmentName: deptName.get(s.e.departmentId) ?? null,
        userId: s.e.userId,
        userLogin: s.user?.login ?? null,
        userPhone: s.user?.phone ?? null,
        userStatus: s.user?.status ?? null,
        hasTelegram: Boolean(s.user?.telegramId),
        hasFace: s.hasFace,
        attendanceCount: s.attendanceCount,
        usedSystem: s.usedSystem,
        score: s.score,
        suggestedKeep: s.e.id === keepId,
      })),
    };
  });
}

export async function removeDuplicatePair(keepId: number, dropId: number): Promise<DedupeRemoved> {
  if (keepId === dropId) throw new Error("Bir xil qator");
  const groups = await loadScoredDuplicateGroups();
  const group = groups.find((g) => g.scored.some((s) => s.e.id === keepId) && g.scored.some((s) => s.e.id === dropId));
  if (!group) throw new Error("Bu ikki yozuv dublikat guruhida emas");
  const winner = group.scored.find((s) => s.e.id === keepId)!;
  const loser = group.scored.find((s) => s.e.id === dropId)!;
  return dropLoser(winner, loser);
}

export async function dedupeSimilarEmployees(): Promise<{
  kept: number;
  removed: DedupeRemoved[];
  groups: number;
}> {
  const groups = await loadScoredDuplicateGroups();
  const removed: DedupeRemoved[] = [];
  for (const g of groups) {
    const winner = g.scored[0]!;
    for (const loser of g.scored.slice(1)) {
      removed.push(await dropLoser(winner, loser));
    }
  }
  return { kept: groups.length, removed, groups: groups.length };
}

async function mergeThenDeleteEmployee(keepId: number, dropId: number) {
  await db.update(employeesTable).set({ reportsToId: keepId }).where(eq(employeesTable.reportsToId, dropId));
  await db.update(employeesTable).set({ mentorId: keepId }).where(eq(employeesTable.mentorId, dropId));
  await db
    .delete(staffingAlertsTable)
    .where(or(eq(staffingAlertsTable.employeeId, dropId), eq(staffingAlertsTable.managerEmployeeId, dropId)))
    .catch(() => undefined);
  await db
    .update(branchNeedsTable)
    .set({ managerEmployeeId: keepId })
    .where(eq(branchNeedsTable.managerEmployeeId, dropId))
    .catch(() => undefined);
  await db
    .update(branchAuditsTable)
    .set({ managerEmployeeId: keepId })
    .where(eq(branchAuditsTable.managerEmployeeId, dropId))
    .catch(() => undefined);
  await db
    .update(internshipsTable)
    .set({ trainerId: keepId })
    .where(eq(internshipsTable.trainerId, dropId))
    .catch(() => undefined);
  const keepIntern = await db
    .select({ id: internshipsTable.id })
    .from(internshipsTable)
    .where(eq(internshipsTable.employeeId, keepId))
    .limit(1)
    .catch(() => []);
  if (keepIntern.length) {
    await db.delete(internshipsTable).where(eq(internshipsTable.employeeId, dropId)).catch(() => undefined);
  } else {
    await db
      .update(internshipsTable)
      .set({ employeeId: keepId })
      .where(eq(internshipsTable.employeeId, dropId))
      .catch(() => undefined);
  }
  await db
    .update(payrollMonthsTable)
    .set({ employeeId: keepId })
    .where(eq(payrollMonthsTable.employeeId, dropId))
    .catch(() => undefined);
  await db
    .update(settlementLinesTable)
    .set({ employeeId: keepId })
    .where(eq(settlementLinesTable.employeeId, dropId))
    .catch(() => undefined);

  const keepDates = await db
    .select({ workDate: attendanceRecordsTable.workDate })
    .from(attendanceRecordsTable)
    .where(eq(attendanceRecordsTable.employeeId, keepId));
  const occupied = new Set(keepDates.map((r) => r.workDate));
  const dropAtt = await db
    .select({ id: attendanceRecordsTable.id, workDate: attendanceRecordsTable.workDate })
    .from(attendanceRecordsTable)
    .where(eq(attendanceRecordsTable.employeeId, dropId));
  const moveIds = dropAtt.filter((r) => !occupied.has(r.workDate)).map((r) => r.id);
  const delIds = dropAtt.filter((r) => occupied.has(r.workDate)).map((r) => r.id);
  if (moveIds.length) {
    await db.update(attendanceRecordsTable).set({ employeeId: keepId }).where(inArray(attendanceRecordsTable.id, moveIds));
  }
  if (delIds.length) {
    await db.delete(attendanceRecordsTable).where(inArray(attendanceRecordsTable.id, delIds));
  }

  try {
    await db.delete(employeesTable).where(eq(employeesTable.id, dropId));
  } catch {
    await db.update(employeesTable).set({ employmentStatus: "dismissed" }).where(eq(employeesTable.id, dropId));
  }
}
