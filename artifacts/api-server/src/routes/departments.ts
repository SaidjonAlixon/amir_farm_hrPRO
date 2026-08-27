import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, departmentsTable, usersTable } from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import { isHrManager } from "../lib/roles";

const router: IRouter = Router();

function canManageDepartments(role?: string) {
  return isHrManager(role) || role === "director";
}

async function getDepartmentFull(id: number) {
  const [row] = await db
    .select({
      id: departmentsTable.id,
      name: departmentsTable.name,
      headId: departmentsTable.headId,
      headName: usersTable.fullName,
      createdAt: departmentsTable.createdAt,
    })
    .from(departmentsTable)
    .leftJoin(usersTable, eq(departmentsTable.headId, usersTable.id))
    .where(eq(departmentsTable.id, id));
  return row ?? null;
}

router.get("/departments", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: departmentsTable.id,
      name: departmentsTable.name,
      headId: departmentsTable.headId,
      headName: usersTable.fullName,
      createdAt: departmentsTable.createdAt,
    })
    .from(departmentsTable)
    .leftJoin(usersTable, eq(departmentsTable.headId, usersTable.id))
    .orderBy(departmentsTable.name);
  res.json(
    rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

router.post("/departments", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canManageDepartments(req.userRole)) {
    res.status(403).json({ error: "Faqat HR / admin / direktor bo‘lim qo‘sha oladi" });
    return;
  }
  const { name, headId } = req.body ?? {};
  if (!name || !String(name).trim()) {
    res.status(400).json({ error: "Bo'lim nomi kerak" });
    return;
  }
  const hid =
    headId === null || headId === undefined || headId === ""
      ? null
      : parseInt(String(headId), 10);
  if (hid != null && !Number.isFinite(hid)) {
    res.status(400).json({ error: "Boshliq id noto‘g‘ri" });
    return;
  }

  const [dept] = await db
    .insert(departmentsTable)
    .values({ name: String(name).trim(), headId: hid })
    .returning();
  const full = await getDepartmentFull(dept.id);
  res.status(201).json(
    full
      ? { ...full, createdAt: full.createdAt.toISOString() }
      : { ...dept, headName: null, createdAt: dept.createdAt.toISOString() },
  );
});

router.get("/departments/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const row = await getDepartmentFull(id);
  if (!row) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.patch("/departments/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canManageDepartments(req.userRole)) {
    res.status(403).json({ error: "Faqat HR / admin / direktor tahrirlashi mumkin" });
    return;
  }
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, headId } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) {
    const n = String(name).trim();
    if (!n) {
      res.status(400).json({ error: "Bo'lim nomi bo‘sh bo‘lmasin" });
      return;
    }
    updates.name = n;
  }
  if (headId !== undefined) {
    updates.headId =
      headId === null || headId === "" ? null : parseInt(String(headId), 10);
  }
  if (!Object.keys(updates).length) {
    const existing = await getDepartmentFull(id);
    if (!existing) {
      res.status(404).json({ error: "Topilmadi" });
      return;
    }
    res.json({ ...existing, createdAt: existing.createdAt.toISOString() });
    return;
  }

  const [updated] = await db
    .update(departmentsTable)
    .set(updates)
    .where(eq(departmentsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }
  const full = await getDepartmentFull(id);
  res.json(
    full
      ? { ...full, createdAt: full.createdAt.toISOString() }
      : { ...updated, headName: null, createdAt: updated.createdAt.toISOString() },
  );
});

router.delete("/departments/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canManageDepartments(req.userRole)) {
    res.status(403).json({ error: "Faqat HR / admin / direktor o‘chira oladi" });
    return;
  }
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [existing] = await db
    .select({ id: departmentsTable.id })
    .from(departmentsTable)
    .where(eq(departmentsTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }
  try {
    await db.delete(departmentsTable).where(eq(departmentsTable.id, id));
    res.sendStatus(204);
  } catch {
    res.status(400).json({
      error: "Bo‘limni o‘chirib bo‘lmadi — unga bog‘langan yozuvlar bor",
    });
  }
});

export default router;
