import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, phoneInterviewsTable, candidatesTable, usersTable } from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import { ensureCanManageCandidate, isRecruiterScoped, canViewCandidate } from "../lib/candidate-access";

const router: IRouter = Router();

async function getPhoneInterviewFull(id: number) {
  const [row] = await db
    .select({
      id: phoneInterviewsTable.id,
      candidateId: phoneInterviewsTable.candidateId,
      candidateName: candidatesTable.fullName,
      recruiterId: phoneInterviewsTable.recruiterId,
      recruiterName: usersTable.fullName,
      interviewDate: phoneInterviewsTable.interviewDate,
      notes: phoneInterviewsTable.notes,
      status: phoneInterviewsTable.status,
      rejectReason: phoneInterviewsTable.rejectReason,
      createdAt: phoneInterviewsTable.createdAt,
    })
    .from(phoneInterviewsTable)
    .leftJoin(candidatesTable, eq(phoneInterviewsTable.candidateId, candidatesTable.id))
    .leftJoin(usersTable, eq(phoneInterviewsTable.recruiterId, usersTable.id))
    .where(eq(phoneInterviewsTable.id, id));
  return row ?? null;
}

router.get("/phone-interviews", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { candidateId, recruiterId } = req.query as Record<string, string>;
  const conditions = [];
  if (candidateId) conditions.push(eq(phoneInterviewsTable.candidateId, parseInt(candidateId, 10)));
  if (recruiterId) conditions.push(eq(phoneInterviewsTable.recruiterId, parseInt(recruiterId, 10)));
  if (isRecruiterScoped(req.userRole) && req.userId) {
    conditions.push(eq(candidatesTable.recruiterId, req.userId));
  }

  const baseQuery = db
    .select({
      id: phoneInterviewsTable.id,
      candidateId: phoneInterviewsTable.candidateId,
      candidateName: candidatesTable.fullName,
      recruiterId: phoneInterviewsTable.recruiterId,
      recruiterName: usersTable.fullName,
      interviewDate: phoneInterviewsTable.interviewDate,
      notes: phoneInterviewsTable.notes,
      status: phoneInterviewsTable.status,
      rejectReason: phoneInterviewsTable.rejectReason,
      createdAt: phoneInterviewsTable.createdAt,
    })
    .from(phoneInterviewsTable)
    .leftJoin(candidatesTable, eq(phoneInterviewsTable.candidateId, candidatesTable.id))
    .leftJoin(usersTable, eq(phoneInterviewsTable.recruiterId, usersTable.id));

  const rows = conditions.length
    ? await baseQuery.where(and(...conditions))
    : await baseQuery;
  res.json(rows);
});

router.post("/phone-interviews", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { candidateId, recruiterId, interviewDate, notes, status, rejectReason } = req.body ?? {};
  if (!candidateId) { res.status(400).json({ error: "candidateId kerak" }); return; }

  const allowed = await ensureCanManageCandidate(req, res, parseInt(candidateId, 10));
  if (!allowed) return;

  const [created] = await db
    .insert(phoneInterviewsTable)
    .values({
      candidateId: parseInt(candidateId, 10),
      recruiterId: recruiterId ? parseInt(recruiterId, 10) : null,
      interviewDate: interviewDate ?? null,
      notes: notes ?? null,
      status: status ?? "pending",
      rejectReason: rejectReason ?? null,
    })
    .returning();

  if (status === "suitable") {
    await db.update(candidatesTable)
      .set({ stage: "online_interview" })
      .where(eq(candidatesTable.id, parseInt(candidateId, 10)));
  } else if (status === "not_suitable") {
    await db.update(candidatesTable)
      .set({ status: "rejected" })
      .where(eq(candidatesTable.id, parseInt(candidateId, 10)));
  }

  const full = await getPhoneInterviewFull(created.id);
  res.status(201).json(full);
});

router.get("/phone-interviews/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const row = await getPhoneInterviewFull(id);
  if (!row) { res.status(404).json({ error: "Topilmadi" }); return; }
  const [cand] = await db
    .select({ recruiterId: candidatesTable.recruiterId })
    .from(candidatesTable)
    .where(eq(candidatesTable.id, row.candidateId));
  if (!canViewCandidate(req.userId, req.userRole, cand?.recruiterId ?? null)) {
    res.status(403).json({ error: "Bu nomzod sizga biriktirilmagan" });
    return;
  }
  res.json(row);
});

router.patch("/phone-interviews/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [row] = await db.select().from(phoneInterviewsTable).where(eq(phoneInterviewsTable.id, id));
  if (!row) { res.status(404).json({ error: "Topilmadi" }); return; }

  const managed = await ensureCanManageCandidate(req, res, row.candidateId);
  if (!managed) return;

  const allowed = ["interviewDate", "notes", "status", "rejectReason"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  await db.update(phoneInterviewsTable).set(updates).where(eq(phoneInterviewsTable.id, id));

  if (updates.status === "suitable") {
    await db.update(candidatesTable)
      .set({ stage: "online_interview" })
      .where(eq(candidatesTable.id, row.candidateId));
  } else if (updates.status === "not_suitable") {
    await db.update(candidatesTable)
      .set({ status: "rejected" })
      .where(eq(candidatesTable.id, row.candidateId));
  }

  const full = await getPhoneInterviewFull(id);
  res.json(full);
});

export default router;
