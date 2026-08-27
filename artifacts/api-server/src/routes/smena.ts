import { Router, type IRouter } from "express";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, employeesTable, employeeBranchDayOverridesTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { isHrRole } from "../lib/roles";
import { notifyUser } from "../lib/notify";
import {
  getCatalogShifts,
  isValidHm,
  normalizeHm,
  reloadShiftCatalog,
  resolveEmployeeShift,
  shiftHoursLabelForEmployee,
} from "../lib/shift-catalog";
import { isPharmacyShiftStaff, isValidShiftType, normalizeShiftType, type ShiftTypeKey } from "../lib/shift-hours";
import { listDayBranchOverrides } from "../lib/branch-day-override";

const router: IRouter = Router();

const STAFF_ORG = new Set(["pharmacist", "intern"]);
const MANAGER_ORG = "manager";

function isLeadRole(role: string) {
  return role === "admin" || role === "director" || role === "koordinator" || isHrRole(role);
}

function isAdminLike(role: string) {
  return role === "admin" || role === "director" || isHrRole(role);
}

type EmpRow = {
  id: number;
  userId: number | null;
  fullName: string;
  position: string;
  orgRole: string | null;
  reportsToId: number | null;
  assignedBranchId: number | null;
  shiftType: string | null;
  shiftLabel: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  employmentStatus: string | null;
};

const EMP_COLS = {
  id: employeesTable.id,
  userId: employeesTable.userId,
  fullName: employeesTable.fullName,
  position: employeesTable.position,
  orgRole: employeesTable.orgRole,
  reportsToId: employeesTable.reportsToId,
  assignedBranchId: employeesTable.assignedBranchId,
  shiftType: employeesTable.shiftType,
  shiftLabel: employeesTable.shiftLabel,
  shiftStart: employeesTable.shiftStart,
  shiftEnd: employeesTable.shiftEnd,
  location: employeesTable.location,
  latitude: employeesTable.latitude,
  longitude: employeesTable.longitude,
  employmentStatus: employeesTable.employmentStatus,
};

async function empByUserId(userId: number): Promise<EmpRow | null> {
  const [row] = await db.select(EMP_COLS).from(employeesTable).where(eq(employeesTable.userId, userId)).limit(1);
  return row ?? null;
}

async function empById(id: number): Promise<EmpRow | null> {
  const [row] = await db.select(EMP_COLS).from(employeesTable).where(eq(employeesTable.id, id)).limit(1);
  return row ?? null;
}

function hasGps(e: { latitude: number | null; longitude: number | null }) {
  return e.latitude != null && e.longitude != null && Number.isFinite(e.latitude) && Number.isFinite(e.longitude);
}

async function listBranches() {
  const rows = await db
    .select({
      id: employeesTable.id,
      fullName: employeesTable.fullName,
      location: employeesTable.location,
      latitude: employeesTable.latitude,
      longitude: employeesTable.longitude,
      reportsToId: employeesTable.reportsToId,
    })
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.orgRole, MANAGER_ORG),
        sql`coalesce(${employeesTable.employmentStatus}, 'working') <> 'dismissed'`,
      ),
    );
  return rows
    .filter(hasGps)
    .map((b) => ({
      id: b.id,
      fullName: b.fullName,
      name: (b.location || "").split("|")[0].trim() || b.fullName,
      managerName: b.fullName,
      hasGps: true,
      reportsToId: b.reportsToId,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "uz"));
}

async function coordinatorScopeIds(coordEmp: EmpRow): Promise<Set<number>> {
  const mgrs = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(eq(employeesTable.reportsToId, coordEmp.id));
  const ids = new Set(mgrs.map((m) => m.id));
  ids.add(coordEmp.id);
  if (!ids.size) return ids;
  const staff = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(
      or(inArray(employeesTable.reportsToId, [...ids]), inArray(employeesTable.assignedBranchId, [...ids])),
    );
  for (const s of staff) ids.add(s.id);
  return ids;
}

function canPickOwnBranch(role: string, orgRole: string | null) {
  return role === "mudir" || orgRole === MANAGER_ORG || isLeadRole(role);
}

function canAssignTarget(opts: {
  role: string;
  me: EmpRow;
  target: EmpRow;
  scope: Set<number> | null;
}): boolean {
  const { role, me, target, scope } = opts;
  const org = target.orgRole || "";
  if (isAdminLike(role)) return true;
  if (role === "koordinator") {
    if (!(STAFF_ORG.has(org) || org === MANAGER_ORG)) return false;
    if (!scope) return true;
    return scope.has(target.id) || target.reportsToId === me.id;
  }
  if (role === "mudir" || me.orgRole === MANAGER_ORG) {
    if (target.id === me.id) return true;
    if (!(org === "pharmacist" || org === "intern")) return false;
    return (
      target.reportsToId === me.id ||
      target.assignedBranchId === me.id ||
      target.reportsToId === me.assignedBranchId
    );
  }
  if (role === "farmasevt" || me.orgRole === "pharmacist") {
    if (org !== "intern") return false;
    const myBranch = me.assignedBranchId || me.reportsToId;
    return (
      target.reportsToId === me.id ||
      target.reportsToId === myBranch ||
      target.assignedBranchId === myBranch ||
      target.assignedBranchId === me.id
    );
  }
  return false;
}

function serializeShift(emp: EmpRow | null) {
  const fields = emp || { shiftType: "one" };
  const w = resolveEmployeeShift(fields);
  return {
    type: w.key,
    label: w.label,
    hint: w.hint,
    start: w.start,
    end: w.end,
    overnight: Boolean(w.overnight),
    skipGeofence: Boolean(w.skipGeofence),
    warnHm: w.warnHm,
    warnText: w.warnText,
    hoursNote: shiftHoursLabelForEmployee(fields),
    shiftLabel: emp?.shiftLabel ?? null,
    shiftStart: emp?.shiftStart ?? null,
    shiftEnd: emp?.shiftEnd ?? null,
  };
}

function catalogShifts() {
  return getCatalogShifts().map((s) => ({
    type: s.key,
    label: s.label,
    hint: s.hint,
    start: s.start,
    end: s.end,
    overnight: Boolean(s.overnight),
    skipGeofence: Boolean(s.skipGeofence),
    hoursNote: s.skipGeofence
      ? `${s.label}: ${s.start}–${s.end} · GPS majburiy emas`
      : s.overnight
        ? `${s.label}: ${s.start}–${s.end} (ertalab)`
        : `${s.label}: ${s.start}–${s.end}`,
  }));
}

function applyShiftPatch(
  body: {
    shiftType?: string;
    shiftLabel?: string;
    shiftStart?: string;
    shiftEnd?: string;
  },
  patch: Record<string, unknown>,
  opts: { adminLike: boolean },
) {
  if (body.shiftType == null) return null;
  if (!isValidShiftType(body.shiftType)) {
    return "Smena turi noto‘g‘ri";
  }
  const st = body.shiftType as ShiftTypeKey;
  if (st === "custom") {
    if (!opts.adminLike) return "Maxsus smena vaqtini faqat admin belgilaydi";
    if (!isValidHm(body.shiftStart) || !isValidHm(body.shiftEnd)) {
      return "Maxsus smena uchun boshlanish va tugash vaqti (HH:MM) kerak";
    }
    const start = normalizeHm(body.shiftStart!);
    const end = normalizeHm(body.shiftEnd!);
    const label = body.shiftLabel?.trim() || "Maxsus";
    patch.shiftType = "custom";
    patch.shiftStart = start;
    patch.shiftEnd = end;
    patch.shiftLabel = label;
    return null;
  }
  patch.shiftType = st;
  patch.shiftStart = null;
  patch.shiftEnd = null;
  patch.shiftLabel = shiftHoursLabelForEmployee({ shiftType: st });
  return null;
}

router.get("/smena/me", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  await reloadShiftCatalog();
  const role = req.userRole || "";
  const me = await empByUserId(req.userId!);
  const pharmacy = isPharmacyShiftStaff(role, me?.orgRole);
  const branches = pharmacy || isLeadRole(role) ? await listBranches() : [];
  const assignedId = me?.assignedBranchId || (me?.orgRole === MANAGER_ORG ? me.id : me?.reportsToId) || null;
  const assigned = assignedId ? branches.find((b) => b.id === assignedId) || null : null;

  const assignable: Array<{
    id: number;
    fullName: string;
    position: string;
    orgRole: string | null;
    shiftType: string;
    shiftLabel: string;
    shiftStart: string | null;
    shiftEnd: string | null;
    assignedBranchId: number | null;
    assignedBranchName: string | null;
  }> = [];

  if (me && (role === "mudir" || role === "farmasevt" || role === "koordinator" || isLeadRole(role))) {
    const scope = role === "koordinator" ? await coordinatorScopeIds(me) : null;
    const people = await db
      .select(EMP_COLS)
      .from(employeesTable)
      .where(sql`coalesce(${employeesTable.employmentStatus}, 'working') <> 'dismissed'`);

    const branchName = (id: number | null) => branches.find((b) => b.id === id)?.name || null;
    for (const p of people) {
      if (!canAssignTarget({ role, me, target: p, scope })) continue;
      if (p.id === me.id && (role === "farmasevt" || p.orgRole === "pharmacist") && !isAdminLike(role)) continue;
      assignable.push({
        id: p.id,
        fullName: p.fullName,
        position: p.position,
        orgRole: p.orgRole,
        shiftType: normalizeShiftType(p.shiftType),
        shiftLabel: shiftHoursLabelForEmployee(p),
        shiftStart: p.shiftStart,
        shiftEnd: p.shiftEnd,
        assignedBranchId: p.assignedBranchId || (p.orgRole === MANAGER_ORG ? p.id : p.reportsToId),
        assignedBranchName:
          branchName(p.assignedBranchId) ||
          branchName(p.orgRole === MANAGER_ORG ? p.id : p.reportsToId) ||
          null,
      });
    }
    assignable.sort((a, b) => a.fullName.localeCompare(b.fullName, "uz"));
  }

  const canPickShift = pharmacy || isAdminLike(role) || Boolean(me);

  res.json({
    pharmacyStaff: pharmacy,
    canPickShift,
    canPickOwnBranch: Boolean(me && canPickOwnBranch(role, me.orgRole)),
    canAssignOthers: assignable.length > 0,
    canAssignAny: isAdminLike(role),
    canEditShiftTemplates: isAdminLike(role),
    employee: me
      ? {
          id: me.id,
          fullName: me.fullName,
          orgRole: me.orgRole,
          assignedBranchId: assignedId,
          assignedBranchName: assigned?.name || me.location || null,
        }
      : null,
    shift: serializeShift(me),
    shifts: catalogShifts(),
    branches: branches.map(({ id, name, managerName, hasGps }) => ({ id, name, managerName, hasGps })),
    assignable,
    rules: {
      custom: "Admin istalgan lavozimdagi xodimga maxsus ish vaqti belgilay oladi.",
      branch:
        "Admin istalgan lavozimdagi xodimni istalgan smena/filialga o‘tkaza oladi. Face ID filial GPS (35 m) da; masofadan/erkin grafikda GPS talab qilinmaydi.",
    },
  });
});

router.patch("/smena/me", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole || "";
  const me = await empByUserId(req.userId!);
  if (!me) {
    res.status(400).json({ error: "Xodim kartochkasi yo‘q" });
    return;
  }
  const body = req.body as {
    shiftType?: string;
    assignedBranchId?: number | null;
    shiftLabel?: string;
    shiftStart?: string;
    shiftEnd?: string;
  };
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (body.shiftType != null) {
    if (!isPharmacyShiftStaff(role, me.orgRole) && !isAdminLike(role)) {
      res.status(403).json({ error: "Smena tanlash uchun ruxsat yo‘q" });
      return;
    }
    const err = applyShiftPatch(body, patch, { adminLike: isAdminLike(role) });
    if (err) {
      res.status(400).json({ error: err });
      return;
    }
  }

  if (body.assignedBranchId !== undefined) {
    if (!canPickOwnBranch(role, me.orgRole)) {
      res.status(403).json({
        error: "Filialni o‘zingiz tanlay olmaysiz. Mudir yoki koordinator belgilaydi.",
      });
      return;
    }
    const bid = body.assignedBranchId == null ? me.id : Number(body.assignedBranchId);
    const branch = await empById(bid);
    if (!branch || branch.orgRole !== MANAGER_ORG || !hasGps(branch)) {
      res.status(400).json({ error: "Filial GPS yo‘q yoki mudir emas" });
      return;
    }
    patch.assignedBranchId = bid === me.id ? null : bid;
  }

  await db.update(employeesTable).set(patch).where(eq(employeesTable.id, me.id));
  res.json({ ok: true });
});

router.patch("/smena/assign/:employeeId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole || "";
  const me = await empByUserId(req.userId!);
  if (!me) {
    res.status(400).json({ error: "Sizning xodim kartochkangiz yo‘q" });
    return;
  }
  const targetId = Number(req.params.employeeId);
  const target = await empById(targetId);
  if (!target) {
    res.status(404).json({ error: "Xodim topilmadi" });
    return;
  }
  const scope = role === "koordinator" ? await coordinatorScopeIds(me) : null;
  if (!canAssignTarget({ role, me, target, scope })) {
    res.status(403).json({ error: "Bu xodimning filialini belgilash huquqi yo‘q" });
    return;
  }
  if (
    target.orgRole === "pharmacist" &&
    !(role === "mudir" || role === "koordinator" || isLeadRole(role))
  ) {
    res.status(403).json({ error: "Farmasevt filialini faqat mudir yoki koordinator belgilaydi" });
    return;
  }

  const body = req.body as {
    assignedBranchId?: number | null;
    shiftType?: string;
    shiftOnly?: boolean;
    shiftLabel?: string;
    shiftStart?: string;
    shiftEnd?: string;
  };
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (body.shiftType != null) {
    const err = applyShiftPatch(body, patch, { adminLike: isAdminLike(role) });
    if (err) {
      res.status(400).json({ error: err });
      return;
    }
  }

  let loc: string | null = null;
  const wantsBranch = body.assignedBranchId !== undefined && body.assignedBranchId !== null;
  if (wantsBranch) {
    const branchId = Number(body.assignedBranchId);
    const branch = await empById(branchId);
    if (!branch || branch.orgRole !== MANAGER_ORG || !hasGps(branch)) {
      res.status(400).json({ error: "Filial GPS kiritilmagan" });
      return;
    }
    loc = (branch.location || "").split("|")[0].trim() || branch.fullName;
    patch.assignedBranchId = branchId;
    patch.location = loc;
  } else if (body.assignedBranchId === null && isAdminLike(role)) {
    patch.assignedBranchId = null;
  } else if (body.shiftType == null) {
    res.status(400).json({ error: "Filial yoki smena kerak" });
    return;
  }

  const st = body.shiftType ? normalizeShiftType(body.shiftType) : null;
  const skipBranch =
    st === "remote" ||
    st === "flexible" ||
    st === "custom" ||
    Boolean(body.shiftOnly) ||
    body.assignedBranchId === null;
  if (!wantsBranch && !skipBranch && body.shiftType == null) {
    res.status(400).json({ error: "Filial GPS kiritilmagan" });
    return;
  }

  await db.update(employeesTable).set(patch).where(eq(employeesTable.id, target.id));

  if (target.userId) {
    const shiftTxt = body.shiftType
      ? shiftHoursLabelForEmployee({
          shiftType: body.shiftType,
          shiftStart: (patch.shiftStart as string) ?? target.shiftStart,
          shiftEnd: (patch.shiftEnd as string) ?? target.shiftEnd,
          shiftLabel: (patch.shiftLabel as string) ?? target.shiftLabel,
        })
      : "";
    const place = loc ? `${loc} filialiga biriktirildi` : "smena yangilandi";
    await notifyUser({
      userId: target.userId,
      text: `${target.fullName}: ${place}${shiftTxt ? `, ${shiftTxt}` : ""}.`,
      type: "smena_branch",
      linkUrl: "/davomat-face",
    });
  }

  res.json({
    ok: true,
    assignedBranchId: wantsBranch ? Number(body.assignedBranchId) : target.assignedBranchId,
    assignedBranchName: loc,
    shiftType: body.shiftType || target.shiftType,
  });
});

function todayTashkentYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta));
  return dt.toISOString().slice(0, 10);
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Kelgusi kunlar uchun vaqtinchalik filiallar (xodim tanlanganda) */
router.get("/smena/day-branch/:employeeId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole || "";
  const me = await empByUserId(req.userId!);
  if (!me) {
    res.status(400).json({ error: "Xodim kartochkasi yo‘q" });
    return;
  }
  const targetId = Number(req.params.employeeId);
  const target = await empById(targetId);
  if (!target) {
    res.status(404).json({ error: "Xodim topilmadi" });
    return;
  }
  const scope = role === "koordinator" ? await coordinatorScopeIds(me) : null;
  if (!canAssignTarget({ role, me, target, scope }) && target.userId !== req.userId) {
    res.status(403).json({ error: "Ko‘rish huquqi yo‘q" });
    return;
  }
  const from = todayTashkentYmd();
  const to = addDaysYmd(from, 30);
  const items = await listDayBranchOverrides(targetId, from, to);
  res.json({
    employeeId: targetId,
    homeBranchId: target.assignedBranchId || (target.orgRole === MANAGER_ORG ? target.id : target.reportsToId),
    homeBranchName:
      (await listBranches()).find(
        (b) =>
          b.id ===
          (target.assignedBranchId || (target.orgRole === MANAGER_ORG ? target.id : target.reportsToId)),
      )?.name || target.location || null,
    items,
  });
});

/**
 * Faqat belgilangan kunda boshqa filialda davomat.
 * Asosiy assigned_branch_id o‘zgarmaydi — ertasi kun uy filialiga qaytadi.
 */
router.put("/smena/day-branch/:employeeId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole || "";
  const me = await empByUserId(req.userId!);
  if (!me) {
    res.status(400).json({ error: "Xodim kartochkasi yo‘q" });
    return;
  }
  const targetId = Number(req.params.employeeId);
  const target = await empById(targetId);
  if (!target) {
    res.status(404).json({ error: "Xodim topilmadi" });
    return;
  }
  const scope = role === "koordinator" ? await coordinatorScopeIds(me) : null;
  if (!canAssignTarget({ role, me, target, scope })) {
    res.status(403).json({ error: "Bu xodimga kunlik filial belgilash huquqi yo‘q" });
    return;
  }

  const body = req.body as { workDate?: string; branchId?: number; note?: string };
  const workDate = String(body.workDate || "").trim();
  const branchId = Number(body.branchId);
  if (!isYmd(workDate)) {
    res.status(400).json({ error: "Sana YYYY-MM-DD formatida kerak", code: "bad_date" });
    return;
  }
  const today = todayTashkentYmd();
  if (workDate < today) {
    res.status(400).json({ error: "O‘tgan kun uchun belgilab bo‘lmaydi", code: "past_date" });
    return;
  }
  if (!Number.isFinite(branchId)) {
    res.status(400).json({ error: "Filial tanlang" });
    return;
  }
  const branch = await empById(branchId);
  if (!branch || branch.orgRole !== MANAGER_ORG || !hasGps(branch)) {
    res.status(400).json({ error: "Filial GPS yo‘q yoki mudir emas" });
    return;
  }

  const branchName = (branch.location || "").split("|")[0].trim() || branch.fullName;
  const [existing] = await db
    .select({ id: employeeBranchDayOverridesTable.id })
    .from(employeeBranchDayOverridesTable)
    .where(
      and(
        eq(employeeBranchDayOverridesTable.employeeId, targetId),
        eq(employeeBranchDayOverridesTable.workDate, workDate),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(employeeBranchDayOverridesTable)
      .set({
        branchId,
        note: body.note?.trim() || null,
        createdById: me.userId,
        updatedAt: new Date(),
      })
      .where(eq(employeeBranchDayOverridesTable.id, existing.id));
  } else {
    await db.insert(employeeBranchDayOverridesTable).values({
      employeeId: targetId,
      branchId,
      workDate,
      note: body.note?.trim() || null,
      createdById: me.userId,
    });
  }

  if (target.userId) {
    await notifyUser({
      userId: target.userId,
      text: `${target.fullName}: ${workDate} kuni vaqtinchalik «${branchName}» filialida davomat qilasiz. Keyin o‘z filialingizga qaytasiz.`,
      type: "smena_day_branch",
      linkUrl: "/davomat-face",
    });
  }

  res.json({
    ok: true,
    employeeId: targetId,
    workDate,
    branchId,
    branchName,
    message: `${workDate} kuni «${branchName}» da davomat qabul qilinadi. Keyin uy filialiga qaytadi.`,
  });
});

router.delete("/smena/day-branch/:employeeId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole || "";
  const me = await empByUserId(req.userId!);
  if (!me) {
    res.status(400).json({ error: "Xodim kartochkasi yo‘q" });
    return;
  }
  const targetId = Number(req.params.employeeId);
  const target = await empById(targetId);
  if (!target) {
    res.status(404).json({ error: "Xodim topilmadi" });
    return;
  }
  const scope = role === "koordinator" ? await coordinatorScopeIds(me) : null;
  if (!canAssignTarget({ role, me, target, scope })) {
    res.status(403).json({ error: "O‘chirish huquqi yo‘q" });
    return;
  }
  const workDate = String(req.query.workDate || req.body?.workDate || "").trim();
  if (!isYmd(workDate)) {
    res.status(400).json({ error: "workDate kerak (YYYY-MM-DD)" });
    return;
  }
  await db
    .delete(employeeBranchDayOverridesTable)
    .where(
      and(
        eq(employeeBranchDayOverridesTable.employeeId, targetId),
        eq(employeeBranchDayOverridesTable.workDate, workDate),
      ),
    );
  res.json({ ok: true, employeeId: targetId, workDate });
});

export default router;
