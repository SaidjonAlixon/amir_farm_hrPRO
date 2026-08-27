import type { Response } from "express";
import { eq } from "drizzle-orm";
import { db, candidatesTable, usersTable } from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";

import { HR_ROLES, isHrManager as isHrManagerRole } from "./roles";

/** HR suhbatni shu rollarga o'tkaza oladi */
export const ASSIGNABLE_ROLES = [
  "admin",
  ...HR_ROLES,
  "recruiter",
  "trainer",
  "director",
  "department_head",
] as const;

export function isHrManager(role?: string | null): boolean {
  return isHrManagerRole(role);
}

/** Rekruter faqat o'ziga biriktirilgan ishlarni ko'radi */
export function isRecruiterScoped(role?: string | null): boolean {
  return role === "recruiter";
}

/** Faqat mas'ul yoki HR/Admin o'zgartira oladi (boshqa rekruterlar emas) */
export function canManageCandidate(
  userId?: number | null,
  userRole?: string | null,
  assigneeId?: number | null,
): boolean {
  if (isHrManager(userRole)) return true;
  if (userId != null && assigneeId != null && userId === assigneeId) return true;
  return false;
}

/** Ko'rish: HR/Admin hammasi; rekruter — faqat o'ziga biriktirilgan */
export function canViewCandidate(
  userId?: number | null,
  userRole?: string | null,
  assigneeId?: number | null,
): boolean {
  if (!isRecruiterScoped(userRole)) return true;
  return userId != null && assigneeId != null && userId === assigneeId;
}

export async function ensureCanManageCandidate(
  req: AuthRequest,
  res: Response,
  candidateId: number,
): Promise<{ id: number; recruiterId: number | null } | null> {
  const [candidate] = await db
    .select({ id: candidatesTable.id, recruiterId: candidatesTable.recruiterId })
    .from(candidatesTable)
    .where(eq(candidatesTable.id, candidateId));

  if (!candidate) {
    res.status(404).json({ error: "Nomzod topilmadi" });
    return null;
  }

  if (!canManageCandidate(req.userId, req.userRole, candidate.recruiterId)) {
    res.status(403).json({
      error: "Faqat HR yoki biriktirilgan mas'ul bu suhbatni o'zgartira oladi",
    });
    return null;
  }

  return candidate;
}

export async function ensureCanViewCandidate(
  req: AuthRequest,
  res: Response,
  candidateId: number,
): Promise<{ id: number; recruiterId: number | null } | null> {
  const [candidate] = await db
    .select({ id: candidatesTable.id, recruiterId: candidatesTable.recruiterId })
    .from(candidatesTable)
    .where(eq(candidatesTable.id, candidateId));

  if (!candidate) {
    res.status(404).json({ error: "Nomzod topilmadi" });
    return null;
  }

  if (!canViewCandidate(req.userId, req.userRole, candidate.recruiterId)) {
    res.status(403).json({
      error: "Bu nomzod sizga biriktirilmagan",
    });
    return null;
  }

  return candidate;
}

export async function assertAssignableUser(
  userId: number,
): Promise<{ id: number; fullName: string; role: string } | null> {
  const [user] = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      role: usersTable.role,
      status: usersTable.status,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user || user.status !== "active") return null;
  if (!ASSIGNABLE_ROLES.includes(user.role as (typeof ASSIGNABLE_ROLES)[number])) {
    return null;
  }
  return { id: user.id, fullName: user.fullName, role: user.role };
}
