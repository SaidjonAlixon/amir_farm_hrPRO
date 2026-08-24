import { Router, type IRouter } from "express";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import {
  db,
  employeesTable,
  departmentsTable,
  attendanceRecordsTable,
  faceProfilesTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { canViewDavomat } from "../lib/roles";
import { forceBroadcastDavomatToAll } from "../jobs/davomat-reminders";
import { evaluateLiveness, matchFaceForAuthWithAi, type LivenessProof } from "../lib/face-match";
import { maybeBackfillFacePhoto } from "./face";
import { displayBranchName, gpsFromLocationField } from "../lib/geo-location";
import { setSessionCookie } from "../lib/session";
import { hoursForStaff, isPharmacyShiftStaff, shiftWindow } from "../lib/shift-hours";

const router: IRouter = Router();

const WORK_START = "09:00";
const WORK_END = "18:00";
const TZ_OFFSET = "+05:00"; // Asia/Tashkent
/** Davomat Face ID faqat shu radiusda (metr) */
export const DAVOMAT_GEOFENCE_METERS = 35;
/** Belgilangan ish joyi: 41°13'09.3"N 69°16'22.9"E */
export const DAVOMAT_SITE_LAT = 41 + 13 / 60 + 9.3 / 3600; // 41.21925
export const DAVOMAT_SITE_LNG = 69 + 16 / 60 + 22.9 / 3600; // ≈ 69.273028
export const DAVOMAT_SITE_LABEL = "41°13'09.3\"N 69°16'22.9\"E";
const FACE_DESCRIPTOR_LEN = 128;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function parseFaceDescriptor(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length !== FACE_DESCRIPTOR_LEN) return null;
  const out: number[] = [];
  for (const n of raw) {
    if (typeof n !== "number" || !Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
}

function isPgUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

function requireDavomat(req: AuthRequest, res: { status: (n: number) => { json: (b: unknown) => void } }): boolean {
  if (!canViewDavomat(req.userRole)) {
    res.status(403).json({ error: "Davomat faqat Direktor / HR Direktor / HR Menejer uchun" });
    return false;
  }
  return true;
}

function todayTashkent(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta));
  return dt.toISOString().slice(0, 10);
}

function eachDateInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard += 1;
  }
  return out;
}

function parseHm(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map(Number);
  return { h: h ?? 0, m: m ?? 0 };
}

/** YYYY-MM-DD + HH:mm → Date in Tashkent */
function atTashkent(ymd: string, hm: string): Date {
  const { h, m } = parseHm(hm);
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(`${ymd}T${pad(h)}:${pad(m)}:00${TZ_OFFSET}`);
}

function formatHm(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

function fmtHours(mins: number): string {
  if (!Number.isFinite(mins) || mins <= 0) return "0:00";
  const h = Math.floor(mins / 60);
  const m = Math.abs(mins % 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

function fmtSignedMin(mins: number): string {
  if (!mins) return "0 daq";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const body = h > 0 ? `${h} soat ${m} daq` : `${m} daq`;
  return mins < 0 ? `−${body}` : body;
}

type Metrics = {
  status: string;
  checkIn: string;
  checkOut: string;
  workedMinutes: number;
  workedHours: string;
  earlyArrivalMin: number;
  lateArrivalMin: number;
  earlyLeaveMin: number;
  overtimeMin: number;
  earlyArrivalLabel: string;
  lateArrivalLabel: string;
  earlyLeaveLabel: string;
  overtimeLabel: string;
};

function computeMetrics(
  workDate: string,
  checkInAt: Date | null | undefined,
  checkOutAt: Date | null | undefined,
  forcedStatus?: string | null,
  hours?: { start: string; end: string },
): Metrics {
  const start = atTashkent(workDate, hours?.start ?? WORK_START);
  const end = atTashkent(workDate, hours?.end ?? WORK_END);
  let earlyArrivalMin = 0;
  let lateArrivalMin = 0;
  let earlyLeaveMin = 0;
  let overtimeMin = 0;
  let workedMinutes = 0;
  let status = forcedStatus || "absent";

  if (checkInAt) {
    const inDiff = minutesBetween(start, checkInAt);
    if (inDiff < 0) earlyArrivalMin = -inDiff;
    else if (inDiff > 0) lateArrivalMin = inDiff;
    status = lateArrivalMin > 0 ? "late" : "present";
    if (!checkOutAt) status = "incomplete";
  }

  if (checkInAt && checkOutAt) {
    workedMinutes = Math.max(0, minutesBetween(checkInAt, checkOutAt));
    const outDiff = minutesBetween(end, checkOutAt);
    if (outDiff < 0) earlyLeaveMin = -outDiff;
    else if (outDiff > 0) overtimeMin = outDiff;
    if (lateArrivalMin > 0) status = "late";
    else status = "present";
  }

  if (forcedStatus === "leave" || forcedStatus === "absent") {
    status = forcedStatus;
  }

  return {
    status,
    checkIn: formatHm(checkInAt ?? null),
    checkOut: formatHm(checkOutAt ?? null),
    workedMinutes,
    workedHours: fmtHours(workedMinutes),
    earlyArrivalMin,
    lateArrivalMin,
    earlyLeaveMin,
    overtimeMin,
    earlyArrivalLabel: earlyArrivalMin ? fmtSignedMin(earlyArrivalMin) : "—",
    lateArrivalLabel: lateArrivalMin ? fmtSignedMin(lateArrivalMin) : "—",
    earlyLeaveLabel: earlyLeaveMin ? fmtSignedMin(earlyLeaveMin) : "—",
    overtimeLabel: overtimeMin ? fmtSignedMin(overtimeMin) : "—",
  };
}

async function loadActiveEmployees(filters: {
  departmentId?: string;
  location?: string;
  search?: string;
  employeeId?: string;
}) {
  const rows = await db
    .select({
      id: employeesTable.id,
      fullName: employeesTable.fullName,
      position: employeesTable.position,
      departmentId: employeesTable.departmentId,
      departmentName: departmentsTable.name,
      location: employeesTable.location,
      employmentStatus: employeesTable.employmentStatus,
      userId: employeesTable.userId,
      orgRole: employeesTable.orgRole,
      shiftType: employeesTable.shiftType,
    })
    .from(employeesTable)
    .leftJoin(departmentsTable, eq(employeesTable.departmentId, departmentsTable.id));

  return rows.filter((e) => {
    const st = e.employmentStatus || "working";
    if (st === "dismissed") return false;
    if (filters.employeeId && e.id !== Number(filters.employeeId)) return false;
    if (filters.departmentId && e.departmentId !== Number(filters.departmentId)) return false;
    if (filters.location && (e.location || "") !== filters.location) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const hay = [e.fullName, e.position, e.departmentName, e.location].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

async function loadRecords(from: string, to: string, employeeIds: number[]) {
  if (!employeeIds.length) return [];
  return db
    .select()
    .from(attendanceRecordsTable)
    .where(
      and(
        gte(attendanceRecordsTable.workDate, from),
        lte(attendanceRecordsTable.workDate, to),
        inArray(attendanceRecordsTable.employeeId, employeeIds),
      ),
    );
}

function buildReport(
  employees: Awaited<ReturnType<typeof loadActiveEmployees>>,
  records: Awaited<ReturnType<typeof loadRecords>>,
  from: string,
  to: string,
) {
  const dates = eachDateInclusive(from, to);
  const byEmpDate = new Map<string, (typeof records)[0]>();
  for (const r of records) {
    byEmpDate.set(`${r.employeeId}|${r.workDate}`, r);
  }

  const dayStats = dates.map((date) => {
    let present = 0;
    let late = 0;
    let incomplete = 0;
    let leave = 0;
    let absent = 0;
    const presentList: string[] = [];
    const absentList: string[] = [];
    const lateList: string[] = [];
    const farFromOffice: Array<{
      employeeId: number;
      fullName: string;
      position: string | null;
      departmentName: string | null;
      checkIn: string | null;
      officeDistanceMeters: number;
    }> = [];

    for (const e of employees) {
      const rec = byEmpDate.get(`${e.id}|${date}`);
      if (
        rec?.checkLatitude != null &&
        rec?.checkLongitude != null &&
        Number.isFinite(rec.checkLatitude) &&
        Number.isFinite(rec.checkLongitude)
      ) {
        const officeM = haversineMeters(
          rec.checkLatitude,
          rec.checkLongitude,
          DAVOMAT_SITE_LAT,
          DAVOMAT_SITE_LNG,
        );
        if (officeM > 1000) {
          farFromOffice.push({
            employeeId: e.id,
            fullName: e.fullName,
            position: e.position ?? null,
            departmentName: e.departmentName ?? null,
            checkIn: rec.checkInAt ? formatHm(rec.checkInAt as Date) : null,
            officeDistanceMeters: officeM,
          });
        }
      }
      if (!rec || (!rec.checkInAt && rec.status === "absent")) {
        absent += 1;
        absentList.push(e.fullName);
        continue;
      }
      if (rec.status === "leave") {
        leave += 1;
        continue;
      }
      const m = computeMetrics(date, rec.checkInAt, rec.checkOutAt, rec.status, hoursForStaff(e.orgRole, e.shiftType));
      if (m.status === "late") {
        late += 1;
        lateList.push(e.fullName);
        present += 1;
        presentList.push(e.fullName);
      } else if (m.status === "incomplete") {
        incomplete += 1;
        present += 1;
        presentList.push(e.fullName);
      } else if (m.status === "absent") {
        absent += 1;
        absentList.push(e.fullName);
      } else {
        present += 1;
        presentList.push(e.fullName);
      }
    }
    return {
      date,
      present,
      late,
      incomplete,
      leave,
      absent,
      presentList,
      absentList,
      lateList,
      farFromOffice,
    };
  });

  const employeeRows = employees
    .map((e) => {
      const days = dates.map((date) => {
        const rec = byEmpDate.get(`${e.id}|${date}`);
        if (!rec || (!rec.checkInAt && (rec.status === "absent" || !rec.status))) {
          return {
            date,
            status: "absent" as const,
            checkIn: "—",
            checkOut: "—",
            workedMinutes: 0,
            workedHours: "0:00",
            earlyArrivalMin: 0,
            lateArrivalMin: 0,
            earlyLeaveMin: 0,
            overtimeMin: 0,
            earlyArrivalLabel: "—",
            lateArrivalLabel: "—",
            earlyLeaveLabel: "—",
            overtimeLabel: "—",
            source: null as string | null,
            notes: null as string | null,
            recordId: null as number | null,
          };
        }
        if (rec.status === "leave") {
          return {
            date,
            status: "leave" as const,
            checkIn: "—",
            checkOut: "—",
            workedMinutes: 0,
            workedHours: "0:00",
            earlyArrivalMin: 0,
            lateArrivalMin: 0,
            earlyLeaveMin: 0,
            overtimeMin: 0,
            earlyArrivalLabel: "—",
            lateArrivalLabel: "—",
            earlyLeaveLabel: "—",
            overtimeLabel: "—",
            source: rec.source,
            notes: rec.notes,
            recordId: rec.id,
          };
        }
        const m = computeMetrics(date, rec.checkInAt, rec.checkOutAt, rec.status, hoursForStaff(e.orgRole, e.shiftType));
        return {
          date,
          ...m,
          source: rec.source,
          notes: rec.notes,
          recordId: rec.id,
        };
      });

      const totals = days.reduce(
        (acc, d) => {
          if (d.status === "absent") acc.absent += 1;
          else if (d.status === "leave") acc.leave += 1;
          else {
            acc.present += 1;
            if (d.status === "late") acc.late += 1;
            if (d.status === "incomplete") acc.incomplete += 1;
          }
          acc.workedMinutes += d.workedMinutes;
          acc.lateArrivalMin += d.lateArrivalMin;
          acc.earlyArrivalMin += d.earlyArrivalMin;
          acc.earlyLeaveMin += d.earlyLeaveMin;
          acc.overtimeMin += d.overtimeMin;
          return acc;
        },
        {
          present: 0,
          absent: 0,
          late: 0,
          incomplete: 0,
          leave: 0,
          workedMinutes: 0,
          lateArrivalMin: 0,
          earlyArrivalMin: 0,
          earlyLeaveMin: 0,
          overtimeMin: 0,
        },
      );

      return {
        id: e.id,
        fullName: e.fullName,
        position: e.position,
        departmentId: e.departmentId,
        departmentName: e.departmentName,
        location: e.location,
        orgRole: e.orgRole,
        days,
        totals: {
          ...totals,
          workedHours: fmtHours(totals.workedMinutes),
          lateArrivalLabel: totals.lateArrivalMin ? fmtSignedMin(totals.lateArrivalMin) : "—",
          earlyArrivalLabel: totals.earlyArrivalMin ? fmtSignedMin(totals.earlyArrivalMin) : "—",
          earlyLeaveLabel: totals.earlyLeaveMin ? fmtSignedMin(totals.earlyLeaveMin) : "—",
          overtimeLabel: totals.overtimeMin ? fmtSignedMin(totals.overtimeMin) : "—",
        },
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "uz"));

  const summary = {
    employees: employees.length,
    days: dates.length,
    presentPersonDays: employeeRows.reduce((s, e) => s + e.totals.present, 0),
    absentPersonDays: employeeRows.reduce((s, e) => s + e.totals.absent, 0),
    latePersonDays: employeeRows.reduce((s, e) => s + e.totals.late, 0),
    totalWorkedHours: fmtHours(employeeRows.reduce((s, e) => s + e.totals.workedMinutes, 0)),
    totalLateMinutes: employeeRows.reduce((s, e) => s + e.totals.lateArrivalMin, 0),
    totalLateLabel: fmtSignedMin(
      employeeRows.reduce((s, e) => s + e.totals.lateArrivalMin, 0),
    ),
  };

  return {
    workStart: WORK_START,
    workEnd: WORK_END,
    from,
    to,
    dates,
    summary,
    days: dayStats,
    employees: employeeRows,
  };
}

router.get("/davomat", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireDavomat(req, res)) return;
  try {
    const q = req.query as Record<string, string>;
    const to = q.to || todayTashkent();
    const from = q.from || addDays(to, -13);
    const employees = await loadActiveEmployees({
      departmentId: q.departmentId,
      location: q.location,
      search: q.search,
      employeeId: q.employeeId,
    });
    const records = await loadRecords(
      from,
      to,
      employees.map((e) => e.id),
    );
    res.json(buildReport(employees, records, from, to));
  } catch (err) {
    console.error("GET /davomat error:", err);
    res.status(503).json({ error: "Davomat yuklanmadi" });
  }
});

async function ownEmployeeReport(empId: number) {
  const to = todayTashkent();
  const from = addDays(to, -89);
  const employees = await loadActiveEmployees({ employeeId: String(empId) });
  const records = await loadRecords(from, to, [empId]);
  const report = buildReport(employees, records, from, to);
  return {
    from,
    to,
    employee: report.employees[0] ?? null,
  };
}

/** Bugungi kun: kelgan / kelmagan */
router.get("/davomat/today", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireDavomat(req, res)) return;
  try {
    const date = (req.query as { date?: string }).date || todayTashkent();
    const employees = await loadActiveEmployees({});
    const records = await loadRecords(date, date, employees.map((e) => e.id));
    const report = buildReport(employees, records, date, date);
    const day = report.days[0];
    res.json({
      date,
      workStart: WORK_START,
      workEnd: WORK_END,
      ...day,
      employees: report.employees.map((e) => ({
        id: e.id,
        fullName: e.fullName,
        position: e.position,
        departmentName: e.departmentName,
        location: e.location,
        day: e.days[0],
      })),
    });
  } catch (err) {
    console.error("GET /davomat/today error:", err);
    res.status(503).json({ error: "Bugungi davomat yuklanmadi" });
  }
});

/** HR: qo‘lda kelish/ketish yozish yoki tahrirlash */
router.post("/davomat/manual", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireDavomat(req, res)) return;
  try {
    const {
      employeeId,
      workDate,
      checkIn,
      checkOut,
      status,
      notes,
    } = req.body as {
      employeeId?: number;
      workDate?: string;
      checkIn?: string | null;
      checkOut?: string | null;
      status?: string;
      notes?: string;
    };

    if (!employeeId || !workDate || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      res.status(400).json({ error: "employeeId va workDate (YYYY-MM-DD) majburiy" });
      return;
    }

    const [emp] = await db
      .select({ id: employeesTable.id, userId: employeesTable.userId })
      .from(employeesTable)
      .where(eq(employeesTable.id, employeeId))
      .limit(1);
    if (!emp) {
      res.status(404).json({ error: "Xodim topilmadi" });
      return;
    }

    const checkInAt =
      checkIn && /^\d{1,2}:\d{2}$/.test(checkIn) ? atTashkent(workDate, checkIn) : null;
    const checkOutAt =
      checkOut && /^\d{1,2}:\d{2}$/.test(checkOut) ? atTashkent(workDate, checkOut) : null;

    let nextStatus = status || "absent";
    if (!status || status === "auto") {
      nextStatus = computeMetrics(workDate, checkInAt, checkOutAt).status;
      if (!checkInAt && !checkOutAt) nextStatus = "absent";
    }

    const [existing] = await db
      .select({ id: attendanceRecordsTable.id })
      .from(attendanceRecordsTable)
      .where(
        and(
          eq(attendanceRecordsTable.employeeId, employeeId),
          eq(attendanceRecordsTable.workDate, workDate),
        ),
      )
      .limit(1);

    const payload = {
      employeeId,
      userId: emp.userId,
      workDate,
      checkInAt,
      checkOutAt,
      status: nextStatus,
      source: "manual" as const,
      notes: notes || null,
      createdById: req.userId!,
      updatedAt: new Date(),
    };

    if (existing) {
      await db
        .update(attendanceRecordsTable)
        .set(payload)
        .where(eq(attendanceRecordsTable.id, existing.id));
    } else {
      await db.insert(attendanceRecordsTable).values(payload);
    }

    const metrics = computeMetrics(workDate, checkInAt, checkOutAt, nextStatus);
    res.json({ ok: true, workDate, employeeId, ...metrics });
  } catch (err) {
    console.error("POST /davomat/manual error:", err);
    res.status(503).json({ error: "Saqlanmadi" });
  }
});

/** Xodim o‘zi: kelish / ketish — faqat Face ID + geozona orqali */
router.post("/davomat/punch", requireAuth, async (_req: AuthRequest, res): Promise<void> => {
  res.status(400).json({
    error: `Oddiy punch o‘chirilgan. Davomat faqat Face ID + ish joyi (${DAVOMAT_GEOFENCE_METERS} m) orqali.`,
    code: "use_face_punch",
  });
});

type WorkplaceEmp = {
  id: number;
  userId: number | null;
  fullName: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  orgRole: string | null;
  reportsToId: number | null;
  assignedBranchId: number | null;
  shiftType: string | null;
};

const BRANCH_USER_ROLES = new Set(["mudir", "farmasevt", "stajyor"]);
const BRANCH_ORG_ROLES = new Set(["manager", "pharmacist", "intern"]);

function usesBranchDavomat(userRole: string, orgRole: string | null | undefined) {
  return BRANCH_USER_ROLES.has(userRole) || BRANCH_ORG_ROLES.has(orgRole || "");
}

function orgRoleFromUserRole(role: string): string | null {
  if (role === "mudir") return "manager";
  if (role === "farmasevt") return "pharmacist";
  if (role === "stajyor") return "intern";
  if (role === "koordinator") return "coordinator";
  return null;
}

type DavomatPoint = {
  latitude: number;
  longitude: number;
  label: string;
  kind: "branch" | "office";
};

function coordsFromEmp(row: {
  latitude: number | null;
  longitude: number | null;
  location: string | null;
}): { lat: number; lng: number } | null {
  if (
    row.latitude != null &&
    row.longitude != null &&
    Number.isFinite(row.latitude) &&
    Number.isFinite(row.longitude)
  ) {
    return { lat: row.latitude, lng: row.longitude };
  }
  return gpsFromLocationField(row.location);
}

async function resolveDavomatPoint(emp: WorkplaceEmp, userRole: string): Promise<
  | { ok: true; point: DavomatPoint }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  if (!usesBranchDavomat(userRole, emp.orgRole)) {
    return {
      ok: true,
      point: {
        latitude: DAVOMAT_SITE_LAT,
        longitude: DAVOMAT_SITE_LNG,
        label: `Asosiy ofis · ${DAVOMAT_SITE_LABEL}`,
        kind: "office",
      },
    };
  }

  let latLng = coordsFromEmp(emp);
  let label = displayBranchName(emp.location) || emp.location || emp.fullName;

  const branchId =
    emp.assignedBranchId || (emp.orgRole === "manager" ? emp.id : emp.reportsToId);
  if (branchId && (emp.assignedBranchId || emp.orgRole !== "manager")) {
    const [mgr] = await db
      .select({
        latitude: employeesTable.latitude,
        longitude: employeesTable.longitude,
        location: employeesTable.location,
        fullName: employeesTable.fullName,
      })
      .from(employeesTable)
      .where(eq(employeesTable.id, branchId))
      .limit(1);
    if (mgr) {
      const fromMgr = coordsFromEmp(mgr);
      if (fromMgr) latLng = fromMgr;
      label = displayBranchName(mgr.location) || mgr.location || mgr.fullName || label;
    }
  }

  if (!latLng) {
    return {
      ok: false,
      status: 403,
      body: {
        error:
          "Filial lokatsiyasi kiritilmagan. Koordinator avval shu filial GPS ni kiritsin, keyin davomat qilasiz.",
        code: "branch_gps_missing",
        fullName: emp.fullName,
      },
    };
  }

  return {
    ok: true,
    point: {
      latitude: latLng.lat,
      longitude: latLng.lng,
      label: label || "Filial",
      kind: "branch",
    },
  };
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[‘’ʻʼ'`]/g, "'")
    .trim();
}

const ROLE_POSITION: Record<string, string> = {
  admin: "Admin",
  director: "Direktor",
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
  farmasevt: "Farmasevt",
  stajyor: "Stajyor",
};

async function findEmployeeByUserId(userId: number): Promise<WorkplaceEmp | null> {
  const [emp] = await db
    .select({
      id: employeesTable.id,
      userId: employeesTable.userId,
      fullName: employeesTable.fullName,
      location: employeesTable.location,
      latitude: employeesTable.latitude,
      longitude: employeesTable.longitude,
      orgRole: employeesTable.orgRole,
      reportsToId: employeesTable.reportsToId,
      assignedBranchId: employeesTable.assignedBranchId,
      shiftType: employeesTable.shiftType,
    })
    .from(employeesTable)
    .where(eq(employeesTable.userId, userId))
    .limit(1);
  return emp ?? null;
}

/**
 * Davomat majburiy: har bir faol user uchun employees yozuvi bo‘lishi shart.
 * — userId bo‘yicha topadi
 * — yoki F.I.Sh. mos kelgan xodimni bog‘laydi
 * — yo‘q bo‘lsa avtomatik yaratadi
 */
async function ensureEmployeeForUser(user: {
  id: number;
  fullName: string;
  role: string;
  departmentId: number | null;
}): Promise<WorkplaceEmp> {
  const existing = await findEmployeeByUserId(user.id);
  if (existing) return existing;

  const all = await db
    .select({
      id: employeesTable.id,
      userId: employeesTable.userId,
      fullName: employeesTable.fullName,
      location: employeesTable.location,
      latitude: employeesTable.latitude,
      longitude: employeesTable.longitude,
      orgRole: employeesTable.orgRole,
      reportsToId: employeesTable.reportsToId,
      assignedBranchId: employeesTable.assignedBranchId,
      shiftType: employeesTable.shiftType,
      employmentStatus: employeesTable.employmentStatus,
    })
    .from(employeesTable);

  const target = normalizeName(user.fullName);
  const byName = all.find(
    (e) =>
      normalizeName(e.fullName) === target &&
      (e.userId == null || e.userId === user.id) &&
      (e.employmentStatus || "working") !== "dismissed",
  );

  if (byName) {
    const orgRole = byName.orgRole || orgRoleFromUserRole(user.role);
    await db
      .update(employeesTable)
      .set({
        userId: user.id,
        ...(orgRole && !byName.orgRole ? { orgRole } : {}),
        updatedAt: new Date(),
      })
      .where(eq(employeesTable.id, byName.id));
    return {
      id: byName.id,
      userId: user.id,
      fullName: byName.fullName,
      location: byName.location,
      latitude: byName.latitude,
      longitude: byName.longitude,
      orgRole: orgRole,
      reportsToId: byName.reportsToId,
      assignedBranchId: byName.assignedBranchId,
      shiftType: byName.shiftType,
    };
  }

  let departmentId = user.departmentId;
  if (!departmentId) {
    const [anyDept] = await db
      .select({ id: departmentsTable.id })
      .from(departmentsTable)
      .limit(1);
    departmentId = anyDept?.id ?? 1;
  }

  const orgRole = orgRoleFromUserRole(user.role);
  const branchStaff = usesBranchDavomat(user.role, orgRole);
  const [created] = await db
    .insert(employeesTable)
    .values({
      fullName: user.fullName,
      position: ROLE_POSITION[user.role] || user.role || "Xodim",
      departmentId,
      hiredAt: todayTashkent(),
      userId: user.id,
      employmentStatus: "working",
      orgRole,
      location: branchStaff ? null : DAVOMAT_SITE_LABEL,
      latitude: branchStaff ? null : DAVOMAT_SITE_LAT,
      longitude: branchStaff ? null : DAVOMAT_SITE_LNG,
      shiftType: "one",
    })
    .returning({
      id: employeesTable.id,
      userId: employeesTable.userId,
      fullName: employeesTable.fullName,
      location: employeesTable.location,
      latitude: employeesTable.latitude,
      longitude: employeesTable.longitude,
      orgRole: employeesTable.orgRole,
      reportsToId: employeesTable.reportsToId,
      assignedBranchId: employeesTable.assignedBranchId,
      shiftType: employeesTable.shiftType,
    });

  if (!created) throw new Error("Xodim yaratilmadi");
  return created;
}

async function ensureAllActiveUsersLinked(): Promise<number> {
  const users = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      role: usersTable.role,
      departmentId: usersTable.departmentId,
    })
    .from(usersTable)
    .where(eq(usersTable.status, "active"));
  let n = 0;
  for (const u of users) {
    await ensureEmployeeForUser(u);
    n += 1;
  }
  return n;
}

async function matchFaceUserId(
  descriptor: number[] | number[][],
  snapshot?: unknown,
): Promise<
  | { ok: true; userId: number; faceId: number; dist: number; cosine: number }
  | { ok: false; error: string; code: string }
> {
  const matched = await matchFaceForAuthWithAi(descriptor, snapshot);
  if (!matched.ok) return { ok: false, error: matched.error, code: matched.code };
  return { ok: true, userId: matched.userId, faceId: matched.id, dist: matched.dist, cosine: matched.cosine };
}

async function geoGate(
  emp: WorkplaceEmp,
  userRole: string,
  latitude: number,
  longitude: number,
  _accuracyMeters?: number,
): Promise<
  | { ok: true; distanceMeters: number; effectiveRadius: number; point: DavomatPoint }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    }
> {
  const resolved = await resolveDavomatPoint(emp, userRole);
  if (!resolved.ok) return resolved;
  const point = resolved.point;
  const distanceMeters = haversineMeters(latitude, longitude, point.latitude, point.longitude);
  const effectiveRadius = DAVOMAT_GEOFENCE_METERS;

  if (distanceMeters > effectiveRadius) {
    const remainMeters = distanceMeters - effectiveRadius;
    const where = point.kind === "branch" ? "o‘z filiali" : "asosiy ofis";
    return {
      ok: false,
      status: 403,
      body: {
        error: `Hududdan tashqaridasiz (${where}): ${distanceMeters} m. Ruxsat faqat ${effectiveRadius} m. Yana ${remainMeters} m yaqinlashishingiz kerak.`,
        code: "outside_geofence",
        distanceMeters,
        remainMeters,
        allowedMeters: effectiveRadius,
        workplace: {
          location: point.label,
          latitude: point.latitude,
          longitude: point.longitude,
          kind: point.kind,
        },
        fullName: emp.fullName,
      },
    };
  }
  return { ok: true, distanceMeters, effectiveRadius, point };
}

type PunchFail = { ok: false; status: number; body: Record<string, unknown> };

function oncePerDayFail(
  emp: WorkplaceEmp,
  rec: { checkInAt: Date | null; checkOutAt: Date | null } | undefined,
  code: "already_in" | "already_complete",
): PunchFail {
  const checkIn = formatHm(rec?.checkInAt ?? null);
  const checkOut = formatHm(rec?.checkOutAt ?? null);
  return {
    ok: false,
    status: 400,
    body: {
      error:
        code === "already_complete"
          ? `Bugun allaqachon Keldim (${checkIn}) va Ketdim (${checkOut}). Kuniga faqat 1 marta.`
          : `Bugun allaqachon Keldim: ${checkIn}. Qayta belgilab bo‘lmaydi.`,
      code,
      fullName: emp.fullName,
      checkIn,
      checkOut,
      checkInAt: rec?.checkInAt ? rec.checkInAt.toISOString() : null,
      checkOutAt: rec?.checkOutAt ? rec.checkOutAt.toISOString() : null,
    },
  };
}

async function applyFacePunch(opts: {
  emp: WorkplaceEmp;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  faceProfileId: number;
  action: "in" | "out";
}): Promise<
  | { ok: true; payload: Record<string, unknown> }
  | PunchFail
> {
  const { emp, latitude, longitude, distanceMeters, faceProfileId, action } = opts;
  const hours = hoursForStaff(emp.orgRole, emp.shiftType);
  const workDate = todayTashkent();
  const now = new Date();
  const dateFilter = and(
    eq(attendanceRecordsTable.employeeId, emp.id),
    eq(attendanceRecordsTable.workDate, workDate),
  );

  const geoFields = {
    checkLatitude: latitude,
    checkLongitude: longitude,
    distanceMeters,
    source: "face" as const,
    userId: emp.userId,
    updatedAt: now,
  };

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(attendanceRecordsTable)
        .where(dateFilter)
        .limit(1)
        .for("update");

      if (existing?.checkOutAt) {
        return oncePerDayFail(emp, existing, "already_complete");
      }
      if (action === "in" && existing?.checkInAt) {
        return oncePerDayFail(emp, existing, "already_in");
      }
      if (action === "out" && !existing?.checkInAt) {
        return {
          ok: false,
          status: 400,
          body: {
            error: "Avval Keldim ni belgilang",
            code: "need_check_in",
            fullName: emp.fullName,
          },
        };
      }

      let checkInAt = existing?.checkInAt ?? null;
      let checkOutAt = existing?.checkOutAt ?? null;

      if (action === "in") {
        checkInAt = now;
        const status = computeMetrics(workDate, checkInAt, null, null, hours).status;
        if (existing) {
          await tx
            .update(attendanceRecordsTable)
            .set({ ...geoFields, checkInAt, status })
            .where(eq(attendanceRecordsTable.id, existing.id));
        } else {
          await tx.insert(attendanceRecordsTable).values({
            employeeId: emp.id,
            userId: emp.userId,
            workDate,
            checkInAt,
            status,
            ...geoFields,
            createdById: emp.userId,
          });
        }
      } else {
        checkOutAt = now;
        checkInAt = existing!.checkInAt;
        const status = computeMetrics(workDate, existing!.checkInAt, checkOutAt, null, hours).status;
        await tx
          .update(attendanceRecordsTable)
          .set({ ...geoFields, checkOutAt, status })
          .where(eq(attendanceRecordsTable.id, existing!.id));
      }

      await tx
        .update(faceProfilesTable)
        .set({ lastUsedAt: now })
        .where(eq(faceProfilesTable.id, faceProfileId));

      const metrics = computeMetrics(workDate, checkInAt, checkOutAt, null, hours);
      return {
        ok: true as const,
        payload: {
          ok: true,
          action,
          workDate,
          fullName: emp.fullName,
          location: emp.location,
          distanceMeters,
          allowedMeters: DAVOMAT_GEOFENCE_METERS,
          checkInAt: checkInAt ? checkInAt.toISOString() : null,
          checkOutAt: checkOutAt ? checkOutAt.toISOString() : null,
          message:
            action === "in"
              ? `${emp.fullName}: Keldim (${metrics.checkIn})`
              : `${emp.fullName}: Ketdi (${metrics.checkOut}). Ishlangan ${metrics.workedHours}`,
          ...metrics,
        },
      };
    });
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      const [existing] = await db
        .select()
        .from(attendanceRecordsTable)
        .where(dateFilter)
        .limit(1);
      if (existing?.checkOutAt) return oncePerDayFail(emp, existing, "already_complete");
      if (existing?.checkInAt) return oncePerDayFail(emp, existing, "already_in");
    }
    throw err;
  }
}

async function resolveFaceAtSite(opts: {
  descriptor: number[] | number[][];
  latitude: number;
  longitude: number;
  accuracy?: number;
  snapshot?: unknown;
}): Promise<
  | {
      ok: true;
      emp: WorkplaceEmp;
      faceId: number;
      user: { id: number; fullName: string; role: string };
      gate: { distanceMeters: number; effectiveRadius: number };
    }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const matched = await matchFaceUserId(opts.descriptor, opts.snapshot);
  if (!matched.ok) {
    return { ok: false, status: 401, body: { error: matched.error, code: matched.code } };
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      status: usersTable.status,
      role: usersTable.role,
      departmentId: usersTable.departmentId,
    })
    .from(usersTable)
    .where(eq(usersTable.id, matched.userId))
    .limit(1);
  if (!user || (user.status !== "active" && user.status !== "on_leave")) {
    return { ok: false, status: 403, body: { error: "Profil faol emas", code: "user_inactive" } };
  }

  const emp = await ensureEmployeeForUser(user);
  const gate = await geoGate(emp, user.role, opts.latitude, opts.longitude, opts.accuracy);
  if (!gate.ok) {
    return { ok: false, status: gate.status, body: gate.body };
  }
  return {
    ok: true,
    emp,
    faceId: matched.faceId,
    user: { id: user.id, fullName: user.fullName, role: user.role },
    gate: { distanceMeters: gate.distanceMeters, effectiveRadius: gate.effectiveRadius },
  };
}

/** Face ID tanilgan user — to‘liq profil + sessiya shu akkauntga */
async function adoptFaceSession(res: import("express").Response, userId: number) {
  setSessionCookie(res, userId);
  const [row] = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      role: usersTable.role,
      departmentId: usersTable.departmentId,
      departmentName: departmentsTable.name,
      login: usersTable.login,
      phone: usersTable.phone,
      status: usersTable.status,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);
  return row ?? null;
}

/** Login qilgan xodim — ish joyi GPS (UI masofa hisobi uchun) */
router.get("/davomat/me/workplace", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  try {
    const [user] = await db
      .select({
        id: usersTable.id,
        fullName: usersTable.fullName,
        role: usersTable.role,
        departmentId: usersTable.departmentId,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }
    const emp = await ensureEmployeeForUser(user);
    const resolved = await resolveDavomatPoint(emp, user.role);
    const point = resolved.ok
      ? resolved.point
      : {
          latitude: DAVOMAT_SITE_LAT,
          longitude: DAVOMAT_SITE_LNG,
          label: DAVOMAT_SITE_LABEL,
          kind: "office" as const,
        };
    const workDate = todayTashkent();
    const [rec] = await db
      .select()
      .from(attendanceRecordsTable)
      .where(
        and(
          eq(attendanceRecordsTable.employeeId, emp.id),
          eq(attendanceRecordsTable.workDate, workDate),
        ),
      )
      .limit(1);

    res.json({
      allowedMeters: DAVOMAT_GEOFENCE_METERS,
      site: {
        label: point.label,
        latitude: point.latitude,
        longitude: point.longitude,
        kind: point.kind,
      },
      gpsReady: resolved.ok,
      gpsError: resolved.ok ? null : String(resolved.body.error || "Filial GPS yo‘q"),
      workDate,
      shift: (() => {
        const w = shiftWindow(emp.shiftType);
        const pharmacy = isPharmacyShiftStaff(user.role, emp.orgRole);
        return pharmacy
          ? {
              type: w.key,
              label: w.label,
              start: w.start,
              end: w.end,
              warnHm: w.warnHm,
              warnText: w.warnText,
            }
          : null;
      })(),
      employee: {
        id: emp.id,
        fullName: emp.fullName,
        location: point.label,
        latitude: point.latitude,
        longitude: point.longitude,
        hasGps: resolved.ok,
      },
      today: rec
        ? {
            checkIn: formatHm(rec.checkInAt),
            checkOut: formatHm(rec.checkOutAt),
            checkInAt: rec.checkInAt ? rec.checkInAt.toISOString() : null,
            checkOutAt: rec.checkOutAt ? rec.checkOutAt.toISOString() : null,
            status: rec.status,
            complete: Boolean(rec.checkInAt && rec.checkOutAt),
            nextAction: !rec.checkInAt ? "in" : !rec.checkOutAt ? "out" : "done",
          }
        : {
            checkIn: "—",
            checkOut: "—",
            checkInAt: null,
            checkOutAt: null,
            status: "absent",
            complete: false,
            nextAction: "in",
          },
    });
  } catch (err) {
    console.error("GET /davomat/me/workplace error:", err);
    res.status(503).json({ error: "Ish joyi yuklanmadi" });
  }
});

/** Belgilangan davomat nuqtasi — login shart emas */
router.get("/davomat/site", async (_req, res): Promise<void> => {
  res.json({
    allowedMeters: DAVOMAT_GEOFENCE_METERS,
    label: DAVOMAT_SITE_LABEL,
    latitude: DAVOMAT_SITE_LAT,
    longitude: DAVOMAT_SITE_LNG,
  });
});

/** Banner / ogohlantirish holati — barcha login qilgan xodimlar */
router.get("/davomat/me/status", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  try {
    const workDate = todayTashkent();
    const [user] = await db
      .select({
        id: usersTable.id,
        fullName: usersTable.fullName,
        role: usersTable.role,
        departmentId: usersTable.departmentId,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);

    const emp = user ? await ensureEmployeeForUser(user) : null;
    let nextAction: "in" | "out" | "done" | "unlinked" = "unlinked";
    let checkIn = "—";
    let checkOut = "—";
    let fullName: string | null = user?.fullName ?? null;

    if (emp) {
      fullName = emp.fullName;
      const [rec] = await db
        .select()
        .from(attendanceRecordsTable)
        .where(
          and(
            eq(attendanceRecordsTable.employeeId, emp.id),
            eq(attendanceRecordsTable.workDate, workDate),
          ),
        )
        .limit(1);
      checkIn = formatHm(rec?.checkInAt ?? null);
      checkOut = formatHm(rec?.checkOutAt ?? null);
      if (!rec?.checkInAt) nextAction = "in";
      else if (!rec.checkOutAt) nextAction = "out";
      else nextAction = "done";
    }

    const messages: Record<string, string> = {
      in: `Bugun hali kelish belgilanmagan — Face ID bilan davomatdan o‘ting (${DAVOMAT_GEOFENCE_METERS} m hudud).`,
      out: "Kelish belgilandi. Ketishni ham Face ID bilan belgilang.",
      done: "Bugungi davomat yopilgan (kelish va ketish).",
      unlinked: "Davomat Face ID orqali majburiy.",
    };

    res.json({
      workDate,
      allowedMeters: DAVOMAT_GEOFENCE_METERS,
      siteLabel: DAVOMAT_SITE_LABEL,
      fullName,
      nextAction,
      checkIn,
      checkOut,
      message: messages[nextAction],
      linkUrl: "/davomat-face",
      warn: nextAction === "in" || nextAction === "out",
    });
  } catch (err) {
    console.error("GET /davomat/me/status error:", err);
    res.status(503).json({ error: "Davomat holati yuklanmadi" });
  }
});

/** HR/Direktor: barcha faol xodimlarga darhol xabar + xodim bog‘lash */
router.post("/davomat/announce", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireDavomat(req, res)) return;
  try {
    const linked = await ensureAllActiveUsersLinked();
    const sent = await forceBroadcastDavomatToAll();
    res.json({
      ok: true,
      sent,
      linked,
      message: `${sent} ta xabar, ${linked} ta akkaunt xodimlar bilan bog‘landi`,
    });
  } catch (err) {
    console.error("POST /davomat/announce error:", err);
    res.status(503).json({ error: "Xabar yuborilmadi" });
  }
});

/** Xodimning o‘z davomati (so‘nggi 14 kun) */
router.get("/davomat/me", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  try {
    const [user] = await db
      .select({
        id: usersTable.id,
        fullName: usersTable.fullName,
        role: usersTable.role,
        departmentId: usersTable.departmentId,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }
    const emp = await ensureEmployeeForUser(user);
    const own = await ownEmployeeReport(emp.id);
    res.json({
      from: own.from,
      to: own.to,
      fullName: emp.fullName,
      employee: own.employee,
    });
  } catch (err) {
    console.error("GET /davomat/me error:", err);
    res.status(503).json({ error: "Davomat yuklanmadi" });
  }
});

/** Face ID tasdiq — hali Keldim/Ketdim yozilmaydi */
router.post("/davomat/face-verify", async (req, res): Promise<void> => {
  try {
    const descriptors = Array.isArray(req.body?.descriptors)
      ? (req.body.descriptors as unknown[]).map(parseFaceDescriptor).filter((d): d is number[] => Boolean(d))
      : (() => {
          const one = parseFaceDescriptor(req.body?.descriptor);
          return one ? [one] : [];
        })();
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    const accuracy = Number(req.body?.accuracy);
    if (!descriptors.length) {
      res.status(400).json({ error: "Yuz aniq olinmadi — kameraga qarab turing" });
      return;
    }
    const live = evaluateLiveness(req.body?.liveness as LivenessProof | undefined, "login");
    if (!live.ok) {
      res.status(403).json({ error: live.error, code: live.code });
      return;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      res.status(400).json({ error: "GPS majburiy — lokatsiyaga ruxsat bering", code: "gps_required" });
      return;
    }
    const resolved = await resolveFaceAtSite({
      descriptor: descriptors,
      latitude,
      longitude,
      accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
      snapshot: req.body?.snapshot ?? req.body?.photo,
    });
    if (!resolved.ok) {
      res.status(resolved.status).json(resolved.body);
      return;
    }
    await maybeBackfillFacePhoto(resolved.faceId, req.body?.snapshot ?? req.body?.photo);
    const workDate = todayTashkent();
    const [rec] = await db
      .select()
      .from(attendanceRecordsTable)
      .where(
        and(
          eq(attendanceRecordsTable.employeeId, resolved.emp.id),
          eq(attendanceRecordsTable.workDate, workDate),
        ),
      )
      .limit(1);
    const nextAction = !rec?.checkInAt ? "in" : !rec.checkOutAt ? "out" : "done";
    const own = await ownEmployeeReport(resolved.emp.id);
    const sessionUser = await adoptFaceSession(res, resolved.user.id);
    res.json({
      ok: true,
      fullName: resolved.user.fullName,
      employeeId: resolved.emp.id,
      distanceMeters: resolved.gate.distanceMeters,
      allowedMeters: resolved.gate.effectiveRadius,
      workDate,
      nextAction,
      checkIn: formatHm(rec?.checkInAt ?? null),
      checkOut: formatHm(rec?.checkOutAt ?? null),
      checkInAt: rec?.checkInAt ? rec.checkInAt.toISOString() : null,
      checkOutAt: rec?.checkOutAt ? rec.checkOutAt.toISOString() : null,
      employee: own.employee,
      user: sessionUser,
      sessionSwitched: true,
    });
  } catch (err) {
    console.error("POST /davomat/face-verify error:", err);
    res.status(503).json({ error: "Yuz tasdiqlanmadi" });
  }
});

/**
 * Face ID davomat — login shart emas.
 * Yuz → user → avto xodim bog‘lash → GPS hududi → Keldim / Ketdim.
 */
router.post("/davomat/face-punch", async (req, res): Promise<void> => {
  try {
    const descriptor = parseFaceDescriptor(req.body?.descriptor);
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    const accuracy = Number(req.body?.accuracy);
    const actionRaw = String(req.body?.action || "");
    const action = actionRaw === "out" ? "out" : actionRaw === "in" ? "in" : null;

    if (!descriptor) {
      res.status(400).json({ error: "Yuz aniq olinmadi — kameraga qarab turing" });
      return;
    }
    // Liveness — faqat kamera skanida (face-verify). Keldim/Ketdim tugmasi qayta bosh burishni talab qilmaydi.
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      res.status(400).json({
        error: "GPS majburiy — lokatsiyaga ruxsat bering",
        code: "gps_required",
      });
      return;
    }
    if (!action) {
      res.status(400).json({ error: "action: in | out", code: "action_required" });
      return;
    }

    const resolved = await resolveFaceAtSite({
      descriptor,
      latitude,
      longitude,
      accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
      snapshot: req.body?.snapshot ?? req.body?.photo,
    });
    if (!resolved.ok) {
      res.status(resolved.status).json(resolved.body);
      return;
    }
    await maybeBackfillFacePhoto(resolved.faceId, req.body?.snapshot ?? req.body?.photo);

    const punched = await applyFacePunch({
      emp: resolved.emp,
      latitude,
      longitude,
      distanceMeters: resolved.gate.distanceMeters,
      faceProfileId: resolved.faceId,
      action,
    });
    if (!punched.ok) {
      res.status(punched.status).json(punched.body);
      return;
    }
    const own = await ownEmployeeReport(resolved.emp.id);
    const sessionUser = await adoptFaceSession(res, resolved.user.id);
    res.json({
      ...punched.payload,
      employee: own.employee,
      user: sessionUser,
      sessionSwitched: true,
    });
  } catch (err) {
    console.error("POST /davomat/face-punch error:", err);
    res.status(503).json({ error: "Face ID davomat yozilmadi" });
  }
});

/** Faqat masofa tekshiruvi (Face ID ochishdan oldin, login + workplace) */
router.post("/davomat/geo-check", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  try {
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    const accuracy = Number(req.body?.accuracy);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      res.status(400).json({ error: "GPS majburiy", code: "gps_required" });
      return;
    }
    const [user] = await db
      .select({
        id: usersTable.id,
        fullName: usersTable.fullName,
        role: usersTable.role,
        departmentId: usersTable.departmentId,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }
    const emp = await ensureEmployeeForUser(user);
    const gate = await geoGate(
      emp,
      user.role,
      latitude,
      longitude,
      Number.isFinite(accuracy) ? accuracy : undefined,
    );
    if (!gate.ok) {
      res.status(gate.status).json(gate.body);
      return;
    }
    res.json({
      ok: true,
      inside: true,
      distanceMeters: gate.distanceMeters,
      remainMeters: 0,
      allowedMeters: gate.effectiveRadius,
      fullName: emp.fullName,
      location: emp.location,
    });
  } catch (err) {
    console.error("POST /davomat/geo-check error:", err);
    res.status(503).json({ error: "GPS tekshiruv xatosi" });
  }
});

router.get("/davomat/export", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireDavomat(req, res)) return;
  try {
    const q = req.query as Record<string, string>;
    const to = q.to || todayTashkent();
    const from = q.from || addDays(to, -13);
    const employees = await loadActiveEmployees({
      departmentId: q.departmentId,
      location: q.location,
      search: q.search,
      employeeId: q.employeeId,
    });
    const records = await loadRecords(
      from,
      to,
      employees.map((e) => e.id),
    );
    const report = buildReport(employees, records, from, to);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "VAKSINA MED HR";
    workbook.created = new Date();

    const headerStyle = (cell: ExcelJS.Cell, fill = "FF0B3A5C") => {
      cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FF083049" } },
        left: { style: "thin", color: { argb: "FF083049" } },
        bottom: { style: "thin", color: { argb: "FF083049" } },
        right: { style: "thin", color: { argb: "FF083049" } },
      };
    };

    const paintRow = (row: ExcelJS.Row, zebra: boolean, centerCols: number[] = []) => {
      const bg = zebra ? "FFF7FAFC" : "FFFFFFFF";
      row.eachCell((cell, col) => {
        cell.font = { name: "Calibri", size: 10 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        cell.alignment = {
          vertical: "middle",
          horizontal: centerCols.includes(col) ? "center" : "left",
          wrapText: true,
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
      row.height = 20;
    };

    const statusUz: Record<string, string> = {
      present: "Kelgan",
      late: "Kech",
      incomplete: "Ketish yo‘q",
      absent: "Kelmagan",
      leave: "Ta’til",
    };

    const statusFill: Record<string, string> = {
      present: "FFECFDF5",
      late: "FFFFFBEB",
      incomplete: "FFF0F9FF",
      absent: "FFF8FAFC",
      leave: "FFF5F3FF",
    };
    const statusFont: Record<string, string> = {
      present: "FF047857",
      late: "FFB45309",
      incomplete: "FF0369A1",
      absent: "FF94A3B8",
      leave: "FF6D28D9",
    };

    const weekdayUz = ["Du", "Se", "Cho", "Pay", "Ju", "Sha", "Yak"];
    const weekdayLabel = (ymd: string) => {
      const [y, m, d] = ymd.split("-").map(Number);
      const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
      const idx = dow === 0 ? 6 : dow - 1;
      return weekdayUz[idx] ?? "";
    };

    const dayCellText = (d: (typeof report.employees)[0]["days"][0]) => {
      const st = statusUz[d.status] || d.status;
      if (d.status === "absent") return "Kelmagan";
      if (d.status === "leave") return "Ta’til";
      const lines = [st];
      if ((d.checkIn && d.checkIn !== "—") || (d.checkOut && d.checkOut !== "—")) {
        lines.push(`${d.checkIn || "—"}–${d.checkOut || "—"}`);
      }
      if (d.workedHours && d.workedHours !== "—" && d.workedHours !== "0:00") {
        lines.push(`Ish: ${d.workedHours}`);
      }
      if (d.lateArrivalLabel && d.lateArrivalLabel !== "—") {
        lines.push(`Kech: ${d.lateArrivalLabel}`);
      }
      if (d.earlyArrivalLabel && d.earlyArrivalLabel !== "—") {
        lines.push(`Erta: ${d.earlyArrivalLabel}`);
      }
      if (d.earlyLeaveLabel && d.earlyLeaveLabel !== "—") {
        lines.push(`Erta ket: ${d.earlyLeaveLabel}`);
      }
      if (d.overtimeLabel && d.overtimeLabel !== "—") {
        lines.push(`Kech ket: ${d.overtimeLabel}`);
      }
      return lines.join("\n");
    };

    const dates = report.dates?.length
      ? report.dates
      : report.days.map((d) => d.date);
    const metaCols = 5; // No, F.I.Sh., Lavozim, Bo'lim, Filial
    const lastCol = metaCols + dates.length;

    // —— Sheet 1: Jadval (1 xodim = 1 qator, sanalar o‘ngga) ——
    const sGrid = workbook.addWorksheet("Davomat jadvali", {
      views: [{ state: "frozen", ySplit: 2, xSplit: metaCols }],
    });
    sGrid.mergeCells(1, 1, 1, Math.max(lastCol, 6));
    const tGrid = sGrid.getCell("A1");
    tGrid.value = `VAKSINA MED — Davomat jadvali (${from} — ${to}) · ${dates.length} kun · Norma ${WORK_START}–${WORK_END} · Har qator = 1 xodim, sanalar o‘ngga`;
    tGrid.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
    tGrid.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3A5C" } };
    tGrid.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    sGrid.getRow(1).height = 28;

    const metaHeaders = ["No", "F.I.Sh.", "Lavozim", "Bo‘lim", "Filial"];
    metaHeaders.forEach((h, i) => {
      const cell = sGrid.getRow(2).getCell(i + 1);
      cell.value = h;
      headerStyle(cell, "FF1A5F8A");
    });
    dates.forEach((date, i) => {
      const col = metaCols + 1 + i;
      const c2 = sGrid.getRow(2).getCell(col);
      c2.value = `${weekdayLabel(date)}\n${date}`;
      headerStyle(c2, "FF0B3A5C");
    });
    sGrid.getRow(2).height = 36;

    sGrid.getColumn(1).width = 5;
    sGrid.getColumn(2).width = 28;
    sGrid.getColumn(3).width = 16;
    sGrid.getColumn(4).width = 16;
    sGrid.getColumn(5).width = 14;
    dates.forEach((_, i) => {
      sGrid.getColumn(metaCols + 1 + i).width = 16;
    });

    report.employees.forEach((e, idx) => {
      const row = sGrid.getRow(3 + idx);
      const zebra = idx % 2 === 0;
      const bg = zebra ? "FFF7FAFC" : "FFFFFFFF";
      const vals: (string | number)[] = [
        idx + 1,
        e.fullName,
        e.position,
        e.departmentName || "—",
        e.location || "—",
      ];
      vals.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v;
        cell.font = { name: "Calibri", size: 10, bold: i === 1 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        cell.alignment = {
          vertical: "middle",
          horizontal: i === 0 ? "center" : "left",
          wrapText: true,
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
      dates.forEach((date, i) => {
        const d = e.days.find((x) => x.date === date);
        const status = d?.status || "absent";
        const cell = row.getCell(metaCols + 1 + i);
        cell.value = d ? dayCellText(d) : "Kelmagan";
        cell.font = {
          name: "Calibri",
          size: 9,
          color: { argb: statusFont[status] || "FF64748B" },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: statusFill[status] || "FFF8FAFC" },
        };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
      row.height = 52;
    });
    if (lastCol >= 1) {
      sGrid.autoFilter = {
        from: { row: 2, column: 1 },
        to: { row: 2, column: Math.min(lastCol, metaCols) },
      };
    }

    // —— Sheet 2: Kunlik xulosa (faqat raqamlar) ——
    const s1 = workbook.addWorksheet("Kunlik xulosa", {
      views: [{ state: "frozen", ySplit: 2 }],
    });
    s1.mergeCells("A1:F1");
    const t1 = s1.getCell("A1");
    t1.value = `VAKSINA MED — Kunlik xulosa (${from} — ${to}) · Norma: ${WORK_START}–${WORK_END}`;
    t1.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
    t1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3A5C" } };
    t1.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    s1.getRow(1).height = 30;

    const h1 = ["Sana", "Kelgan", "Kech keldi", "Ketish yo‘q", "Ta’til", "Kelmagan"];
    h1.forEach((h, i) => {
      const cell = s1.getRow(2).getCell(i + 1);
      cell.value = h;
      headerStyle(cell, "FF1A5F8A");
    });
    s1.columns = [
      { width: 14 },
      { width: 12 },
      { width: 14 },
      { width: 14 },
      { width: 12 },
      { width: 12 },
    ];
    report.days.forEach((d, idx) => {
      const row = s1.addRow([d.date, d.present, d.late, d.incomplete, d.leave, d.absent]);
      paintRow(row, idx % 2 === 0, [1, 2, 3, 4, 5, 6]);
      if (d.absent > 0) {
        row.getCell(6).font = { name: "Calibri", size: 10, color: { argb: "FFB91C1C" } };
      }
      if (d.present > 0) {
        row.getCell(2).font = { name: "Calibri", size: 10, color: { argb: "FF047857" } };
      }
    });
    s1.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 6 } };

    // —— Sheet 3: Xodimlar jami ——
    const s3 = workbook.addWorksheet("Xodimlar jami", {
      views: [{ state: "frozen", ySplit: 2 }],
    });
    s3.mergeCells("A1:M1");
    const t3 = s3.getCell("A1");
    t3.value = `Xodimlar bo‘yicha jami (${from} — ${to}) · Norma ${WORK_START}–${WORK_END}`;
    t3.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
    t3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3A5C" } };
    t3.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    s3.getRow(1).height = 30;

    const h3 = [
      "No",
      "F.I.Sh.",
      "Lavozim",
      "Bo‘lim",
      "Filial",
      "Kelgan kun",
      "Kelmagan kun",
      "Kech kun",
      "Jami ishlagan",
      "Kech keldi (09:00 dan keyin)",
      "Erta keldi (09:00 dan oldin)",
      "Erta ketdi (18:00 dan oldin)",
      "Kech ketdi (18:00 dan keyin)",
    ];
    h3.forEach((h, i) => {
      const cell = s3.getRow(2).getCell(i + 1);
      cell.value = h;
      headerStyle(cell, "FF1A5F8A");
    });
    s3.columns = [
      { width: 5 },
      { width: 26 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 12 },
      { width: 12 },
      { width: 10 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 18 },
    ];
    report.employees.forEach((e, idx) => {
      const row = s3.addRow([
        idx + 1,
        e.fullName,
        e.position,
        e.departmentName || "—",
        e.location || "—",
        e.totals.present,
        e.totals.absent,
        e.totals.late,
        e.totals.workedHours,
        e.totals.lateArrivalLabel,
        e.totals.earlyArrivalLabel,
        e.totals.earlyLeaveLabel,
        e.totals.overtimeLabel,
      ]);
      paintRow(row, idx % 2 === 0, [1, 6, 7, 8, 9]);
    });
    s3.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 13 } };

    const paintBanner = (row: ExcelJS.Row, fill: string, lastCol: number) => {
      for (let c = 1; c <= lastCol; c++) {
        const cell = row.getCell(c);
        cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      }
      row.height = 22;
    };

    // —— Sheet 4: Kelganlar (oxiridan oldin, har qator = 1 xodim) ——
    const s4 = workbook.addWorksheet("Kelganlar", {
      views: [{ state: "frozen", ySplit: 2 }],
    });
    s4.mergeCells("A1:G1");
    const t4 = s4.getCell("A1");
    t4.value = `Kelganlar — har qator = 1 xodim (${from} — ${to})`;
    t4.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
    t4.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } };
    t4.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    s4.getRow(1).height = 30;
    ["Sana", "No", "F.I.Sh.", "Lavozim", "Holat", "Keldim", "Ketdim"].forEach((h, i) => {
      const cell = s4.getRow(2).getCell(i + 1);
      cell.value = h;
      headerStyle(cell, "FF059669");
    });
    s4.columns = [
      { width: 14 },
      { width: 6 },
      { width: 28 },
      { width: 18 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
    ];
    let presentCount = 0;
    report.days.forEach((day) => {
      const arrived = report.employees
        .map((e) => ({ e, d: e.days.find((x) => x.date === day.date) }))
        .filter(({ d }) => d && d.status !== "absent" && d.status !== "leave");
      if (arrived.length === 0) return;
      const banner = s4.addRow([`${day.date}  ·  ${arrived.length} kishi kelgan`, "", "", "", "", "", ""]);
      s4.mergeCells(banner.number, 1, banner.number, 7);
      paintBanner(banner, "FF047857", 7);
      arrived.forEach(({ e, d }, i) => {
        presentCount += 1;
        const row = s4.addRow([
          day.date,
          i + 1,
          e.fullName,
          e.position,
          statusUz[d!.status] || d!.status,
          d!.checkIn,
          d!.checkOut,
        ]);
        paintRow(row, i % 2 === 1, [1, 2, 5, 6, 7]);
      });
    });
    if (presentCount === 0) {
      const row = s4.addRow(["—", "", "Bu davrda kelgan xodim yo‘q", "", "", "", ""]);
      paintRow(row, false);
    }

    // —— Sheet 5: Kelmaganlar (oxirgi varaq, har qator = 1 xodim) ——
    const s5 = workbook.addWorksheet("Kelmaganlar", {
      views: [{ state: "frozen", ySplit: 2 }],
    });
    s5.mergeCells("A1:E1");
    const t5 = s5.getCell("A1");
    t5.value = `Kelmaganlar — har qator = 1 xodim (${from} — ${to})`;
    t5.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
    t5.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB91C1C" } };
    t5.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    s5.getRow(1).height = 30;
    ["Sana", "No", "F.I.Sh.", "Lavozim", "Bo‘lim"].forEach((h, i) => {
      const cell = s5.getRow(2).getCell(i + 1);
      cell.value = h;
      headerStyle(cell, "FFBE123C");
    });
    s5.columns = [
      { width: 14 },
      { width: 6 },
      { width: 28 },
      { width: 18 },
      { width: 18 },
    ];
    let absentCount = 0;
    report.days.forEach((day) => {
      const missing = report.employees
        .map((e) => ({ e, d: e.days.find((x) => x.date === day.date) }))
        .filter(({ d }) => d?.status === "absent");
      if (missing.length === 0) return;
      const banner = s5.addRow([`${day.date}  ·  ${missing.length} kishi kelmagan`, "", "", "", ""]);
      s5.mergeCells(banner.number, 1, banner.number, 5);
      paintBanner(banner, "FFB91C1C", 5);
      missing.forEach(({ e }, i) => {
        absentCount += 1;
        const row = s5.addRow([day.date, i + 1, e.fullName, e.position, e.departmentName || "—"]);
        paintRow(row, i % 2 === 1, [1, 2]);
      });
    });
    if (absentCount === 0) {
      const row = s5.addRow(["—", "", "Bu davrda kelmagan xodim yo‘q", "", ""]);
      paintRow(row, false);
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const stamp = `${from}_${to}`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="davomat_${stamp}.xlsx"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
  } catch (err) {
    console.error("GET /davomat/export error:", err);
    res.status(503).json({ error: "Excel yuklanmadi" });
  }
});

export default router;
