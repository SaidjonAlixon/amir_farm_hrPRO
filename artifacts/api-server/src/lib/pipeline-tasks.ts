import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, tasksTable, usersTable, candidatesTable } from "@workspace/db";
import { notifyUser } from "./notify";

/** Offline / yakuniy / ishga qabul — shu HR rollariga topshiriq */
export const PIPELINE_HR_ROLES = [
  "hr",
  "hr_menejer",
  "hr_direktor",
  "hr_auditor",
] as const;

const STAGE_TITLES: Record<string, string> = {
  offline_interview: "4-qadam · Offline suhbat",
  final_decision: "5-qadam · Yakuniy qaror",
  offer: "6-qadam · Job Offer",
  documents: "7-qadam · Hujjatlar",
  internship: "8-qadam · Stajirovka",
  hired: "9-qadam · Ishga qabul",
};

const STAGE_LINKS: Record<string, (id: number) => string> = {
  offline_interview: (id) => `/candidates/${id}/offline-interview`,
  final_decision: (id) => `/candidates/${id}/final-decision`,
  offer: (id) => `/candidates/${id}/offer`,
  documents: (id) => `/candidates/${id}/documents`,
  internship: (id) => `/candidates/${id}/internship`,
  hired: (id) => `/candidates/${id}`,
};

function parseDueAt(date?: string | null, time?: string | null): Date | null {
  if (!date) return null;
  const t = (time || "10:00").slice(0, 5);
  const d = new Date(`${date}T${t}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Shu nomzod + bosqichdagi ochiq pipeline vazifalarini yopish */
export async function completePipelineStageTasks(opts: {
  candidateId: number;
  stage: string;
  status?: "done" | "cancelled" | "verified";
}): Promise<void> {
  const status = opts.status ?? "done";
  const open = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.candidateId, opts.candidateId),
        eq(tasksTable.pipelineStage, opts.stage),
        inArray(tasksTable.status, ["todo", "in_progress"]),
      ),
    );
  if (!open.length) return;
  const now = new Date();
  await db
    .update(tasksTable)
    .set({
      status,
      completedAt: status === "cancelled" ? null : now,
      updatedAt: now,
    })
    .where(
      inArray(
        tasksTable.id,
        open.map((r) => r.id),
      ),
    );
}

async function activeUsersByRoles(roles: string[]): Promise<{ id: number }[]> {
  if (!roles.length) return [];
  return db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.status, "active"), inArray(usersTable.role, roles)));
}

/**
 * Pipeline topshirig‘i yaratish.
 * - roles berilsa: har bir faol foydalanuvchiga alohida vazifa
 * - userIds berilsa: faqat shu id lar
 * Bir xil candidate+stage+assignee uchun dublikat ochiq vazifa yaratilmaydi.
 */
export async function createPipelineTasks(opts: {
  candidateId: number;
  candidateName: string;
  stage: string;
  createdById: number;
  roles?: string[];
  userIds?: number[];
  dueAt?: Date | null;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: string;
  extraNote?: string;
}): Promise<number[]> {
  const link = STAGE_LINKS[opts.stage]?.(opts.candidateId) ?? `/candidates/${opts.candidateId}`;
  const stageTitle = STAGE_TITLES[opts.stage] || opts.stage;
  const title = `${stageTitle}: ${opts.candidateName}`;
  const dueAt =
    opts.dueAt ?? parseDueAt(opts.dueDate, opts.dueTime) ?? null;

  const descriptionParts = [
    `Nomzod: ${opts.candidateName}`,
    `Bosqich: ${stageTitle}`,
    opts.dueDate
      ? `Muddat: ${opts.dueDate}${opts.dueTime ? ` ${opts.dueTime}` : ""}`
      : null,
    opts.extraNote || null,
    `Havola: ${link}`,
  ].filter(Boolean);

  let assigneeIds: number[] = [];
  if (opts.userIds?.length) {
    assigneeIds = [...new Set(opts.userIds.filter((id) => Number.isFinite(id) && id > 0))];
  } else if (opts.roles?.length) {
    const users = await activeUsersByRoles(opts.roles);
    assigneeIds = users.map((u) => u.id);
  }

  if (!assigneeIds.length) return [];

  const createdIds: number[] = [];
  for (const assigneeId of assigneeIds) {
    const [existing] = await db
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.candidateId, opts.candidateId),
          eq(tasksTable.pipelineStage, opts.stage),
          eq(tasksTable.assigneeKind, "user"),
          eq(tasksTable.assigneeId, assigneeId),
          inArray(tasksTable.status, ["todo", "in_progress"]),
        ),
      )
      .limit(1);
    if (existing) {
      if (dueAt) {
        await db
          .update(tasksTable)
          .set({ dueAt, updatedAt: new Date(), title, description: descriptionParts.join("\n") })
          .where(eq(tasksTable.id, existing.id));
      }
      createdIds.push(existing.id);
      continue;
    }

    const [row] = await db
      .insert(tasksTable)
      .values({
        title,
        description: descriptionParts.join("\n"),
        status: "todo",
        priority: opts.priority || "high",
        dueAt,
        assigneeKind: "user",
        assigneeId,
        createdById: opts.createdById,
        candidateId: opts.candidateId,
        pipelineStage: opts.stage,
        attachments: [],
        completionAttachments: [],
      })
      .returning({ id: tasksTable.id });

    if (row) {
      createdIds.push(row.id);
      await notifyUser({
        userId: assigneeId,
        text: `Yangi topshiriq: «${title}»`,
        type: "task_assigned",
        linkUrl: "/vazifalar",
      });
    }
  }
  return createdIds;
}

export async function assignOfflineInterviewToHrs(opts: {
  candidateId: number;
  candidateName: string;
  createdById: number;
  scheduledDate: string;
  scheduledTime?: string | null;
}): Promise<void> {
  await createPipelineTasks({
    candidateId: opts.candidateId,
    candidateName: opts.candidateName,
    stage: "offline_interview",
    createdById: opts.createdById,
    roles: [...PIPELINE_HR_ROLES],
    dueDate: opts.scheduledDate,
    dueTime: opts.scheduledTime,
    priority: "urgent",
    extraNote: "Rekruter offline suhbat vaqtini belgiladi. Natijani kiriting.",
  });
}

export async function assignFinalDecisionToHrs(opts: {
  candidateId: number;
  candidateName: string;
  createdById: number;
}): Promise<void> {
  await completePipelineStageTasks({
    candidateId: opts.candidateId,
    stage: "offline_interview",
  });
  await createPipelineTasks({
    candidateId: opts.candidateId,
    candidateName: opts.candidateName,
    stage: "final_decision",
    createdById: opts.createdById,
    roles: [...PIPELINE_HR_ROLES],
    priority: "high",
    extraNote: "Offline suhbatdan o‘tdi — yakuniy qarorni qabul qiling.",
  });
}

export async function assignOfferToRecruiter(opts: {
  candidateId: number;
  candidateName: string;
  recruiterId: number | null | undefined;
  createdById: number;
}): Promise<void> {
  await completePipelineStageTasks({
    candidateId: opts.candidateId,
    stage: "final_decision",
  });
  if (!opts.recruiterId) return;
  await createPipelineTasks({
    candidateId: opts.candidateId,
    candidateName: opts.candidateName,
    stage: "offer",
    createdById: opts.createdById,
    userIds: [opts.recruiterId],
    priority: "high",
    extraNote: "Yakuniy qaror ijobiy — Job Offer yuboring.",
  });
}

export async function assignDocumentsToRecruiter(opts: {
  candidateId: number;
  candidateName: string;
  recruiterId: number | null | undefined;
  createdById: number;
}): Promise<void> {
  await completePipelineStageTasks({
    candidateId: opts.candidateId,
    stage: "offer",
  });
  if (!opts.recruiterId) return;
  await createPipelineTasks({
    candidateId: opts.candidateId,
    candidateName: opts.candidateName,
    stage: "documents",
    createdById: opts.createdById,
    userIds: [opts.recruiterId],
    priority: "high",
    extraNote: "Offer qabul qilindi — hujjatlarni to‘plang.",
  });
}

export async function assignInternshipToTrainers(opts: {
  candidateId: number;
  candidateName: string;
  createdById: number;
  trainerId?: number | null;
}): Promise<void> {
  await completePipelineStageTasks({
    candidateId: opts.candidateId,
    stage: "documents",
  });
  if (opts.trainerId) {
    await createPipelineTasks({
      candidateId: opts.candidateId,
      candidateName: opts.candidateName,
      stage: "internship",
      createdById: opts.createdById,
      userIds: [opts.trainerId],
      priority: "high",
      extraNote: "Stajirovkani boshqaring va baholang.",
    });
    return;
  }
  await createPipelineTasks({
    candidateId: opts.candidateId,
    candidateName: opts.candidateName,
    stage: "internship",
    createdById: opts.createdById,
    roles: ["trainer"],
    priority: "high",
    extraNote: "Stajirovkani boshqaring va baholang.",
  });
}

export async function assignHireToHrs(opts: {
  candidateId: number;
  candidateName: string;
  createdById: number;
}): Promise<void> {
  await completePipelineStageTasks({
    candidateId: opts.candidateId,
    stage: "internship",
  });
  await createPipelineTasks({
    candidateId: opts.candidateId,
    candidateName: opts.candidateName,
    stage: "hired",
    createdById: opts.createdById,
    roles: [...PIPELINE_HR_ROLES],
    priority: "urgent",
    extraNote: "Stajirovka yakunlandi — ishga qabulni rasmiylashtiring.",
  });
}

export async function getCandidateBrief(candidateId: number) {
  const [row] = await db
    .select({
      id: candidatesTable.id,
      fullName: candidatesTable.fullName,
      recruiterId: candidatesTable.recruiterId,
    })
    .from(candidatesTable)
    .where(eq(candidatesTable.id, candidateId))
    .limit(1);
  return row ?? null;
}

/** Rejected bo‘lsa ochiq pipeline vazifalarini bekor qilish */
export async function cancelOpenPipelineTasks(candidateId: number): Promise<void> {
  await db
    .update(tasksTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(tasksTable.candidateId, candidateId),
        isNotNull(tasksTable.pipelineStage),
        inArray(tasksTable.status, ["todo", "in_progress"]),
      ),
    );
}
