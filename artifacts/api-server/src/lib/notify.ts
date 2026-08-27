import { and, eq, inArray } from "drizzle-orm";
import { db, notificationsTable, usersTable } from "@workspace/db";

import { HR_ROLES } from "../lib/roles";

/** Faol HR (va ixtiyoriy admin) ga bildirishnoma */
export async function notifyActiveHrs(opts: {
  text: string;
  type: string;
  linkUrl: string;
  includeAdmin?: boolean;
}): Promise<void> {
  const roles = opts.includeAdmin === false ? [...HR_ROLES] : [...HR_ROLES, "admin"];
  const hrs = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.status, "active"), inArray(usersTable.role, roles)));

  for (const r of hrs) {
    await db.insert(notificationsTable).values({
      userId: r.id,
      text: opts.text,
      type: opts.type,
      linkUrl: opts.linkUrl,
    });
  }
}

export async function notifyByRoles(opts: {
  roles: string[];
  text: string;
  type: string;
  linkUrl: string;
}): Promise<void> {
  if (!opts.roles.length) return;
  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.status, "active"), inArray(usersTable.role, opts.roles)));

  for (const r of users) {
    await db.insert(notificationsTable).values({
      userId: r.id,
      text: opts.text,
      type: opts.type,
      linkUrl: opts.linkUrl,
    });
  }
}

export async function notifyUser(opts: {
  userId: number | null | undefined;
  text: string;
  type: string;
  linkUrl: string;
}): Promise<void> {
  if (!opts.userId) return;
  await db.insert(notificationsTable).values({
    userId: opts.userId,
    text: opts.text,
    type: opts.type,
    linkUrl: opts.linkUrl,
  });
}

/** Barcha faol foydalanuvchilarga (xodimlarga) bildirishnoma */
export async function notifyAllActiveUsers(opts: {
  text: string;
  type: string;
  linkUrl: string;
}): Promise<number> {
  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.status, "active"));

  for (const u of users) {
    await db.insert(notificationsTable).values({
      userId: u.id,
      text: opts.text,
      type: opts.type,
      linkUrl: opts.linkUrl,
    });
  }
  return users.length;
}
