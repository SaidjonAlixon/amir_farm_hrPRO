import { Router, type IRouter } from "express";
import ExcelJS from "exceljs";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import { canViewHolat, canViewHolatFull } from "../lib/roles";
import { buildHolatReport, type HolatReport } from "../lib/holat";

const router: IRouter = Router();

function navyTitle(sheet: ExcelJS.Worksheet, lastCol: number, text: string) {
  sheet.mergeCells(1, 1, 1, lastCol);
  const title = sheet.getCell(1, 1);
  title.value = text;
  title.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3A5C" } };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 30;
}

function headerRow(sheet: ExcelJS.Worksheet, headers: string[]) {
  const row = sheet.getRow(2);
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A5F8A" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  row.height = 24;
  sheet.views = [{ state: "frozen", ySplit: 2 }];
  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: headers.length } };
}

function addRows(sheet: ExcelJS.Worksheet, rows: Array<Array<string | number | null>>) {
  const line = { style: "thin" as const, color: { argb: "FFD0D7DE" } };
  const border = { top: line, left: line, bottom: line, right: line };
  rows.forEach((vals, idx) => {
    const row = sheet.addRow(vals.map((v) => (v == null || v === "" ? "—" : v)));
    row.eachCell((cell) => {
      cell.font = { name: "Calibri", size: 10, color: { argb: "FF1E293B" } };
      cell.border = border;
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: idx % 2 === 0 ? "FFF4F8FB" : "FFFFFFFF" },
      };
    });
    row.height = 20;
  });
}

async function holatWorkbook(report: HolatReport) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "VAKSINA MED HR";
  wb.created = new Date();

  const s0 = wb.addWorksheet("Sonlar");
  navyTitle(s0, 3, `VAKSINA MED — Holat · ${report.generatedAt}`);
  headerRow(s0, ["Ko‘rsatkich", "Son", "Manba"]);
  s0.columns = [{ width: 42 }, { width: 12 }, { width: 55 }];
  addRows(s0, [
    ["Koordinatorlar (tarmoq, org_role)", report.pharmacyCounts.coordinators, report.source],
    ["Mudirlar (tarmoq)", report.pharmacyCounts.mudirs, "employees.org_role=manager"],
    ["Farmasevtlar (tarmoq)", report.pharmacyCounts.pharmacists, "employees.org_role=pharmacist"],
    ["Stajyorlar (tarmoq)", report.pharmacyCounts.interns, "employees.org_role=intern"],
    ["Tarmoq jami (koordinator→stajyor)", report.pharmacyCounts.total, "Faol, dismissed emas"],
    ["Login: koordinator", report.loginCounts.koordinator, "users.role"],
    ["Login: mudir", report.loginCounts.mudir, "users.role"],
    ["Login: farmasevt", report.loginCounts.farmasevt, "users.role"],
    ["Login: stajyor", report.loginCounts.stajyor, "users.role"],
    ["Bo‘limlar", report.office.departments, "departments"],
    ["Barcha xodimlar (employees)", report.office.employeesTotal, "employees"],
    ["Barcha loginlar (users)", report.office.usersTotal, "users"],
    ["Xodim qo‘shilgan filiallar", report.branchesWithStaff.length, "mudir ostida farmasevt/stajyor bor"],
    ["Xodim qo‘shilmagan filiallar", report.branchesWithoutStaff.length, "mudir bor, jamoa yo‘q"],
  ]);

  const s1 = wb.addWorksheet("Kim qoshgan");
  navyTitle(s1, 7, "Kim nechta odam qo‘shgan (created_by_id yoki daraxt)");
  headerRow(s1, ["F.I.Sh.", "Rol", "Mudir", "Farmasevt", "Stajyor", "Jami", "User ID"]);
  s1.columns = [{ width: 28 }, { width: 18 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }];
  addRows(
    s1,
    report.addedBy.map((a) => [a.fullName, a.roleLabel, a.mudirs, a.pharmacists, a.interns, a.total, a.userId]),
  );

  const s2 = wb.addWorksheet("Koordinator daraxti");
  navyTitle(s2, 12, "Koordinator → mudir → xodim");
  headerRow(s2, [
    "Koordinator",
    "Mudir",
    "Filial",
    "Xodim ism",
    "Xodim familiya",
    "Lavozim",
    "Tarmoq roli",
    "Telefon",
    "Ishga olingan",
    "Yaratilgan",
    "Qo‘shgan",
    "Manba",
  ]);
  s2.columns = [
    { width: 24 }, { width: 24 }, { width: 22 }, { width: 16 }, { width: 16 },
    { width: 16 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 22 }, { width: 12 },
  ];
  const treeRows: Array<Array<string | number | null>> = [];
  for (const c of report.coordinators) {
    if (!c.mudirs.length) {
      treeRows.push([c.fullName, "—", "—", "—", "—", c.position, "Koordinator", c.phone, c.hiredAt, c.createdAt, c.createdByName, "—"]);
    }
    for (const m of c.mudirs) {
      if (!m.staff.length) {
        treeRows.push([
          c.fullName, m.fullName, m.branch, m.firstName, m.lastName, m.position, "Mudir",
          m.phone, m.hiredAt, m.createdAt, m.createdByName, m.addedBySource,
        ]);
      }
      for (const s of m.staff) {
        treeRows.push([
          c.fullName, m.fullName, m.branch, s.firstName, s.lastName, s.position, s.orgRoleLabel,
          s.phone, s.hiredAt, s.createdAt, s.createdByName, s.addedBySource,
        ]);
      }
    }
  }
  addRows(s2, treeRows);

  const s3 = wb.addWorksheet("Filiallar");
  navyTitle(s3, 8, "Qaysi filialga xodim qo‘shilgan / qo‘shilmagan");
  headerRow(s3, ["Filial", "Mudir", "Koordinator", "Farmasevt", "Stajyor", "Jami xodim", "Holat", "Mudir ID"]);
  s3.columns = [{ width: 24 }, { width: 24 }, { width: 24 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 18 }, { width: 10 }];
  addRows(s3, [
    ...report.branchesWithStaff.map((b) => [
      b.branch, b.mudirName, b.coordinatorName, b.pharmacistCount, b.internCount, b.staffCount, "Xodim bor", b.mudirEmployeeId,
    ]),
    ...report.branchesWithoutStaff.map((b) => [
      b.branch, b.mudirName, b.coordinatorName, 0, 0, 0, "Xodim qo‘shilmagan", b.mudirEmployeeId,
    ]),
  ]);

  const s4 = wb.addWorksheet("Tarmoq xodimlari");
  navyTitle(s4, 16, "Koordinatorlardan stajyorlargacha — tarmoq");
  const netH = [
    "№", "Ism", "Familiya", "F.I.Sh.", "Lavozim", "Tarmoq roli", "Login roli", "Login", "Telefon",
    "Filial", "Koordinator", "Mudir", "Bo‘lim", "Ishga olingan", "Yaratilgan", "Qo‘shgan",
  ];
  headerRow(s4, netH);
  s4.columns = netH.map((h) => ({ width: h.length < 10 ? 12 : 18 }));
  addRows(
    s4,
    report.networkPeople.map((p, i) => [
      i + 1, p.firstName, p.lastName, p.fullName, p.position, p.orgRoleLabel, p.loginRoleLabel, p.login,
      p.phone, p.branch, p.coordinatorName, p.mudirName, p.departmentName, p.hiredAt, p.createdAt, p.createdByName,
    ]),
  );

  const s5 = wb.addWorksheet("Barcha xodimlar");
  navyTitle(s5, 16, "Tizimdagi barcha employees yozuvlari");
  headerRow(s5, netH);
  s5.columns = netH.map((h) => ({ width: h.length < 10 ? 12 : 18 }));
  addRows(
    s5,
    report.allEmployees.map((p, i) => [
      i + 1, p.firstName, p.lastName, p.fullName, p.position, p.orgRoleLabel, p.loginRoleLabel, p.login,
      p.phone, p.branch, p.coordinatorName, p.mudirName, p.departmentName, p.hiredAt, p.createdAt, p.createdByName,
    ]),
  );

  const s6 = wb.addWorksheet("Bolimlar");
  navyTitle(s6, 5, "Barcha bo‘limlar");
  headerRow(s6, ["ID", "Bo‘lim", "Rahbar", "Xodimlar soni", "Yaratilgan"]);
  s6.columns = [{ width: 8 }, { width: 28 }, { width: 28 }, { width: 14 }, { width: 20 }];
  addRows(s6, report.departments.map((d) => [d.id, d.name, d.headName, d.employeeCount, d.createdAt]));

  const s7 = wb.addWorksheet("Loginlar");
  navyTitle(s7, 10, "Barcha foydalanuvchilar (users)");
  headerRow(s7, ["ID", "Ism", "Familiya", "F.I.Sh.", "Lavozim (rol)", "Login", "Telefon", "Bo‘lim", "Holat", "Yaratilgan"]);
  s7.columns = [{ width: 8 }, { width: 16 }, { width: 16 }, { width: 26 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 18 }, { width: 12 }, { width: 20 }];
  addRows(
    s7,
    report.allUsers.map((u) => [
      u.id, u.firstName, u.lastName, u.fullName, u.roleLabel, u.login, u.phone, u.departmentName, u.statusLabel, u.createdAt,
    ]),
  );

  return wb;
}

router.get("/holat", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canViewHolat(req.userRole)) {
    res.status(403).json({ error: "Holat sizga ochiq emas" });
    return;
  }
  try {
    const full = canViewHolatFull(req.userRole);
    const report = await buildHolatReport({
      full,
      scopeRole: req.userRole,
      scopeUserId: req.userId,
    });
    res.json(report);
  } catch (err) {
    console.error("GET /holat error:", err);
    res.status(503).json({ error: "Holat yuklanmadi" });
  }
});

router.get("/holat/export", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canViewHolat(req.userRole)) {
    res.status(403).json({ error: "Holat sizga ochiq emas" });
    return;
  }
  try {
    const full = canViewHolatFull(req.userRole);
    const report = await buildHolatReport({
      full,
      scopeRole: req.userRole,
      scopeUserId: req.userId,
    });
    const wb = await holatWorkbook(report);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="VAKSINA_Holat_${stamp}.xlsx"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
  } catch (err) {
    console.error("GET /holat/export error:", err);
    res.status(503).json({ error: "Excel yuklanmadi" });
  }
});

export default router;
