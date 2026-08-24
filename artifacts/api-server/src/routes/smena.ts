import { Router, type IRouter } from "express";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, employeesTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { isHrRole } from "../lib/roles";
import { notifyUser } from "../lib/notify";
import { isPharmacyShiftStaff, normalizeShiftType, shiftWindow } from "../lib/shift-hours";

const router: IRouter = Router();

const STAFF_ORG = new Set(["pharmacist", "intern"]);
const MANAGER_ORG = "manager";

function isLeadRole(role: string) {
  return role === "admin" || role === "director" || role === "koordinator" || isHrRole(role);
}

type EmpRow = {
  id: number;
  userId: number | null;
  fullName: string;
  orgRole: string | null;
  reportsToId: number | null;
  assignedBranchId: number | null;
  shiftType: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  employmentStatus: string | null;
};

const EMP_COLS = {
  id: employeesTable.id,
  userId: employeesTable.userId,
  fullName: employeesTable.fullName,
  orgRole: employeesTable.orgRole,
  reportsToId: employeesTable.reportsToId,
  assignedBranchId: employeesTable.assignedBranchId,
  shiftType: employeesTable.shiftType,
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
  if (isLeadRole(role) && role !== "koordinator") {
    return STAFF_ORG.has(org) || org === MANAGER_ORG;
  }
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

function serializeShift(shiftType: string | null) {
  const w = shiftWindow(shiftType);
  return {
    type: w.key,
    label: w.label,
    start: w.start,
    end: w.end,
    warnHm: w.warnHm,
    warnText: w.warnText,
    hoursNote: `${w.label}: ${w.start}–${w.end}. Kechikish — jarima.`,
  };
}

router.get("/smena/me", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole || "";
  const me = await empByUserId(req.userId!);
  const pharmacy = isPharmacyShiftStaff(role, me?.orgRole);
  const branches = pharmacy || isLeadRole(role) ? await listBranches() : [];
  const assignedId = me?.assignedBranchId || (me?.orgRole === MANAGER_ORG ? me.id : me?.reportsToId) || null;
  const assigned = assignedId ? branches.find((b) => b.id === assignedId) || null : null;

  const assignable: Array<{
    id: number;
    fullName: string;
    orgRole: string | null;
    shiftType: string;
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
      if (p.id === me.id && (role === "farmasevt" || p.orgRole === "pharmacist")) continue;
      assignable.push({
        id: p.id,
        fullName: p.fullName,
        orgRole: p.orgRole,
        shiftType: normalizeShiftType(p.shiftType),
        assignedBranchId: p.assignedBranchId || (p.orgRole === MANAGER_ORG ? p.id : p.reportsToId),
        assignedBranchName:
          branchName(p.assignedBranchId) ||
          branchName(p.orgRole === MANAGER_ORG ? p.id : p.reportsToId) ||
          null,
      });
    }
    assignable.sort((a, b) => a.fullName.localeCompare(b.fullName, "uz"));
  }

  res.json({
    pharmacyStaff: pharmacy,
    canPickShift: pharmacy,
    canPickOwnBranch: Boolean(me && canPickOwnBranch(role, me.orgRole)),
    canAssignOthers: assignable.length > 0,
    employee: me
      ? {
          id: me.id,
          fullName: me.fullName,
          orgRole: me.orgRole,
          assignedBranchId: assignedId,
          assignedBranchName: assigned?.name || me.location || null,
        }
      : null,
    shift: serializeShift(me?.shiftType || "one"),
    branches,
    assignable,
    rules: {
      shift1: "1-smena: 08:00–17:00. Ogohlantirish 07:45. Kechiksa — jarima.",
      shift2: "2-smena: 18:00–23:45. Ogohlantirish 17:45. Kechiksa — jarima.",
      branch:
        "Farmasevt qaysi filialga borishini faqat mudir yoki koordinator belgilaydi. Stajyor lokatsiyasini mudir yoki o‘z farmasevti belgilaydi. Smenani xodim o‘zi tanlaydi. Face ID faqat belgilangan filial GPS (35 m) da o‘tadi.",
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
  const body = req.body as { shiftType?: string; assignedBranchId?: number | null };
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (body.shiftType != null) {
    if (!isPharmacyShiftStaff(role, me.orgRole)) {
      res.status(403).json({ error: "Smena tanlash faqat mudir, farmasevt va stajyor uchun" });
      return;
    }
    if (body.shiftType !== "one" && body.shiftType !== "two") {
      res.status(400).json({ error: "Smena 1 yoki 2 bo‘lishi kerak" });
      return;
    }
    patch.shiftType = body.shiftType;
    patch.shiftLabel = body.shiftType === "two" ? "2-smena 18:00–23:45" : "1-smena 08:00–17:00";
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
  if (target.orgRole === "pharmacist" && !(role === "mudir" || role === "koordinator" || isLeadRole(role))) {
    res.status(403).json({ error: "Farmasevt filialini faqat mudir yoki koordinator belgilaydi" });
    return;
  }

  const body = req.body as { assignedBranchId?: number; shiftType?: string };
  const branchId = Number(body.assignedBranchId);
  const branch = await empById(branchId);
  if (!branch || branch.orgRole !== MANAGER_ORG || !hasGps(branch)) {
    res.status(400).json({ error: "Filial GPS kiritilmagan" });
    return;
  }
  if (body.shiftType != null && body.shiftType !== "one" && body.shiftType !== "two") {
    res.status(400).json({ error: "Smena 1 yoki 2 bo‘lishi kerak" });
    return;
  }

  const loc = (branch.location || "").split("|")[0].trim() || branch.fullName;
  await db
    .update(employeesTable)
    .set({
      assignedBranchId: branchId,
      location: loc,
      ...(body.shiftType
        ? {
            shiftType: body.shiftType,
            shiftLabel: body.shiftType === "two" ? "2-smena 18:00–23:45" : "1-smena 08:00–17:00",
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(employeesTable.id, target.id));

  if (target.userId) {
    const shiftTxt = body.shiftType === "two" ? "2-smena 18:00–23:45" : body.shiftType === "one" ? "1-smena 08:00–17:00" : "";
    await notifyUser({
      userId: target.userId,
      text: `${target.fullName}: ${loc} filialiga biriktirildi${shiftTxt ? `, ${shiftTxt}` : ""}. Face ID faqat shu joydan (35 m).`,
      type: "smena_branch",
      linkUrl: "/davomat-face",
    });
  }

  res.json({ ok: true, assignedBranchId: branchId, assignedBranchName: loc, shiftType: body.shiftType || target.shiftType });
});

export default router;
