import { Router, type IRouter } from "express";
import { and, eq, inArray, ne } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db, usersTable, employeesTable } from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import { parseGpsText, displayBranchName } from "../lib/geo-location";
import { saveManagerBranchLocation } from "../lib/branch-gps";
import { ensureFarmasevtDepartmentId } from "../lib/farmasevt-department";
import {
  canHardDeletePharmacyNetwork,
  hardDeletePharmacyEmployee,
} from "../lib/delete-pharmacy-staff";

const router: IRouter = Router();

const STAFF_ROLES = ["mudir", "farmasevt", "stajyor"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

function latinSlug(input: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh",
    ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
    ў: "o", қ: "q", ғ: "g", ҳ: "h",
  };
  let s = input.trim().toLowerCase();
  s = s.replace(/o['ʻ’`]/g, "o").replace(/g['ʻ’`]/g, "g");
  let out = "";
  for (const ch of s) out += map[ch] ?? ch;
  out = out.replace(/[^a-z0-9]+/g, "").slice(0, 14);
  return out || "user";
}

function randomPassword(len = 8): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let pwd = "";
  for (let i = 0; i < len; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

async function uniqueLogin(role: string, fullName: string): Promise<string> {
  const base = `${role}_${latinSlug(fullName)}`;
  let candidate = base;
  for (let i = 0; i < 50; i++) {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.login, candidate));
    if (!existing) return candidate;
    candidate = `${base}${i + 2}`;
  }
  return `${base}_${Date.now().toString(36).slice(-4)}`;
}

async function defaultDepartmentId(): Promise<number> {
  return ensureFarmasevtDepartmentId();
}

async function ensureCoordinatorEmployee(userId: number, fullName: string) {
  const [existing] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.userId, userId));

  if (existing) {
    if (existing.orgRole !== "coordinator") {
      const [updated] = await db
        .update(employeesTable)
        .set({ orgRole: "coordinator" })
        .where(eq(employeesTable.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }

  const departmentId = await defaultDepartmentId();
  const [created] = await db
    .insert(employeesTable)
    .values({
      fullName,
      position: "Koordinator",
      departmentId,
      hiredAt: new Date().toISOString().slice(0, 10),
      orgRole: "coordinator",
      userId,
      employmentStatus: "working",
      shiftType: "one",
      createdById: userId,
    })
    .returning();
  return created;
}

type LoginCredential = {
  employeeId: number;
  userId: number | null;
  fullName: string;
  location: string;
  login: string;
  password: string;
  roleLabel: string;
  mudirName: string;
};

const STAFF_ORG = new Set(["pharmacist", "intern", "supervisor"]);

function orgRoleLabel(orgRole: string | null | undefined) {
  if (orgRole === "intern") return "Stajyor";
  if (orgRole === "supervisor") return "Boshqaruvchi";
  if (orgRole === "manager") return "Mudir";
  if (orgRole === "coordinator") return "Koordinator";
  return "Farmasevt";
}

function branchLabel(location: string | null | undefined, fallback: string) {
  const loc = displayBranchName(location);
  const generic = !loc || loc === "Filial" || loc === fallback;
  return generic ? fallback : loc;
}

async function actorEmployee(userId: number, orgRole: "coordinator" | "manager") {
  const rows = await db
    .select({
      id: employeesTable.id,
      orgRole: employeesTable.orgRole,
      fullName: employeesTable.fullName,
      location: employeesTable.location,
    })
    .from(employeesTable)
    .where(eq(employeesTable.userId, userId));
  return rows.find((r) => r.orgRole === orgRole) ?? rows[0] ?? null;
}

async function usersByIds(userIds: number[]) {
  if (!userIds.length) return new Map<number, { id: number; login: string; password: string }>();
  const users = await db
    .select({
      id: usersTable.id,
      login: usersTable.login,
      password: usersTable.password,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));
  return new Map(users.map((u) => [u.id, u]));
}

type MudirCredential = {
  employeeId: number;
  fullName: string;
  location: string;
  login: string;
  password: string;
};

async function loadOwnMudirCredentials(actorUserId: number): Promise<MudirCredential[]> {
  const coordRows = await db
    .select({
      id: employeesTable.id,
      orgRole: employeesTable.orgRole,
    })
    .from(employeesTable)
    .where(eq(employeesTable.userId, actorUserId));
  const coord = coordRows.find((r) => r.orgRole === "coordinator") ?? coordRows[0];
  if (!coord) return [];

  const managers = await db
    .select({
      id: employeesTable.id,
      fullName: employeesTable.fullName,
      location: employeesTable.location,
      userId: employeesTable.userId,
      reportsToId: employeesTable.reportsToId,
      employmentStatus: employeesTable.employmentStatus,
    })
    .from(employeesTable)
    .where(eq(employeesTable.orgRole, "manager"));

  const mine = managers.filter(
    (m) => m.reportsToId === coord.id && m.employmentStatus !== "dismissed",
  );
  const userIds = [...new Set(mine.map((m) => m.userId).filter((id): id is number => id != null))];
  const users = userIds.length
    ? await db
        .select({
          id: usersTable.id,
          login: usersTable.login,
          password: usersTable.password,
        })
        .from(usersTable)
        .where(inArray(usersTable.id, userIds))
    : [];
  const byUser = new Map(users.map((u) => [u.id, u]));

  return mine
    .map((m) => {
      const u = m.userId != null ? byUser.get(m.userId) : undefined;
      return {
        employeeId: m.id,
        fullName: m.fullName,
        location: branchLabel(m.location, m.fullName),
        login: u?.login || "—",
        password: u?.password || "—",
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "uz"));
}

async function loadStaffCredentials(actorUserId: number, actorRole: string): Promise<LoginCredential[]> {
  const wantManager = actorRole === "mudir";
  const actor = await actorEmployee(actorUserId, wantManager ? "manager" : "coordinator");
  if (!actor) return [];

  let managers: Array<{ id: number; fullName: string; location: string | null }> = [];
  if (wantManager) {
    managers = [{ id: actor.id, fullName: actor.fullName, location: actor.location }];
  } else {
    const all = await db
      .select({
        id: employeesTable.id,
        fullName: employeesTable.fullName,
        location: employeesTable.location,
        reportsToId: employeesTable.reportsToId,
        employmentStatus: employeesTable.employmentStatus,
      })
      .from(employeesTable)
      .where(eq(employeesTable.orgRole, "manager"));
    managers = all.filter(
      (m) => m.reportsToId === actor.id && m.employmentStatus !== "dismissed",
    );
  }

  const managerIds = managers.map((m) => m.id);
  if (!managerIds.length) return [];
  const byManager = new Map(managers.map((m) => [m.id, m]));

  const staff = await db
    .select({
      id: employeesTable.id,
      fullName: employeesTable.fullName,
      location: employeesTable.location,
      userId: employeesTable.userId,
      orgRole: employeesTable.orgRole,
      reportsToId: employeesTable.reportsToId,
      employmentStatus: employeesTable.employmentStatus,
    })
    .from(employeesTable)
    .where(inArray(employeesTable.reportsToId, managerIds));

  const mine = staff.filter(
    (s) => STAFF_ORG.has(s.orgRole || "") && s.employmentStatus !== "dismissed",
  );
  const byUser = await usersByIds(
    [...new Set(mine.map((s) => s.userId).filter((id): id is number => id != null))],
  );

  return mine
    .map((s) => {
      const mudir = s.reportsToId != null ? byManager.get(s.reportsToId) : undefined;
      const u = s.userId != null ? byUser.get(s.userId) : undefined;
      return {
        employeeId: s.id,
        userId: s.userId,
        fullName: s.fullName,
        location: branchLabel(s.location || mudir?.location, mudir?.fullName || s.fullName),
        login: u?.login || "—",
        password: u?.password || "—",
        roleLabel: orgRoleLabel(s.orgRole),
        mudirName: mudir?.fullName || "—",
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "uz"));
}

function paintCredSheet(
  workbook: ExcelJS.Workbook,
  opts: {
    name: string;
    title: string;
    headers: string[];
    widths: number[];
    rows: Array<Array<string | number>>;
    monoCols?: number[];
  },
) {
  const sheet = workbook.addWorksheet(opts.name, {
    views: [{ state: "frozen", ySplit: 2 }],
    properties: { defaultRowHeight: 22 },
  });
  const lastCol = opts.headers.length;
  sheet.mergeCells(1, 1, 1, lastCol);
  const title = sheet.getCell("A1");
  title.value = opts.title;
  title.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3A5C" } };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 30;
  opts.headers.forEach((h, i) => {
    const cell = sheet.getRow(2).getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A5F8A" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  sheet.columns = opts.widths.map((width) => ({ width }));
  const mono = new Set(opts.monoCols ?? [2, 3]);
  opts.rows.forEach((vals, idx) => {
    const row = sheet.addRow(vals);
    row.eachCell((cell, col) => {
      cell.font = {
        name: mono.has(col) ? "Consolas" : "Calibri",
        size: 10,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: idx % 2 === 0 ? "FFF7FAFC" : "FFFFFFFF" },
      };
    });
  });
  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: lastCol } };
}

async function sendWorkbook(
  res: import("express").Response,
  workbook: ExcelJS.Workbook,
  filename: string,
) {
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

router.get("/pharmacy-network/mudirs", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (req.userRole !== "koordinator" || !req.userId) {
    res.status(403).json({ error: "Faqat koordinator o‘z mudirlarini ko‘radi" });
    return;
  }
  res.json(await loadOwnMudirCredentials(req.userId));
});

router.get("/pharmacy-network/staff-logins", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!req.userId || (req.userRole !== "koordinator" && req.userRole !== "mudir")) {
    res.status(403).json({ error: "Faqat koordinator yoki mudir ko‘radi" });
    return;
  }
  res.json(await loadStaffCredentials(req.userId, req.userRole));
});

router.get("/pharmacy-network/mudirs/export", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (req.userRole !== "koordinator" || !req.userId) {
    res.status(403).json({ error: "Faqat koordinator Excel yuklashi mumkin" });
    return;
  }

  const mudirs = await loadOwnMudirCredentials(req.userId);
  const staff = await loadStaffCredentials(req.userId, "koordinator");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VAKSINA MED HR";
  workbook.created = new Date();

  paintCredSheet(workbook, {
    name: "Mudirlar",
    title: `VAKSINA MED — Mening mudirlarim · ${mudirs.length} ta`,
    headers: ["F.I.Sh.", "Login", "Parol", "Filial"],
    widths: [32, 24, 16, 28],
    rows: mudirs.map((r) => [r.fullName, r.login, r.password, r.location]),
  });
  paintCredSheet(workbook, {
    name: "Farmasevt va stajyor",
    title: `Qo‘l ostidagi filiallar — farmasevt / stajyor · ${staff.length} ta`,
    headers: ["F.I.Sh.", "Lavozim", "Login", "Parol", "Filial", "Mudir"],
    widths: [32, 16, 24, 16, 28, 28],
    rows: staff.map((r) => [r.fullName, r.roleLabel, r.login, r.password, r.location, r.mudirName]),
    monoCols: [3, 4],
  });

  const stamp = new Date().toISOString().slice(0, 10);
  await sendWorkbook(res, workbook, `tarmoq-login-${stamp}.xlsx`);
});

router.get("/pharmacy-network/staff-logins/export", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (req.userRole !== "mudir" || !req.userId) {
    res.status(403).json({ error: "Faqat mudir o‘z xodimlarini Excelga oladi" });
    return;
  }
  const staff = await loadStaffCredentials(req.userId, "mudir");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VAKSINA MED HR";
  workbook.created = new Date();
  paintCredSheet(workbook, {
    name: "Xodimlar",
    title: `VAKSINA MED — Filial xodimlari (login/parol) · ${staff.length} ta`,
    headers: ["F.I.Sh.", "Lavozim", "Login", "Parol", "Filial"],
    widths: [32, 16, 24, 16, 28],
    rows: staff.map((r) => [r.fullName, r.roleLabel, r.login, r.password, r.location]),
    monoCols: [3, 4],
  });
  const stamp = new Date().toISOString().slice(0, 10);
  await sendWorkbook(res, workbook, `filial-xodimlar-login-${stamp}.xlsx`);
});

async function canEditNetworkCreds(
  actorUserId: number,
  actorRole: string,
  employeeId: number,
): Promise<{ ok: true; userId: number } | { ok: false; status: number; error: string }> {
  const [target] = await db
    .select({
      id: employeesTable.id,
      userId: employeesTable.userId,
      orgRole: employeesTable.orgRole,
      reportsToId: employeesTable.reportsToId,
    })
    .from(employeesTable)
    .where(eq(employeesTable.id, employeeId));
  if (!target) return { ok: false, status: 404, error: "Xodim topilmadi" };
  if (!target.userId) return { ok: false, status: 400, error: "Bu xodimda login yo‘q" };

  if (actorRole === "mudir") {
    const actor = await actorEmployee(actorUserId, "manager");
    if (!actor) return { ok: false, status: 403, error: "Filial bog‘lanmagan" };
    if (target.reportsToId !== actor.id || !STAFF_ORG.has(target.orgRole || "")) {
      return { ok: false, status: 403, error: "Faqat o‘z filial xodimini tahrirlaysiz" };
    }
    return { ok: true, userId: target.userId };
  }

  if (actorRole === "koordinator") {
    const actor = await actorEmployee(actorUserId, "coordinator");
    if (!actor) return { ok: false, status: 403, error: "Koordinator kartasi yo‘q" };
    if (target.orgRole === "manager" && target.reportsToId === actor.id) {
      return { ok: true, userId: target.userId };
    }
    if (STAFF_ORG.has(target.orgRole || "") && target.reportsToId) {
      const [mudir] = await db
        .select({ id: employeesTable.id, reportsToId: employeesTable.reportsToId })
        .from(employeesTable)
        .where(eq(employeesTable.id, target.reportsToId));
      if (mudir?.reportsToId === actor.id) return { ok: true, userId: target.userId };
    }
    return { ok: false, status: 403, error: "Faqat o‘z tarmog‘ingizdagi odamni tahrirlaysiz" };
  }

  return { ok: false, status: 403, error: "Ruxsat yo‘q" };
}

router.patch("/pharmacy-network/credentials/:employeeId", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!req.userId || (req.userRole !== "koordinator" && req.userRole !== "mudir")) {
    res.status(403).json({ error: "Ruxsat yo‘q" });
    return;
  }
  const employeeId = parseInt(
    Array.isArray(req.params.employeeId) ? req.params.employeeId[0] : req.params.employeeId,
    10,
  );
  if (!Number.isFinite(employeeId)) {
    res.status(400).json({ error: "Noto‘g‘ri xodim" });
    return;
  }
  const allowed = await canEditNetworkCreds(req.userId, req.userRole, employeeId);
  if (!allowed.ok) {
    res.status(allowed.status).json({ error: allowed.error });
    return;
  }

  const login = String(req.body?.login ?? "").trim();
  const password = String(req.body?.password ?? "").trim();
  if (!login) {
    res.status(400).json({ error: "Login bo‘sh bo‘lmasin" });
    return;
  }
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(login)) {
    res.status(400).json({ error: "Login: 3–40 belgi, harf/raqam . _ -" });
    return;
  }
  if (password && password.length < 6) {
    res.status(400).json({ error: "Parol kamida 6 belgi" });
    return;
  }

  const [taken] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.login, login), ne(usersTable.id, allowed.userId)));
  if (taken) {
    res.status(400).json({ error: "Bu login band" });
    return;
  }

  const updates: { login: string; password?: string } = { login };
  if (password) updates.password = password;

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, allowed.userId))
    .returning({
      id: usersTable.id,
      login: usersTable.login,
      password: usersTable.password,
    });
  if (!updated) {
    res.status(404).json({ error: "Login topilmadi" });
    return;
  }
  res.json({
    employeeId,
    userId: updated.id,
    login: updated.login,
    password: updated.password,
  });
});

/**
 * POST /api/pharmacy-network/staff
 * Koordinator → mudir; Mudir → farmasevt | stajyor
 * Avtomatik login/parol yaratadi.
 */
router.post("/pharmacy-network/staff", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const actorRole = req.userRole ?? "";
  const actorId = req.userId;
  if (!actorId) {
    res.status(401).json({ error: "Avtorizatsiya talab etiladi" });
    return;
  }

  const { firstName, lastName, phone, role, location, coordinates, managerEmployeeId } = req.body ?? {};
  const fn = String(firstName || "").trim();
  const ln = String(lastName || "").trim();
  const phoneVal = String(phone || "").trim();
  const staffRole = String(role || "").trim() as StaffRole;

  if (!fn || !ln) {
    res.status(400).json({ error: "Ism va familiya majburiy" });
    return;
  }
  if (!phoneVal) {
    res.status(400).json({ error: "Telefon raqam majburiy" });
    return;
  }
  if (!STAFF_ROLES.includes(staffRole)) {
    res.status(400).json({ error: "Rol: mudir, farmasevt yoki stajyor" });
    return;
  }

  if (actorRole === "koordinator") {
    if (staffRole !== "mudir" && staffRole !== "farmasevt" && staffRole !== "stajyor") {
      res.status(403).json({ error: "Koordinator mudir, farmasevt yoki stajyor qo‘sha oladi" });
      return;
    }
  } else if (actorRole === "mudir") {
    if (staffRole !== "farmasevt" && staffRole !== "stajyor") {
      res.status(403).json({ error: "Mudir faqat farmasevt yoki stajyor qo‘sha oladi" });
      return;
    }
  } else if (
    actorRole === "admin" ||
    actorRole === "hr" ||
    actorRole === "hr_menejer" ||
    actorRole === "hr_direktor"
  ) {
    // HR/admin ham xuddi shu rollarni yaratishi mumkin
  } else {
    res.status(403).json({ error: "Ruxsat yo‘q" });
    return;
  }

  const fullName = `${fn} ${ln}`.replace(/\s+/g, " ").trim();
  const [actor] = await db
    .select({ fullName: usersTable.fullName, departmentId: usersTable.departmentId })
    .from(usersTable)
    .where(eq(usersTable.id, actorId));

  let reportsToId: number | null = null;
  let orgRole: string;
  let position: string;
  let branchLocation: string | null = location?.trim() || null;
  let branchLat: number | null = null;
  let branchLng: number | null = null;

  if (staffRole === "mudir") {
    orgRole = "manager";
    position = "Filial mudiri";
    if (actorRole === "koordinator") {
      const coord = await ensureCoordinatorEmployee(
        actorId,
        actor?.fullName || "Koordinator",
      );
      reportsToId = coord.id;
    } else {
      const [coord] = await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.orgRole, "coordinator"))
        .limit(1);
      if (!coord) {
        res.status(400).json({
          error: "Avval tizimda koordinator xodimi bo‘lishi kerak",
        });
        return;
      }
      reportsToId = coord.id;
    }
    const gps = parseGpsText(String(coordinates || location || ""));
    if (gps) {
      branchLat = gps.lat;
      branchLng = gps.lng;
      if (!branchLocation || parseGpsText(branchLocation)) {
        branchLocation = "Filial";
      }
    }
    if (!branchLocation) branchLocation = "Filial";
  } else {
    if (staffRole === "stajyor") {
      orgRole = "intern";
      position = "Stajyor";
    } else {
      orgRole = "pharmacist";
      position = "Farmasevt";
    }

    if (actorRole === "mudir") {
      const [myBranch] = await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.userId, actorId));
      if (!myBranch || myBranch.orgRole !== "manager") {
        res.status(400).json({
          error: "Filial bog‘lanmagan — avval sizni mudir sifatida tarmoqqa ulang",
        });
        return;
      }
      reportsToId = myBranch.id;
      branchLocation = myBranch.location;
    } else {
      const mid = parseInt(String(managerEmployeeId ?? ""), 10);
      if (!Number.isFinite(mid)) {
        res.status(400).json({ error: "Qaysi filialga qo‘shishni tanlang" });
        return;
      }
      const [mgr] = await db
        .select({
          id: employeesTable.id,
          orgRole: employeesTable.orgRole,
          reportsToId: employeesTable.reportsToId,
          location: employeesTable.location,
          employmentStatus: employeesTable.employmentStatus,
        })
        .from(employeesTable)
        .where(eq(employeesTable.id, mid));
      if (!mgr || mgr.orgRole !== "manager") {
        res.status(400).json({ error: "Filial (mudir) topilmadi" });
        return;
      }
      if (actorRole === "koordinator") {
        const coord = await actorEmployee(actorId, "coordinator");
        if (!coord || mgr.reportsToId !== coord.id) {
          res.status(403).json({ error: "Faqat o‘z qo‘l ostidagi filialga qo‘shasiz" });
          return;
        }
      }
      reportsToId = mgr.id;
      branchLocation = mgr.location;
    }
  }

  const generatedPassword = randomPassword(8);
  const finalLogin = await uniqueLogin(staffRole, fullName);
  // Mudir / farmasevt / stajyor — bo‘lim doim «Farmasevt»
  const departmentId = await defaultDepartmentId();

  try {
    const [user] = await db
      .insert(usersTable)
      .values({
        fullName,
        role: staffRole,
        departmentId,
        login: finalLogin,
        password: generatedPassword,
        phone: phoneVal,
        status: "active",
      })
      .returning();

    const [employee] = await db
      .insert(employeesTable)
      .values({
        fullName,
        position,
        departmentId,
        hiredAt: new Date().toISOString().slice(0, 10),
        orgRole,
        reportsToId,
        location: branchLocation,
        latitude: branchLat,
        longitude: branchLng,
        userId: user.id,
        employmentStatus: "working",
        shiftType: "one",
        createdById: actorId,
      })
      .returning();

    res.status(201).json({
      id: user.id,
      fullName: user.fullName,
      role: user.role,
      login: user.login,
      phone: user.phone,
      temporaryPassword: generatedPassword,
      employeeId: employee.id,
      orgRole: employee.orgRole,
      location: employee.location,
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(400).json({ error: "Bu login band — qayta urinib ko‘ring" });
      return;
    }
    throw err;
  }
});

async function handleSaveManagerLocation(
  req: AuthRequest,
  res: import("express").Response,
  employeeId: number,
) {
  const actorId = req.userId;
  if (!actorId) {
    res.status(401).json({ error: "Avtorizatsiya talab etiladi" });
    return;
  }
  const result = await saveManagerBranchLocation({
    actorRole: req.userRole ?? "",
    actorUserId: actorId,
    employeeId,
    coordinates: String(req.body?.coordinates || "").trim(),
    branchName: String(req.body?.branchName ?? req.body?.locationName ?? "").trim() || null,
  });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({
    id: result.id,
    location: result.location,
    latitude: result.latitude,
    longitude: result.longitude,
  });
}

/**
 * Koordinator: o‘z mudirining filial GPS ni saqlaydi.
 * Koordinata matnidan nom avtomatik olinadi.
 */
router.post("/pharmacy-network/location", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const employeeId = parseInt(String(req.body?.employeeId ?? req.body?.id ?? ""), 10);
  if (!Number.isFinite(employeeId)) {
    res.status(400).json({ error: "Noto‘g‘ri mudir" });
    return;
  }
  await handleSaveManagerLocation(req, res, employeeId);
});

router.post(
  "/pharmacy-network/managers/:id/location",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Noto‘g‘ri mudir" });
      return;
    }
    await handleSaveManagerLocation(req, res, id);
  },
);

/**
 * Filial (mudir) yoki xodimni butunlay o‘chirish.
 * Mudir o‘chirilsa — filial + ostidagi barcha xodimlar ham yo‘qoladi.
 */
async function handleHardDelete(req: AuthRequest, res: import("express").Response): Promise<void> {
  if (!canHardDeletePharmacyNetwork(req.userRole ?? undefined)) {
    res.status(403).json({ error: "Faqat admin/HR o‘chira oladi" });
    return;
  }
  const body = (req.body ?? {}) as {
    employeeId?: number | string;
    userId?: number | string | null;
    fullName?: string | null;
  };
  const fromParam = req.params.employeeId;
  const employeeId = parseInt(
    String(
      body.employeeId ??
        (Array.isArray(fromParam) ? fromParam[0] : fromParam) ??
        "",
    ),
    10,
  );
  const userIdRaw = body.userId ?? req.query.userId;
  const userId =
    userIdRaw != null && String(userIdRaw).trim() !== ""
      ? parseInt(String(userIdRaw), 10)
      : null;
  const fullName = String(body.fullName ?? req.query.fullName ?? "").trim() || null;

  if (!Number.isFinite(employeeId) && !userId && !fullName) {
    res.status(400).json({ error: "Noto‘g‘ri xodim" });
    return;
  }
  try {
    const result = await hardDeletePharmacyEmployee(
      Number.isFinite(employeeId) ? employeeId : 0,
      {
        userId: userId != null && Number.isFinite(userId) ? userId : null,
        fullName,
      },
    );
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      ok: true,
      kind: result.kind,
      fullName: result.fullName,
      deletedEmployees: result.deletedEmployees,
      deletedUsers: result.deletedUsers,
      message:
        result.kind === "filial"
          ? `Filial va mudir «${result.fullName}» butunlay o‘chirildi (${result.deletedEmployees} yozuv)`
          : `«${result.fullName}» butunlay o‘chirildi`,
    });
  } catch (err) {
    console.error("pharmacy-network hard-delete error:", err);
    res.status(503).json({ error: "O‘chirish amalga oshmadi" });
  }
}

router.post("/pharmacy-network/hard-delete", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  await handleHardDelete(req, res);
});

router.delete(
  "/pharmacy-network/employees/:employeeId",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    await handleHardDelete(req, res);
  },
);

export default router;
