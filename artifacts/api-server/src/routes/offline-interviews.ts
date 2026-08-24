import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, offlineInterviewsTable, candidatesTable, usersTable } from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import { ensureCanManageCandidate, isRecruiterScoped } from "../lib/candidate-access";
import { notifyActiveHrs, notifyUser } from "../lib/notify";
import {
  assignFinalDecisionToHrs,
  cancelOpenPipelineTasks,
  completePipelineStageTasks,
} from "../lib/pipeline-tasks";

const router: IRouter = Router();

async function getOfflineInterviewFull(id: number) {
  const [row] = await db.select().from(offlineInterviewsTable).where(eq(offlineInterviewsTable.id, id));
  if (!row) return null;

  const [candidate] = await db
    .select({ fullName: candidatesTable.fullName, recruiterId: candidatesTable.recruiterId })
    .from(candidatesTable)
    .where(eq(candidatesTable.id, row.candidateId));
  const [hrUser] = row.hrId
    ? await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, row.hrId))
    : [null];
  const [trainerUser] = row.trainerId
    ? await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, row.trainerId))
    : [null];

  return {
    ...row,
    candidateName: candidate?.fullName ?? null,
    recruiterId: candidate?.recruiterId ?? null,
    hrName: hrUser?.fullName ?? null,
    trainerName: trainerUser?.fullName ?? null,
  };
}

router.get("/offline-interviews", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { candidateId, hrId, trainerId, dateFrom, dateTo } = req.query as Record<string, string>;

  const rows = await db.select().from(offlineInterviewsTable);
  let filtered = rows.filter((r) => {
    if (candidateId && r.candidateId !== parseInt(candidateId, 10)) return false;
    if (hrId && r.hrId !== parseInt(hrId, 10)) return false;
    if (trainerId && r.trainerId !== parseInt(trainerId, 10)) return false;
    if (dateFrom && r.scheduledDate < dateFrom) return false;
    if (dateTo && r.scheduledDate > dateTo) return false;
    return true;
  });

  if (isRecruiterScoped(req.userRole) && req.userId) {
    const myCandidates = await db
      .select({ id: candidatesTable.id })
      .from(candidatesTable)
      .where(eq(candidatesTable.recruiterId, req.userId));
    const myIds = new Set(myCandidates.map((c) => c.id));
    filtered = filtered.filter((r) => myIds.has(r.candidateId));
  }

  const enriched = await Promise.all(filtered.map(async (r) => {
    const [candidate] = await db.select({ fullName: candidatesTable.fullName }).from(candidatesTable).where(eq(candidatesTable.id, r.candidateId));
    const [hrUser] = r.hrId ? await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, r.hrId)) : [null];
    const [trainerUser] = r.trainerId ? await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, r.trainerId)) : [null];
    return {
      ...r,
      candidateName: candidate?.fullName ?? null,
      hrName: hrUser?.fullName ?? null,
      trainerName: trainerUser?.fullName ?? null,
    };
  }));

  enriched.sort((a, b) => {
    const aDone = a.result ? 1 : 0;
    const bDone = b.result ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return (b.scheduledDate || "").localeCompare(a.scheduledDate || "");
  });

  res.json(enriched);
});

router.post("/offline-interviews", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { candidateId, scheduledDate, scheduledTime, hrId, trainerId } = req.body ?? {};
  if (!candidateId || !scheduledDate) {
    res.status(400).json({ error: "Majburiy maydonlar to'ldirilmagan" });
    return;
  }

  const candId = parseInt(candidateId, 10);
  const allowed = await ensureCanManageCandidate(req, res, candId);
  if (!allowed) return;

  // Mavjud stub bo‘lsa — yangi yaratmasdan yangilaymiz
  const [existing] = await db
    .select()
    .from(offlineInterviewsTable)
    .where(eq(offlineInterviewsTable.candidateId, candId));

  let interviewId: number;
  if (existing && !existing.result) {
    await db
      .update(offlineInterviewsTable)
      .set({
        scheduledDate,
        scheduledTime: scheduledTime ?? null,
        hrId: hrId ? parseInt(hrId, 10) : existing.hrId,
        trainerId: trainerId ? parseInt(trainerId, 10) : existing.trainerId,
      })
      .where(eq(offlineInterviewsTable.id, existing.id));
    interviewId = existing.id;
  } else if (existing?.result) {
    res.status(400).json({ error: "Bu nomzod uchun offline suhbat allaqachon yakunlangan" });
    return;
  } else {
    const [created] = await db
      .insert(offlineInterviewsTable)
      .values({
        candidateId: candId,
        scheduledDate,
        scheduledTime: scheduledTime ?? null,
        hrId: hrId ? parseInt(hrId, 10) : null,
        trainerId: trainerId ? parseInt(trainerId, 10) : null,
        attendanceStatus: "pending",
      })
      .returning();
    interviewId = created.id;
  }

  const [candidate] = await db
    .select({ fullName: candidatesTable.fullName, recruiterId: candidatesTable.recruiterId })
    .from(candidatesTable)
    .where(eq(candidatesTable.id, candId));

  const linkUrl = `/candidates/${candId}/offline-interview`;
  const text = `Offline suhbat belgilandi: "${candidate?.fullName ?? "Nomzod"}" — ${scheduledDate}${scheduledTime ? ` ${scheduledTime}` : ""}`;

  await notifyActiveHrs({ text, type: "interview_reminder", linkUrl });
  await notifyUser({
    userId: candidate?.recruiterId,
    text,
    type: "interview_reminder",
    linkUrl,
  });
  if (trainerId) {
    await notifyUser({
      userId: parseInt(trainerId, 10),
      text,
      type: "interview_reminder",
      linkUrl,
    });
  }

  const full = await getOfflineInterviewFull(interviewId);
  res.status(201).json(full);
});

router.get("/offline-interviews/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const full = await getOfflineInterviewFull(id);
  if (!full) { res.status(404).json({ error: "Topilmadi" }); return; }
  res.json(full);
});

router.patch("/offline-interviews/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const allowedKeys = ["scheduledDate", "scheduledTime", "hrId", "trainerId", "attendanceStatus", "hrScore", "hrNotes", "trainerScore", "trainerNotes", "result", "resultNotes"];
  const updates: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const [existing] = await db.select().from(offlineInterviewsTable).where(eq(offlineInterviewsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Topilmadi" }); return; }

  const allowed = await ensureCanManageCandidate(req, res, existing.candidateId);
  if (!allowed) return;

  await db.update(offlineInterviewsTable).set(updates).where(eq(offlineInterviewsTable.id, id));

  const [candidate] = await db
    .select({ fullName: candidatesTable.fullName, recruiterId: candidatesTable.recruiterId })
    .from(candidatesTable)
    .where(eq(candidatesTable.id, existing.candidateId));

  if (updates.result === "passed") {
    await db.update(candidatesTable).set({ stage: "final_decision" }).where(eq(candidatesTable.id, existing.candidateId));
    const linkUrl = `/candidates/${existing.candidateId}/final-decision`;
    const text = `Offline suhbatdan o'tdi: "${candidate?.fullName ?? "Nomzod"}". Yakuniy qarorni davom ettiring.`;
    await notifyActiveHrs({ text, type: "stage_change", linkUrl });
    await notifyUser({
      userId: candidate?.recruiterId,
      text,
      type: "stage_change",
      linkUrl,
    });
    await assignFinalDecisionToHrs({
      candidateId: existing.candidateId,
      candidateName: candidate?.fullName ?? "Nomzod",
      createdById: req.userId!,
    });
  } else if (updates.result === "failed") {
    await db.update(candidatesTable).set({ status: "rejected", stage: "final_decision" }).where(eq(candidatesTable.id, existing.candidateId));
    const linkUrl = `/candidates/${existing.candidateId}`;
    const text = `Offline suhbat: "${candidate?.fullName ?? "Nomzod"}" rad etildi.`;
    await notifyActiveHrs({ text, type: "stage_change", linkUrl });
    await notifyUser({
      userId: candidate?.recruiterId,
      text,
      type: "stage_change",
      linkUrl,
    });
    await completePipelineStageTasks({
      candidateId: existing.candidateId,
      stage: "offline_interview",
      status: "cancelled",
    });
    await cancelOpenPipelineTasks(existing.candidateId);
  }

  const full = await getOfflineInterviewFull(id);
  res.json(full);
});

export default router;
