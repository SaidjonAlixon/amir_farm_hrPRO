import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  preboardingsTable,
  candidatesTable,
  offlineInterviewsTable,
} from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import { ensureCanManageCandidate, isRecruiterScoped } from "../lib/candidate-access";
import { notifyActiveHrs, notifyUser } from "../lib/notify";
import { assignOfflineInterviewToHrs } from "../lib/pipeline-tasks";

const router: IRouter = Router();

router.get("/preboarding", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { candidateId } = req.query as Record<string, string>;
  const conditions = [];
  if (candidateId) conditions.push(eq(preboardingsTable.candidateId, parseInt(candidateId, 10)));
  if (isRecruiterScoped(req.userRole) && req.userId) {
    conditions.push(eq(candidatesTable.recruiterId, req.userId));
  }

  const baseQuery = db
    .select({
      id: preboardingsTable.id,
      candidateId: preboardingsTable.candidateId,
      checklist: preboardingsTable.checklist,
      notes: preboardingsTable.notes,
      completedAt: preboardingsTable.completedAt,
      createdAt: preboardingsTable.createdAt,
    })
    .from(preboardingsTable)
    .leftJoin(candidatesTable, eq(preboardingsTable.candidateId, candidatesTable.id));

  const rows = conditions.length
    ? await baseQuery.where(and(...conditions))
    : await baseQuery;
  res.json(rows);
});

router.post("/preboarding", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const { candidateId, checklist, notes, scheduledDate, scheduledTime } = req.body ?? {};
  if (!candidateId) {
    res.status(400).json({ error: "candidateId kerak" });
    return;
  }
  if (!scheduledDate || !String(scheduledDate).trim()) {
    res.status(400).json({
      error: "Offline suhbat sanasini belgilang — HR topshirig‘i muddati shu bo‘ladi",
    });
    return;
  }

  const candId = parseInt(candidateId, 10);
  const allowed = await ensureCanManageCandidate(req, res, candId);
  if (!allowed) return;

  const dateStr = String(scheduledDate).slice(0, 10);
  const timeStr = scheduledTime ? String(scheduledTime).slice(0, 5) : "10:00";

  const defaultChecklist = [
    { label: "Lavozim vazifalari bilan tanishtirish", completed: false },
    { label: "Ish tartibi va qoidalar", completed: false },
    { label: "Kompaniya qadriyatlari", completed: false },
    { label: "Xavfsizlik qoidalari", completed: false },
    { label: "Jamoaviy tuzilma", completed: false },
  ];

  const [created] = await db
    .insert(preboardingsTable)
    .values({
      candidateId: candId,
      checklist: checklist ?? defaultChecklist,
      notes: notes ?? null,
    })
    .returning();

  await db
    .update(candidatesTable)
    .set({ stage: "offline_interview" })
    .where(eq(candidatesTable.id, candId));

  const [candidate] = await db
    .select({ fullName: candidatesTable.fullName, recruiterId: candidatesTable.recruiterId })
    .from(candidatesTable)
    .where(eq(candidatesTable.id, candId));

  const existingOffline = await db
    .select()
    .from(offlineInterviewsTable)
    .where(eq(offlineInterviewsTable.candidateId, candId));

  if (existingOffline.length === 0) {
    await db.insert(offlineInterviewsTable).values({
      candidateId: candId,
      scheduledDate: dateStr,
      scheduledTime: timeStr,
      attendanceStatus: "pending",
      result: null,
    });
  } else {
    const open = existingOffline.find((r) => !r.result) ?? existingOffline[0]!;
    if (!open.result) {
      await db
        .update(offlineInterviewsTable)
        .set({ scheduledDate: dateStr, scheduledTime: timeStr })
        .where(eq(offlineInterviewsTable.id, open.id));
    }
  }

  const linkUrl = `/candidates/${candId}/offline-interview`;
  const text = `Offline suhbat belgilandi: "${candidate?.fullName ?? "Nomzod"}" — ${dateStr} ${timeStr}. Pre-boarding tugadi.`;

  await notifyActiveHrs({
    text,
    type: "interview_reminder",
    linkUrl,
  });
  await notifyUser({
    userId: candidate?.recruiterId,
    text,
    type: "interview_reminder",
    linkUrl,
  });

  // HR (direktor / auditor / menejer) — vazifalar sahifasiga
  await assignOfflineInterviewToHrs({
    candidateId: candId,
    candidateName: candidate?.fullName ?? "Nomzod",
    createdById: req.userId!,
    scheduledDate: dateStr,
    scheduledTime: timeStr,
  });

  res.status(201).json(created);
});

router.patch("/preboarding/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const allowed = ["checklist", "notes", "completedAt"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const [updated] = await db
    .update(preboardingsTable)
    .set(updates)
    .where(eq(preboardingsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Topilmadi" });
    return;
  }
  res.json(updated);
});

export default router;
