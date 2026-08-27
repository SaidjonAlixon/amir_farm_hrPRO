import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Admin tahrirlaydigan smena shablonlari (1-smena, masofadan, …) */
export const shiftTemplatesTable = pgTable("shift_templates", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  hint: text("hint").notNull().default(""),
  startHm: text("start_hm").notNull(),
  endHm: text("end_hm").notNull(),
  overnight: boolean("overnight").notNull().default(false),
  skipGeofence: boolean("skip_geofence").notNull().default(false),
  warnHm: text("warn_hm").notNull(),
  warnText: text("warn_text").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
