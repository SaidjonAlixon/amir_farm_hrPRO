import { pgTable, text, serial, timestamp, integer, jsonb, doublePrecision } from "drizzle-orm/pg-core";

export const preboardingsTable = pgTable("preboarding", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull(),
  checklist: jsonb("checklist").notNull().default([]), // ChecklistItem[]
  notes: text("notes"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const offersTable = pgTable("offers", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull(),
  position: text("position").notNull(),
  salary: text("salary").notNull(),
  workConditions: text("work_conditions"),
  documentsChecklist: jsonb("documents_checklist").notNull().default([]), // ChecklistItem[]
  status: text("status").notNull().default("pending"), // pending|accepted|rejected
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const internshipsTable = pgTable("internships", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  trainerId: integer("trainer_id"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  tasks: jsonb("tasks").notNull().default([]), // ChecklistItem[]
  evaluations: jsonb("evaluations").notNull().default([]), // InternshipEvaluation[]
  status: text("status").notNull().default("ongoing"), // ongoing|completed|failed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  position: text("position").notNull(),
  departmentId: integer("department_id").notNull(),
  mentorId: integer("mentor_id"),
  hiredAt: text("hired_at").notNull(),
  candidateId: integer("candidate_id"),
  /** coordinator | manager | pharmacist */
  orgRole: text("org_role"),
  /** Yuqori lavozimdagi xodim id (employees.id) */
  reportsToId: integer("reports_to_id"),
  /** Apteka / filial nomi */
  location: text("location"),
  /** Filial GPS (audit geofence uchun) */
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  /** one | two | custom */
  shiftType: text("shift_type").default("one"),
  /** Davomat GPS olinadigan filial mudiri (employees.id) */
  assignedBranchId: integer("assigned_branch_id"),
  /** Mudir belgilagan maxsus holat matni */
  shiftLabel: text("shift_label"),
  /** working | new | dismissed | need_hire | searching | no_manager */
  employmentStatus: text("employment_status").notNull().default("working"),
  /** Login foydalanuvchisi (users.id) — mudir/koordinator bog‘lash */
  userId: integer("user_id"),
  /** Kim qo‘shgan (users.id) — pharmacy-network / employees create */
  createdById: integer("created_by_id"),
  photoUrl: text("photo_url"),
  /** Fiks maosh (so‘m, butun son) */
  fixedSalary: integer("fixed_salary").notNull().default(0),
  /** 100% KPI dagi bonus ulushi (%) */
  bonusPercent: doublePrecision("bonus_percent").notNull().default(30),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
