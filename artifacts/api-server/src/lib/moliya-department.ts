import { eq, sql } from "drizzle-orm";
import { db, departmentsTable } from "@workspace/db";

export const MOLIYA_DEPARTMENT_NAME = "Moliya";

export function isMoliyaRole(role?: string | null): boolean {
  return role === "moliya";
}

export async function ensureMoliyaDepartmentId(): Promise<number> {
  const [existing] = await db
    .select({ id: departmentsTable.id })
    .from(departmentsTable)
    .where(eq(departmentsTable.name, MOLIYA_DEPARTMENT_NAME))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(departmentsTable)
    .values({ name: MOLIYA_DEPARTMENT_NAME })
    .returning({ id: departmentsTable.id });
  if (created) return created.id;

  const [again] = await db
    .select({ id: departmentsTable.id })
    .from(departmentsTable)
    .where(eq(departmentsTable.name, MOLIYA_DEPARTMENT_NAME))
    .limit(1);
  if (!again) throw new Error("Moliya bo‘limi yaratilmadi");
  return again.id;
}

export async function syncMoliyaDepartmentAssignments(departmentId?: number): Promise<number> {
  const moliyaId = departmentId ?? (await ensureMoliyaDepartmentId());
  await db.execute(sql`
    UPDATE users
    SET department_id = ${moliyaId}
    WHERE role = 'moliya'
      AND department_id IS DISTINCT FROM ${moliyaId}
  `);
  await db.execute(sql`
    UPDATE employees e
    SET department_id = ${moliyaId}
    FROM users u
    WHERE e.user_id = u.id
      AND u.role = 'moliya'
      AND e.department_id IS DISTINCT FROM ${moliyaId}
  `);
  await db.execute(sql`
    INSERT INTO users (full_name, role, login, password, status, department_id)
    SELECT 'Demo Moliyachi', 'moliya', 'moliyachi1', 'pass123', 'active', ${moliyaId}
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE login = 'moliyachi1')
  `);
  return moliyaId;
}
