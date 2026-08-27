import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * Filial ehtiyojlari — barcha vaqtlar bazada saqlanadi.
 * status:
 *   pending     — mudir yuborgan, koordinator tasdiǧi kutilmoqda
 *   assigned    — koordinator tasdiqlagan, xodimga topshiriq ketgan
 *   in_progress — xodim qabul qilgan
 *   done        — xodim bajargan, yakuniy tasdiq kutilmoqda
 *   verified    — mudir/koordinator yakuniy tasdiqlagan (yopiq, baza qoladi)
 *   closed      — bekor / yopilgan
 */
export const branchNeedsTable = pgTable("branch_needs", {
  id: serial("id").primaryKey(),
  needType: text("need_type").notNull(),
  branchLocation: text("branch_location"),
  managerEmployeeId: integer("manager_employee_id"),
  note: text("note"),
  status: text("status").notNull().default("pending"),
  createdById: integer("created_by_id"),
  /** Koordinator tasdiǧi */
  confirmedById: integer("confirmed_by_id"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  /** Xodimga yuborilgan */
  assignedUserId: integer("assigned_user_id"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  taskId: integer("task_id"),
  /** Xodim qabul qilgan */
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  /** Xodim bajargan */
  completedAt: timestamp("completed_at", { withTimezone: true }),
  /** Mudir yoki koordinator yakuniy tasdiq */
  verifiedById: integer("verified_by_id"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  closedById: integer("closed_by_id"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
