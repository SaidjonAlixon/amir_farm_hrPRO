import { pgTable, text, serial, timestamp, integer, doublePrecision, uniqueIndex } from "drizzle-orm/pg-core";

/** Filial oylik hisob-kitob varaqasi (Excel ANTEY uslubi) */
export const settlementSheetsTable = pgTable(
  "settlement_sheets",
  {
    id: serial("id").primaryKey(),
    branchName: text("branch_name").notNull(),
    month: text("month").notNull(),
    planCurrent: doublePrecision("plan_current").notNull().default(0),
    planPrev: doublePrecision("plan_prev").notNull().default(0),
    /** 0.88 = kartaga tushgan = soliqdan keyingi 88% */
    taxNetRate: doublePrecision("tax_net_rate").notNull().default(0.88),
    status: text("status").notNull().default("draft"),
    createdById: integer("created_by_id"),
    approvedById: integer("approved_by_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("settlement_sheets_branch_month_uidx").on(t.branchName, t.month)],
);

export const settlementLinesTable = pgTable("settlement_lines", {
  id: serial("id").primaryKey(),
  sheetId: integer("sheet_id").notNull(),
  employeeId: integer("employee_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  sales: doublePrecision("sales").notNull().default(0),
  position: text("position"),
  planCurrent: doublePrecision("plan_current").notNull().default(0),
  planPrev: doublePrecision("plan_prev").notNull().default(0),
  /** 0.006 = 0.6% savdo ulushi; yangi qatorlarda 0, qo‘lda kiritiladi */
  percent: doublePrecision("percent").notNull().default(0),
  fiksa: doublePrecision("fiksa").notNull().default(0),
  planBonus: doublePrecision("plan_bonus").notNull().default(0),
  extraBonus: doublePrecision("extra_bonus").notNull().default(0),
  avans: doublePrecision("avans").notNull().default(0),
  inventoryFine: doublePrecision("inventory_fine").notNull().default(0),
  timeFine: doublePrecision("time_fine").notNull().default(0),
  expiryHold: doublePrecision("expiry_hold").notNull().default(0),
  fineNote: text("fine_note"),
  /** null = kartaga = yakuniy oylik */
  cardAmount: doublePrecision("card_amount"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
