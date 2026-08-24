import { pgTable, text, serial, timestamp, integer, uniqueIndex, index, doublePrecision } from "drizzle-orm/pg-core";

/**
 * Kunlik davomat — kelish / ketish.
 * workDate: YYYY-MM-DD (Toshkent kuni)
 */
export const attendanceRecordsTable = pgTable(
  "attendance_records",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id").notNull(),
    userId: integer("user_id"),
    workDate: text("work_date").notNull(),
    checkInAt: timestamp("check_in_at", { withTimezone: true }),
    checkOutAt: timestamp("check_out_at", { withTimezone: true }),
    /** present | late | absent | incomplete | leave */
    status: text("status").notNull().default("present"),
    /** manual | punch | face | import */
    source: text("source").notNull().default("manual"),
    checkLatitude: doublePrecision("check_latitude"),
    checkLongitude: doublePrecision("check_longitude"),
    distanceMeters: integer("distance_meters"),
    notes: text("notes"),
    createdById: integer("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("attendance_records_emp_date_uidx").on(t.employeeId, t.workDate),
    index("attendance_records_date_idx").on(t.workDate),
    index("attendance_records_employee_idx").on(t.employeeId),
  ],
);
