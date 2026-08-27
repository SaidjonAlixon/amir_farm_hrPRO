import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const vacanciesTable = pgTable("vacancies", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  salaryRange: text("salary_range"),
  location: text("location"),
  schedule: text("schedule"),
  benefits: text("benefits"),
  channels: jsonb("channels").notNull().default([]), // VacancyChannel[]
  status: text("status").notNull().default("draft"), // draft|published|closed
  recruiterId: integer("recruiter_id"),
  deadline: timestamp("deadline", { withTimezone: true }),
  lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
  /** HR rekruterga yuborgan / biriktirgan vaqt */
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  /** Rekruter "Qabul qildim" bosgan vaqt */
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  /** E'lon tasdiqlangan / Faol bo'lgan vaqt */
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const channelsTable = pgTable("channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default(""),
  isActive: integer("is_active").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
