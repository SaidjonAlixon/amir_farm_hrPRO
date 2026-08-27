import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const phoneInterviewsTable = pgTable("phone_interviews", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull(),
  recruiterId: integer("recruiter_id"),
  interviewDate: text("interview_date"),
  notes: text("notes"),
  status: text("status").notNull().default("pending"), // suitable|not_suitable|pending
  rejectReason: text("reject_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const onlineInterviewsTable = pgTable("online_interviews", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull(),
  interviewDate: text("interview_date"),
  questionsAnswers: jsonb("questions_answers").notNull().default([]), // QA[]
  experienceLevel: text("experience_level"), // experienced|inexperienced|null
  score: integer("score"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const offlineInterviewsTable = pgTable("offline_interviews", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull(),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time"),
  hrId: integer("hr_id"),
  trainerId: integer("trainer_id"),
  attendanceStatus: text("attendance_status").notNull().default("pending"), // attended|absent|rescheduled|pending
  hrScore: integer("hr_score"),
  hrNotes: text("hr_notes"),
  trainerScore: integer("trainer_score"),
  trainerNotes: text("trainer_notes"),
  result: text("result"), // passed|failed|null
  resultNotes: text("result_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
