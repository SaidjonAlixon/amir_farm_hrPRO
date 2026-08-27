import { eq } from "drizzle-orm";
import { db, shiftTemplatesTable } from "@workspace/db";
import {
  ALL_SHIFTS,
  hmToMinutes,
  type ShiftTypeKey,
  type ShiftWindow,
} from "./shift-hours";

let catalogCache: Map<string, ShiftWindow> | null = null;

function warnBefore(startHm: string, minutes: number): string {
  const total = hmToMinutes(startHm) - minutes;
  const h = Math.floor(((total % 1440) + 1440) % 1440 / 60);
  const m = ((total % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function rowToWindow(row: {
  key: string;
  label: string;
  hint: string;
  startHm: string;
  endHm: string;
  overnight: boolean;
  skipGeofence: boolean;
  warnHm: string;
  warnText: string;
}): ShiftWindow {
  return {
    key: row.key as ShiftTypeKey,
    label: row.label,
    hint: row.hint,
    start: row.startHm,
    end: row.endHm,
    overnight: row.overnight,
    skipGeofence: row.skipGeofence,
    warnHm: row.warnHm,
    warnText: row.warnText,
  };
}

function defaultToRow(s: ShiftWindow) {
  return {
    key: s.key,
    label: s.label,
    hint: s.hint,
    startHm: s.start,
    endHm: s.end,
    overnight: Boolean(s.overnight),
    skipGeofence: Boolean(s.skipGeofence),
    warnHm: s.warnHm,
    warnText: s.warnText,
    sortOrder: ALL_SHIFTS.findIndex((x) => x.key === s.key),
  };
}

export async function seedShiftTemplatesIfEmpty(): Promise<void> {
  const existing = await db.select({ key: shiftTemplatesTable.key }).from(shiftTemplatesTable).limit(1);
  if (existing.length) return;
  for (const s of ALL_SHIFTS) {
    try {
      await db.insert(shiftTemplatesTable).values(defaultToRow(s));
    } catch {
      /* parallel seed race */
    }
  }
}

export async function reloadShiftCatalog(): Promise<void> {
  await seedShiftTemplatesIfEmpty();
  const rows = await db.select().from(shiftTemplatesTable);
  const map = new Map<string, ShiftWindow>();
  for (const row of rows) {
    map.set(row.key, rowToWindow(row));
  }
  for (const s of ALL_SHIFTS) {
    if (!map.has(s.key)) map.set(s.key, s);
  }
  catalogCache = map;
}

export function getCachedShiftWindow(key: string): ShiftWindow {
  const k = key as ShiftTypeKey;
  if (catalogCache?.has(k)) return catalogCache.get(k)!;
  return ALL_SHIFTS.find((s) => s.key === k) ?? ALL_SHIFTS[0]!;
}

export function getCatalogShifts(): ShiftWindow[] {
  return ALL_SHIFTS.map((s) => getCachedShiftWindow(s.key));
}

export type EmployeeShiftFields = {
  shiftType?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  shiftLabel?: string | null;
  orgRole?: string | null;
};

export function resolveEmployeeShift(emp: EmployeeShiftFields): ShiftWindow {
  const key = emp.shiftType === "custom" ? "custom" : emp.shiftType || "one";
  if (key === "custom") {
    const start = emp.shiftStart?.trim() || "09:00";
    const end = emp.shiftEnd?.trim() || "18:00";
    const label = emp.shiftLabel?.trim() || "Maxsus";
    const overnight = hmToMinutes(end) <= hmToMinutes(start);
    return {
      key: "custom",
      label,
      hint: label,
      start,
      end,
      overnight,
      warnHm: warnBefore(start, 15),
      warnText: `${label}: ${start}–${end}. Kechiksa — jarima.`,
    };
  }
  return getCachedShiftWindow(key);
}

export function shiftHoursLabelForEmployee(emp: EmployeeShiftFields): string {
  const w = resolveEmployeeShift(emp);
  if (w.overnight) return `${w.label}: ${w.start}–${w.end} (ertalab)`;
  if (w.skipGeofence) return `${w.label}: ${w.start}–${w.end} · GPS majburiy emas`;
  return `${w.label}: ${w.start}–${w.end}`;
}

export function hoursForEmployee(emp: EmployeeShiftFields): { start: string; end: string } {
  const w = resolveEmployeeShift(emp);
  return { start: w.start, end: w.end };
}

export function shiftSkipsGeofenceForEmployee(emp: EmployeeShiftFields): boolean {
  return Boolean(resolveEmployeeShift(emp).skipGeofence);
}

export function isValidHm(raw?: string | null): boolean {
  return Boolean(raw && /^\d{1,2}:\d{2}$/.test(raw.trim()));
}

export function normalizeHm(raw: string): string {
  const [h, m] = raw.trim().split(":").map(Number);
  return `${String(h || 0).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
}

export async function updateShiftTemplate(
  key: string,
  patch: Partial<{
    label: string;
    hint: string;
    startHm: string;
    endHm: string;
    overnight: boolean;
    skipGeofence: boolean;
    warnHm: string;
    warnText: string;
  }>,
): Promise<ShiftWindow | null> {
  const existing = await db
    .select()
    .from(shiftTemplatesTable)
    .where(eq(shiftTemplatesTable.key, key))
    .limit(1);
  if (!existing[0]) return null;

  const startHm = patch.startHm ? normalizeHm(patch.startHm) : existing[0].startHm;
  const endHm = patch.endHm ? normalizeHm(patch.endHm) : existing[0].endHm;
  const overnight =
    patch.overnight !== undefined
      ? patch.overnight
      : hmToMinutes(endHm) <= hmToMinutes(startHm);

  const next = {
    label: patch.label?.trim() || existing[0].label,
    hint: patch.hint?.trim() ?? existing[0].hint,
    startHm,
    endHm,
    overnight,
    skipGeofence: patch.skipGeofence ?? existing[0].skipGeofence,
    warnHm: patch.warnHm ? normalizeHm(patch.warnHm) : warnBefore(startHm, 15),
    warnText: patch.warnText?.trim() || existing[0].warnText,
    updatedAt: new Date(),
  };

  await db.update(shiftTemplatesTable).set(next).where(eq(shiftTemplatesTable.key, key));
  await reloadShiftCatalog();
  return getCachedShiftWindow(key);
}
