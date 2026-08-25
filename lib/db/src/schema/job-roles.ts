import { pgTable, text, serial, timestamp, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core";

/** Admin qo‘shgan lavozimlar (tizim rollariga qo‘shimcha) */
export const jobRolesTable = pgTable(
  "job_roles",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    hidden: boolean("hidden").notNull().default(false),
    createdById: integer("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("job_roles_slug_uidx").on(t.slug)],
);
