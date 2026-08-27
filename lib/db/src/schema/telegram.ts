import { pgTable, text, serial, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";

/**
 * Telegram Mini App bir martalik kirish tokenlari.
 * Bot login qabul qilganda yaratiladi; Mini App ochilganda cookie sessiyaga almashtiriladi.
 */
export const telegramAuthTokensTable = pgTable(
  "telegram_auth_tokens",
  {
    id: serial("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: integer("user_id").notNull(),
    telegramUserId: text("telegram_user_id").notNull(),
    chatId: text("chat_id").notNull(),
    used: boolean("used").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("telegram_auth_tokens_user_idx").on(t.userId),
    index("telegram_auth_tokens_tg_idx").on(t.telegramUserId),
  ],
);
