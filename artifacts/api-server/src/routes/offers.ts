import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, offersTable, candidatesTable } from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import { ensureCanManageCandidate, isRecruiterScoped } from "../lib/candidate-access";
import { assignDocumentsToRecruiter, cancelOpenPipelineTasks } from "../lib/pipeline-tasks";

const router: IRouter = Router();

router.get("/offers", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { candidateId, status } = req.query as Record<string, string>;

  const conditions = [];
  if (candidateId) conditions.push(eq(offersTable.candidateId, parseInt(candidateId, 10)));
  if (status) conditions.push(eq(offersTable.status, status));
  if (isRecruiterScoped(req.userRole) && req.userId) {
    conditions.push(eq(candidatesTable.recruiterId, req.userId));
  }

  const baseQuery = db
    .select({
      id: offersTable.id,
      candidateId: offersTable.candidateId,
      candidateName: candidatesTable.fullName,
      position: offersTable.position,
      salary: offersTable.salary,
      workConditions: offersTable.workConditions,
      documentsChecklist: offersTable.documentsChecklist,
      status: offersTable.status,
      createdAt: offersTable.createdAt,
    })
    .from(offersTable)
    .leftJoin(candidatesTable, eq(offersTable.candidateId, candidatesTable.id));

  const filtered = conditions.length
    ? await baseQuery.where(and(...conditions))
    : await baseQuery;

  res.json(filtered);
});

router.post("/offers", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { candidateId, position, salary, workConditions, documentsChecklist } = req.body ?? {};
  if (!candidateId || !position || !salary) {
    res.status(400).json({ error: "Majburiy maydonlar to'ldirilmagan" });
    return;
  }

  const allowed = await ensureCanManageCandidate(req, res, parseInt(candidateId, 10));
  if (!allowed) return;

  const defaultDocs = [
    { label: "Pasport nusxasi", completed: false },
    { label: "Diplom / Ta'lim hujjati", completed: false },
    { label: "Mehnat daftarchasi", completed: false },
    { label: "Tibbiy ma'lumotnoma", completed: false },
    { label: "2 dona 3x4 rasm", completed: false },
  ];

  const [created] = await db
    .insert(offersTable)
    .values({
      candidateId: parseInt(candidateId, 10),
      position,
      salary,
      workConditions: workConditions ?? null,
      documentsChecklist: documentsChecklist ?? defaultDocs,
      status: "pending",
    })
    .returning();

  await db.update(candidatesTable)
    .set({ stage: "offer" })
    .where(eq(candidatesTable.id, parseInt(candidateId, 10)));

  const [full] = await db
    .select({
      id: offersTable.id,
      candidateId: offersTable.candidateId,
      candidateName: candidatesTable.fullName,
      position: offersTable.position,
      salary: offersTable.salary,
      workConditions: offersTable.workConditions,
      documentsChecklist: offersTable.documentsChecklist,
      status: offersTable.status,
      createdAt: offersTable.createdAt,
    })
    .from(offersTable)
    .leftJoin(candidatesTable, eq(offersTable.candidateId, candidatesTable.id))
    .where(eq(offersTable.id, created.id));

  res.status(201).json(full);
});

router.get("/offers/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [row] = await db
    .select({
      id: offersTable.id,
      candidateId: offersTable.candidateId,
      candidateName: candidatesTable.fullName,
      position: offersTable.position,
      salary: offersTable.salary,
      workConditions: offersTable.workConditions,
      documentsChecklist: offersTable.documentsChecklist,
      status: offersTable.status,
      createdAt: offersTable.createdAt,
    })
    .from(offersTable)
    .leftJoin(candidatesTable, eq(offersTable.candidateId, candidatesTable.id))
    .where(eq(offersTable.id, id));
  if (!row) { res.status(404).json({ error: "Topilmadi" }); return; }
  res.json(row);
});

router.patch("/offers/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const allowed = ["position", "salary", "workConditions", "documentsChecklist", "status"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const [existing] = await db.select().from(offersTable).where(eq(offersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Topilmadi" }); return; }

  await db.update(offersTable).set(updates).where(eq(offersTable.id, id));

  if (updates.status === "accepted") {
    await db.update(candidatesTable)
      .set({ stage: "documents" })
      .where(eq(candidatesTable.id, existing.candidateId));
    const [cand] = await db
      .select({
        fullName: candidatesTable.fullName,
        recruiterId: candidatesTable.recruiterId,
      })
      .from(candidatesTable)
      .where(eq(candidatesTable.id, existing.candidateId));
    await assignDocumentsToRecruiter({
      candidateId: existing.candidateId,
      candidateName: cand?.fullName ?? "Nomzod",
      recruiterId: cand?.recruiterId,
      createdById: (req as AuthRequest).userId || cand?.recruiterId || existing.candidateId,
    });
  } else if (updates.status === "rejected") {
    await db.update(candidatesTable)
      .set({ status: "rejected", stage: "offer" })
      .where(eq(candidatesTable.id, existing.candidateId));
    await cancelOpenPipelineTasks(existing.candidateId);
  }

  const [full] = await db
    .select({
      id: offersTable.id,
      candidateId: offersTable.candidateId,
      candidateName: candidatesTable.fullName,
      position: offersTable.position,
      salary: offersTable.salary,
      workConditions: offersTable.workConditions,
      documentsChecklist: offersTable.documentsChecklist,
      status: offersTable.status,
      createdAt: offersTable.createdAt,
    })
    .from(offersTable)
    .leftJoin(candidatesTable, eq(offersTable.candidateId, candidatesTable.id))
    .where(eq(offersTable.id, id));

  res.json(full);
});

export default router;
