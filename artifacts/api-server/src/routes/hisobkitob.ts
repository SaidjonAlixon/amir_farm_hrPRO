import { Router, type IRouter } from "express";
import { and, asc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import ExcelJS from "exceljs";
import {
  db,
  employeesTable,
  payrollMonthsTable,
  settlementLinesTable,
  settlementSheetsTable,
  usersTable,
} from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import {
  canAdminHisobkitob,
  canEditHisobkitob,
  canViewHisobkitob,
  computeLine,
  computeSheetTotals,
} from "../lib/settlement";

const router: IRouter = Router();

function denyView(req: AuthRequest, res: { status: (n: number) => { json: (b: unknown) => void } }) {
  if (!canViewHisobkitob(req.userRole)) {
    res.status(403).json({ error: "Hisob-kitob faqat admin, direktor va moliyachi uchun" });
    return true;
  }
  return false;
}

function denyEdit(req: AuthRequest, res: { status: (n: number) => { json: (b: unknown) => void } }) {
  if (!canEditHisobkitob(req.userRole)) {
    res.status(403).json({ error: "Tahrirlash ruxsati yo‘q" });
    return true;
  }
  return false;
}

function mapLine(
  row: typeof settlementLinesTable.$inferSelect,
  taxNetRate: number,
  sheetPlanCurrent: number,
  sheetPlanPrev: number,
) {
  const calc = computeLine(
    {
      sales: row.sales,
      percent: row.percent,
      fiksa: row.fiksa,
      planBonus: row.planBonus,
      extraBonus: row.extraBonus ?? 0,
      avans: row.avans,
      inventoryFine: row.inventoryFine,
      timeFine: row.timeFine,
      expiryHold: row.expiryHold,
      cardAmount: row.cardAmount,
      planCurrent: row.planCurrent ?? 0,
      planPrev: row.planPrev ?? 0,
    },
    taxNetRate,
    sheetPlanCurrent,
    sheetPlanPrev,
  );
  return { ...row, ...calc };
}

async function loadSheet(id: number) {
  const [sheet] = await db.select().from(settlementSheetsTable).where(eq(settlementSheetsTable.id, id)).limit(1);
  if (!sheet) return null;
  const lines = await db
    .select()
    .from(settlementLinesTable)
    .where(eq(settlementLinesTable.sheetId, id))
    .orderBy(asc(settlementLinesTable.sortOrder), asc(settlementLinesTable.id));
  const mapped = lines.map((l) => mapLine(l, sheet.taxNetRate, sheet.planCurrent, sheet.planPrev));
  const totals = computeSheetTotals(mapped, sheet.planCurrent, sheet.planPrev);
  return { sheet, lines: mapped, totals };
}

const DEMO_PHONES = ["998901111111", "998902222222", "998903333333", "998904444444"];
const DEMO_NAMES = [
  "Ermatova Saida",
  "Pulatxujayev Akbarxuja",
  "Shuxriddinov Axrorxuja",
  "Shuxriddinov Asrorxuja",
  "Shodiyeva Samira",
];

const ROLE_UZ: Record<string, string> = {
  coordinator: "Koordinator",
  manager: "Mudir",
  pharmacist: "Farmatsevt",
  intern: "Stajyor",
  supervisor: "Nazoratchi",
};

function onlyDigits(s?: string | null) {
  return (s || "").replace(/\D/g, "").replace(/^998/, "");
}

function looksLikePhone(s?: string | null) {
  const t = (s || "").trim();
  if (!t) return false;
  const d = t.replace(/\D/g, "");
  return d.length >= 9 && d.length <= 15 && !/[A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ]/.test(t);
}

function staffDisplayName(s: { fullName: string; userName: string | null }) {
  if (s.fullName && !looksLikePhone(s.fullName)) return s.fullName.trim();
  if (s.userName && !looksLikePhone(s.userName)) return s.userName.trim();
  return (s.fullName || s.userName || "").trim();
}

function staffPhone(s: { phone: string | null; login: string | null }) {
  if (s.phone && s.phone.trim()) return s.phone.trim();
  if (looksLikePhone(s.login)) return s.login!.trim();
  return null;
}

function staffRole(s: { position: string | null; orgRole: string | null }) {
  const p = (s.position || "").trim();
  if (p && !looksLikePhone(p)) return p;
  return ROLE_UZ[s.orgRole || ""] || p || "";
}

function posKey(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function samePosition(s: { position: string | null; orgRole: string | null }, want: string) {
  const w = posKey(want);
  if (!w) return false;
  return posKey(staffRole(s)) === w || posKey(s.position || "") === w;
}

async function allWorkingStaff() {
  return db
    .select({
      id: employeesTable.id,
      fullName: employeesTable.fullName,
      position: employeesTable.position,
      orgRole: employeesTable.orgRole,
      location: employeesTable.location,
      userId: employeesTable.userId,
      fiksa: employeesTable.fixedSalary,
      phone: usersTable.phone,
      userName: usersTable.fullName,
      login: usersTable.login,
    })
    .from(employeesTable)
    .leftJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .where(
      or(
        eq(employeesTable.employmentStatus, "working"),
        isNull(employeesTable.employmentStatus),
        eq(employeesTable.employmentStatus, ""),
      ),
    )
    .orderBy(asc(employeesTable.fullName));
}

async function payrollBonusByUser(month: string) {
  const rows = await db
    .select({
      userId: payrollMonthsTable.userId,
      bonusAmount: payrollMonthsTable.bonusAmount,
      fixedSalary: payrollMonthsTable.fixedSalary,
    })
    .from(payrollMonthsTable)
    .where(eq(payrollMonthsTable.month, month));
  return new Map(rows.map((r) => [r.userId, r]));
}

async function fillSheetFromStaff(sheetId: number, month?: string) {
  const staff = await allWorkingStaff();
  if (!staff.length) return;
  let ym = month || "";
  if (!ym) {
    const [sh] = await db
      .select({ month: settlementSheetsTable.month })
      .from(settlementSheetsTable)
      .where(eq(settlementSheetsTable.id, sheetId))
      .limit(1);
    ym = sh?.month || "";
  }
  const payroll = ym ? await payrollBonusByUser(ym) : new Map();
  const lines = await db.select().from(settlementLinesTable).where(eq(settlementLinesTable.sheetId, sheetId));

  const byId = new Map(staff.map((s) => [s.id, s]));
  const byPhone = new Map<string, (typeof staff)[0]>();
  const byName = new Map<string, (typeof staff)[0]>();
  for (const s of staff) {
    const ph = onlyDigits(staffPhone(s));
    if (ph.length >= 9 && !byPhone.has(ph)) byPhone.set(ph, s);
    const nm = staffDisplayName(s).toLowerCase();
    if (nm && !byName.has(nm)) byName.set(nm, s);
  }

  const linked = new Set<number>();
  const keepIds = new Set<number>();
  for (const line of lines) {
    const fromId = line.employeeId ? byId.get(line.employeeId) : undefined;
    const fromPhone = byPhone.get(onlyDigits(line.phone)) || (looksLikePhone(line.fullName) ? byPhone.get(onlyDigits(line.fullName)) : undefined);
    const fromName = byName.get((line.fullName || "").trim().toLowerCase());
    const emp = fromId || fromPhone || fromName;
    if (!emp || linked.has(emp.id)) continue;
    linked.add(emp.id);
    keepIds.add(line.id);
    const pay = emp.userId ? payroll.get(emp.userId) : undefined;
    await db
      .update(settlementLinesTable)
      .set({
        employeeId: emp.id,
        fullName: staffDisplayName(emp),
        phone: staffPhone(emp) || line.phone,
        position: staffRole(emp) || null,
        fiksa: Number(emp.fiksa || 0),
        extraBonus: Number(pay?.bonusAmount ?? line.extraBonus ?? 0),
        updatedAt: new Date(),
      })
      .where(eq(settlementLinesTable.id, line.id));
  }

  const missing = staff.filter((s) => !linked.has(s.id));
  if (missing.length) {
    const start = lines.length;
    await db.insert(settlementLinesTable).values(
      missing.map((r, i) => {
        const pay = r.userId ? payroll.get(r.userId) : undefined;
        return {
          sheetId,
          employeeId: r.id,
          sortOrder: start + i,
          fullName: staffDisplayName(r),
          phone: staffPhone(r),
          position: staffRole(r) || null,
          fiksa: Number(r.fiksa || 0),
          extraBonus: Number(pay?.bonusAmount || 0),
          percent: 0,
        };
      }),
    );
  }

  const drop = lines.filter((l) => !keepIds.has(l.id)).map((l) => l.id);
  if (drop.length) {
    await db.delete(settlementLinesTable).where(inArray(settlementLinesTable.id, drop));
  }
}

async function purgeDemoSettlementLines() {
  try {
    await db
      .delete(settlementLinesTable)
      .where(or(inArray(settlementLinesTable.phone, DEMO_PHONES), inArray(settlementLinesTable.fullName, DEMO_NAMES)));
    const sheets = await db.select({ id: settlementSheetsTable.id, branchName: settlementSheetsTable.branchName }).from(settlementSheetsTable);
    for (const s of sheets) {
      try {
        await fillSheetFromStaff(s.id);
      } catch (err) {
        console.error("fillSheetFromStaff", s.id, err);
      }
    }
  } catch (err) {
    console.error("purgeDemoSettlementLines", err);
  }
}

router.get("/hisobkitob/sheets", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (denyView(req, res)) return;
  try {
    const month = String(req.query.month || "").slice(0, 7);
    const rows = await db
      .select()
      .from(settlementSheetsTable)
      .orderBy(asc(settlementSheetsTable.branchName));
    const list = month ? rows.filter((s) => s.month === month) : rows;
    res.json({ items: list });
  } catch (err) {
    console.error("GET /hisobkitob/sheets", err);
    res.status(503).json({ error: "Varaqalar yuklanmadi" });
  }
});

router.post("/hisobkitob/sheets", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (denyEdit(req, res)) return;
  try {
    const branchName = String(req.body?.branchName || "").trim() || "Oylik";
    const month = String(req.body?.month || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ error: "Oy formati YYYY-MM" });
      return;
    }
    const [created] = await db
      .insert(settlementSheetsTable)
      .values({
        branchName,
        month,
        planCurrent: Number(req.body?.planCurrent) || 0,
        planPrev: Number(req.body?.planPrev) || 0,
        taxNetRate: Number(req.body?.taxNetRate) || 0.88,
        createdById: req.userId,
      })
      .returning();
    await fillSheetFromStaff(created!.id).catch((err) => console.error("fillSheetFromStaff", err));
    res.json(created);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ error: "Bu oyda shu nomdagi varaq allaqachon bor" });
      return;
    }
    console.error("POST /hisobkitob/sheets", err);
    res.status(503).json({ error: "Varaq yaratilmadi" });
  }
});

router.get("/hisobkitob/sheets/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (denyView(req, res)) return;
  try {
    const id = Number(req.params.id);
    await fillSheetFromStaff(id).catch((err) => console.error("fillSheetFromStaff", err));
    const packed = await loadSheet(id);
    if (!packed) {
      res.status(404).json({ error: "Varaq topilmadi" });
      return;
    }
    res.json({
      ...packed.sheet,
      lines: packed.lines,
      totals: packed.totals,
      canEdit: canEditHisobkitob(req.userRole) && packed.sheet.status !== "approved",
      canAdmin: canAdminHisobkitob(req.userRole),
      locked: packed.sheet.status === "approved" && !canAdminHisobkitob(req.userRole),
    });
  } catch (err) {
    console.error("GET /hisobkitob/sheets/:id", err);
    res.status(503).json({ error: "Varaq yuklanmadi" });
  }
});

function lineRole(p?: string | null) {
  return (p || "").split("·")[0]!.trim();
}

router.post("/hisobkitob/sheets/:id/apply-position", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (denyEdit(req, res)) return;
  try {
    const id = Number(req.params.id);
    const packed = await loadSheet(id);
    if (!packed) {
      res.status(404).json({ error: "Varaq topilmadi" });
      return;
    }
    if (packed.sheet.status === "approved" && !canAdminHisobkitob(req.userRole)) {
      res.status(403).json({ error: "Tasdiqlangan varaq yopiq" });
      return;
    }
    const position = String(req.body?.position || "").trim();
    if (!position) {
      res.status(400).json({ error: "Lavozim tanlang" });
      return;
    }
    const fiksa = Math.max(0, Math.round(Number(req.body?.fiksa) || 0));
    const bonusPercent = Math.max(0, Math.min(200, Number(req.body?.bonusPercent) || 0));
    const want = posKey(position);
    const staff = await allWorkingStaff();
    let targets = staff.filter((s) => samePosition(s, position));
    const lines = await db.select().from(settlementLinesTable).where(eq(settlementLinesTable.sheetId, id));
    if (!targets.length) {
      const lineEmpIds = lines
        .filter((l) => posKey(lineRole(l.position)) === want)
        .map((l) => l.employeeId)
        .filter((n): n is number => n != null);
      targets = staff.filter((s) => lineEmpIds.includes(s.id));
    }
    if (!targets.length) {
      res.status(404).json({ error: "Bu lavozimda xodim yo‘q" });
      return;
    }
    const empIds = targets.map((s) => s.id);
    await db
      .update(employeesTable)
      .set({ fixedSalary: fiksa, bonusPercent })
      .where(inArray(employeesTable.id, empIds));
    const userIds = targets.map((s) => s.userId).filter((n): n is number => n != null);
    if (userIds.length && packed.sheet.month) {
      await db
        .update(payrollMonthsTable)
        .set({ fixedSalary: fiksa, bonusPercent })
        .where(and(eq(payrollMonthsTable.month, packed.sheet.month), inArray(payrollMonthsTable.userId, userIds)));
    }
    await fillSheetFromStaff(id, packed.sheet.month);
    res.json({ ok: true, count: targets.length, ...(await loadSheet(id)) });
  } catch (err) {
    console.error("POST apply-position", err);
    res.status(503).json({ error: "Lavozimga yozilmadi" });
  }
});

router.post("/hisobkitob/sheets/:id/sync-oylik", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (denyEdit(req, res)) return;
  try {
    const id = Number(req.params.id);
    const packed = await loadSheet(id);
    if (!packed) {
      res.status(404).json({ error: "Varaq topilmadi" });
      return;
    }
    if (packed.sheet.status === "approved" && !canAdminHisobkitob(req.userRole)) {
      res.status(403).json({ error: "Tasdiqlangan varaq yopiq" });
      return;
    }
    await fillSheetFromStaff(id, packed.sheet.month);
    const payroll = await payrollBonusByUser(packed.sheet.month);
    const staff = await allWorkingStaff();
    const byId = new Map(staff.map((s) => [s.id, s]));
    const fresh = await db
      .select()
      .from(settlementLinesTable)
      .where(eq(settlementLinesTable.sheetId, id));
    for (const line of fresh) {
      if (!line.employeeId) continue;
      const emp = byId.get(line.employeeId);
      if (!emp) continue;
      const pay = emp.userId ? payroll.get(emp.userId) : undefined;
      await db
        .update(settlementLinesTable)
        .set({
          fullName: emp.fullName,
          phone: emp.phone || line.phone,
          position: emp.position || line.position,
          fiksa: Number(emp.fiksa || 0),
          extraBonus: Number(pay?.bonusAmount ?? line.extraBonus ?? 0),
          updatedAt: new Date(),
        })
        .where(eq(settlementLinesTable.id, line.id));
    }
    res.json(await loadSheet(id));
  } catch (err) {
    console.error("POST sync-oylik", err);
    res.status(503).json({ error: "Oylikdan sinxronlanmadi" });
  }
});

router.patch("/hisobkitob/sheets/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (denyEdit(req, res)) return;
  try {
    const id = Number(req.params.id);
    const [cur] = await db.select().from(settlementSheetsTable).where(eq(settlementSheetsTable.id, id)).limit(1);
    if (!cur) {
      res.status(404).json({ error: "Varaq topilmadi" });
      return;
    }
    if (cur.status === "approved" && !canAdminHisobkitob(req.userRole)) {
      res.status(403).json({ error: "Tasdiqlangan varaqni faqat admin o‘zgartiradi" });
      return;
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (req.body?.branchName != null) patch.branchName = String(req.body.branchName).trim();
    if (req.body?.planCurrent != null) patch.planCurrent = Number(req.body.planCurrent) || 0;
    if (req.body?.planPrev != null) patch.planPrev = Number(req.body.planPrev) || 0;
    if (req.body?.taxNetRate != null && canAdminHisobkitob(req.userRole)) {
      const r = Number(req.body.taxNetRate);
      if (r > 0 && r <= 1) patch.taxNetRate = r;
    }
    await db.update(settlementSheetsTable).set(patch).where(eq(settlementSheetsTable.id, id));
    res.json(await loadSheet(id));
  } catch (err) {
    console.error("PATCH /hisobkitob/sheets/:id", err);
    res.status(503).json({ error: "Saqlanmadi" });
  }
});

router.delete("/hisobkitob/sheets/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canAdminHisobkitob(req.userRole)) {
    res.status(403).json({ error: "O‘chirish faqat admin uchun" });
    return;
  }
  const id = Number(req.params.id);
  await db.delete(settlementLinesTable).where(eq(settlementLinesTable.sheetId, id));
  await db.delete(settlementSheetsTable).where(eq(settlementSheetsTable.id, id));
  res.json({ ok: true });
});

router.post("/hisobkitob/sheets/:id/reset", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (denyEdit(req, res)) return;
  const id = Number(req.params.id);
  const [sheet] = await db.select().from(settlementSheetsTable).where(eq(settlementSheetsTable.id, id)).limit(1);
  if (!sheet) {
    res.status(404).json({ error: "Varaq topilmadi" });
    return;
  }
  if (sheet.status === "approved" && !canAdminHisobkitob(req.userRole)) {
    res.status(403).json({ error: "Tasdiqlangan varaq yopiq" });
    return;
  }
  await db
    .update(settlementLinesTable)
    .set({
      sales: 0,
      fiksa: 0,
      planBonus: 0,
      avans: 0,
      inventoryFine: 0,
      timeFine: 0,
      expiryHold: 0,
      cardAmount: null,
      updatedAt: new Date(),
    })
    .where(eq(settlementLinesTable.sheetId, id));
  await db
    .update(settlementSheetsTable)
    .set({ status: "draft", approvedById: null, approvedAt: null, updatedAt: new Date() })
    .where(eq(settlementSheetsTable.id, id));
  res.json(await loadSheet(id));
});

router.post("/hisobkitob/sheets/:id/approve", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canAdminHisobkitob(req.userRole) && req.userRole !== "director" && req.userRole !== "moliya") {
    res.status(403).json({ error: "Tasdiqlash ruxsati yo‘q" });
    return;
  }
  const id = Number(req.params.id);
  await db
    .update(settlementSheetsTable)
    .set({
      status: "approved",
      approvedById: req.userId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(settlementSheetsTable.id, id));
  res.json(await loadSheet(id));
});

router.post("/hisobkitob/sheets/:id/unlock", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canAdminHisobkitob(req.userRole)) {
    res.status(403).json({ error: "Qayta ochish faqat admin uchun" });
    return;
  }
  const id = Number(req.params.id);
  await db
    .update(settlementSheetsTable)
    .set({ status: "draft", approvedById: null, approvedAt: null, updatedAt: new Date() })
    .where(eq(settlementSheetsTable.id, id));
  res.json(await loadSheet(id));
});

router.post("/hisobkitob/sheets/:id/lines", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (denyEdit(req, res)) return;
  try {
    const sheetId = Number(req.params.id);
    const packed = await loadSheet(sheetId);
    if (!packed) {
      res.status(404).json({ error: "Varaq topilmadi" });
      return;
    }
    if (packed.sheet.status === "approved" && !canAdminHisobkitob(req.userRole)) {
      res.status(403).json({ error: "Tasdiqlangan varaq yopiq" });
      return;
    }
    const [row] = await db
      .insert(settlementLinesTable)
      .values({
        sheetId,
        sortOrder: packed.lines.length,
        fullName: String(req.body?.fullName || "Yangi xodim").trim(),
        phone: req.body?.phone ? String(req.body.phone) : null,
        employeeId: req.body?.employeeId != null ? Number(req.body.employeeId) : null,
        sales: Number(req.body?.sales) || 0,
        percent: Number.isFinite(Number(req.body?.percent)) ? Number(req.body.percent) : 0,
        fiksa: Number(req.body?.fiksa) || 0,
        planBonus: Number(req.body?.planBonus) || 0,
      })
      .returning();
    res.json(mapLine(row!, packed.sheet.taxNetRate, packed.sheet.planCurrent, packed.sheet.planPrev));
  } catch (err) {
    console.error("POST lines", err);
    res.status(503).json({ error: "Qator qo‘shilmadi" });
  }
});

router.patch("/hisobkitob/lines/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (denyEdit(req, res)) return;
  try {
    const id = Number(req.params.id);
    const [line] = await db.select().from(settlementLinesTable).where(eq(settlementLinesTable.id, id)).limit(1);
    if (!line) {
      res.status(404).json({ error: "Qator topilmadi" });
      return;
    }
    const [sheet] = await db.select().from(settlementSheetsTable).where(eq(settlementSheetsTable.id, line.sheetId)).limit(1);
    if (sheet?.status === "approved" && !canAdminHisobkitob(req.userRole)) {
      res.status(403).json({ error: "Tasdiqlangan varaq yopiq" });
      return;
    }
    const b = req.body ?? {};
    const num = (k: string) => (b[k] == null || b[k] === "" ? undefined : Number(b[k]));
    await db
      .update(settlementLinesTable)
      .set({
        ...(b.fullName != null ? { fullName: String(b.fullName) } : {}),
        ...(b.phone !== undefined ? { phone: b.phone ? String(b.phone) : null } : {}),
        ...(num("planCurrent") != null ? { planCurrent: num("planCurrent")! } : {}),
        ...(num("planPrev") != null ? { planPrev: num("planPrev")! } : {}),
        ...(num("sales") != null ? { sales: num("sales")! } : {}),
        ...(num("percent") != null ? { percent: num("percent")! } : {}),
        ...(num("fiksa") != null ? { fiksa: num("fiksa")! } : {}),
        ...(num("planBonus") != null ? { planBonus: num("planBonus")! } : {}),
        ...(num("extraBonus") != null ? { extraBonus: num("extraBonus")! } : {}),
        ...(num("avans") != null ? { avans: num("avans")! } : {}),
        ...(num("inventoryFine") != null ? { inventoryFine: num("inventoryFine")! } : {}),
        ...(num("timeFine") != null ? { timeFine: num("timeFine")! } : {}),
        ...(num("expiryHold") != null ? { expiryHold: num("expiryHold")! } : {}),
        ...(b.position !== undefined ? { position: b.position ? String(b.position) : null } : {}),
        ...(b.fineNote !== undefined ? { fineNote: b.fineNote ? String(b.fineNote) : null } : {}),
        ...(b.cardAmount === null || b.cardAmount === ""
          ? { cardAmount: null }
          : num("cardAmount") != null
            ? { cardAmount: num("cardAmount")! }
            : {}),
        updatedAt: new Date(),
      })
      .where(eq(settlementLinesTable.id, id));
    if (num("fiksa") != null && line.employeeId) {
      const amount = Math.max(0, Math.round(num("fiksa")!));
      await db
        .update(employeesTable)
        .set({ fixedSalary: amount })
        .where(eq(employeesTable.id, line.employeeId));
      const [emp] = await db
        .select({ userId: employeesTable.userId })
        .from(employeesTable)
        .where(eq(employeesTable.id, line.employeeId))
        .limit(1);
      const [sh] = await db
        .select({ month: settlementSheetsTable.month })
        .from(settlementSheetsTable)
        .where(eq(settlementSheetsTable.id, line.sheetId))
        .limit(1);
      if (emp?.userId && sh?.month) {
        await db
          .update(payrollMonthsTable)
          .set({ fixedSalary: amount })
          .where(and(eq(payrollMonthsTable.userId, emp.userId), eq(payrollMonthsTable.month, sh.month)));
      }
    }
    const packed = await loadSheet(line.sheetId);
    res.json(packed);
  } catch (err) {
    console.error("PATCH line", err);
    res.status(503).json({ error: "Qator saqlanmadi" });
  }
});

router.delete("/hisobkitob/lines/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (denyEdit(req, res)) return;
  const id = Number(req.params.id);
  const [line] = await db.select().from(settlementLinesTable).where(eq(settlementLinesTable.id, id)).limit(1);
  if (!line) {
    res.status(404).json({ error: "Qator topilmadi" });
    return;
  }
  const [sheet] = await db.select().from(settlementSheetsTable).where(eq(settlementSheetsTable.id, line.sheetId)).limit(1);
  if (sheet?.status === "approved" && !canAdminHisobkitob(req.userRole)) {
    res.status(403).json({ error: "Tasdiqlangan varaq yopiq" });
    return;
  }
  await db.delete(settlementLinesTable).where(eq(settlementLinesTable.id, id));
  res.json(await loadSheet(line.sheetId));
});

router.get("/hisobkitob/staff", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (denyView(req, res)) return;
  const q = String(req.query.q || "").trim();
  const rows = await db
    .select({
      id: employeesTable.id,
      fullName: employeesTable.fullName,
      location: employeesTable.location,
      position: employeesTable.position,
      phone: usersTable.phone,
      fiksa: employeesTable.fixedSalary,
    })
    .from(employeesTable)
    .leftJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .where(q ? ilike(employeesTable.fullName, `%${q}%`) : undefined)
    .limit(40);
  res.json({ items: rows });
});

router.get("/hisobkitob/sheets/:id/export", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (denyView(req, res)) return;
  const packed = await loadSheet(Number(req.params.id));
  if (!packed) {
    res.status(404).json({ error: "Varaq topilmadi" });
    return;
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(packed.sheet.branchName.slice(0, 28));
  ws.addRow([
    "XODIM",
    "LAVOZIM",
    "TELEFON",
    "JORIY REJA",
    "OLDINGI REJA",
    "SAVDO",
    "REJADAN ORTIQ",
    "REJA %",
    "SAVDO FOIZI",
    "FOIZ SUMMASI",
    "FIKS",
    "REJA BONUSI",
    "KPI BONUS",
    "AVANS",
    "QAYTA HISOB",
    "VAQT JARIMASI",
    "MUDDATI O'TGAN",
    "HISOBLANGAN",
    "QO'LGA / KARTA",
    "IZOH",
  ]);
  for (const l of packed.lines) {
    ws.addRow([
      l.fullName,
      l.position,
      l.phone,
      l.planCurrent,
      l.planPrev,
      l.sales,
      l.overPlan,
      l.planPct,
      l.percent,
      l.oylikPct,
      l.fiksa,
      l.earnedPlanBonus,
      l.extraBonus,
      l.avans,
      l.inventoryFine,
      l.timeFine,
      l.expiryHold,
      l.grossPay,
      l.card,
      l.fineNote,
    ]);
  }
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="hisobkitob-${packed.sheet.branchName}-${packed.sheet.month}.xlsx"`,
  );
  await wb.xlsx.write(res);
  res.end();
});

export default router;
