import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, onlineInterviewsTable, candidatesTable } from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import { ensureCanManageCandidate, isRecruiterScoped } from "../lib/candidate-access";

const router: IRouter = Router();

router.get("/online-interviews", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { candidateId } = req.query as Record<string, string>;
  const conditions = [];
  if (candidateId) conditions.push(eq(onlineInterviewsTable.candidateId, parseInt(candidateId, 10)));
  if (isRecruiterScoped(req.userRole) && req.userId) {
    conditions.push(eq(candidatesTable.recruiterId, req.userId));
  }

  const baseQuery = db
    .select({
      id: onlineInterviewsTable.id,
      candidateId: onlineInterviewsTable.candidateId,
      candidateName: candidatesTable.fullName,
      interviewDate: onlineInterviewsTable.interviewDate,
      questionsAnswers: onlineInterviewsTable.questionsAnswers,
      experienceLevel: onlineInterviewsTable.experienceLevel,
      score: onlineInterviewsTable.score,
      notes: onlineInterviewsTable.notes,
      createdAt: onlineInterviewsTable.createdAt,
    })
    .from(onlineInterviewsTable)
    .leftJoin(candidatesTable, eq(onlineInterviewsTable.candidateId, candidatesTable.id));

  const rows = conditions.length
    ? await baseQuery.where(and(...conditions))
    : await baseQuery;
  res.json(rows);
});

router.post("/online-interviews", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { candidateId, interviewDate, questionsAnswers, experienceLevel, score, notes } = req.body ?? {};
  if (!candidateId) { res.status(400).json({ error: "candidateId kerak" }); return; }

  const allowed = await ensureCanManageCandidate(req, res, parseInt(candidateId, 10));
  if (!allowed) return;

  const [created] = await db
    .insert(onlineInterviewsTable)
    .values({
      candidateId: parseInt(candidateId, 10),
      interviewDate: interviewDate ?? null,
      questionsAnswers: questionsAnswers ?? [],
      experienceLevel: experienceLevel ?? null,
      score: score ?? null,
      notes: notes ?? null,
    })
    .returning();

  await db.update(candidatesTable)
    .set({ stage: "preboarding" })
    .where(eq(candidatesTable.id, parseInt(candidateId, 10)));

  const [row] = await db
    .select({
      id: onlineInterviewsTable.id,
      candidateId: onlineInterviewsTable.candidateId,
      candidateName: candidatesTable.fullName,
      interviewDate: onlineInterviewsTable.interviewDate,
      questionsAnswers: onlineInterviewsTable.questionsAnswers,
      experienceLevel: onlineInterviewsTable.experienceLevel,
      score: onlineInterviewsTable.score,
      notes: onlineInterviewsTable.notes,
      createdAt: onlineInterviewsTable.createdAt,
    })
    .from(onlineInterviewsTable)
    .leftJoin(candidatesTable, eq(onlineInterviewsTable.candidateId, candidatesTable.id))
    .where(eq(onlineInterviewsTable.id, created.id));

  res.status(201).json(row);
});

router.get("/online-interviews/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [row] = await db
    .select({
      id: onlineInterviewsTable.id,
      candidateId: onlineInterviewsTable.candidateId,
      candidateName: candidatesTable.fullName,
      interviewDate: onlineInterviewsTable.interviewDate,
      questionsAnswers: onlineInterviewsTable.questionsAnswers,
      experienceLevel: onlineInterviewsTable.experienceLevel,
      score: onlineInterviewsTable.score,
      notes: onlineInterviewsTable.notes,
      createdAt: onlineInterviewsTable.createdAt,
    })
    .from(onlineInterviewsTable)
    .leftJoin(candidatesTable, eq(onlineInterviewsTable.candidateId, candidatesTable.id))
    .where(eq(onlineInterviewsTable.id, id));
  if (!row) { res.status(404).json({ error: "Topilmadi" }); return; }
  res.json(row);
});

router.patch("/online-interviews/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const allowed = ["interviewDate", "questionsAnswers", "experienceLevel", "score", "notes"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  await db.update(onlineInterviewsTable).set(updates).where(eq(onlineInterviewsTable.id, id));
  const [row] = await db
    .select({
      id: onlineInterviewsTable.id,
      candidateId: onlineInterviewsTable.candidateId,
      candidateName: candidatesTable.fullName,
      interviewDate: onlineInterviewsTable.interviewDate,
      questionsAnswers: onlineInterviewsTable.questionsAnswers,
      experienceLevel: onlineInterviewsTable.experienceLevel,
      score: onlineInterviewsTable.score,
      notes: onlineInterviewsTable.notes,
      createdAt: onlineInterviewsTable.createdAt,
    })
    .from(onlineInterviewsTable)
    .leftJoin(candidatesTable, eq(onlineInterviewsTable.candidateId, candidatesTable.id))
    .where(eq(onlineInterviewsTable.id, id));
  if (!row) { res.status(404).json({ error: "Topilmadi" }); return; }
  res.json(row);
});

export default router;
