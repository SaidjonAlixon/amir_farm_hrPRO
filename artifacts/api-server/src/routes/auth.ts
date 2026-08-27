import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, departmentsTable } from "@workspace/db";
import { setSessionCookie, clearSessionCookie } from "../lib/session";

const router: IRouter = Router();

async function getUserWithDept(userId: number) {
  const [user] = await db
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
    .where(eq(usersTable.id, userId));
  return user ?? null;
}

function canSignIn(status?: string | null) {
  return status === "active" || status === "on_leave";
}

function statusBlockMessage(status?: string | null) {
  if (status === "on_leave") return "Foydalanuvchi tatilda";
  if (status === "terminated") return "Foydalanuvchi tugatilgan";
  if (status === "vacant" || status === "inactive" || status === "blocked") {
    return "Foydalanuvchi hozir bo‘sh holatda";
  }
  return "Foydalanuvchi faol emas";
}

function isDbDown(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  return (
    e.code === "ETIMEDOUT" ||
    e.code === "ECONNREFUSED" ||
    e.code === "ENOTFOUND" ||
    e.code === "57P01" ||
    /timeout|ECONNRESET|Connection terminated/i.test(String(e.message || ""))
  );
}

router.post("/auth/login", async (req, res): Promise<void> => {
  // Bo‘sh joy / tab / NBSP — avtomatik olib tashlanadi
  const compact = (v: unknown) => String(v ?? "").replace(/[\s\u00a0\u200b\uFEFF]+/g, "");
  const login = compact(req.body?.login);
  const password = compact(req.body?.password);
  if (!login || !password) {
    res.status(400).json({ error: "Login va parol kerak" });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(sql`lower(${usersTable.login}) = lower(${login})`);

    if (!user || compact(user.password) !== password) {
      res.status(401).json({ error: "Login yoki parol noto'g'ri" });
      return;
    }

    if (!canSignIn(user.status)) {
      res.status(403).json({ error: statusBlockMessage(user.status) });
      return;
    }

    setSessionCookie(res, user.id);

    const fullUser = await getUserWithDept(user.id);
    req.log?.info?.({ userId: user.id, role: user.role }, "User logged in");
    res.json({ user: fullUser });
  } catch (err) {
    console.error("auth/login error:", err);
    if (!process.env.DATABASE_URL) {
      res.status(503).json({
        error: "DATABASE_URL sozlanmagan — Vercel Environment Variables tekshiring",
      });
      return;
    }
    res.status(503).json({
      error: isDbDown(err)
        ? "Baza bilan aloqa yo‘q — birozdan keyin qayta urinib ko‘ring"
        : "Server xatosi — qayta urinib ko‘ring",
    });
  }
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const sessionCookie = req.cookies?.session;
  if (!sessionCookie) {
    res.status(204).end();
    return;
  }

  try {
    const decoded = JSON.parse(Buffer.from(sessionCookie, "base64").toString());
    const user = await getUserWithDept(decoded.userId);
    if (!user) {
      res.status(401).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }
    res.json(user);
  } catch (err) {
    if (err instanceof SyntaxError) {
      res.status(401).json({ error: "Noto'g'ri sessiya" });
      return;
    }
    console.error("auth/me error:", err);
    res.status(503).json({
      error: isDbDown(err)
        ? "Baza bilan aloqa yo‘q — birozdan keyin qayta urinib ko‘ring"
        : "Server xatosi — qayta urinib ko‘ring",
    });
  }
});

/** O‘z profili: ism/familiya + parol (Excel export uchun bazada ochiq saqlanadi) */
router.patch("/auth/profile", async (req, res): Promise<void> => {
  const sessionCookie = req.cookies?.session;
  if (!sessionCookie) {
    res.status(401).json({ error: "Avtorizatsiya kerak" });
    return;
  }

  let userId: number;
  try {
    const decoded = JSON.parse(Buffer.from(sessionCookie, "base64").toString());
    userId = Number(decoded.userId);
  } catch {
    res.status(401).json({ error: "Noto‘g‘ri sessiya" });
    return;
  }
  if (!Number.isFinite(userId)) {
    res.status(401).json({ error: "Noto‘g‘ri sessiya" });
    return;
  }

  const firstName = String(req.body?.firstName ?? "").trim();
  const lastName = String(req.body?.lastName ?? "").trim();
  const password = String(req.body?.password ?? "").trim();

  if (!firstName || !lastName) {
    res.status(400).json({ error: "Ism va familiyani kiriting" });
    return;
  }
  if (!password) {
    res.status(400).json({ error: "Yangi parolni kiriting" });
    return;
  }
  if (password.length < 4) {
    res.status(400).json({ error: "Parol kamida 4 belgi bo‘lsin" });
    return;
  }

  const fullName = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();

  try {
    const [updated] = await db
      .update(usersTable)
      .set({ fullName, password })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id });

    if (!updated) {
      res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }

    const user = await getUserWithDept(userId);
    res.json({ user, message: "Profil yangilandi — parol bazaga saqlandi" });
  } catch (err) {
    console.error("auth/profile error:", err);
    res.status(503).json({
      error: isDbDown(err)
        ? "Baza bilan aloqa yo‘q — birozdan keyin qayta urinib ko‘ring"
        : "Server xatosi — qayta urinib ko‘ring",
    });
  }
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

export default router;
