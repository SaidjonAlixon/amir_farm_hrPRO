import { Router, type IRouter } from "express";
import { eq, and, ilike } from "drizzle-orm";
import { db, candidatesTable, vacanciesTable, usersTable, notificationsTable } from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import { canDeleteHrRecords, deleteCandidateCascade } from "../lib/delete-candidate";
import {
  canManageCandidate,
  canViewCandidate,
  isHrManager,
  isRecruiterScoped,
  assertAssignableUser,
} from "../lib/candidate-access";

const router: IRouter = Router();

const PIPELINE_STAGES = [
  { key: "phone_interview", label: "Tanishuv" },
  { key: "online_interview", label: "Onlayn suhbat" },
  { key: "preboarding", label: "Pre-boarding" },
  { key: "offline_interview", label: "Offline suhbat" },
  { key: "final_decision", label: "Yakuniy qaror" },
  { key: "offer", label: "Job offer" },
  { key: "documents", label: "Hujjatlar" },
  { key: "internship", label: "Stajirovka" },
  { key: "hired", label: "Ishga qabul" },
];

async function getCandidateFull(id: number) {
  const [row] = await db
    .select({
      id: candidatesTable.id,
      fullName: candidatesTable.fullName,
      birthDate: candidatesTable.birthDate,
      phone: candidatesTable.phone,
      address: candidatesTable.address,
      photoUrl: candidatesTable.photoUrl,
      education: candidatesTable.education,
      experience: candidatesTable.experience,
      expectedSalary: candidatesTable.expectedSalary,
      notes: candidatesTable.notes,
      vacancyId: candidatesTable.vacancyId,
      vacancyTitle: vacanciesTable.title,
      recruiterId: candidatesTable.recruiterId,
      recruiterName: usersTable.fullName,
      stage: candidatesTable.stage,
      status: candidatesTable.status,
      createdAt: candidatesTable.createdAt,
    })
    .from(candidatesTable)
    .leftJoin(vacanciesTable, eq(candidatesTable.vacancyId, vacanciesTable.id))
    .leftJoin(usersTable, eq(candidatesTable.recruiterId, usersTable.id))
    .where(eq(candidatesTable.id, id));
  return row ?? null;
}

router.get("/candidates", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { vacancyId, stage, status, recruiterId, search } = req.query as Record<string, string>;

  const conditions = [];
  if (vacancyId) conditions.push(eq(candidatesTable.vacancyId, parseInt(vacancyId, 10)));
  if (stage) conditions.push(eq(candidatesTable.stage, stage));
  if (status) conditions.push(eq(candidatesTable.status, status));
  if (search) conditions.push(ilike(candidatesTable.fullName, `%${search}%`));

  // Rekruter faqat o'ziga biriktirilgan nomzodlarni ko'radi
  if (isRecruiterScoped(req.userRole) && req.userId) {
    conditions.push(eq(candidatesTable.recruiterId, req.userId));
  } else if (recruiterId) {
    conditions.push(eq(candidatesTable.recruiterId, parseInt(recruiterId, 10)));
  }

  const baseQuery = db
    .select({
      id: candidatesTable.id,
      fullName: candidatesTable.fullName,
      birthDate: candidatesTable.birthDate,
      phone: candidatesTable.phone,
      address: candidatesTable.address,
      photoUrl: candidatesTable.photoUrl,
      education: candidatesTable.education,
      experience: candidatesTable.experience,
      expectedSalary: candidatesTable.expectedSalary,
      notes: candidatesTable.notes,
      vacancyId: candidatesTable.vacancyId,
      vacancyTitle: vacanciesTable.title,
      recruiterId: candidatesTable.recruiterId,
      recruiterName: usersTable.fullName,
      stage: candidatesTable.stage,
      status: candidatesTable.status,
      createdAt: candidatesTable.createdAt,
    })
    .from(candidatesTable)
    .leftJoin(vacanciesTable, eq(candidatesTable.vacancyId, vacanciesTable.id))
    .leftJoin(usersTable, eq(candidatesTable.recruiterId, usersTable.id));

  const rows = conditions.length
    ? await baseQuery.where(and(...conditions)).orderBy(candidatesTable.createdAt)
    : await baseQuery.orderBy(candidatesTable.createdAt);

  res.json(rows);
});

router.post("/candidates", async (req, res): Promise<void> => {
  const { fullName, phone, vacancyId, birthDate, address, education, experience, expectedSalary, notes, recruiterId } = req.body ?? {};
  if (!fullName || !phone || !vacancyId) {
    res.status(400).json({ error: "Majburiy maydonlar to'ldirilmagan" });
    return;
  }
  const [created] = await db
    .insert(candidatesTable)
    .values({
      fullName,
      phone,
      vacancyId: parseInt(vacancyId, 10),
      birthDate: birthDate ?? null,
      address: address ?? null,
      education: education ?? null,
      experience: experience ?? null,
      expectedSalary: expectedSalary ?? null,
      notes: notes ?? null,
      recruiterId: recruiterId ? parseInt(recruiterId, 10) : null,
      stage: "phone_interview",
      status: "active",
    })
    .returning();
  const full = await getCandidateFull(created.id);
  res.status(201).json(full);
});

router.get("/candidates/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const row = await getCandidateFull(id);
  if (!row) { res.status(404).json({ error: "Topilmadi" }); return; }
  if (!canViewCandidate(req.userId, req.userRole, row.recruiterId)) {
    res.status(403).json({ error: "Bu nomzod sizga biriktirilmagan" });
    return;
  }
  res.json(row);
});

router.patch("/candidates/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [existing] = await db
    .select({ id: candidatesTable.id, recruiterId: candidatesTable.recruiterId, fullName: candidatesTable.fullName })
    .from(candidatesTable)
    .where(eq(candidatesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }

  const wantsReassign = req.body?.recruiterId !== undefined;
  if (wantsReassign && !isHrManager(req.userRole)) {
    res.status(403).json({ error: "Faqat HR mas'ulni o'zgartira oladi" });
    return;
  }

  const otherKeys = Object.keys(req.body ?? {}).filter((k) => k !== "recruiterId");
  if (otherKeys.length > 0 && !canManageCandidate(req.userId, req.userRole, existing.recruiterId)) {
    res.status(403).json({ error: "Faqat biriktirilgan mas'ul va HR o'zgartira oladi" });
    return;
  }

  if (!wantsReassign && !canManageCandidate(req.userId, req.userRole, existing.recruiterId)) {
    res.status(403).json({ error: "Faqat biriktirilgan mas'ul va HR o'zgartira oladi" });
    return;
  }

  const allowed = ["fullName", "birthDate", "phone", "address", "education", "experience", "expectedSalary", "notes", "stage", "status", "recruiterId", "photoUrl"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] === undefined) continue;
    if (key === "recruiterId") {
      if (!isHrManager(req.userRole)) continue;
      const raw = req.body.recruiterId;
      if (raw === null || raw === "") {
        updates.recruiterId = null;
      } else {
        const assignee = await assertAssignableUser(parseInt(String(raw), 10));
        if (!assignee) {
          res.status(400).json({
            error: "Mas'ul sifatida faqat faol admin/HR/rekruter/trener/direktor/bo'lim boshlig'i tanlanadi",
          });
          return;
        }
        updates.recruiterId = assignee.id;
      }
    } else {
      updates[key] = req.body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    res.json(await getCandidateFull(id));
    return;
  }

  await db.update(candidatesTable).set(updates).where(eq(candidatesTable.id, id));

  if (
    updates.recruiterId != null &&
    updates.recruiterId !== existing.recruiterId &&
    typeof updates.recruiterId === "number"
  ) {
    await db.insert(notificationsTable).values({
      userId: updates.recruiterId,
      text: `Sizga nomzod biriktirildi: "${existing.fullName}". Suhbatni olib borishingiz mumkin.`,
      type: "stage_change",
      linkUrl: `/candidates/${id}`,
    });
  }

  if (updates.status === "hired" || updates.stage === "hired") {
    const { resolveStaffingHireByCandidateId } = await import("../lib/staffing-alert");
    await resolveStaffingHireByCandidateId(id);
  }

  // Pipeline topshiriqlari — bosqich o‘tganda
  try {
    const {
      assignOfferToRecruiter,
      assignInternshipToTrainers,
      assignHireToHrs,
      cancelOpenPipelineTasks,
      completePipelineStageTasks,
    } = await import("../lib/pipeline-tasks");

    if (updates.status === "rejected") {
      await cancelOpenPipelineTasks(id);
    } else if (updates.stage === "offer" && existing.stage !== "offer") {
      await assignOfferToRecruiter({
        candidateId: id,
        candidateName: existing.fullName,
        recruiterId: (updates.recruiterId as number | undefined) ?? existing.recruiterId,
        createdById: req.userId!,
      });
    } else if (updates.stage === "internship" && existing.stage !== "internship") {
      await assignInternshipToTrainers({
        candidateId: id,
        candidateName: existing.fullName,
        createdById: req.userId!,
      });
    } else if (updates.stage === "hired" || updates.status === "hired") {
      await assignHireToHrs({
        candidateId: id,
        candidateName: existing.fullName,
        createdById: req.userId!,
      });
    } else if (updates.stage === "documents" && existing.stage !== "documents") {
      await completePipelineStageTasks({ candidateId: id, stage: "offer" });
      const { assignDocumentsToRecruiter } = await import("../lib/pipeline-tasks");
      await assignDocumentsToRecruiter({
        candidateId: id,
        candidateName: existing.fullName,
        recruiterId: existing.recruiterId,
        createdById: req.userId!,
      });
    }
  } catch (err) {
    console.error("pipeline-tasks candidate patch", err);
  }

  const full = await getCandidateFull(id);
  if (!full) { res.status(404).json({ error: "Topilmadi" }); return; }
  res.json(full);
});

router.delete("/candidates/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!canDeleteHrRecords(req.userRole)) {
    res.status(403).json({ error: "Faqat HR va Direktor o'chira oladi" });
    return;
  }

  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const ok = await deleteCandidateCascade(id);
  if (!ok) { res.status(404).json({ error: "Topilmadi" }); return; }
  res.status(204).send();
});

router.get("/candidates/:id/pipeline", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const candidate = await getCandidateFull(id);
  if (!candidate) { res.status(404).json({ error: "Topilmadi" }); return; }
  if (!canViewCandidate(req.userId, req.userRole, candidate.recruiterId)) {
    res.status(403).json({ error: "Bu nomzod sizga biriktirilmagan" });
    return;
  }

  const currentStage = candidate.stage;
  const currentIdx = PIPELINE_STAGES.findIndex((s) => s.key === currentStage);

  const stages = PIPELINE_STAGES.map((s, idx) => {
    let status: string;
    if (candidate.status === "rejected" && (s.key === currentStage || idx === currentIdx)) {
      status = idx < currentIdx ? "completed" : idx === currentIdx ? "failed" : "pending";
    } else if (candidate.status === "hired" || currentStage === "hired") {
      // Ishga qabul qilinganda 1–9 qadamlarning hammasi yashil ✓
      status = "completed";
    } else if (idx < currentIdx) {
      status = "completed";
    } else if (idx === currentIdx) {
      status = "in_progress";
    } else {
      status = "pending";
    }
    return {
      key: s.key,
      label: s.label,
      status,
      completedAt: status === "completed" ? candidate.createdAt : null,
      details: null,
    };
  });

  res.json({
    candidateId: candidate.id,
    candidateName: candidate.fullName,
    currentStage,
    stages,
  });
});

export default router;
