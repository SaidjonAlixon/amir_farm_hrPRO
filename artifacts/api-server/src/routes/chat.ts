import { Router, type IRouter } from "express";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  chatsTable,
  chatMembersTable,
  chatMessagesTable,
  usersTable,
} from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import { notifyUser } from "../lib/notify";

const router: IRouter = Router();

type ChatAttachmentKind = "image" | "file" | "audio" | "video" | "video_note";

type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  kind: ChatAttachmentKind;
  url: string;
  size?: number;
  durationSec?: number;
};

const ATTACHMENT_KINDS = new Set<ChatAttachmentKind>([
  "image",
  "file",
  "audio",
  "video",
  "video_note",
]);

function isAllowedAttachmentUrl(url: string) {
  if (!url) return false;
  if (url.startsWith("https://") || url.startsWith("http://")) return true;
  if (url.startsWith("/api/uploads/")) return true;
  return false;
}

function inferAttachmentKind(mimeType: string, rawKind?: string): ChatAttachmentKind {
  if (rawKind && ATTACHMENT_KINDS.has(rawKind as ChatAttachmentKind)) {
    return rawKind as ChatAttachmentKind;
  }
  const m = (mimeType || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return "file";
}

function attachmentPreviewLabel(attachments: ChatAttachment[]): string {
  if (!attachments.length) return "📎 Fayl";
  if (attachments.length > 1) return `📎 ${attachments.length} ta fayl`;
  const a = attachments[0]!;
  if (a.kind === "audio") return "🎤 Ovozli xabar";
  if (a.kind === "video_note") return "🔵 Video xabar";
  if (a.kind === "video") return "🎬 Video";
  if (a.kind === "image") return "🖼 Rasm";
  return `📎 ${a.name || "Fayl"}`;
}

function sanitizeChatAttachments(raw: unknown, max = 5): ChatAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, max)
    .map((a: any, i: number) => {
      const url = String(a?.url || "");
      if (!isAllowedAttachmentUrl(url)) return null;
      const mimeType = String(a?.mimeType || "application/octet-stream");
      return {
        id: String(a?.id || `att-${Date.now()}-${i}`),
        name: String(a?.name || "fayl").slice(0, 200),
        mimeType,
        kind: inferAttachmentKind(mimeType, a?.kind),
        url: url.slice(0, 2000),
        size: typeof a?.size === "number" ? a.size : undefined,
        durationSec:
          typeof a?.durationSec === "number" && a.durationSec > 0
            ? Math.min(Math.round(a.durationSec), 600)
            : undefined,
      };
    })
    .filter(Boolean) as ChatAttachment[];
}

type MemberUser = {
  id: number;
  fullName: string;
  role: string;
  status: string;
};

function serializeUser(u: {
  id: number;
  fullName: string;
  role: string;
  status: string;
}): MemberUser {
  return {
    id: u.id,
    fullName: u.fullName,
    role: u.role,
    status: u.status,
  };
}

async function assertMember(chatId: number, userId: number) {
  const [row] = await db
    .select()
    .from(chatMembersTable)
    .where(
      and(eq(chatMembersTable.chatId, chatId), eq(chatMembersTable.userId, userId)),
    )
    .limit(1);
  return row ?? null;
}

async function getChatMembers(chatId: number): Promise<MemberUser[]> {
  const rows = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      role: usersTable.role,
      status: usersTable.status,
    })
    .from(chatMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, chatMembersTable.userId))
    .where(eq(chatMembersTable.chatId, chatId));
  return rows.map(serializeUser);
}

async function findDirectChatId(userA: number, userB: number): Promise<number | null> {
  const myChats = await db
    .select({ chatId: chatMembersTable.chatId })
    .from(chatMembersTable)
    .where(eq(chatMembersTable.userId, userA));
  if (!myChats.length) return null;

  const chatIds = myChats.map((c) => c.chatId);
  const directChats = await db
    .select({ id: chatsTable.id })
    .from(chatsTable)
    .where(and(inArray(chatsTable.id, chatIds), eq(chatsTable.type, "direct")));
  if (!directChats.length) return null;

  for (const chat of directChats) {
    const members = await db
      .select({ userId: chatMembersTable.userId })
      .from(chatMembersTable)
      .where(eq(chatMembersTable.chatId, chat.id));
    if (
      members.length === 2 &&
      members.some((m) => m.userId === userA) &&
      members.some((m) => m.userId === userB)
    ) {
      return chat.id;
    }
  }
  return null;
}

async function lastMessageForChat(chatId: number) {
  const [msg] = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.chatId, chatId))
    .orderBy(desc(chatMessagesTable.id))
    .limit(1);
  return msg ?? null;
}

async function unreadCount(chatId: number, userId: number, lastReadAt: Date | null) {
  if (!lastReadAt) {
    const [row] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(chatMessagesTable)
      .where(
        and(
          eq(chatMessagesTable.chatId, chatId),
          ne(chatMessagesTable.senderId, userId),
        ),
      );
    return row?.c ?? 0;
  }
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(chatMessagesTable)
    .where(
      and(
        eq(chatMessagesTable.chatId, chatId),
        ne(chatMessagesTable.senderId, userId),
        gt(chatMessagesTable.createdAt, lastReadAt),
      ),
    );
  return row?.c ?? 0;
}

function chatTitle(
  chat: typeof chatsTable.$inferSelect,
  members: MemberUser[],
  meId: number,
) {
  if (chat.type === "group") {
    return chat.title?.trim() || "Guruh";
  }
  const other = members.find((m) => m.id !== meId);
  return other?.fullName || "Chat";
}

/** Yangi chat uchun xodimlar ro‘yxati */
router.get("/chats/users", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const me = req.userId!;
  const q = String(req.query.q || "").trim();

  const conditions = [
    eq(usersTable.status, "active"),
    ne(usersTable.id, me),
  ];
  if (q) {
    conditions.push(
      or(
        ilike(usersTable.fullName, `%${q}%`),
        ilike(usersTable.login, `%${q}%`),
        ilike(usersTable.role, `%${q}%`),
      )!,
    );
  }

  const rows = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      role: usersTable.role,
      status: usersTable.status,
      login: usersTable.login,
    })
    .from(usersTable)
    .where(and(...conditions))
    .orderBy(asc(usersTable.fullName))
    .limit(80);

  res.json({
    users: rows.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      role: u.role,
      status: u.status,
      login: u.login,
    })),
  });
});

/** Mening chatlarim */
router.get("/chats", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const me = req.userId!;

  const memberships = await db
    .select()
    .from(chatMembersTable)
    .where(eq(chatMembersTable.userId, me));

  if (!memberships.length) {
    res.json({ chats: [] });
    return;
  }

  const chatIds = memberships.map((m) => m.chatId);
  const chats = await db
    .select()
    .from(chatsTable)
    .where(inArray(chatsTable.id, chatIds));

  const chatById = new Map(chats.map((c) => [c.id, c]));
  const membershipByChat = new Map(memberships.map((m) => [m.chatId, m]));

  const items = await Promise.all(
    chatIds.map(async (chatId) => {
      const chat = chatById.get(chatId);
      if (!chat) return null;
      const members = await getChatMembers(chatId);
      const last = await lastMessageForChat(chatId);
      const mem = membershipByChat.get(chatId)!;
      const unread = await unreadCount(chatId, me, mem.lastReadAt);
      const other = members.find((m) => m.id !== me) ?? null;

      return {
        id: chat.id,
        type: chat.type,
        title: chatTitle(chat, members, me),
        members,
        memberCount: members.length,
        peer: chat.type === "direct" ? other : null,
        lastMessage: last
          ? {
              id: last.id,
              content: last.content,
              senderId: last.senderId,
              createdAt: last.createdAt.toISOString(),
            }
          : null,
        unreadCount: unread,
        lastMessageAt: (chat.lastMessageAt ?? chat.createdAt).toISOString(),
        createdAt: chat.createdAt.toISOString(),
      };
    }),
  );

  const sorted = items
    .filter(Boolean)
    .sort((a, b) => {
      const ta = new Date(a!.lastMessageAt).getTime();
      const tb = new Date(b!.lastMessageAt).getTime();
      return tb - ta;
    });

  res.json({ chats: sorted });
});

/** Yangi chat: direct yoki group */
router.post("/chats", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const me = req.userId!;
  const type = String(req.body?.type || "direct");
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const rawIds: unknown[] = Array.isArray(req.body?.memberIds)
    ? req.body.memberIds
    : req.body?.userId != null
      ? [req.body.userId]
      : [];

  const memberIds = [
    ...new Set(
      rawIds
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0 && n !== me),
    ),
  ];

  if (!memberIds.length) {
    res.status(400).json({ error: "Kamida bitta xodim tanlang" });
    return;
  }

  const active = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(eq(usersTable.status, "active"), inArray(usersTable.id, memberIds)),
    );
  if (active.length !== memberIds.length) {
    res.status(400).json({ error: "Ba'zi xodimlar topilmadi yoki faol emas" });
    return;
  }

  if (type === "direct") {
    if (memberIds.length !== 1) {
      res.status(400).json({ error: "Shaxsiy chat uchun faqat 1 xodim" });
      return;
    }
    const otherId = memberIds[0]!;
    const existingId = await findDirectChatId(me, otherId);
    if (existingId) {
      const chat = (await db.select().from(chatsTable).where(eq(chatsTable.id, existingId)))[0]!;
      const members = await getChatMembers(existingId);
      res.json({
        chat: {
          id: chat.id,
          type: chat.type,
          title: chatTitle(chat, members, me),
          members,
          createdAt: chat.createdAt.toISOString(),
          existing: true,
        },
      });
      return;
    }

    const [chat] = await db
      .insert(chatsTable)
      .values({
        type: "direct",
        title: null,
        createdById: me,
        lastMessageAt: new Date(),
      })
      .returning();

    await db.insert(chatMembersTable).values([
      { chatId: chat.id, userId: me, lastReadAt: new Date() },
      { chatId: chat.id, userId: otherId, lastReadAt: null },
    ]);

    const members = await getChatMembers(chat.id);
    res.status(201).json({
      chat: {
        id: chat.id,
        type: chat.type,
        title: chatTitle(chat, members, me),
        members,
        createdAt: chat.createdAt.toISOString(),
        existing: false,
      },
    });
    return;
  }

  if (type === "group") {
    if (!title) {
      res.status(400).json({ error: "Guruh nomi kerak" });
      return;
    }
    if (memberIds.length < 1) {
      res.status(400).json({ error: "Guruhga kamida 1 xodim qo‘shing" });
      return;
    }

    const [chat] = await db
      .insert(chatsTable)
      .values({
        type: "group",
        title,
        createdById: me,
        lastMessageAt: new Date(),
      })
      .returning();

    await db.insert(chatMembersTable).values([
      { chatId: chat.id, userId: me, lastReadAt: new Date() },
      ...memberIds.map((userId) => ({
        chatId: chat.id,
        userId,
        lastReadAt: null as Date | null,
      })),
    ]);

    const members = await getChatMembers(chat.id);
    const meUser = (
      await db
        .select({ fullName: usersTable.fullName })
        .from(usersTable)
        .where(eq(usersTable.id, me))
        .limit(1)
    )[0];

    for (const uid of memberIds) {
      await notifyUser({
        userId: uid,
        text: `${meUser?.fullName || "Xodim"} sizni «${title}» guruhiga qo‘shdi`,
        type: "chat_group",
        linkUrl: `/chat?id=${chat.id}`,
      });
    }

    res.status(201).json({
      chat: {
        id: chat.id,
        type: chat.type,
        title: chatTitle(chat, members, me),
        members,
        createdAt: chat.createdAt.toISOString(),
        existing: false,
      },
    });
    return;
  }

  res.status(400).json({ error: "Noto‘g‘ri chat turi" });
});

/** Bitta chat */
router.get("/chats/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const me = req.userId!;
  const chatId = Number(req.params.id);
  if (!Number.isFinite(chatId)) {
    res.status(400).json({ error: "Noto‘g‘ri id" });
    return;
  }
  const mem = await assertMember(chatId, me);
  if (!mem) {
    res.status(404).json({ error: "Chat topilmadi" });
    return;
  }
  const [chat] = await db.select().from(chatsTable).where(eq(chatsTable.id, chatId));
  if (!chat) {
    res.status(404).json({ error: "Chat topilmadi" });
    return;
  }
  const members = await getChatMembers(chatId);
  res.json({
    chat: {
      id: chat.id,
      type: chat.type,
      title: chatTitle(chat, members, me),
      members,
      peer: chat.type === "direct" ? members.find((m) => m.id !== me) ?? null : null,
      createdAt: chat.createdAt.toISOString(),
    },
  });
});

/** Xabarlar */
router.get(
  "/chats/:id/messages",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const me = req.userId!;
    const chatId = Number(req.params.id);
    if (!Number.isFinite(chatId)) {
      res.status(400).json({ error: "Noto‘g‘ri id" });
      return;
    }
    const mem = await assertMember(chatId, me);
    if (!mem) {
      res.status(404).json({ error: "Chat topilmadi" });
      return;
    }

    const afterId = req.query.afterId ? Number(req.query.afterId) : null;
    const beforeId = req.query.beforeId ? Number(req.query.beforeId) : null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const conditions = [eq(chatMessagesTable.chatId, chatId)];
    if (afterId && Number.isFinite(afterId)) {
      conditions.push(gt(chatMessagesTable.id, afterId));
    }
    if (beforeId && Number.isFinite(beforeId)) {
      conditions.push(lt(chatMessagesTable.id, beforeId));
    }

    let rows = await db
      .select({
        id: chatMessagesTable.id,
        chatId: chatMessagesTable.chatId,
        senderId: chatMessagesTable.senderId,
        content: chatMessagesTable.content,
        replyToId: chatMessagesTable.replyToId,
        editedAt: chatMessagesTable.editedAt,
        deletedAt: chatMessagesTable.deletedAt,
        createdAt: chatMessagesTable.createdAt,
        attachments: chatMessagesTable.attachments,
        senderName: usersTable.fullName,
      })
      .from(chatMessagesTable)
      .innerJoin(usersTable, eq(usersTable.id, chatMessagesTable.senderId))
      .where(and(...conditions))
      .orderBy(afterId ? asc(chatMessagesTable.id) : desc(chatMessagesTable.id))
      .limit(limit);

    if (!afterId) {
      rows = rows.reverse();
    }

    const others = await db
      .select({
        userId: chatMembersTable.userId,
        lastReadAt: chatMembersTable.lastReadAt,
      })
      .from(chatMembersTable)
      .where(
        and(eq(chatMembersTable.chatId, chatId), ne(chatMembersTable.userId, me)),
      );

    const replyIds = [
      ...new Set(
        rows
          .map((m) => m.replyToId)
          .filter((id): id is number => typeof id === "number" && id > 0),
      ),
    ];
    const replyMap = new Map<
      number,
      { id: number; content: string; senderName: string; deleted: boolean }
    >();
    if (replyIds.length) {
      const replyRows = await db
        .select({
          id: chatMessagesTable.id,
          content: chatMessagesTable.content,
          deletedAt: chatMessagesTable.deletedAt,
          senderName: usersTable.fullName,
        })
        .from(chatMessagesTable)
        .innerJoin(usersTable, eq(usersTable.id, chatMessagesTable.senderId))
        .where(inArray(chatMessagesTable.id, replyIds));
      for (const r of replyRows) {
        replyMap.set(r.id, {
          id: r.id,
          content: r.deletedAt ? "" : r.content,
          senderName: r.senderName,
          deleted: !!r.deletedAt,
        });
      }
    }

    res.json({
      messages: rows.map((m) => {
        const deleted = !!m.deletedAt;
        const read =
          m.senderId === me &&
          others.length > 0 &&
          others.every(
            (o) => o.lastReadAt && o.lastReadAt.getTime() >= m.createdAt.getTime(),
          );
        const reply = m.replyToId ? replyMap.get(m.replyToId) ?? null : null;
        return {
          id: m.id,
          chatId: m.chatId,
          senderId: m.senderId,
          senderName: m.senderName,
          content: deleted ? "" : m.content,
          deleted,
          editedAt: m.editedAt?.toISOString() ?? null,
          replyToId: m.replyToId ?? null,
          replyTo: reply
            ? {
                id: reply.id,
                content: reply.deleted ? "" : reply.content.slice(0, 120),
                senderName: reply.senderName,
                deleted: reply.deleted,
              }
            : null,
          attachments: deleted
            ? []
            : ((m.attachments as ChatAttachment[]) ?? []),
          read,
          createdAt: m.createdAt.toISOString(),
        };
      }),
    });
  },
);

/** Xabar yuborish */
router.post(
  "/chats/:id/messages",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const me = req.userId!;
    const chatId = Number(req.params.id);
    if (!Number.isFinite(chatId)) {
      res.status(400).json({ error: "Noto‘g‘ri id" });
      return;
    }
    const mem = await assertMember(chatId, me);
    if (!mem) {
      res.status(404).json({ error: "Chat topilmadi" });
      return;
    }

    const content = String(req.body?.content || "").trim();
    const attachments = sanitizeChatAttachments(req.body?.attachments);
    if (!content && attachments.length === 0) {
      res.status(400).json({ error: "Xabar yoki fayl kerak" });
      return;
    }
    if (content.length > 4000) {
      res.status(400).json({ error: "Xabar juda uzun (max 4000)" });
      return;
    }

    let replyToId: number | null = null;
    const rawReply = req.body?.replyToId;
    if (rawReply != null && rawReply !== "") {
      const rid = Number(rawReply);
      if (!Number.isFinite(rid) || rid <= 0) {
        res.status(400).json({ error: "Javob xabar id noto‘g‘ri" });
        return;
      }
      const [parent] = await db
        .select()
        .from(chatMessagesTable)
        .where(
          and(eq(chatMessagesTable.id, rid), eq(chatMessagesTable.chatId, chatId)),
        )
        .limit(1);
      if (!parent || parent.deletedAt) {
        res.status(400).json({ error: "Javob beriladigan xabar topilmadi" });
        return;
      }
      replyToId = rid;
    }

    const now = new Date();
    const placeholder = content || attachmentPreviewLabel(attachments);
    const [msg] = await db
      .insert(chatMessagesTable)
      .values({
        chatId,
        senderId: me,
        content: placeholder,
        attachments,
        replyToId,
        createdAt: now,
      })
      .returning();

    const [sender] = await db
      .select({ fullName: usersTable.fullName })
      .from(usersTable)
      .where(eq(usersTable.id, me))
      .limit(1);

    void Promise.all([
      db
        .update(chatsTable)
        .set({ lastMessageAt: now, updatedAt: now })
        .where(eq(chatsTable.id, chatId)),
      db
        .update(chatMembersTable)
        .set({ lastReadAt: now })
        .where(
          and(eq(chatMembersTable.chatId, chatId), eq(chatMembersTable.userId, me)),
        ),
    ]).catch(() => {});

    let replyTo: {
      id: number;
      content: string;
      senderName: string;
      deleted: boolean;
    } | null = null;
    if (replyToId) {
      const [parent] = await db
        .select({
          id: chatMessagesTable.id,
          content: chatMessagesTable.content,
          deletedAt: chatMessagesTable.deletedAt,
          senderName: usersTable.fullName,
        })
        .from(chatMessagesTable)
        .innerJoin(usersTable, eq(usersTable.id, chatMessagesTable.senderId))
        .where(eq(chatMessagesTable.id, replyToId))
        .limit(1);
      if (parent) {
        replyTo = {
          id: parent.id,
          content: parent.deletedAt ? "" : parent.content.slice(0, 120),
          senderName: parent.senderName,
          deleted: !!parent.deletedAt,
        };
      }
    }

    res.status(201).json({
      message: {
        id: msg.id,
        chatId: msg.chatId,
        senderId: msg.senderId,
        senderName: sender?.fullName || "",
        content: msg.content,
        deleted: false,
        editedAt: null,
        replyToId,
        replyTo,
        attachments: (msg.attachments as ChatAttachment[]) ?? [],
        read: false,
        createdAt: msg.createdAt.toISOString(),
      },
    });

    void (async () => {
      try {
        const members = await getChatMembers(chatId);
        const previewBase = content || attachmentPreviewLabel(attachments) || "Xabar";
        const preview =
          previewBase.length > 80 ? `${previewBase.slice(0, 80)}…` : previewBase;
        await Promise.allSettled(
          members
            .filter((m) => m.id !== me)
            .map((m) =>
              notifyUser({
                userId: m.id,
                text: `${sender?.fullName || "Xodim"}: ${preview}`,
                type: "chat_message",
                linkUrl: `/chat?id=${chatId}`,
              }),
            ),
        );
      } catch {
        /* ignore */
      }
    })();
  },
);

/** Xabarni tahrirlash — faqat o‘zingizniki */
router.patch(
  "/chats/:chatId/messages/:messageId",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const me = req.userId!;
    const chatId = Number(req.params.chatId);
    const messageId = Number(req.params.messageId);
    if (!Number.isFinite(chatId) || !Number.isFinite(messageId)) {
      res.status(400).json({ error: "Noto‘g‘ri id" });
      return;
    }
    const mem = await assertMember(chatId, me);
    if (!mem) {
      res.status(404).json({ error: "Chat topilmadi" });
      return;
    }

    const content = String(req.body?.content || "").trim();
    if (!content) {
      res.status(400).json({ error: "Xabar bo‘sh bo‘lmasin" });
      return;
    }
    if (content.length > 4000) {
      res.status(400).json({ error: "Xabar juda uzun (max 4000)" });
      return;
    }

    const [existing] = await db
      .select()
      .from(chatMessagesTable)
      .where(
        and(
          eq(chatMessagesTable.id, messageId),
          eq(chatMessagesTable.chatId, chatId),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Xabar topilmadi" });
      return;
    }
    if (existing.senderId !== me) {
      res.status(403).json({ error: "Faqat o‘z xabaringizni tahrirlaysiz" });
      return;
    }
    if (existing.deletedAt) {
      res.status(400).json({ error: "O‘chirilgan xabarni tahrirlab bo‘lmaydi" });
      return;
    }

    const now = new Date();
    const [updated] = await db
      .update(chatMessagesTable)
      .set({ content, editedAt: now })
      .where(eq(chatMessagesTable.id, messageId))
      .returning();

    const [sender] = await db
      .select({ fullName: usersTable.fullName })
      .from(usersTable)
      .where(eq(usersTable.id, me))
      .limit(1);

    res.json({
      message: {
        id: updated.id,
        chatId: updated.chatId,
        senderId: updated.senderId,
        senderName: sender?.fullName || "",
        content: updated.content,
        deleted: false,
        editedAt: updated.editedAt?.toISOString() ?? null,
        replyToId: updated.replyToId ?? null,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  },
);

/** Xabarni o‘chirish — faqat o‘zingizniki (soft delete) */
router.delete(
  "/chats/:chatId/messages/:messageId",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const me = req.userId!;
    const chatId = Number(req.params.chatId);
    const messageId = Number(req.params.messageId);
    if (!Number.isFinite(chatId) || !Number.isFinite(messageId)) {
      res.status(400).json({ error: "Noto‘g‘ri id" });
      return;
    }
    const mem = await assertMember(chatId, me);
    if (!mem) {
      res.status(404).json({ error: "Chat topilmadi" });
      return;
    }

    const [existing] = await db
      .select()
      .from(chatMessagesTable)
      .where(
        and(
          eq(chatMessagesTable.id, messageId),
          eq(chatMessagesTable.chatId, chatId),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Xabar topilmadi" });
      return;
    }
    if (existing.senderId !== me) {
      res.status(403).json({ error: "Faqat o‘z xabaringizni o‘chirasiz" });
      return;
    }

    await db
      .update(chatMessagesTable)
      .set({ deletedAt: new Date(), content: "" })
      .where(eq(chatMessagesTable.id, messageId));

    res.json({ ok: true, id: messageId });
  },
);

/** Guruhdan a’zo chiqarish — har qanday a’zo istalgan odamni chiqara oladi */
router.delete(
  "/chats/:id/members/:userId",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const me = req.userId!;
    const chatId = Number(req.params.id);
    const targetId = Number(req.params.userId);
    if (!Number.isFinite(chatId) || !Number.isFinite(targetId)) {
      res.status(400).json({ error: "Noto‘g‘ri id" });
      return;
    }

    const mem = await assertMember(chatId, me);
    if (!mem) {
      res.status(404).json({ error: "Chat topilmadi" });
      return;
    }

    const [chat] = await db.select().from(chatsTable).where(eq(chatsTable.id, chatId));
    if (!chat || chat.type !== "group") {
      res.status(400).json({ error: "Faqat guruhdan chiqarish mumkin" });
      return;
    }

    const targetMem = await assertMember(chatId, targetId);
    if (!targetMem) {
      res.status(404).json({ error: "A’zo topilmadi" });
      return;
    }

    await db
      .delete(chatMembersTable)
      .where(
        and(eq(chatMembersTable.chatId, chatId), eq(chatMembersTable.userId, targetId)),
      );

    const remaining = await getChatMembers(chatId);
    if (remaining.length === 0) {
      await db.delete(chatMessagesTable).where(eq(chatMessagesTable.chatId, chatId));
      await db.delete(chatsTable).where(eq(chatsTable.id, chatId));
      res.json({ ok: true, deletedChat: true, members: [] });
      return;
    }

    if (targetId !== me) {
      const meUser = (
        await db
          .select({ fullName: usersTable.fullName })
          .from(usersTable)
          .where(eq(usersTable.id, me))
          .limit(1)
      )[0];
      void notifyUser({
        userId: targetId,
        text: `${meUser?.fullName || "Xodim"} sizni «${chat.title || "Guruh"}» guruhidan chiqardi`,
        type: "chat_group",
        linkUrl: `/chat`,
      }).catch(() => {});
    }

    res.json({
      ok: true,
      deletedChat: false,
      chat: {
        id: chat.id,
        type: chat.type,
        title: chatTitle(chat, remaining, me),
        members: remaining,
        createdAt: chat.createdAt.toISOString(),
      },
    });
  },
);

/** Guruhni to‘liq o‘chirish — har qanday a’zo */
router.delete("/chats/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const me = req.userId!;
  const chatId = Number(req.params.id);
  if (!Number.isFinite(chatId)) {
    res.status(400).json({ error: "Noto‘g‘ri id" });
    return;
  }

  const mem = await assertMember(chatId, me);
  if (!mem) {
    res.status(404).json({ error: "Chat topilmadi" });
    return;
  }

  const [chat] = await db.select().from(chatsTable).where(eq(chatsTable.id, chatId));
  if (!chat) {
    res.status(404).json({ error: "Chat topilmadi" });
    return;
  }
  if (chat.type !== "group") {
    res.status(400).json({ error: "Faqat guruhni o‘chirish mumkin" });
    return;
  }

  const members = await getChatMembers(chatId);
  await db.delete(chatMessagesTable).where(eq(chatMessagesTable.chatId, chatId));
  await db.delete(chatMembersTable).where(eq(chatMembersTable.chatId, chatId));
  await db.delete(chatsTable).where(eq(chatsTable.id, chatId));

  const meUser = (
    await db
      .select({ fullName: usersTable.fullName })
      .from(usersTable)
      .where(eq(usersTable.id, me))
      .limit(1)
  )[0];
  const title = chat.title?.trim() || "Guruh";
  void Promise.allSettled(
    members
      .filter((m) => m.id !== me)
      .map((m) =>
        notifyUser({
          userId: m.id,
          text: `${meUser?.fullName || "Xodim"} «${title}» guruhini o‘chirdi`,
          type: "chat_group",
          linkUrl: `/chat`,
        }),
      ),
  );

  res.status(204).send();
});

/** Guruhga a’zo qo‘shish — faqat a’zolar, faqat guruh */
router.post(
  "/chats/:id/members",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const me = req.userId!;
    const chatId = Number(req.params.id);
    if (!Number.isFinite(chatId)) {
      res.status(400).json({ error: "Noto‘g‘ri id" });
      return;
    }

    const mem = await assertMember(chatId, me);
    if (!mem) {
      res.status(404).json({ error: "Chat topilmadi" });
      return;
    }

    const [chat] = await db.select().from(chatsTable).where(eq(chatsTable.id, chatId));
    if (!chat || chat.type !== "group") {
      res.status(400).json({ error: "Faqat guruhga a’zo qo‘shiladi" });
      return;
    }

    const rawIds: unknown[] = Array.isArray(req.body?.memberIds) ? req.body.memberIds : [];
    const memberIds = [
      ...new Set(
        rawIds
          .map((x) => Number(x))
          .filter((n) => Number.isFinite(n) && n > 0 && n !== me),
      ),
    ];
    if (!memberIds.length) {
      res.status(400).json({ error: "Kamida bitta xodim tanlang" });
      return;
    }

    const existing = await db
      .select({ userId: chatMembersTable.userId })
      .from(chatMembersTable)
      .where(eq(chatMembersTable.chatId, chatId));
    const existingSet = new Set(existing.map((e) => e.userId));
    const toAdd = memberIds.filter((id) => !existingSet.has(id));
    if (!toAdd.length) {
      const members = await getChatMembers(chatId);
      res.json({
        chat: {
          id: chat.id,
          type: chat.type,
          title: chatTitle(chat, members, me),
          members,
          createdAt: chat.createdAt.toISOString(),
        },
        added: [],
      });
      return;
    }

    const active = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.status, "active"), inArray(usersTable.id, toAdd)));
    if (active.length !== toAdd.length) {
      res.status(400).json({ error: "Ba'zi xodimlar topilmadi yoki faol emas" });
      return;
    }

    await db.insert(chatMembersTable).values(
      toAdd.map((userId) => ({
        chatId,
        userId,
        lastReadAt: null as Date | null,
      })),
    );

    const meUser = (
      await db
        .select({ fullName: usersTable.fullName })
        .from(usersTable)
        .where(eq(usersTable.id, me))
        .limit(1)
    )[0];
    const title = chat.title?.trim() || "Guruh";

    for (const uid of toAdd) {
      await notifyUser({
        userId: uid,
        text: `${meUser?.fullName || "Xodim"} sizni «${title}» guruhiga qo‘shdi`,
        type: "chat_group",
        linkUrl: `/chat?id=${chatId}`,
      });
    }

    const members = await getChatMembers(chatId);
    res.json({
      chat: {
        id: chat.id,
        type: chat.type,
        title: chatTitle(chat, members, me),
        members,
        createdAt: chat.createdAt.toISOString(),
      },
      added: toAdd,
    });
  },
);

/** O‘qildi */
router.post("/chats/:id/read", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const me = req.userId!;
  const chatId = Number(req.params.id);
  if (!Number.isFinite(chatId)) {
    res.status(400).json({ error: "Noto‘g‘ri id" });
    return;
  }
  const mem = await assertMember(chatId, me);
  if (!mem) {
    res.status(404).json({ error: "Chat topilmadi" });
    return;
  }
  await db
    .update(chatMembersTable)
    .set({ lastReadAt: new Date() })
    .where(
      and(eq(chatMembersTable.chatId, chatId), eq(chatMembersTable.userId, me)),
    );
  res.json({ ok: true });
});

export default router;
