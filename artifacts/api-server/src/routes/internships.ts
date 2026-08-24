import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, internshipsTable, employeesTable, usersTable, candidatesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/internships", async (req, res): Promise<void> => {
  const { employeeId, trainerId, status } = req.query as Record<string, string>;

  const rows = await db.select().from(internshipsTable).orderBy(internshipsTable.createdAt);
  const filtered = rows.filter((r) => {
    if (employeeId && r.employeeId !== parseInt(employeeId, 10)) return false;
    if (trainerId && r.trainerId !== parseInt(trainerId, 10)) return false;
    if (status && r.status !== status) return false;
    return true;
  });

  const enriched = await Promise.all(filtered.map(async (r) => {
    const [emp] = await db.select({ fullName: employeesTable.fullName }).from(employeesTable).where(eq(employeesTable.id, r.employeeId));
    const [trainer] = r.trainerId ? await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, r.trainerId)) : [null];
    return {
      ...r,
      employeeName: emp?.fullName ?? null,
      trainerName: trainer?.fullName ?? null,
    };
  }));

  res.json(enriched);
});

router.post("/internships", async (req, res): Promise<void> => {
  const { employeeId, trainerId, startDate, endDate, tasks } = req.body ?? {};
  if (!employeeId || !startDate) {
    res.status(400).json({ error: "Majburiy maydonlar to'ldirilmagan" });
    return;
  }

  const [created] = await db
    .insert(internshipsTable)
    .values({
      employeeId: parseInt(employeeId, 10),
      trainerId: trainerId ? parseInt(trainerId, 10) : null,
      startDate,
      endDate: endDate ?? null,
      tasks: tasks ?? [],
      evaluations: [],
      status: "ongoing",
    })
    .returning();

  const [emp] = await db.select({ fullName: employeesTable.fullName }).from(employeesTable).where(eq(employeesTable.id, parseInt(employeeId, 10)));
  res.status(201).json({ ...created, employeeName: emp?.fullName ?? null, trainerName: null });
});

router.get("/internships/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [row] = await db.select().from(internshipsTable).where(eq(internshipsTable.id, id));
  if (!row) { res.status(404).json({ error: "Topilmadi" }); return; }
  const [emp] = await db.select({ fullName: employeesTable.fullName }).from(employeesTable).where(eq(employeesTable.id, row.employeeId));
  const [trainer] = row.trainerId ? await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, row.trainerId)) : [null];
  res.json({ ...row, employeeName: emp?.fullName ?? null, trainerName: trainer?.fullName ?? null });
});

router.patch("/internships/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const allowed = ["trainerId", "endDate", "tasks", "evaluations", "status"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const [existing] = await db.select().from(internshipsTable).where(eq(internshipsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Topilmadi" }); return; }

  const [updated] = await db.update(internshipsTable).set(updates).where(eq(internshipsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Topilmadi" }); return; }

  if (updates.status === "completed") {
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, existing.employeeId));
    if (emp?.candidateId) {
      await db.update(candidatesTable)
        .set({ stage: "hired", status: "hired" })
        .where(eq(candidatesTable.id, emp.candidateId));
      const { resolveStaffingHireByCandidateId } = await import("../lib/staffing-alert");
      await resolveStaffingHireByCandidateId(emp.candidateId);
      const [cand] = await db
        .select({ fullName: candidatesTable.fullName })
        .from(candidatesTable)
        .where(eq(candidatesTable.id, emp.candidateId));
      const { assignHireToHrs } = await import("../lib/pipeline-tasks");
      await assignHireToHrs({
        candidateId: emp.candidateId,
        candidateName: cand?.fullName ?? emp.fullName ?? "Nomzod",
        createdById: (req as any).userId ?? existing.trainerId ?? 1,
      });
    }
  }

  res.json({ ...updated, employeeName: null, trainerName: null });
});

export default router;
