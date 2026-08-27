import { pgTable, text, serial, timestamp, integer, jsonb, doublePrecision } from "drizzle-orm/pg-core";

/** Bitta talab javobi — boshida tanlanmagan */
export type AuditAnswer = "yes" | "no" | null;

export type AuditChecklistItem = {
  id: string;
  label: string;
  answer: AuditAnswer;
  /** Yo'q tanlanganda ixtiyoriy izoh */
  note?: string | null;
};

export type AuditCategory = {
  id: string;
  title: string;
  items: AuditChecklistItem[];
};

/**
 * Filial audit cheklistlari — koordinator tashrifi.
 * Har bir filialga talablar bo'yicha Ha / Yo'q belgilanadi, foiz hisoblanadi.
 */
export const branchAuditsTable = pgTable("branch_audits", {
  id: serial("id").primaryKey(),
  managerEmployeeId: integer("manager_employee_id").notNull(),
  branchLocation: text("branch_location"),
  managerName: text("manager_name"),
  /** YYYY-MM-DD */
  visitDate: text("visit_date").notNull(),
  /** 1-tashrif | 2-tashrif | nazorat | qayta-tekshiruv */
  visitName: text("visit_name").notNull().default("1-tashrif"),
  monthLabel: text("month_label"),
  coordinatorId: integer("coordinator_id").notNull(),
  coordinatorName: text("coordinator_name"),
  generalNote: text("general_note"),
  categories: jsonb("categories").$type<AuditCategory[]>().notNull(),
  scorePercent: integer("score_percent").notNull().default(0),
  answeredCount: integer("answered_count").notNull().default(0),
  yesCount: integer("yes_count").notNull().default(0),
  noCount: integer("no_count").notNull().default(0),
  totalCount: integer("total_count").notNull().default(0),
  /** Saqlashdagi GPS tekshiruvi */
  checkLatitude: doublePrecision("check_latitude"),
  checkLongitude: doublePrecision("check_longitude"),
  distanceMeters: integer("distance_meters"),
  status: text("status").notNull().default("saved"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
