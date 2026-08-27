import { pgTable, text, serial, timestamp, integer, date, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Foydalanuvchining oliy maqsadi.
 * status: active | archived
 */
export const userGoalsTable = pgTable("user_goals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * Har kunlik natija — oliy maqsad yo‘lida bugun nima qilindi.
 * Bir foydalanuvchi + bir sana = bitta yozuv.
 */
export const goalDailyLogsTable = pgTable(
  "goal_daily_logs",
  {
    id: serial("id").primaryKey(),
    goalId: integer("goal_id").notNull(),
    userId: integer("user_id").notNull(),
    workDate: date("work_date").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("goal_daily_logs_user_date_uidx").on(t.userId, t.workDate)],
);
