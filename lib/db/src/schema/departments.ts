import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const departmentsTable = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  headId: integer("head_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
