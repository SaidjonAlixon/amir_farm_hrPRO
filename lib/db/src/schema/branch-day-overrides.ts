import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

/**
 * Kunlik vaqtinchalik filial — faqat shu work_date da davomat GPS shu filialdan.
 * Asosiy assigned_branch_id o‘zgarmaydi; ertasi kun avtomatik uy filialiga qaytadi.
 */
export const employeeBranchDayOverridesTable = pgTable(
  "employee_branch_day_overrides",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id").notNull(),
    /** Mudir (filial) employees.id */
    branchId: integer("branch_id").notNull(),
    /** YYYY-MM-DD (Asia/Tashkent) */
    workDate: text("work_date").notNull(),
    note: text("note"),
    createdById: integer("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("emp_branch_day_overrides_emp_date_uidx").on(t.employeeId, t.workDate),
    index("emp_branch_day_overrides_date_idx").on(t.workDate),
    index("emp_branch_day_overrides_branch_idx").on(t.branchId),
  ],
);
