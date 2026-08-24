import { eq, sql } from "drizzle-orm";
import { db, departmentsTable } from "@workspace/db";

/** Mudir / farmasevt / stajyor uchun yagona bo‘lim nomi */
export const FARMASEVT_DEPARTMENT_NAME = "Farmasevt";

export const FARMASEVT_USER_ROLES = ["mudir", "farmasevt", "stajyor"] as const;

export function isFarmasevtDepartmentRole(role?: string | null): boolean {
  return !!role && (FARMASEVT_USER_ROLES as readonly string[]).includes(role);
}

/** «Farmasevt» bo‘limini topadi yoki yaratadi */
export async function ensureFarmasevtDepartmentId(): Promise<number> {
  const [existing] = await db
    .select({ id: departmentsTable.id })
    .from(departmentsTable)
    .where(eq(departmentsTable.name, FARMASEVT_DEPARTMENT_NAME))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(departmentsTable)
    .values({ name: FARMASEVT_DEPARTMENT_NAME })
    .returning({ id: departmentsTable.id });
  if (created) return created.id;

  // Race: boshqa so‘rov yaratgan bo‘lishi mumkin
  const [again] = await db
    .select({ id: departmentsTable.id })
    .from(departmentsTable)
    .where(eq(departmentsTable.name, FARMASEVT_DEPARTMENT_NAME))
    .limit(1);
  if (!again) throw new Error("Farmasevt bo‘limi yaratilmadi");
  return again.id;
}

/** Mavjud mudir/farmasevt/stajyor foydalanuvchi va xodimlarni «Farmasevt» bo‘limiga o‘tkazadi */
export async function syncFarmasevtDepartmentAssignments(departmentId?: number): Promise<number> {
  const farmId = departmentId ?? (await ensureFarmasevtDepartmentId());
  await db.execute(sql`
    UPDATE users
    SET department_id = ${farmId}
    WHERE role IN ('mudir', 'farmasevt', 'stajyor')
      AND department_id IS DISTINCT FROM ${farmId}
  `);
  await db.execute(sql`
    UPDATE employees e
    SET department_id = ${farmId}
    FROM users u
    WHERE e.user_id = u.id
      AND u.role IN ('mudir', 'farmasevt', 'stajyor')
      AND e.department_id IS DISTINCT FROM ${farmId}
  `);
  await db.execute(sql`
    UPDATE employees
    SET department_id = ${farmId}
    WHERE org_role IN ('manager', 'pharmacist', 'intern')
      AND department_id IS DISTINCT FROM ${farmId}
  `);
  return farmId;
}
