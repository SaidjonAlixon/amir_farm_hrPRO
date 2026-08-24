import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const requestsTable = pgTable("requests", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull(),
  position: text("position").notNull(),
  count: integer("count").notNull().default(1),
  description: text("description"),
  requirements: text("requirements"),
  salaryRange: text("salary_range"),
  deadline: text("deadline"),
  reason: text("reason"),
  /** Ish joyi: shahar */
  city: text("city"),
  /** Ish joyi: tuman */
  district: text("district"),
  priority: text("priority").notNull().default("normal"), // urgent|normal
  status: text("status").notNull().default("submitted"), // submitted|reviewing|accepted|announced|closed
  assignedToId: integer("assigned_to_id"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  createdById: integer("created_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
