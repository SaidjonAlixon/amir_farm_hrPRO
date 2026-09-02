import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

/**
 * Kunlik smena rejasi — bir kunda bir yoki bir nechta smena (masalan 1-smena + 3-smena).
 * work_date bo‘yicha doimiy smenadan vaqtincha ustun keladi.
 */
export const employeeDayShiftPlansTable = pgTable(
  "employee_day_shift_plans",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id").notNull(),
    /** YYYY-MM-DD (Asia/Tashkent) */
    workDate: text("work_date").notNull(),
    /** Bir kundagi smena tartibi: 0, 1, 2… */
    segmentOrder: integer("segment_order").notNull().default(0),
    /** one | two | three | custom | … */
    shiftType: text("shift_type").notNull(),
    shiftStart: text("shift_start"),
    shiftEnd: text("shift_end"),
    /** Shu segment uchun vaqtinchalik filial (mudir employees.id) */
    branchId: integer("branch_id"),
    note: text("note"),
    createdById: integer("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("emp_day_shift_plans_emp_date_seg_uidx").on(t.employeeId, t.workDate, t.segmentOrder),
    index("emp_day_shift_plans_date_idx").on(t.workDate),
    index("emp_day_shift_plans_employee_idx").on(t.employeeId),
  ],
);
