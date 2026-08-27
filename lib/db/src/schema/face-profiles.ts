import { pgTable, text, serial, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";

/** Kameradan olingan yuz vektori (Face ID) */
export const faceProfilesTable = pgTable(
  "face_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    /** JSON number[] — 128 o‘lchamli descriptor */
    descriptor: text("descriptor").notNull(),
    /** Ro‘yxatdan o‘tishdagi yuz surati (data URL yoki blob URL) */
    photoUrl: text("photo_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("face_profiles_user_uidx").on(t.userId)],
);
