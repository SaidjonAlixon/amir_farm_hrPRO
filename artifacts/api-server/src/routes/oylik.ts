import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db, employeesTable, payrollMonthsTable, usersTable, workCalendarDaysTable } from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import {
  canApprovePayroll,
  canEditKpiSettings,
  canManagePayroll,
  computePayroll,
  computePayrollList,
  currentMonthKey,
  defaultIsWorkDay,
  formatSom,
  loadKpiWeights,
  loadWorkDayOverrides,
  monthBounds,
  saveKpiWeights,
  upsertPayrollDraft,
  workdaysBetween,
} from "../lib/kpi-payroll";

const router: IRouter = Router();

router.get("/oylik/me", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  try {
    const month = String(req.query.month || currentMonthKey()).slice(0, 7);
    const report = await computePayroll(req.userId!, month);
    if (!report) {
      res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }
    const [saved] = await db
      .select({ status: payrollMonthsTable.status, approvedAt: payrollMonthsTable.approvedAt })
      .from(payrollMonthsTable)
      .where(and(eq(payrollMonthsTable.userId, req.userId!), eq(payrollMonthsTable.month, report.month)))
      .limit(1);
    res.json({ ...report, status: saved?.status || "draft", approvedAt: saved?.approvedAt || null });
  } catch (err) {
    console.error("GET /oylik/me", err);
    const detail = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: `Oylik ma'lumoti yuklanmadi: ${detail}` });
  }
});

router.get("/oylik/settings", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canManagePayroll(req.userRole)) {
    res.status(403).json({ error: "Ruxsat yo‘q" });
    return;
  }
  try {
    const weights = await loadKpiWeights();
    res.json({
      weights,
      canEdit: canEditKpiSettings(req.userRole),
      canApprove: canApprovePayroll(req.userRole),
    });
  } catch (err) {
    console.error("GET /oylik/settings", err);
    res.status(503).json({ error: "Sozlama yuklanmadi" });
  }
});

router.patch("/oylik/settings", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canEditKpiSettings(req.userRole)) {
    res.status(403).json({ error: "KPI og‘irligini HR direktor, direktor, moliyachi yoki admin o‘zgartiradi" });
    return;
  }
  try {
    const body = req.body ?? {};
    const weights = await saveKpiWeights(
      {
        attendance: body.attendance != null ? Number(body.attendance) : undefined,
        tasks: body.tasks != null ? Number(body.tasks) : undefined,
        checklist: body.checklist != null ? Number(body.checklist) : undefined,
        workStartHm: body.workStartHm,
      },
      req.userId!,
    );
    res.json({ weights });
  } catch (err) {
    console.error("PATCH /oylik/settings", err);
    res.status(503).json({ error: "Sozlama saqlanmadi" });
  }
});

router.patch("/oylik/calendar", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canEditKpiSettings(req.userRole)) {
    res.status(403).json({ error: "Kalendarni faqat admin va rahbar o‘zgartiradi" });
    return;
  }
  const day = String(req.body?.day || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    res.status(400).json({ error: "Sana noto‘g‘ri" });
    return;
  }
  const isWork = Boolean(req.body?.isWork);
  try {
    const now = new Date();
    if (isWork === defaultIsWorkDay(day)) {
      await db.delete(workCalendarDaysTable).where(eq(workCalendarDaysTable.day, day));
    } else {
      const [existing] = await db
        .select({ day: workCalendarDaysTable.day })
        .from(workCalendarDaysTable)
        .where(eq(workCalendarDaysTable.day, day))
        .limit(1);
      if (existing) {
        await db
          .update(workCalendarDaysTable)
          .set({ isWork, updatedById: req.userId!, updatedAt: now })
          .where(eq(workCalendarDaysTable.day, day));
      } else {
        await db.insert(workCalendarDaysTable).values({
          day,
          isWork,
          updatedById: req.userId!,
          updatedAt: now,
        });
      }
    }
    const { from, to } = monthBounds(day.slice(0, 7));
    const overrides = await loadWorkDayOverrides();
    res.json({ ok: true, day, isWork, workDays: workdaysBetween(from, to, overrides) });
  } catch (err) {
    console.error("PATCH /oylik/calendar", err);
    res.status(503).json({ error: "Kalendar saqlanmadi" });
  }
});

router.get("/oylik/employees", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canManagePayroll(req.userRole)) {
    res.status(403).json({ error: "Ruxsat yo‘q" });
    return;
  }
  try {
    const month = String(req.query.month || currentMonthKey()).slice(0, 7);
    const q = String(req.query.q || "").trim();
    const payload = await computePayrollList(month, q);
    res.json(payload);
  } catch (err) {
    console.error("GET /oylik/employees", err);
    const detail = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: `Ro‘yxat yuklanmadi: ${detail}` });
  }
});

router.get("/oylik/employees/:userId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canManagePayroll(req.userRole)) {
    res.status(403).json({ error: "Ruxsat yo‘q" });
    return;
  }
  try {
    const userId = Number(req.params.userId);
    const month = String(req.query.month || currentMonthKey()).slice(0, 7);
    const report = await computePayroll(userId, month);
    if (!report) {
      res.status(404).json({ error: "Xodim topilmadi" });
      return;
    }
    const [saved] = await db
      .select({ status: payrollMonthsTable.status, approvedAt: payrollMonthsTable.approvedAt })
      .from(payrollMonthsTable)
      .where(and(eq(payrollMonthsTable.userId, userId), eq(payrollMonthsTable.month, report.month)))
      .limit(1);
    res.json({ ...report, status: saved?.status || "draft", approvedAt: saved?.approvedAt || null });
  } catch (err) {
    console.error("GET /oylik/employees/:id", err);
    const detail = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: `Hisob yuklanmadi: ${detail}` });
  }
});

router.patch("/oylik/salary/:userId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canEditKpiSettings(req.userRole)) {
    res.status(403).json({ error: "Fiks maosh / bonus foizini o‘zgartirish ruxsati yo‘q" });
    return;
  }
  try {
    const userId = Number(req.params.userId);
    const body = req.body ?? {};
    const byEmp = Number(body.employeeId);
    const [emp] = Number.isFinite(byEmp) && byEmp > 0
      ? await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.id, byEmp)).limit(1)
      : await db
          .select({ id: employeesTable.id })
          .from(employeesTable)
          .where(eq(employeesTable.userId, userId))
          .limit(1);
    if (!emp) {
      res.status(404).json({ error: "Xodim kartochkasi yo‘q — avval xodimga bog‘lang" });
      return;
    }
    const patch: { fixedSalary?: number; bonusPercent?: number } = {};
    if (body.fixedSalary != null) patch.fixedSalary = Math.max(0, Math.round(Number(body.fixedSalary)));
    if (body.bonusPercent != null) patch.bonusPercent = Math.max(0, Math.min(200, Number(body.bonusPercent)));
    if (Object.keys(patch).length) {
      await db.update(employeesTable).set(patch).where(eq(employeesTable.id, emp.id));
    }
    res.json({ ok: true, userId, ...patch });
  } catch (err) {
    console.error("PATCH /oylik/salary", err);
    res.status(503).json({ error: "Saqlanmadi" });
  }
});

function normPosition(v: unknown) {
  return String(v ?? "").trim();
}

async function userIdsByPosition(position: string) {
  const rows = await db
    .select({ userId: employeesTable.userId, position: employeesTable.position })
    .from(employeesTable);
  const want = position.trim().toLowerCase();
  return rows
    .filter((r) => r.userId != null && (r.position || "").trim().toLowerCase() === want)
    .map((r) => r.userId as number);
}

router.patch("/oylik/salary-bulk", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canEditKpiSettings(req.userRole)) {
    res.status(403).json({ error: "Fiks maosh / bonus foizini o‘zgartirish ruxsati yo‘q" });
    return;
  }
  try {
    const position = normPosition(req.body?.position);
    if (!position) {
      res.status(400).json({ error: "Lavozim tanlang" });
      return;
    }
    const patch: { fixedSalary?: number; bonusPercent?: number } = {};
    if (req.body?.fixedSalary != null) patch.fixedSalary = Math.max(0, Math.round(Number(req.body.fixedSalary)));
    if (req.body?.bonusPercent != null) patch.bonusPercent = Math.max(0, Math.min(200, Number(req.body.bonusPercent)));
    if (!Object.keys(patch).length) {
      res.status(400).json({ error: "Fiksa yoki bonus kiriting" });
      return;
    }
    const ids = await userIdsByPosition(position);
    if (!ids.length) {
      res.status(404).json({ error: "Bu lavozimda xodim yo‘q" });
      return;
    }
    const emps = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(inArray(employeesTable.userId, ids));
    if (emps.length) {
      await db
        .update(employeesTable)
        .set(patch)
        .where(inArray(employeesTable.id, emps.map((e) => e.id)));
    }
    res.json({ ok: true, position, count: emps.length, ...patch });
  } catch (err) {
    console.error("PATCH /oylik/salary-bulk", err);
    res.status(503).json({ error: "Saqlanmadi" });
  }
});

router.post("/oylik/recalculate", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canManagePayroll(req.userRole)) {
    res.status(403).json({ error: "Ruxsat yo‘q" });
    return;
  }
  try {
    const month = String(req.body?.month || req.query.month || currentMonthKey()).slice(0, 7);
    await db.update(employeesTable).set({ fixedSalary: 0, bonusPercent: 0 });
    await db
      .update(payrollMonthsTable)
      .set({
        fixedSalary: 0,
        bonusPercent: 0,
        kpiPercent: 0,
        maxBonus: 0,
        bonusAmount: 0,
        totalAmount: 0,
        status: "draft",
        snapshot: {},
        approvedById: null,
        approvedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(payrollMonthsTable.month, month));
    res.json({ ok: true, month, reset: true });
  } catch (err) {
    console.error("POST /oylik/recalculate", err);
    res.status(503).json({ error: "Qayta hisoblanmadi" });
  }
});

router.post("/oylik/approve", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canApprovePayroll(req.userRole)) {
    res.status(403).json({ error: "Tasdiqlash: admin, direktor yoki moliyachi" });
    return;
  }
  try {
    const month = String(req.body?.month || currentMonthKey()).slice(0, 7);
    const all = Boolean(req.body?.all);
    const position = normPosition(req.body?.position);
    const userId = req.body?.userId != null ? Number(req.body.userId) : null;
    const now = new Date();

    if (position && (all || !userId)) {
      const ids = await userIdsByPosition(position);
      if (!ids.length) {
        res.status(404).json({ error: "Bu lavozimda xodim yo‘q" });
        return;
      }
      const existing = await db
        .select({ userId: payrollMonthsTable.userId })
        .from(payrollMonthsTable)
        .where(and(eq(payrollMonthsTable.month, month), inArray(payrollMonthsTable.userId, ids)));
      const have = new Set(existing.map((r) => r.userId));
      const missing = ids.filter((id) => !have.has(id));
      if (missing.length) {
        await db.insert(payrollMonthsTable).values(
          missing.map((id) => ({
            userId: id,
            month,
            status: "approved",
            fixedSalary: 0,
            bonusPercent: 0,
            kpiPercent: 0,
            maxBonus: 0,
            bonusAmount: 0,
            totalAmount: 0,
            approvedById: req.userId!,
            approvedAt: now,
          })),
        );
      }
      await db
        .update(payrollMonthsTable)
        .set({ status: "approved", approvedById: req.userId!, approvedAt: now, updatedAt: now })
        .where(and(eq(payrollMonthsTable.month, month), inArray(payrollMonthsTable.userId, ids)));
      res.json({ ok: true, month, position, count: ids.length, status: "approved" });
      return;
    }

    if (all || !userId) {
      const users = await db.select({ id: usersTable.id }).from(usersTable);
      const existing = await db
        .select({ userId: payrollMonthsTable.userId })
        .from(payrollMonthsTable)
        .where(eq(payrollMonthsTable.month, month));
      const have = new Set(existing.map((r) => r.userId));
      const missing = users.filter((u) => !have.has(u.id));
      if (missing.length) {
        await db.insert(payrollMonthsTable).values(
          missing.map((u) => ({
            userId: u.id,
            month,
            status: "approved",
            fixedSalary: 0,
            bonusPercent: 0,
            kpiPercent: 0,
            maxBonus: 0,
            bonusAmount: 0,
            totalAmount: 0,
            approvedById: req.userId!,
            approvedAt: now,
          })),
        );
      }
      await db
        .update(payrollMonthsTable)
        .set({ status: "approved", approvedById: req.userId!, approvedAt: now, updatedAt: now })
        .where(eq(payrollMonthsTable.month, month));
      res.json({ ok: true, month, count: users.length, status: "approved" });
      return;
    }

    const report = await computePayroll(userId, month);
    if (!report) {
      res.status(404).json({ error: "Xodim topilmadi" });
      return;
    }
    await upsertPayrollDraft(report, "approved");
    await db
      .update(payrollMonthsTable)
      .set({ approvedById: req.userId!, approvedAt: now, status: "approved" })
      .where(and(eq(payrollMonthsTable.userId, userId), eq(payrollMonthsTable.month, report.month)));
    res.json({ ok: true, ...report, status: "approved" });
  } catch (err) {
    console.error("POST /oylik/approve", err);
    res.status(503).json({ error: "Tasdiqlanmadi" });
  }
});

router.get("/oylik/export", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canManagePayroll(req.userRole)) {
    res.status(403).json({ error: "Ruxsat yo‘q" });
    return;
  }
  try {
    const month = String(req.query.month || currentMonthKey()).slice(0, 7);
    const { items } = await computePayrollList(month);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Oylik KPI");
    ws.columns = [
      { header: "F.I.Sh.", width: 28 },
      { header: "Lavozim", width: 18 },
      { header: "Filial", width: 16 },
      { header: "Fiks maosh", width: 14 },
      { header: "Bonus %", width: 10 },
      { header: "Davomat KPI", width: 12 },
      { header: "Topshiriq KPI", width: 14 },
      { header: "Checklist KPI", width: 14 },
      { header: "Umumiy KPI", width: 12 },
      { header: "Bonus", width: 14 },
      { header: "Jami oylik", width: 14 },
      { header: "Holat", width: 12 },
    ];
    for (const r of items) {
      ws.addRow([
        r.fullName,
        r.position || r.roleLabel,
        r.branch || "",
        r.fixedSalary,
        r.bonusPercent,
        r.attendanceAvailable ? r.attendance : "—",
        r.tasksAvailable ? r.tasks : "—",
        r.checklistAvailable ? r.checklist : "—",
        r.kpiPercent,
        r.bonusAmount,
        r.totalAmount,
        r.status === "approved" ? "Tasdiqlangan" : "Qoralama",
      ]);
    }
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="oylik-kpi-${month}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error("GET /oylik/export", err);
    res.status(503).json({ error: "Excel yuklanmadi" });
  }
});

export default router;
export { formatSom };
