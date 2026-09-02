import { and, eq, gte, lte } from "drizzle-orm";
import {
  db,
  employeeDayShiftPlansTable,
  employeesTable,
} from "@workspace/db";
import { getDayBranchOverride } from "./branch-day-override";
import { displayBranchName, gpsFromLocationField } from "./geo-location";
import {
  getCachedShiftWindow,
  isValidHm,
  normalizeHm,
  reloadShiftCatalogIfStale,
  resolveEmployeeShift,
  type EmployeeShiftFields,
} from "./shift-catalog";
import { hmToMinutes, isValidShiftType, type ShiftTypeKey } from "./shift-hours";

export type ShiftSegmentPlan = {
  segmentOrder: number;
  shiftType: ShiftTypeKey;
  label: string;
  hint: string;
  start: string;
  end: string;
  overnight: boolean;
  skipGeofence: boolean;
  warnHm: string;
  warnText: string;
  branchId: number | null;
  branchName: string | null;
  latitude: number | null;
  longitude: number | null;
  planId: number | null;
  note: string | null;
};

export type DayShiftPlanItem = {
  id: number;
  employeeId: number;
  workDate: string;
  segmentOrder: number;
  shiftType: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  branchId: number | null;
  branchName: string | null;
  note: string | null;
};

export type EmployeeForSchedule = EmployeeShiftFields & {
  id: number;
  assignedBranchId?: number | null;
  reportsToId?: number | null;
  orgRole?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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

function resolveSegmentWindow(
  shiftType: string,
  shiftStart?: string | null,
  shiftEnd?: string | null,
  shiftLabel?: string | null,
): ReturnType<typeof resolveEmployeeShift> {
  const st = isValidShiftType(shiftType) ? shiftType : "one";
  if (st === "custom") {
    return resolveEmployeeShift({
      shiftType: "custom",
      shiftStart: shiftStart || "09:00",
      shiftEnd: shiftEnd || "18:00",
      shiftLabel: shiftLabel || "Maxsus",
    });
  }
  const base = getCachedShiftWindow(st);
  const start = shiftStart?.trim() || base.start;
  const end = shiftEnd?.trim() || base.end;
  if (st === "three" || (shiftStart?.trim() && shiftEnd?.trim())) {
    const overnight = hmToMinutes(end) <= hmToMinutes(start);
    return {
      ...base,
      key: st,
      start,
      end,
      overnight,
      warnHm: base.warnHm,
      warnText: `${base.label}: ${start}–${end}. Kechiksa — jarima.`,
    };
  }
  return base;
}

async function branchCoords(
  branchId: number,
): Promise<{ branchName: string; latitude: number; longitude: number } | null> {
  const [row] = await db
    .select({
      latitude: employeesTable.latitude,
      longitude: employeesTable.longitude,
      location: employeesTable.location,
      fullName: employeesTable.fullName,
    })
    .from(employeesTable)
    .where(eq(employeesTable.id, branchId))
    .limit(1);
  if (!row) return null;
  const coords = coordsFromEmp(row);
  if (!coords) return null;
  return {
    branchName: displayBranchName(row.location) || row.location || row.fullName || "Filial",
    latitude: coords.lat,
    longitude: coords.lng,
  };
}

async function homeBranchId(emp: EmployeeForSchedule): Promise<number | null> {
  return emp.assignedBranchId || (emp.orgRole === "manager" ? emp.id : emp.reportsToId) || null;
}

/** Shu kundagi smena rejasi (bir yoki bir nechta segment). */
export async function getDayShiftSchedule(
  emp: EmployeeForSchedule,
  workDate: string,
): Promise<ShiftSegmentPlan[]> {
  await reloadShiftCatalogIfStale();
  const planRows = await db
    .select()
    .from(employeeDayShiftPlansTable)
    .where(
      and(
        eq(employeeDayShiftPlansTable.employeeId, emp.id),
        eq(employeeDayShiftPlansTable.workDate, workDate),
      ),
    );

  if (planRows.length) {
    const sorted = [...planRows].sort((a, b) => a.segmentOrder - b.segmentOrder);
    const segments: ShiftSegmentPlan[] = [];
    for (const row of sorted) {
      const w = resolveSegmentWindow(row.shiftType, row.shiftStart, row.shiftEnd);
      let branchName: string | null = null;
      let latitude: number | null = null;
      let longitude: number | null = null;
      const bid = row.branchId ?? (await homeBranchId(emp));
      if (bid) {
        const bc = await branchCoords(bid);
        if (bc) {
          branchName = bc.branchName;
          latitude = bc.latitude;
          longitude = bc.longitude;
        }
      }
      segments.push({
        segmentOrder: row.segmentOrder,
        shiftType: w.key,
        label: w.label,
        hint: w.hint,
        start: w.start,
        end: w.end,
        overnight: Boolean(w.overnight),
        skipGeofence: Boolean(w.skipGeofence),
        warnHm: w.warnHm,
        warnText: w.warnText,
        branchId: row.branchId ?? bid,
        branchName,
        latitude,
        longitude,
        planId: row.id,
        note: row.note,
      });
    }
    return segments;
  }

  const legacyBranch = await getDayBranchOverride(emp.id, workDate);
  const w = resolveEmployeeShift(emp);
  const branchId = legacyBranch?.branchId ?? (await homeBranchId(emp));
  let branchName = legacyBranch?.branchName ?? null;
  let latitude = legacyBranch?.latitude ?? null;
  let longitude = legacyBranch?.longitude ?? null;

  if (!legacyBranch && branchId) {
    const bc = await branchCoords(branchId);
    if (bc) {
      branchName = bc.branchName;
      latitude = bc.latitude;
      longitude = bc.longitude;
    }
  }

  return [
    {
      segmentOrder: 0,
      shiftType: w.key,
      label: w.label,
      hint: w.hint,
      start: w.start,
      end: w.end,
      overnight: Boolean(w.overnight),
      skipGeofence: Boolean(w.skipGeofence),
      warnHm: w.warnHm,
      warnText: w.warnText,
      branchId,
      branchName,
      latitude,
      longitude,
      planId: null,
      note: legacyBranch ? `Vaqtinchalik filial (${workDate})` : null,
    },
  ];
}

export type AttendanceSegmentRec = {
  segmentOrder: number;
  checkInAt: Date | null;
  checkOutAt: Date | null;
};

export type ActiveSegmentContext = {
  segment: ShiftSegmentPlan;
  segmentOrder: number;
  nextAction: "in" | "out" | "done";
  allDone: boolean;
  record?: AttendanceSegmentRec;
};

/** Faol smena segmenti — davomat punch uchun. */
export function findActiveSegmentContext(
  schedule: ShiftSegmentPlan[],
  records: AttendanceSegmentRec[],
): ActiveSegmentContext {
  if (!schedule.length) {
    const fallback: ShiftSegmentPlan = {
      segmentOrder: 0,
      shiftType: "one",
      label: "1-smena",
      hint: "",
      start: "08:00",
      end: "17:00",
      overnight: false,
      skipGeofence: false,
      warnHm: "07:45",
      warnText: "",
      branchId: null,
      branchName: null,
      latitude: null,
      longitude: null,
      planId: null,
      note: null,
    };
    const rec = records.find((r) => r.segmentOrder === 0);
    if (!rec?.checkInAt) return { segment: fallback, segmentOrder: 0, nextAction: "in", allDone: false, record: rec };
    if (!rec.checkOutAt) return { segment: fallback, segmentOrder: 0, nextAction: "out", allDone: false, record: rec };
    return { segment: fallback, segmentOrder: 0, nextAction: "done", allDone: true, record: rec };
  }

  for (const seg of schedule) {
    const rec = records.find((r) => r.segmentOrder === seg.segmentOrder);
    if (!rec?.checkInAt) {
      return { segment: seg, segmentOrder: seg.segmentOrder, nextAction: "in", allDone: false, record: rec };
    }
    if (!rec.checkOutAt) {
      return { segment: seg, segmentOrder: seg.segmentOrder, nextAction: "out", allDone: false, record: rec };
    }
  }

  const last = schedule[schedule.length - 1]!;
  const lastRec = records.find((r) => r.segmentOrder === last.segmentOrder);
  return {
    segment: last,
    segmentOrder: last.segmentOrder,
    nextAction: "done",
    allDone: true,
    record: lastRec,
  };
}

export function hoursForSegment(segment: ShiftSegmentPlan): { start: string; end: string } {
  return { start: segment.start, end: segment.end };
}

export async function listDayShiftPlans(
  employeeId: number,
  fromDate: string,
  toDate: string,
): Promise<DayShiftPlanItem[]> {
  const rows = await db
    .select({
      id: employeeDayShiftPlansTable.id,
      employeeId: employeeDayShiftPlansTable.employeeId,
      workDate: employeeDayShiftPlansTable.workDate,
      segmentOrder: employeeDayShiftPlansTable.segmentOrder,
      shiftType: employeeDayShiftPlansTable.shiftType,
      shiftStart: employeeDayShiftPlansTable.shiftStart,
      shiftEnd: employeeDayShiftPlansTable.shiftEnd,
      branchId: employeeDayShiftPlansTable.branchId,
      note: employeeDayShiftPlansTable.note,
      location: employeesTable.location,
      fullName: employeesTable.fullName,
    })
    .from(employeeDayShiftPlansTable)
    .leftJoin(employeesTable, eq(employeesTable.id, employeeDayShiftPlansTable.branchId))
    .where(
      and(
        eq(employeeDayShiftPlansTable.employeeId, employeeId),
        gte(employeeDayShiftPlansTable.workDate, fromDate),
        lte(employeeDayShiftPlansTable.workDate, toDate),
      ),
    );

  return rows
    .map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      workDate: r.workDate,
      segmentOrder: r.segmentOrder,
      shiftType: r.shiftType,
      shiftStart: r.shiftStart,
      shiftEnd: r.shiftEnd,
      branchId: r.branchId,
      branchName: r.branchId
        ? displayBranchName(r.location) || r.location || r.fullName || "Filial"
        : null,
      note: r.note,
    }))
    .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.segmentOrder - b.segmentOrder);
}

export type DayPlanSegmentInput = {
  shiftType: string;
  shiftStart?: string;
  shiftEnd?: string;
  branchId?: number | null;
};

export function validateDayPlanSegments(segments: DayPlanSegmentInput[]): string | null {
  if (!segments.length) return "Kamida bitta smena segmenti kerak";
  if (segments.length > 4) return "Bir kunda 4 tadan ortiq smena bo‘lmaydi";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (!isValidShiftType(seg.shiftType)) return `${i + 1}-segment: smena turi noto‘g‘ri`;
    const st = seg.shiftType as ShiftTypeKey;
    if (st === "custom" || st === "three") {
      if (!isValidHm(seg.shiftStart) || !isValidHm(seg.shiftEnd)) {
        return `${i + 1}-segment: boshlanish va tugash vaqti (HH:MM) kerak`;
      }
    }
  }
  return null;
}

export async function saveDayShiftPlan(
  employeeId: number,
  workDate: string,
  segments: DayPlanSegmentInput[],
  opts: { note?: string; createdById?: number | null },
): Promise<void> {
  const err = validateDayPlanSegments(segments);
  if (err) throw new Error(err);

  await db
    .delete(employeeDayShiftPlansTable)
    .where(
      and(
        eq(employeeDayShiftPlansTable.employeeId, employeeId),
        eq(employeeDayShiftPlansTable.workDate, workDate),
      ),
    );

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const st = seg.shiftType as ShiftTypeKey;
    await db.insert(employeeDayShiftPlansTable).values({
      employeeId,
      workDate,
      segmentOrder: i,
      shiftType: st,
      shiftStart:
        st === "custom" || st === "three" ? normalizeHm(seg.shiftStart!) : seg.shiftStart?.trim() || null,
      shiftEnd:
        st === "custom" || st === "three" ? normalizeHm(seg.shiftEnd!) : seg.shiftEnd?.trim() || null,
      branchId: seg.branchId ?? null,
      note: i === 0 ? opts.note?.trim() || null : null,
      createdById: opts.createdById ?? null,
    });
  }
}

export async function deleteDayShiftPlan(employeeId: number, workDate: string): Promise<void> {
  await db
    .delete(employeeDayShiftPlansTable)
    .where(
      and(
        eq(employeeDayShiftPlansTable.employeeId, employeeId),
        eq(employeeDayShiftPlansTable.workDate, workDate),
      ),
    );
}

/** Guruhlangan kunlik rejalar (UI uchun) */
export function groupDayPlansByDate(items: DayShiftPlanItem[]): Array<{
  workDate: string;
  segments: DayShiftPlanItem[];
}> {
  const map = new Map<string, DayShiftPlanItem[]>();
  for (const item of items) {
    const list = map.get(item.workDate) || [];
    list.push(item);
    map.set(item.workDate, list);
  }
  return [...map.entries()]
    .map(([workDate, segments]) => ({
      workDate,
      segments: segments.sort((a, b) => a.segmentOrder - b.segmentOrder),
    }))
    .sort((a, b) => a.workDate.localeCompare(b.workDate));
}
