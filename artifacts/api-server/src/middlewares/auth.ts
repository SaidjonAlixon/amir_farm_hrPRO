import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

export interface AuthRequest extends Request {
  userId?: number;
  userRole?: string;
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const sessionCookie = req.cookies?.session;
  if (!sessionCookie) {
    res.status(401).json({ error: "Avtorizatsiya talab etiladi" });
    return;
  }

  let decoded: { userId?: number };
  try {
    decoded = JSON.parse(Buffer.from(sessionCookie, "base64").toString());
  } catch {
    res.status(401).json({ error: "Noto'g'ri sessiya" });
    return;
  }

  if (!decoded?.userId) {
    res.status(401).json({ error: "Noto'g'ri sessiya" });
    return;
  }

  try {
    const [user] = await db
      .select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId));

    if (!user || (user.status !== "active" && user.status !== "on_leave")) {
      res.status(401).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }

    req.userId = user.id;
    req.userRole = user.role;
    next();
  } catch (err) {
    console.error("requireAuth db error:", err);
    res.status(503).json({ error: "Server vaqtincha ishlamayapti, qayta urinib ko‘ring" });
  }
}
