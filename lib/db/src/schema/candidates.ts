import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const candidatesTable = pgTable("candidates", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  birthDate: text("birth_date"),
  phone: text("phone").notNull(),
  address: text("address"),
  photoUrl: text("photo_url"),
  education: text("education"),
  experience: text("experience"),
  expectedSalary: text("expected_salary"),
  notes: text("notes"),
  vacancyId: integer("vacancy_id").notNull(),
  recruiterId: integer("recruiter_id"),
  stage: text("stage").notNull().default("phone_interview"),
  // phone_interview|online_interview|preboarding|offline_interview|final_decision|offer|internship|hired|rejected
  status: text("status").notNull().default("active"), // active|rejected|hired
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
