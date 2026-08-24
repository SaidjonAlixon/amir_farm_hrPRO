import { eq } from "drizzle-orm";
import { db, branchNeedsTable } from "@workspace/db";
import { notifyUser } from "./notify";

/** Vazifa holati o‘zgaganda bog‘langan ehtiyojni yangilash */
export async function syncBranchNeedFromTask(opts: {
  taskId: number;
  event: "accepted" | "completed" | "verified" | "rework";
  verifiedById?: number | null;
}): Promise<void> {
  const [need] = await db
    .select()
    .from(branchNeedsTable)
    .where(eq(branchNeedsTable.taskId, opts.taskId))
    .limit(1);
  if (!need) return;

  const now = new Date();

  if (opts.event === "accepted") {
    await db
      .update(branchNeedsTable)
      .set({ status: "in_progress", acceptedAt: now })
      .where(eq(branchNeedsTable.id, need.id));
    return;
  }

  if (opts.event === "completed") {
    await db
      .update(branchNeedsTable)
      .set({ status: "done", completedAt: now })
      .where(eq(branchNeedsTable.id, need.id));

    const notifyIds = new Set<number>();
    if (need.createdById) notifyIds.add(need.createdById);
    if (need.confirmedById) notifyIds.add(need.confirmedById);
    for (const uid of notifyIds) {
      await notifyUser({
        userId: uid,
        text: `Ehtiyoj bajarildi — tasdiqlang: «${need.needType}»`,
        type: "stage_change",
        linkUrl: "/ehtiyoj",
      });
    }
    return;
  }

  if (opts.event === "verified") {
    await db
      .update(branchNeedsTable)
      .set({
        status: "verified",
        verifiedAt: now,
        verifiedById: opts.verifiedById ?? need.verifiedById ?? null,
      })
      .where(eq(branchNeedsTable.id, need.id));
    return;
  }

  if (opts.event === "rework") {
    await db
      .update(branchNeedsTable)
      .set({
        status: "in_progress",
        completedAt: null,
      })
      .where(eq(branchNeedsTable.id, need.id));
  }
}
