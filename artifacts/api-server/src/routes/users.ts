import { Router, type IRouter } from "express";
import { eq, and, ilike, asc } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db, usersTable, departmentsTable } from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import {
  ensureFarmasevtDepartmentId,
  isFarmasevtDepartmentRole,
} from "../lib/farmasevt-department";
import { ensureMoliyaDepartmentId, isMoliyaRole } from "../lib/moliya-department";

const router: IRouter = Router();

const ALLOWED_ROLES = [
  "admin",
  "recruiter",
  "hr",
  "hr_direktor",
  "hr_auditor",
  "hr_menejer",
  "trainer",
  "mentor",
  "director",
  "department_head",
  "mudir",
  "koordinator",
  "texnik",
  "ombor",
  "sb",
  "sb_boshliq",
  "farmasevt",
  "stajyor",
  "moliya",
] as const;

const ALLOWED_STATUSES = ["active", "vacant", "terminated", "on_leave"] as const;

const ROLE_LABEL_UZ: Record<string, string> = {
  admin: "Admin",
  recruiter: "Rekruter",
  hr: "HR",
  hr_direktor: "HR Direktor",
  hr_auditor: "HR Auditor",
  hr_menejer: "HR Menejer",
  trainer: "Trener",
  mentor: "Mentor",
  director: "Direktor",
  department_head: "Bo‘lim boshlig‘i",
  mudir: "Mudir",
  koordinator: "Koordinator",
  texnik: "Texnik",
  ombor: "Ombor",
  sb: "SB operatori",
  sb_boshliq: "SB bo‘limi boshlig‘i",
  farmasevt: "Farmasevt",
  stajyor: "Stajyor",
  moliya: "Moliyachi",
};

const STATUS_UZ: Record<string, string> = {
  active: "Faol",
  inactive: "Bo‘sh",
  vacant: "Bo‘sh",
  terminated: "Tugatilgan",
  on_leave: "Tatilda",
  blocked: "Bo‘sh",
};

function requireAdmin(req: AuthRequest, res: import("express").Response): boolean {
  if (req.userRole !== "admin") {
    res.status(403).json({ error: "Faqat admin foydalanuvchi yaratishi mumkin" });
    return false;
  }
  return true;
}

function latinSlug(input: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh",
    ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
    ў: "o", қ: "q", ғ: "g", ҳ: "h",
    "o'": "o", "g'": "g", "oʻ": "o", "gʻ": "g",
  };
  let s = input.trim().toLowerCase();
  s = s.replace(/o['ʻ’`]/g, "o").replace(/g['ʻ’`]/g, "g");
  let out = "";
  for (const ch of s) {
    out += map[ch] ?? ch;
  }
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

function publicUser(row: {
  id: number;
  fullName: string;
  role: string;
  departmentId: number | null;
  login: string;
  phone: string | null;
  status: string;
  createdAt: Date;
}, departmentName: string | null = null) {
  return {
    id: row.id,
    fullName: row.fullName,
    role: row.role,
    departmentId: row.departmentId,
    departmentName,
    login: row.login,
    phone: row.phone,
    status: row.status,
    createdAt: row.createdAt,
  };
}

router.get("/users", async (req, res): Promise<void> => {
  const { role, departmentId, search } = req.query as Record<string, string>;

  const conditions = [];
  if (role) conditions.push(eq(usersTable.role, role));
  if (departmentId) conditions.push(eq(usersTable.departmentId, parseInt(departmentId, 10)));
  if (search) conditions.push(ilike(usersTable.fullName, `%${search}%`));

  const base = db
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
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id));

  const rows = conditions.length
    ? await base.where(and(...conditions))
    : await base;

  res.json(rows);
});

/** Admin — barcha foydalanuvchilar + login/parol Excel */
router.get("/users/export", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (req.userRole !== "admin") {
    res.status(403).json({ error: "Faqat admin Excel yuklab olishi mumkin" });
    return;
  }

  const rows = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      role: usersTable.role,
      departmentName: departmentsTable.name,
      login: usersTable.login,
      password: usersTable.password,
      phone: usersTable.phone,
      status: usersTable.status,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .orderBy(asc(usersTable.fullName));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VAKSINA MED HR";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Foydalanuvchilar", {
    views: [{ state: "frozen", ySplit: 2, xSplit: 0 }],
    properties: { defaultRowHeight: 22 },
  });

  sheet.mergeCells("A1:I1");
  const title = sheet.getCell("A1");
  title.value = "VAKSINA MED — Foydalanuvchilar ro‘yxati (login va parollar)";
  title.font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0B3A5C" },
  };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 36;

  const headers = [
    "№",
    "F.I.Sh.",
    "Rol",
    "Login",
    "Parol",
    "Telefon",
    "Bo‘lim",
    "Holat",
    "Yaratilgan",
  ];
  const headerRow = sheet.getRow(2);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1A5F8A" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF0B3A5C" } },
      left: { style: "thin", color: { argb: "FF0B3A5C" } },
      bottom: { style: "thin", color: { argb: "FF0B3A5C" } },
      right: { style: "thin", color: { argb: "FF0B3A5C" } },
    };
  });
  headerRow.height = 28;

  sheet.columns = [
    { key: "n", width: 6 },
    { key: "fullName", width: 32 },
    { key: "role", width: 18 },
    { key: "login", width: 26 },
    { key: "password", width: 16 },
    { key: "phone", width: 18 },
    { key: "department", width: 22 },
    { key: "status", width: 12 },
    { key: "createdAt", width: 18 },
  ];

  rows.forEach((u, idx) => {
    const row = sheet.addRow({
      n: idx + 1,
      fullName: u.fullName,
      role: ROLE_LABEL_UZ[u.role] || u.role,
      login: u.login,
      password: u.password,
      phone: u.phone || "—",
      department: u.departmentName || "—",
      status: STATUS_UZ[u.status] || u.status,
      createdAt: u.createdAt
        ? new Date(u.createdAt).toLocaleString("uz-UZ", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—",
    });

    const zebra = idx % 2 === 0 ? "FFF7FAFC" : "FFFFFFFF";
    row.eachCell((cell, colNumber) => {
      cell.font = {
        name: "Calibri",
        size: 11,
        bold: colNumber === 4 || colNumber === 5,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: zebra },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: colNumber === 1 || colNumber === 8 ? "center" : "left",
        wrapText: true,
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
    // Login / parol ustunlarini ajratib ko‘rsatish
    row.getCell(4).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8F4FC" },
    };
    row.getCell(5).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFF4E5" },
    };
    row.height = 24;
  });

  const footerRow = sheet.addRow([]);
  sheet.mergeCells(`A${footerRow.number}:I${footerRow.number}`);
  const footer = sheet.getCell(`A${footerRow.number}`);
  footer.value = `Jami: ${rows.length} ta foydalanuvchi · Yuklab olingan: ${new Date().toLocaleString("uz-UZ")} · Maxfiy — faqat admin uchun`;
  footer.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF64748B" } };
  footer.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(footerRow.number).height = 22;

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="foydalanuvchilar_${stamp}.xlsx"`,
  );
  res.setHeader("Cache-Control", "no-store");
  res.send(buffer);
});

router.post("/users", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const { fullName, role, departmentId, login, password, phone, status } = req.body ?? {};
  if (!fullName?.trim() || !role) {
    res.status(400).json({ error: "Ism-familiya va rol majburiy" });
    return;
  }
  if (!ALLOWED_ROLES.includes(role)) {
    res.status(400).json({ error: "Noto'g'ri rol" });
    return;
  }

  const generatedPassword = password?.trim() || randomPassword(8);
  let finalLogin = login?.trim();
  if (!finalLogin) {
    finalLogin = await uniqueLogin(role, String(fullName));
  } else {
    const [dup] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.login, finalLogin));
    if (dup) {
      res.status(400).json({ error: "Bu login band" });
      return;
    }
  }

  try {
    let resolvedDeptId = departmentId ? parseInt(String(departmentId), 10) : null;
    if (isFarmasevtDepartmentRole(role)) {
      resolvedDeptId = await ensureFarmasevtDepartmentId();
    } else if (isMoliyaRole(role)) {
      resolvedDeptId = await ensureMoliyaDepartmentId();
    }

    const [user] = await db
      .insert(usersTable)
      .values({
        fullName: String(fullName).trim(),
        role,
        departmentId: resolvedDeptId,
        login: finalLogin,
        password: generatedPassword,
        phone: phone ?? null,
        status: status ?? "active",
      })
      .returning();

    let departmentName: string | null = null;
    if (user.departmentId) {
      const [dept] = await db
        .select({ name: departmentsTable.name })
        .from(departmentsTable)
        .where(eq(departmentsTable.id, user.departmentId));
      departmentName = dept?.name ?? null;
    }

    res.status(201).json({
      ...publicUser(user, departmentName),
      temporaryPassword: generatedPassword,
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(400).json({ error: "Bu login band" });
      return;
    }
    throw err;
  }
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
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
    .where(eq(usersTable.id, id));
  if (!row) { res.status(404).json({ error: "Topilmadi" }); return; }
  res.json(row);
});

router.post("/users/:id/regenerate-login", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Noto‘g‘ri ID" });
    return;
  }
  if (req.userId === id) {
    res.status(400).json({ error: "O‘zingizning login/parolingizni shu yerda yangilay olmaysiz" });
    return;
  }

  const [row] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }

  const login = await uniqueLogin(row.role, row.fullName);
  const temporaryPassword = randomPassword(8);

  const [updated] = await db
    .update(usersTable)
    .set({ login, password: temporaryPassword })
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }

  res.json({
    ...publicUser(updated),
    temporaryPassword,
  });
});

router.patch("/users/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [existing] = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }

  const allowed = ["fullName", "role", "departmentId", "phone", "status"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (updates.role && !ALLOWED_ROLES.includes(updates.role as typeof ALLOWED_ROLES[number])) {
    res.status(400).json({ error: "Noto'g'ri rol" });
    return;
  }
  if (updates.status) {
    const st = String(updates.status);
    const mapped = st === "inactive" || st === "blocked" ? "vacant" : st;
    if (!ALLOWED_STATUSES.includes(mapped as (typeof ALLOWED_STATUSES)[number])) {
      res.status(400).json({ error: "Noto‘g‘ri holat" });
      return;
    }
    updates.status = mapped;
  }
  if (req.userId === id && updates.status && updates.status !== "active") {
    res.status(400).json({ error: "O‘zingizni faoldan chiqara olmaysiz" });
    return;
  }

  const effectiveRole = (updates.role as string | undefined) || existing.role;
  if (isFarmasevtDepartmentRole(effectiveRole)) {
    updates.departmentId = await ensureFarmasevtDepartmentId();
  } else if (isMoliyaRole(effectiveRole)) {
    updates.departmentId = await ensureMoliyaDepartmentId();
  } else if (updates.departmentId !== undefined && updates.departmentId !== null) {
    updates.departmentId = parseInt(String(updates.departmentId), 10);
  }

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Topilmadi" }); return; }
  res.json(publicUser(updated));
});

router.delete("/users/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (req.userId === id) {
    res.status(400).json({ error: "O'zingizni o'chira olmaysiz" });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.sendStatus(204);
});

export default router;
