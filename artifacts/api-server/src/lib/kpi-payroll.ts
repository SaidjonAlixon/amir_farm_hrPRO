import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import {
  db,
  attendanceRecordsTable,
  branchAuditsTable,
  employeesTable,
  workCalendarDaysTable,
  kpiSettingsTable,
  payrollMonthsTable,
  tasksTable,
  usersTable,
} from "@workspace/db";

export type KpiWeights = {
  attendance: number;
  tasks: number;
  checklist: number;
  workStartHm: string;
};

export type AttendanceDayDetail = {
  date: string;
  status: string;
  lateMinutes: number | null;
  counted: boolean;
  points: number;
  note: string;
};

export type TaskDetail = {
  id: number;
  title: string;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  points: number;
  label: string;
};

export type ChecklistDetail = {
  id: number;
  visitDate: string;
  visitName: string;
  percent: number;
  yesCount: number;
  totalCount: number;
};

export type PayrollCompute = {
  userId: number;
  employeeId: number | null;
  month: string;
  monthLabel: string;
  from: string;
  to: string;
  fullName: string;
  role: string;
  roleLabel: string;
  position: string | null;
  branch: string | null;
  fixedSalary: number;
  bonusPercent: number;
  attendance: {
    available: boolean;
    complete: boolean;
    percent: number;
    baseWeight: number;
    effectiveWeight: number;
    points: number;
    countedDays: number;
    expectedDays: number;
    closedDays: number;
    days: AttendanceDayDetail[];
  };
  tasks: {
    available: boolean;
    percent: number;
    baseWeight: number;
    effectiveWeight: number;
    points: number;
    total: number;
    items: TaskDetail[];
  };
  checklist: {
    available: boolean;
    percent: number;
    baseWeight: number;
    effectiveWeight: number;
    items: ChecklistDetail[];
  };
  kpiPercent: number;
  maxBonus: number;
  bonusAmount: number;
  totalAmount: number;
};

const MONTH_NAMES = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];

export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  director: "Direktor",
  moliya: "Moliyachi",
  hr: "HR",
  hr_direktor: "HR Direktor",
  hr_menejer: "HR Menejer",
  hr_auditor: "HR Auditor",
  recruiter: "Rekruter",
  trainer: "Trener",
  mentor: "Mentor",
  department_head: "Bo‘lim boshlig‘i",
  mudir: "Mudir",
  koordinator: "Koordinator",
  texnik: "Texnik",
  ombor: "Ombor",
  sb: "SB operatori",
  sb_boshliq: "SB bo‘limi boshlig‘i",
  farmasevt: "Farmasevt",
  stajyor: "Stajyor",
};

export function canManagePayroll(role?: string | null) {
  return role === "admin" || role === "director" || role === "moliya" || role === "hr_direktor";
}

export function canApprovePayroll(role?: string | null) {
  return role === "admin" || role === "director" || role === "moliya";
}

export function canEditKpiSettings(role?: string | null) {
  return role === "admin" || role === "hr_direktor" || role === "director" || role === "moliya";
}

export function currentMonthKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}

export function monthBounds(ym: string) {
  const raw = /^(\d{4})-(\d{2})$/.exec(ym || "") ? ym : currentMonthKey();
  const [y, m] = raw.split("-").map(Number);
  const from = `${raw}-01`;
  const lastDay = new Date(y!, m!, 0).getDate();
  const to = `${raw}-${String(lastDay).padStart(2, "0")}`;
  return { month: raw, from, to, monthLabel: `${MONTH_NAMES[m! - 1]} ${y}` };
}

export function tashkentToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function nextIsoDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(y!, m! - 1, d! + 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

export function defaultIsWorkDay(iso: string): boolean {
  return new Date(`${iso}T12:00:00+05:00`).getDay() !== 0;
}

export function eachDate(from: string, to: string): string[] {
  const days: string[] = [];
  if (!from || !to || from > to) return days;
  let cur = from;
  while (cur <= to) {
    days.push(cur);
    cur = nextIsoDate(cur);
  }
  return days;
}

export function isWorkDay(iso: string, overrides?: Map<string, boolean>): boolean {
  if (overrides?.has(iso)) return overrides.get(iso)!;
  return defaultIsWorkDay(iso);
}

/** Default: yakshanba dam. Override kalendar orqali. */
export function workdaysBetween(from: string, to: string, overrides?: Map<string, boolean>): string[] {
  return eachDate(from, to).filter((d) => isWorkDay(d, overrides));
}

export function expectedWorkdays(from: string, to: string, month: string, overrides?: Map<string, boolean>) {
  const today = tashkentToday();
  const closeTo = month === currentMonthKey() && today < to ? today : to;
  return workdaysBetween(from, closeTo, overrides);
}

export async function loadWorkDayOverrides(): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  try {
    const rows = await db
      .select({ day: workCalendarDaysTable.day, isWork: workCalendarDaysTable.isWork })
      .from(workCalendarDaysTable);
    for (const r of rows) map.set(r.day, Boolean(r.isWork));
  } catch (err) {
    console.error("loadWorkDayOverrides", err);
  }
  return map;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function roundMoney(n: number) {
  return Math.round(n);
}

function lateMinutes(workDate: string, checkIn: Date, startHm: string) {
  const hm = /^\d{2}:\d{2}$/.test(startHm) ? startHm : "09:00";
  const start = new Date(`${workDate}T${hm}:00+05:00`);
  return Math.max(0, Math.round((checkIn.getTime() - start.getTime()) / 60000));
}

function attendancePoints(status: string, lateMin: number | null): {
  counted: boolean;
  points: number;
  note: string;
} {
  const st = (status || "").toLowerCase();
  if (st === "leave" || st === "on_leave" || st === "sick") {
    return { counted: false, points: 0, note: "Uzrli — hisobga olinmaydi" };
  }
  if (st === "absent") {
    return { counted: true, points: 0, note: "Sababsiz kelmagan" };
  }
  if (lateMin == null) {
    if (st === "present" || st === "incomplete") {
      return { counted: true, points: 1, note: "O‘z vaqtida" };
    }
    return { counted: true, points: 0, note: status };
  }
  if (lateMin <= 5) return { counted: true, points: 1, note: "0–5 daqiqa" };
  if (lateMin <= 30) return { counted: true, points: 0.7, note: "5–30 daqiqa kechikish" };
  return { counted: true, points: 0.3, note: "30 daqiqadan ortiq kechikish" };
}

export async function loadKpiWeights(): Promise<KpiWeights> {
  try {
    const [row] = await db.select().from(kpiSettingsTable).where(eq(kpiSettingsTable.id, 1)).limit(1);
    return {
      attendance: row?.attendanceWeight ?? 40,
      tasks: row?.tasksWeight ?? 30,
      checklist: row?.checklistWeight ?? 30,
      workStartHm: row?.workStartHm ?? "09:00",
    };
  } catch {
    return { attendance: 40, tasks: 30, checklist: 30, workStartHm: "09:00" };
  }
}

function clampWeight(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function saveKpiWeights(patch: Partial<KpiWeights>, userId: number): Promise<KpiWeights> {
  const cur = await loadKpiWeights();
  const next = {
    attendance: clampWeight(patch.attendance ?? cur.attendance),
    tasks: clampWeight(patch.tasks ?? cur.tasks),
    checklist: clampWeight(patch.checklist ?? cur.checklist),
    workStartHm: patch.workStartHm || cur.workStartHm,
  };
  const [existing] = await db.select({ id: kpiSettingsTable.id }).from(kpiSettingsTable).limit(1);
  if (existing) {
    await db
      .update(kpiSettingsTable)
      .set({
        attendanceWeight: next.attendance,
        tasksWeight: next.tasks,
        checklistWeight: next.checklist,
        workStartHm: next.workStartHm,
        updatedById: userId,
        updatedAt: new Date(),
      })
      .where(eq(kpiSettingsTable.id, existing.id));
  } else {
    await db.insert(kpiSettingsTable).values({
      attendanceWeight: next.attendance,
      tasksWeight: next.tasks,
      checklistWeight: next.checklist,
      workStartHm: next.workStartHm,
      updatedById: userId,
    });
  }
  return next;
}

function effectiveWeights(
  base: KpiWeights,
  avail: { attendance: boolean; tasks: boolean; checklist: boolean },
) {
  const parts: Array<["attendance" | "tasks" | "checklist", number]> = [];
  if (avail.attendance) parts.push(["attendance", base.attendance]);
  if (avail.tasks) parts.push(["tasks", base.tasks]);
  if (avail.checklist) parts.push(["checklist", base.checklist]);
  const sum = parts.reduce((s, p) => s + p[1], 0);
  const out = { attendance: 0, tasks: 0, checklist: 0 };
  if (sum <= 0) return out;
  for (const [k, w] of parts) out[k] = (w / sum) * 100;
  return out;
}

export async function computePayroll(userId: number, monthKey: string): Promise<PayrollCompute | null> {
  const { month, from, to, monthLabel } = monthBounds(monthKey);
  const weights = await loadKpiWeights();
  const workOverrides = await loadWorkDayOverrides();

  const [user] = await db
    .select({ id: usersTable.id, fullName: usersTable.fullName, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) return null;

  type EmpRow = {
    id: number;
    position: string | null;
    location: string | null;
    fixedSalary: number | null;
    bonusPercent: number | null;
  };
  let emp: EmpRow | undefined;
  try {
    const [row] = await db
      .select({
        id: employeesTable.id,
        position: employeesTable.position,
        location: employeesTable.location,
        fixedSalary: employeesTable.fixedSalary,
        bonusPercent: employeesTable.bonusPercent,
      })
      .from(employeesTable)
      .where(eq(employeesTable.userId, userId))
      .limit(1);
    emp = row;
  } catch {
    const [row] = await db
      .select({
        id: employeesTable.id,
        position: employeesTable.position,
        location: employeesTable.location,
      })
      .from(employeesTable)
      .where(eq(employeesTable.userId, userId))
      .limit(1);
    emp = row ? { ...row, fixedSalary: 0, bonusPercent: 30 } : undefined;
  }

  const fixedSalary = Math.max(0, Math.round(Number(emp?.fixedSalary ?? 0)));
  const bonusPercent = Math.max(0, Number(emp?.bonusPercent ?? 30));

  const attDays: AttendanceDayDetail[] = [];
  if (emp) {
    try {
      const records = await db
        .select({
          workDate: attendanceRecordsTable.workDate,
          status: attendanceRecordsTable.status,
          checkInAt: attendanceRecordsTable.checkInAt,
        })
        .from(attendanceRecordsTable)
        .where(
          and(
            eq(attendanceRecordsTable.employeeId, emp.id),
            gte(attendanceRecordsTable.workDate, from),
            lte(attendanceRecordsTable.workDate, to),
          ),
        );
      for (const r of records) {
        const late = r.checkInAt != null ? lateMinutes(r.workDate, r.checkInAt, weights.workStartHm) : null;
        const scored = attendancePoints(r.status, late);
        attDays.push({
          date: r.workDate,
          status: r.status,
          lateMinutes: late,
          counted: scored.counted,
          points: scored.points,
          note: scored.note,
        });
      }
    } catch (err) {
      console.error("computePayroll attendance", userId, err);
    }
  }
  const expected = expectedWorkdays(from, to, month, workOverrides);
  const recorded = new Set(attDays.map((d) => d.date));
  const complete = expected.length > 0 && expected.every((d) => recorded.has(d));
  const closedDays = expected.filter((d) => recorded.has(d)).length;
  for (const date of expected) {
    if (!recorded.has(date)) {
      attDays.push({
        date,
        status: "missing",
        lateMinutes: null,
        counted: true,
        points: 0,
        note: "Yopilmagan kun",
      });
    }
  }
  const countedAtt = attDays.filter((d) => expected.includes(d.date) && d.counted);
  const attPoints = countedAtt.reduce((s, d) => s + d.points, 0);
  const attAvailable = complete && countedAtt.length > 0;
  const attPercent = countedAtt.length > 0 ? (attPoints / countedAtt.length) * 100 : 0;

  const fromDt = new Date(`${from}T00:00:00+05:00`);
  const toDt = new Date(`${to}T23:59:59+05:00`);
  let taskRows: Array<{
    id: number;
    title: string;
    status: string;
    dueAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }> = [];
  try {
    taskRows = await db
      .select({
        id: tasksTable.id,
        title: tasksTable.title,
        status: tasksTable.status,
        dueAt: tasksTable.dueAt,
        completedAt: tasksTable.completedAt,
        createdAt: tasksTable.createdAt,
      })
      .from(tasksTable)
      .where(
        and(
          emp
            ? or(
                and(eq(tasksTable.assigneeKind, "user"), eq(tasksTable.assigneeId, userId)),
                and(eq(tasksTable.assigneeKind, "employee"), eq(tasksTable.assigneeId, emp.id)),
              )
            : and(eq(tasksTable.assigneeKind, "user"), eq(tasksTable.assigneeId, userId)),
          or(
            and(gte(tasksTable.dueAt, fromDt), lte(tasksTable.dueAt, toDt)),
            and(isNull(tasksTable.dueAt), gte(tasksTable.createdAt, fromDt), lte(tasksTable.createdAt, toDt)),
          ),
        ),
      );
  } catch (err) {
    console.error("computePayroll tasks", userId, err);
  }

  const taskItems: TaskDetail[] = taskRows.map((t) => {
    const done = t.status === "done" || t.status === "verified";
    let points = 0;
    let label = "Bajarilmagan";
    if (t.status === "cancelled") {
      points = 0;
      label = "Bekor qilingan";
    } else if (done) {
      if (!t.dueAt || (t.completedAt && t.completedAt.getTime() <= t.dueAt.getTime())) {
        points = 1;
        label = "O‘z vaqtida";
      } else {
        points = 0.5;
        label = "Kechikib bajarilgan";
      }
    }
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      dueAt: t.dueAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      points,
      label,
    };
  });
  const tasksAvailable = taskItems.length > 0;
  const taskPoints = taskItems.reduce((s, t) => s + t.points, 0);
  const taskPercent = tasksAvailable ? (taskPoints / taskItems.length) * 100 : 0;

  const checklistItems: ChecklistDetail[] = [];
  try {
    const auditWhere = emp
      ? or(eq(branchAuditsTable.coordinatorId, userId), eq(branchAuditsTable.managerEmployeeId, emp.id))
      : eq(branchAuditsTable.coordinatorId, userId);
    const audits = await db
      .select({
        id: branchAuditsTable.id,
        visitDate: branchAuditsTable.visitDate,
        visitName: branchAuditsTable.visitName,
        scorePercent: branchAuditsTable.scorePercent,
        yesCount: branchAuditsTable.yesCount,
        totalCount: branchAuditsTable.totalCount,
      })
      .from(branchAuditsTable)
      .where(and(auditWhere, gte(branchAuditsTable.visitDate, from), lte(branchAuditsTable.visitDate, to)));
    for (const a of audits) {
      checklistItems.push({
        id: a.id,
        visitDate: a.visitDate,
        visitName: a.visitName,
        percent: a.scorePercent,
        yesCount: a.yesCount,
        totalCount: a.totalCount,
      });
    }
  } catch (err) {
    console.error("computePayroll audits", userId, err);
  }
  const checklistAvailable = checklistItems.length > 0;
  const checklistPercent = checklistAvailable
    ? checklistItems.reduce((s, i) => s + i.percent, 0) / checklistItems.length
    : 0;

  const eff = effectiveWeights(weights, {
    attendance: attAvailable,
    tasks: tasksAvailable,
    checklist: checklistAvailable,
  });

  const kpiPercent =
    (attPercent * eff.attendance) / 100 +
    (taskPercent * eff.tasks) / 100 +
    (checklistPercent * eff.checklist) / 100;

  const maxBonus = roundMoney((fixedSalary * bonusPercent) / 100);
  const bonusAmount = roundMoney((maxBonus * kpiPercent) / 100);

  return {
    userId,
    employeeId: emp?.id ?? null,
    month,
    monthLabel,
    from,
    to,
    fullName: user.fullName,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] || user.role,
    position: emp?.position ?? null,
    branch: emp?.location ?? null,
    fixedSalary,
    bonusPercent,
    attendance: {
      available: attAvailable,
      complete,
      percent: round1(attPercent),
      baseWeight: weights.attendance,
      effectiveWeight: round1(eff.attendance),
      points: round1(attPoints),
      countedDays: countedAtt.length,
      expectedDays: expected.length,
      closedDays,
      days: attDays.sort((a, b) => b.date.localeCompare(a.date)),
    },
    tasks: {
      available: tasksAvailable,
      percent: round1(taskPercent),
      baseWeight: weights.tasks,
      effectiveWeight: round1(eff.tasks),
      points: round1(taskPoints),
      total: taskItems.length,
      items: taskItems,
    },
    checklist: {
      available: checklistAvailable,
      percent: round1(checklistPercent),
      baseWeight: weights.checklist,
      effectiveWeight: round1(eff.checklist),
      items: checklistItems,
    },
    kpiPercent: round1(kpiPercent),
    maxBonus,
    bonusAmount,
    totalAmount: fixedSalary + bonusAmount,
  };
}

export type PayrollListRow = {
  employeeId: number;
  userId: number | null;
  fullName: string;
  roleLabel: string;
  position: string | null;
  branch: string | null;
  fixedSalary: number;
  bonusPercent: number;
  kpiPercent: number;
  bonusAmount: number;
  totalAmount: number;
  status: string;
  attendance: number;
  tasks: number;
  checklist: number;
  attendanceAvailable: boolean;
  attendanceComplete: boolean;
  expectedWorkDays: number;
  closedWorkDays: number;
  tasksAvailable: boolean;
  checklistAvailable: boolean;
};

function kpiFromParts(
  weights: KpiWeights,
  attPercent: number,
  attAvailable: boolean,
  taskPercent: number,
  tasksAvailable: boolean,
  checklistPercent: number,
  checklistAvailable: boolean,
  fixedSalary: number,
  bonusPercent: number,
) {
  const eff = effectiveWeights(weights, {
    attendance: attAvailable,
    tasks: tasksAvailable,
    checklist: checklistAvailable,
  });
  const kpiPercent =
    (attPercent * eff.attendance) / 100 +
    (taskPercent * eff.tasks) / 100 +
    (checklistPercent * eff.checklist) / 100;
  const maxBonus = roundMoney((fixedSalary * bonusPercent) / 100);
  const bonusAmount = roundMoney((maxBonus * kpiPercent) / 100);
  return {
    kpiPercent: round1(kpiPercent),
    bonusAmount,
    totalAmount: fixedSalary + bonusAmount,
    attendance: round1(attPercent),
    tasks: round1(taskPercent),
    checklist: round1(checklistPercent),
  };
}

function scoreAttendanceDays(
  records: Array<{ status: string; checkInAt: Date | null; workDate: string }>,
  workStartHm: string,
  expected: string[],
) {
  const recorded = new Set(records.map((r) => r.workDate));
  const complete = expected.length > 0 && expected.every((d) => recorded.has(d));
  const closedDays = expected.filter((d) => recorded.has(d)).length;
  let points = 0;
  let counted = 0;
  for (const r of records) {
    if (!expected.includes(r.workDate)) continue;
    const late = r.checkInAt != null ? lateMinutes(r.workDate, r.checkInAt, workStartHm) : null;
    const scored = attendancePoints(r.status, late);
    if (scored.counted) {
      counted += 1;
      points += scored.points;
    }
  }
  const available = complete && counted > 0;
  return {
    available,
    complete,
    percent: counted > 0 ? (points / counted) * 100 : 0,
    expectedDays: expected.length,
    closedDays,
  };
}

function scoreTaskRows(rows: Array<{ status: string; dueAt: Date | null; completedAt: Date | null }>) {
  if (!rows.length) return { available: false, percent: 0 };
  let points = 0;
  for (const t of rows) {
    const done = t.status === "done" || t.status === "verified";
    if (t.status === "cancelled") {
      points += 0;
    } else if (done) {
      if (!t.dueAt || (t.completedAt && t.completedAt.getTime() <= t.dueAt.getTime())) points += 1;
      else points += 0.5;
    }
  }
  return { available: true, percent: (points / rows.length) * 100 };
}

/** Barcha faol xodimlar oyligi — bitta oy uchun, N+1 so‘rovsiz. */
export async function computePayrollList(
  monthKey: string,
  q = "",
): Promise<{ month: string; monthLabel: string; workDays: string[]; items: PayrollListRow[] }> {
  const { month, from, to, monthLabel } = monthBounds(monthKey);
  const workOverrides = await loadWorkDayOverrides();
  const workDays = workdaysBetween(from, to, workOverrides);
  const expected = expectedWorkdays(from, to, month, workOverrides);
  const weights = await loadKpiWeights();
  const fromDt = new Date(`${from}T00:00:00+05:00`);
  const toDt = new Date(`${to}T23:59:59+05:00`);
  const needle = q.trim();
  const seenEmp = new Set<number>();

  const staffRows = await db
    .select({
      empId: employeesTable.id,
      fullName: employeesTable.fullName,
      position: employeesTable.position,
      location: employeesTable.location,
      orgRole: employeesTable.orgRole,
      employmentStatus: employeesTable.employmentStatus,
      userId: employeesTable.userId,
      fixedSalary: employeesTable.fixedSalary,
      bonusPercent: employeesTable.bonusPercent,
      userRole: usersTable.role,
      userStatus: usersTable.status,
      login: usersTable.login,
    })
    .from(employeesTable)
    .leftJoin(usersTable, eq(usersTable.id, employeesTable.userId));

  const users = staffRows.filter((u) => {
    if (seenEmp.has(u.empId)) return false;
    seenEmp.add(u.empId);
    const st = u.employmentStatus || "working";
    if (st !== "working" && st !== "new") return false;
    if (!needle) return true;
    const hay = `${u.fullName} ${u.login || ""} ${u.position || ""} ${u.location || ""}`.toLowerCase();
    return hay.includes(needle.toLowerCase());
  });

  const empIds = users.map((u) => u.empId);
  const userIds = users.map((u) => u.userId).filter((id): id is number => id != null);

  const attByEmp = new Map<number, Array<{ status: string; checkInAt: Date | null; workDate: string }>>();
  if (empIds.length) {
    try {
      const records = await db
        .select({
          employeeId: attendanceRecordsTable.employeeId,
          workDate: attendanceRecordsTable.workDate,
          status: attendanceRecordsTable.status,
          checkInAt: attendanceRecordsTable.checkInAt,
        })
        .from(attendanceRecordsTable)
        .where(
          and(
            inArray(attendanceRecordsTable.employeeId, empIds),
            gte(attendanceRecordsTable.workDate, from),
            lte(attendanceRecordsTable.workDate, to),
          ),
        );
      for (const r of records) {
        const list = attByEmp.get(r.employeeId) ?? [];
        list.push(r);
        attByEmp.set(r.employeeId, list);
      }
    } catch (err) {
      console.error("payroll list attendance", err);
    }
  }

  const taskByUser = new Map<number, Array<{ status: string; dueAt: Date | null; completedAt: Date | null }>>();
  const taskByEmp = new Map<number, Array<{ status: string; dueAt: Date | null; completedAt: Date | null }>>();
  try {
    const taskRows = await db
      .select({
        assigneeKind: tasksTable.assigneeKind,
        assigneeId: tasksTable.assigneeId,
        status: tasksTable.status,
        dueAt: tasksTable.dueAt,
        completedAt: tasksTable.completedAt,
      })
      .from(tasksTable)
      .where(
        or(
          and(gte(tasksTable.dueAt, fromDt), lte(tasksTable.dueAt, toDt)),
          and(isNull(tasksTable.dueAt), gte(tasksTable.createdAt, fromDt), lte(tasksTable.createdAt, toDt)),
        ),
      );
    for (const t of taskRows) {
      const row = { status: t.status, dueAt: t.dueAt, completedAt: t.completedAt };
      if (t.assigneeKind === "user") {
        const list = taskByUser.get(t.assigneeId) ?? [];
        list.push(row);
        taskByUser.set(t.assigneeId, list);
      } else if (t.assigneeKind === "employee") {
        const list = taskByEmp.get(t.assigneeId) ?? [];
        list.push(row);
        taskByEmp.set(t.assigneeId, list);
      }
    }
  } catch (err) {
    console.error("payroll list tasks", err);
  }

  const checkByUser = new Map<number, Map<number, number>>();
  const checkByEmp = new Map<number, Map<number, number>>();
  try {
    const audits = await db
      .select({
        id: branchAuditsTable.id,
        coordinatorId: branchAuditsTable.coordinatorId,
        managerEmployeeId: branchAuditsTable.managerEmployeeId,
        scorePercent: branchAuditsTable.scorePercent,
      })
      .from(branchAuditsTable)
      .where(and(gte(branchAuditsTable.visitDate, from), lte(branchAuditsTable.visitDate, to)));
    for (const a of audits) {
      if (a.coordinatorId != null) {
        const m = checkByUser.get(a.coordinatorId) ?? new Map();
        m.set(a.id, a.scorePercent);
        checkByUser.set(a.coordinatorId, m);
      }
      if (a.managerEmployeeId != null) {
        const m = checkByEmp.get(a.managerEmployeeId) ?? new Map();
        m.set(a.id, a.scorePercent);
        checkByEmp.set(a.managerEmployeeId, m);
      }
    }
  } catch (err) {
    console.error("payroll list audits", err);
  }

  const statusByUser = new Map<number, string>();
  if (userIds.length) {
    try {
      const saved = await db
        .select({ userId: payrollMonthsTable.userId, status: payrollMonthsTable.status })
        .from(payrollMonthsTable)
        .where(and(eq(payrollMonthsTable.month, month), inArray(payrollMonthsTable.userId, userIds)));
      for (const s of saved) statusByUser.set(s.userId, s.status);
    } catch (err) {
      console.error("payroll list months", err);
    }
  }

  const items: PayrollListRow[] = users.map((u) => {
    const fixedSalary = Math.max(0, Math.round(Number(u.fixedSalary ?? 0)));
    const bonusPercent = Math.max(0, Number(u.bonusPercent ?? 30));
    const uid = u.userId;
    const att = scoreAttendanceDays(attByEmp.get(u.empId) ?? [], weights.workStartHm, expected);
    const mergedTasks = [...(uid != null ? taskByUser.get(uid) ?? [] : []), ...(taskByEmp.get(u.empId) ?? [])];
    const tasks = scoreTaskRows(mergedTasks);
    const checkMap = new Map<number, number>([
      ...(uid != null ? checkByUser.get(uid) ?? [] : []),
      ...(checkByEmp.get(u.empId) ?? []),
    ]);
    const checkPercents = [...checkMap.values()];
    const checklistAvailable = checkPercents.length > 0;
    const checklistPercent = checklistAvailable
      ? checkPercents.reduce((s, n) => s + n, 0) / checkPercents.length
      : 0;
    const money = kpiFromParts(
      weights,
      att.percent,
      att.available,
      tasks.percent,
      tasks.available,
      checklistPercent,
      checklistAvailable,
      fixedSalary,
      bonusPercent,
    );
    const roleKey = u.userRole || u.orgRole || "";
    return {
      employeeId: u.empId,
      userId: uid,
      fullName: u.fullName,
      roleLabel: ROLE_LABELS[roleKey] || roleKey,
      position: u.position ?? null,
      branch: u.location ?? null,
      fixedSalary,
      bonusPercent,
      kpiPercent: money.kpiPercent,
      bonusAmount: money.bonusAmount,
      totalAmount: money.totalAmount,
      status: (uid != null ? statusByUser.get(uid) : undefined) || "draft",
      attendance: money.attendance,
      tasks: money.tasks,
      checklist: money.checklist,
      attendanceAvailable: att.available,
      attendanceComplete: att.complete,
      expectedWorkDays: att.expectedDays,
      closedWorkDays: att.closedDays,
      tasksAvailable: tasks.available,
      checklistAvailable,
    };
  });

  items.sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));
  return { month, monthLabel, workDays, items };
}

export async function upsertPayrollDraft(report: PayrollCompute, status?: string) {
  const payload = {
    employeeId: report.employeeId,
    fixedSalary: report.fixedSalary,
    bonusPercent: report.bonusPercent,
    kpiPercent: report.kpiPercent,
    maxBonus: report.maxBonus,
    bonusAmount: report.bonusAmount,
    totalAmount: report.totalAmount,
    snapshot: report as unknown as Record<string, unknown>,
    computedAt: new Date(),
    updatedAt: new Date(),
    ...(status ? { status } : {}),
  };
  const [existing] = await db
    .select({ id: payrollMonthsTable.id, status: payrollMonthsTable.status })
    .from(payrollMonthsTable)
    .where(and(eq(payrollMonthsTable.userId, report.userId), eq(payrollMonthsTable.month, report.month)))
    .limit(1);
  if (existing) {
    if (existing.status === "approved" && status !== "approved") return existing;
    await db.update(payrollMonthsTable).set(payload).where(eq(payrollMonthsTable.id, existing.id));
    return existing;
  }
  await db.insert(payrollMonthsTable).values({
    userId: report.userId,
    month: report.month,
    status: status || "draft",
    ...payload,
  });
  return null;
}

export function formatSom(n: number) {
  return `${Math.round(n).toLocaleString("ru-RU")} so‘m`;
}
