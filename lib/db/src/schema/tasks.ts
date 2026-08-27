import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

/** Vazifa biriktirilgan fayl / rasm */
export type TaskAttachment = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "file";
  /** Blob URL yoki /api/uploads/... yo'li (eski: data URL) */
  url: string;
  size?: number;
};

/**
 * Vazifalar — Trello-uslubidagi ish topshiriqlari.
 * status: todo | in_progress | done | verified | cancelled
 * priority: low | normal | high | urgent
 * assigneeKind: user | employee
 * extensionStatus: null | pending | approved | rejected
 */
export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("normal"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  /** user = tizim foydalanuvchisi, employee = xodimlar jadvali */
  assigneeKind: text("assignee_kind").notNull().default("user"),
  assigneeId: integer("assignee_id").notNull(),
  createdById: integer("created_by_id").notNull(),
  /** Pipeline vazifasi — qaysi nomzod */
  candidateId: integer("candidate_id"),
  /** Pipeline vazifasi — qaysi bosqich (offline_interview, offer, …) */
  pipelineStage: text("pipeline_stage"),
  /** Beruvchi qo'shgan fayllar */
  attachments: jsonb("attachments").notNull().default([]),
  /** Ijrochi bajarish natijasi */
  completionNote: text("completion_note"),
  completionAttachments: jsonb("completion_attachments").notNull().default([]),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  /** Ijrochi qabul qilgan vaqt */
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  /** Muddat uzaytirish so'rovi */
  extensionRequestedDueAt: timestamp("extension_requested_due_at", { withTimezone: true }),
  extensionNote: text("extension_note"),
  extensionStatus: text("extension_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
