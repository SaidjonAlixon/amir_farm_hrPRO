import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  text: text("text").notNull(),
  type: text("type").notNull().default("stage_change"),
  // new_request|interview_reminder|expired_task|stage_change|offer_accepted|hired
  isRead: boolean("is_read").notNull().default(false),
  linkUrl: text("link_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
