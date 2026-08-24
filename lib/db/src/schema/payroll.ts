import { pgTable, text, serial, timestamp, integer, doublePrecision, jsonb, uniqueIndex, boolean } from "drizzle-orm/pg-core";

/** Global KPI og‘irliklari (bitta qator, id=1) */
export const kpiSettingsTable = pgTable("kpi_settings", {
  id: serial("id").primaryKey(),
  attendanceWeight: integer("attendance_weight").notNull().default(40),
  tasksWeight: integer("tasks_weight").notNull().default(30),
  checklistWeight: integer("checklist_weight").notNull().default(30),
  workStartHm: text("work_start_hm").notNull().default("09:00"),
  updatedById: integer("updated_by_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PayrollSnapshot = Record<string, unknown>;

/** Oylik hisob-kitob tarixi */
export const payrollMonthsTable = pgTable(
  "payroll_months",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    employeeId: integer("employee_id"),
    month: text("month").notNull(),
    fixedSalary: integer("fixed_salary").notNull().default(0),
    bonusPercent: doublePrecision("bonus_percent").notNull().default(30),
    kpiPercent: doublePrecision("kpi_percent").notNull().default(0),
    maxBonus: integer("max_bonus").notNull().default(0),
    bonusAmount: integer("bonus_amount").notNull().default(0),
    totalAmount: integer("total_amount").notNull().default(0),
    status: text("status").notNull().default("draft"),
    snapshot: jsonb("snapshot").$type<PayrollSnapshot>().notNull().default({}),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    approvedById: integer("approved_by_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payroll_months_user_month_uidx").on(t.userId, t.month)],
);

/** Ish / dam kunlari — default: Du–Sha ish, Ya dam. Qator faqat o‘zgartirilgan sanalar. */
export const workCalendarDaysTable = pgTable("work_calendar_days", {
  day: text("day").primaryKey(),
  isWork: boolean("is_work").notNull(),
  updatedById: integer("updated_by_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
