import { Router, type IRouter } from "express";
import { eq, and, sql, isNotNull } from "drizzle-orm";
import {
  db,
  requestsTable,
  vacanciesTable,
  candidatesTable,
  employeesTable,
  notificationsTable,
  channelsTable,
} from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import { isRecruiterScoped } from "../lib/candidate-access";

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

router.get("/dashboard/stats", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const userId = req.userId ?? 1;
  const scoped = isRecruiterScoped(req.userRole) && req.userId
    ? eq(candidatesTable.recruiterId, req.userId)
    : null;
  const vacScoped = isRecruiterScoped(req.userRole) && req.userId
    ? eq(vacanciesTable.recruiterId, req.userId)
    : null;

  const [openReqs] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(requestsTable)
    .where(sql`status NOT IN ('closed')`);

  const [activeVacs] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vacanciesTable)
    .where(
      vacScoped
        ? and(eq(vacanciesTable.status, "published"), vacScoped)
        : eq(vacanciesTable.status, "published"),
    );

  const [activeCands] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(candidatesTable)
    .where(scoped ? and(eq(candidatesTable.status, "active"), scoped) : eq(candidatesTable.status, "active"));

  const [rejectedCands] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(candidatesTable)
    .where(scoped ? and(eq(candidatesTable.status, "rejected"), scoped) : eq(candidatesTable.status, "rejected"));

  const [hiredMonth] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(candidatesTable)
    .where(scoped ? and(eq(candidatesTable.status, "hired"), scoped) : eq(candidatesTable.status, "hired"));

  const [totalCands] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(candidatesTable)
    .where(scoped ?? sql`true`);

  const [unread] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));

  res.json({
    openRequests: openReqs?.count ?? 0,
    activeVacancies: activeVacs?.count ?? 0,
    activeCandidates: activeCands?.count ?? 0,
    rejectedCandidates: rejectedCands?.count ?? 0,
    totalCandidates: totalCands?.count ?? 0,
    hiredThisMonth: hiredMonth?.count ?? 0,
    avgTimeToHire: 14.5,
    unreadNotifications: unread?.count ?? 0,
  });
});

router.get("/dashboard/pipeline-overview", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const candidates = isRecruiterScoped(req.userRole) && req.userId
    ? await db
      .select({
        stage: candidatesTable.stage,
        status: candidatesTable.status,
      })
      .from(candidatesTable)
      .where(eq(candidatesTable.recruiterId, req.userId))
    : await db
      .select({
        stage: candidatesTable.stage,
        status: candidatesTable.status,
      })
      .from(candidatesTable);

  const stageIndex = (stage: string) =>
    PIPELINE_STAGES.findIndex((s) => s.key === stage);

  const counts = PIPELINE_STAGES.map((s, idx) => {
    // Bosib o'tgan + hozir shu bosqichda turganlar (kumulyativ)
    const reached = candidates.filter((c) => {
      if (c.status === "hired" || c.stage === "hired") return true;
      const cIdx = stageIndex(c.stage);
      if (cIdx < 0) return false;
      return cIdx >= idx;
    }).length;

    // Hozir aynan shu bosqichda (kutilmoqda / faol)
    const current = candidates.filter((c) => {
      if (s.key === "hired") {
        return c.status === "hired" || c.stage === "hired";
      }
      if (c.status === "rejected" || c.status === "hired") return false;
      return c.stage === s.key;
    }).length;

    const rejectedHere = candidates.filter(
      (c) => c.status === "rejected" && c.stage === s.key,
    ).length;

    return {
      stage: s.key,
      label: s.label,
      count: reached,
      currentCount: current,
      rejectedCount: rejectedHere,
    };
  });

  res.json(counts);
});

router.get("/dashboard/recent-activity", async (_req, res): Promise<void> => {
  const STAGE_LABELS: Record<string, string> = {
    phone_interview: "Tanishuv",
    online_interview: "Onlayn suhbat",
    preboarding: "Pre-boarding",
    offline_interview: "Offline suhbat",
    final_decision: "Yakuniy qaror",
    offer: "Job offer",
    documents: "Hujjatlar",
    internship: "Stajirovka",
    hired: "Ishga qabul",
    rejected: "Rad etilgan",
  };

  const STATUS_LABELS: Record<string, string> = {
    submitted: "Yangi",
    reviewing: "Ko'rib chiqilmoqda",
    accepted: "Qabul qilingan",
    announced: "E'lon qilingan",
    closed: "Yopilgan",
  };

  const recentCandidates = await db
    .select({
      id: candidatesTable.id,
      fullName: candidatesTable.fullName,
      stage: candidatesTable.stage,
      status: candidatesTable.status,
      createdAt: candidatesTable.createdAt,
    })
    .from(candidatesTable)
    .orderBy(sql`created_at DESC`)
    .limit(8);

  const recentRequests = await db
    .select({
      id: requestsTable.id,
      position: requestsTable.position,
      status: requestsTable.status,
      createdAt: requestsTable.createdAt,
    })
    .from(requestsTable)
    .orderBy(sql`created_at DESC`)
    .limit(8);

  const activities = [
    ...recentCandidates.map((c) => {
      const stageLabel = STAGE_LABELS[c.stage] || c.stage;
      const isRejected = c.status === "rejected";
      const isHired = c.status === "hired" || c.stage === "hired";
      let text: string;
      let type = "stage_change";
      if (isRejected) {
        text = `${c.fullName} nomzodi rad etildi (${stageLabel} bosqichida)`;
        type = "rejected";
      } else if (isHired) {
        text = `${c.fullName} ishga qabul qilindi`;
        type = "hired";
      } else {
        text = `${c.fullName} — ${stageLabel} bosqichida`;
      }
      return {
        id: c.id,
        text,
        type,
        actorName: null,
        createdAt: c.createdAt?.toISOString() ?? "",
        linkUrl: `/candidates/${c.id}`,
        entityType: "candidate",
        entityId: c.id,
      };
    }),
    ...recentRequests.map((r) => ({
      id: r.id + 100000,
      text: `"${r.position}" arizasi — ${STATUS_LABELS[r.status] || r.status}`,
      type: "new_request",
      actorName: null,
      createdAt: r.createdAt?.toISOString() ?? "",
      linkUrl: `/requests/${r.id}`,
      entityType: "request",
      entityId: r.id,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 12);

  res.json(activities);
});

router.get("/dashboard/channel-stats", async (_req, res): Promise<void> => {
  const channels = await db.select().from(channelsTable);

  const stats = channels.map((ch) => ({
    channelId: ch.id,
    channelName: ch.name,
    channelIcon: ch.icon,
    publishedCount: Math.floor(Math.random() * 5) + 1,
    candidatesCount: Math.floor(Math.random() * 20) + 5,
  }));

  res.json(stats);
});

router.get("/dashboard/recruiter-tasks", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const role = req.userRole;
  const userId = req.userId;

  const STAGE_LABELS: Record<string, string> = {
    phone_interview: "Tanishuv",
    online_interview: "Onlayn suhbat",
    preboarding: "Pre-boarding",
    offline_interview: "Offline suhbat",
    final_decision: "Yakuniy qaror",
    offer: "Job offer",
    documents: "Hujjatlar",
    internship: "Stajirovka",
    hired: "Ishga qabul",
  };

  const ACTION_BY_STAGE: Record<string, string> = {
    phone_interview: "bilan bog'laning",
    online_interview: "onlayn suhbatni yakunlang",
    preboarding: "pre-boardingni tekshiring",
    offline_interview: "offline suhbat natijasini kiriting",
    final_decision: "yakuniy qaror qabul qiling",
    offer: "job offer yuboring",
    documents: "hujjatlarni yakunlang",
    internship: "stajirovkani baholang",
  };

  const candConditions = [eq(candidatesTable.status, "active")];
  if (role === "recruiter" && userId) {
    candConditions.push(eq(candidatesTable.recruiterId, userId));
  }

  const pending = await db
    .select()
    .from(candidatesTable)
    .where(and(...candConditions))
    .orderBy(candidatesTable.createdAt)
    .limit(8);

  const candidateTasks = pending.map((c, idx) => {
    const stageLabel = STAGE_LABELS[c.stage] || c.stage;
    const action = ACTION_BY_STAGE[c.stage] || "bilan ishlashni davom eting";
    const due = new Date();
    due.setHours(9 + idx, 0, 0, 0);
    return {
      id: c.id,
      type: c.stage === "phone_interview" ? "call_candidate" : "schedule_interview",
      description: `${c.fullName} ${action} — ${stageLabel} bosqichi`,
      candidateId: c.id,
      candidateName: c.fullName,
      vacancyId: c.vacancyId,
      linkUrl: `/candidates/${c.id}`,
      priority: idx === 0 ? "high" : idx < 3 ? "medium" : "low",
      dueDate: due.toISOString(),
      dueLabel: due.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" }),
    };
  });

  // Biriktirilgan vakansiyalar muddati — admin/director hammasi; recruiter o'ziniki; boshqalar — ariza bergan
  const vacConditions = [
    isNotNull(vacanciesTable.recruiterId),
    isNotNull(vacanciesTable.deadline),
    sql`${vacanciesTable.status} IN ('draft', 'published')`,
  ];
  if (role === "recruiter" && userId) {
    vacConditions.push(eq(vacanciesTable.recruiterId, userId));
  } else if (role !== "admin" && role !== "director" && userId) {
    vacConditions.push(
      sql`${vacanciesTable.requestId} IN (
        SELECT id FROM requests WHERE created_by_id = ${userId}
      )`,
    );
  }

  const openVacancies = await db
    .select()
    .from(vacanciesTable)
    .where(and(...vacConditions))
    .orderBy(vacanciesTable.deadline)
    .limit(12);

  const vacancyTasks = openVacancies.map((v) => {
    const deadline = v.deadline ? new Date(v.deadline) : new Date();
    const msLeft = deadline.getTime() - Date.now();
    const hoursLeft = Math.round(msLeft / 3600000);
    const expired = msLeft <= 0;
    return {
      id: 100000 + v.id,
      type: "find_candidate",
      description: expired
        ? `"${v.title}" e'lon muddati o'tgan`
        : `"${v.title}" — e'longa ${Math.max(0, hoursLeft)} soat qoldi`,
      candidateId: null,
      candidateName: null,
      vacancyId: v.id,
      vacancyTitle: v.title,
      deadline: deadline.toISOString(),
      linkUrl: `/vacancies/${v.id}`,
      priority: expired || hoursLeft < 24 ? "high" : hoursLeft < 72 ? "medium" : "low",
      dueDate: deadline.toISOString(),
      dueLabel: deadline.toLocaleString("uz-UZ", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  });

  // Muddat vazifalari oldinda, keyin nomzod vazifalari
  const tasks = [...vacancyTasks, ...candidateTasks].slice(0, 15);
  res.json(tasks);
});

export default router;
