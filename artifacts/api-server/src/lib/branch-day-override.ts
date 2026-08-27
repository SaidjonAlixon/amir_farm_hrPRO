import { and, eq, gte, lte } from "drizzle-orm";
import { db, employeesTable, employeeBranchDayOverridesTable } from "@workspace/db";
import { displayBranchName, gpsFromLocationField } from "./geo-location";

export type DayBranchOverride = {
  id: number;
  employeeId: number;
  branchId: number;
  workDate: string;
  note: string | null;
  branchName: string;
  latitude: number;
  longitude: number;
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

/** Shu kunda vaqtinchalik filial GPS (bo‘lsa). */
export async function getDayBranchOverride(
  employeeId: number,
  workDate: string,
): Promise<DayBranchOverride | null> {
  const [row] = await db
    .select({
      id: employeeBranchDayOverridesTable.id,
      employeeId: employeeBranchDayOverridesTable.employeeId,
      branchId: employeeBranchDayOverridesTable.branchId,
      workDate: employeeBranchDayOverridesTable.workDate,
      note: employeeBranchDayOverridesTable.note,
      latitude: employeesTable.latitude,
      longitude: employeesTable.longitude,
      location: employeesTable.location,
      fullName: employeesTable.fullName,
    })
    .from(employeeBranchDayOverridesTable)
    .innerJoin(employeesTable, eq(employeesTable.id, employeeBranchDayOverridesTable.branchId))
    .where(
      and(
        eq(employeeBranchDayOverridesTable.employeeId, employeeId),
        eq(employeeBranchDayOverridesTable.workDate, workDate),
      ),
    )
    .limit(1);
  if (!row) return null;
  const coords = coordsFromEmp(row);
  if (!coords) return null;
  return {
    id: row.id,
    employeeId: row.employeeId,
    branchId: row.branchId,
    workDate: row.workDate,
    note: row.note,
    branchName: displayBranchName(row.location) || row.location || row.fullName || "Filial",
    latitude: coords.lat,
    longitude: coords.lng,
  };
}

export async function listDayBranchOverrides(
  employeeId: number,
  fromDate: string,
  toDate: string,
): Promise<
  Array<{
    id: number;
    employeeId: number;
    branchId: number;
    workDate: string;
    note: string | null;
    branchName: string;
  }>
> {
  const rows = await db
    .select({
      id: employeeBranchDayOverridesTable.id,
      employeeId: employeeBranchDayOverridesTable.employeeId,
      branchId: employeeBranchDayOverridesTable.branchId,
      workDate: employeeBranchDayOverridesTable.workDate,
      note: employeeBranchDayOverridesTable.note,
      location: employeesTable.location,
      fullName: employeesTable.fullName,
    })
    .from(employeeBranchDayOverridesTable)
    .innerJoin(employeesTable, eq(employeesTable.id, employeeBranchDayOverridesTable.branchId))
    .where(
      and(
        eq(employeeBranchDayOverridesTable.employeeId, employeeId),
        gte(employeeBranchDayOverridesTable.workDate, fromDate),
        lte(employeeBranchDayOverridesTable.workDate, toDate),
      ),
    );
  return rows
    .map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      branchId: r.branchId,
      workDate: r.workDate,
      note: r.note,
      branchName: displayBranchName(r.location) || r.location || r.fullName || "Filial",
    }))
    .sort((a, b) => a.workDate.localeCompare(b.workDate));
}
