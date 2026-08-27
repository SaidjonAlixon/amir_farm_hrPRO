import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * Filial xodim holati o‘zgarganda (Ishlamoqdadan boshqa) koordinatorga ogohlantirish.
 * workflowStatus: pending | confirmed | cancelled | closed
 */
export const staffingAlertsTable = pgTable("staffing_alerts", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  managerEmployeeId: integer("manager_employee_id"),
  branchLocation: text("branch_location"),
  shiftType: text("shift_type"),
  shiftLabel: text("shift_label"),
  /** new | dismissed | need_hire */
  employmentStatus: text("employment_status").notNull(),
  /** pending | confirmed | cancelled | closed */
  workflowStatus: text("workflow_status").notNull().default("pending"),
  note: text("note"),
  createdById: integer("created_by_id"),
  confirmedById: integer("confirmed_by_id"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  requestId: integer("request_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/**
 * Rekruter arizani olish uchun so‘rov qoldiradi; HR tasdiqlab biriktiradi.
 * status: pending | accepted | rejected
 */
export const requestClaimsTable = pgTable("request_claims", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  recruiterId: integer("recruiter_id").notNull(),
  note: text("note"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
