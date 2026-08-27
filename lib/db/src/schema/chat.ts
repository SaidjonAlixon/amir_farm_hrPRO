import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/** Chat: direct (1:1) yoki group */
export const chatsTable = pgTable(
  "chats",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull().default("direct"), // direct | group
    title: text("title"),
    createdById: integer("created_by_id").notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("chats_last_message_at_idx").on(t.lastMessageAt)],
);

export const chatMembersTable = pgTable(
  "chat_members",
  {
    id: serial("id").primaryKey(),
    chatId: integer("chat_id").notNull(),
    userId: integer("user_id").notNull(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("chat_members_chat_user_uidx").on(t.chatId, t.userId),
    index("chat_members_user_idx").on(t.userId),
  ],
);

export const chatMessagesTable = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    chatId: integer("chat_id").notNull(),
    senderId: integer("sender_id").notNull(),
    content: text("content").notNull(),
    /** [{ id, name, mimeType, kind: image|file|audio|video|video_note, url, size, durationSec? }] */
    attachments: jsonb("attachments").notNull().default([]),
    /** Javob berilayotgan xabar id */
    replyToId: integer("reply_to_id"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("chat_messages_chat_id_idx").on(t.chatId),
    index("chat_messages_chat_created_idx").on(t.chatId, t.createdAt),
  ],
);
