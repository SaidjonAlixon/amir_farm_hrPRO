import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  kirishProgressTable,
  kirishVideosTable,
  type KirishStageState,
  type KirishStagesMap,
} from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth";
import { requireAuth } from "../middlewares/auth";
import { canAccessKirish } from "../lib/roles";
import {
  KIRISH_STAGE_COUNT,
  getStage,
  publicStagePayload,
  scoreAnswers,
  KIRISH_STAGES,
  KIRISH_PASS_SCORE,
  type KirishQuestion,
} from "../lib/kirish-content";
import { parseYoutubeId } from "../lib/youtube-id";
import { parseDriveFileId } from "../lib/drive-id";

const router: IRouter = Router();

function emptyStage(): KirishStageState {
  return {
    videoDone: false,
    slidesDone: false,
    score: null,
    attempts: 0,
    passed: false,
    passedAt: null,
  };
}

function ensureStagesMap(raw: KirishStagesMap | null | undefined): KirishStagesMap {
  const map: KirishStagesMap = { ...(raw || {}) };
  for (let i = 1; i <= KIRISH_STAGE_COUNT; i++) {
    const key = String(i);
    if (!map[key]) map[key] = emptyStage();
  }
  return map;
}

function requireStajyor(req: AuthRequest, res: import("express").Response): boolean {
  if (!canAccessKirish(req.userRole)) {
    res.status(403).json({ error: "Faqat stajyor uchun" });
    return false;
  }
  return true;
}

async function getOrCreateProgress(userId: number) {
  const [existing] = await db
    .select()
    .from(kirishProgressTable)
    .where(eq(kirishProgressTable.userId, userId))
    .limit(1);
  if (existing) {
    return {
      ...existing,
      stagesJson: ensureStagesMap(existing.stagesJson as KirishStagesMap),
    };
  }
  const stages = ensureStagesMap({});
  const [created] = await db
    .insert(kirishProgressTable)
    .values({
      userId,
      currentStage: 1,
      status: "in_progress",
      stagesJson: stages,
    })
    .returning();
  return { ...created, stagesJson: stages };
}

function serializeProgress(row: Awaited<ReturnType<typeof getOrCreateProgress>>) {
  const stages = ensureStagesMap(row.stagesJson);
  const allPassed = Array.from({ length: KIRISH_STAGE_COUNT }, (_, i) =>
    Boolean(stages[String(i + 1)]?.passed),
  ).every(Boolean);

  return {
    id: row.id,
    userId: row.userId,
    currentStage: row.currentStage,
    status: row.status,
    stages,
    allPassed,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    passScore: KIRISH_PASS_SCORE,
    stageCount: KIRISH_STAGE_COUNT,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function youtubeByStage() {
  const rows = await db.select().from(kirishVideosTable);
  return new Map(rows.map((r) => [r.stage, r]));
}

function parseAdminQuestions(raw: unknown): KirishQuestion[] | { error: string } {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return { error: "Test savollari noto‘g‘ri" };
  const out: KirishQuestion[] = [];
  for (let i = 0; i < raw.length; i++) {
    const q = raw[i] as Record<string, unknown>;
    const text = String(q?.text ?? "").trim();
    const options = Array.isArray(q?.options)
      ? q.options.map((o) => String(o ?? "").trim()).filter(Boolean)
      : [];
    const correctIndex = Number(q?.correctIndex);
    if (!text) return { error: `${i + 1}-savol matnini yozing` };
    if (options.length < 2) return { error: `${i + 1}-savolda kamida 2 ta variant bo‘lsin` };
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      return { error: `${i + 1}-savolda to‘g‘ri javobni belgilang` };
    }
    const idRaw = String(q?.id ?? "").trim();
    out.push({
      id: idRaw || `q-${i + 1}-${Date.now()}`,
      text,
      options,
      correctIndex,
    });
  }
  return out;
}

function questionsForStage(
  stage: (typeof KIRISH_STAGES)[number],
  ov?: { questionsJson?: KirishQuestion[] | null } | null,
): KirishQuestion[] {
  const custom = ov?.questionsJson;
  if (!Array.isArray(custom) || custom.length === 0) return stage.questions;
  return custom.map((q, i) => {
    const expected = Number(q?.correctIndex);
    return {
      id: String(q?.id || stage.questions[i]?.id || `q-${i + 1}`),
      text: String(q?.text || ""),
      options: Array.isArray(q?.options) ? q.options.map((o) => String(o ?? "")) : [],
      correctIndex: Number.isInteger(expected)
        ? expected
        : Number(stage.questions[i]?.correctIndex ?? 0),
    };
  });
}

function publicStagesWithVideos(
  byStage: Map<
    number,
    {
      youtubeUrl: string;
      youtubeId: string;
      pdfUrl: string | null;
      driveFileId: string | null;
      questionsJson?: KirishQuestion[] | null;
    }
  >,
) {
  return KIRISH_STAGES.map((s) => {
    const ov = byStage.get(s.stage);
    const questions = questionsForStage(s, ov);
    const pub = publicStagePayload({ ...s, questions });
    const youtubeId = ov?.youtubeId || null;
    const driveFileId = ov?.driveFileId || null;
    return {
      ...pub,
      videoUrl: youtubeId ? ov!.youtubeUrl : pub.videoUrl,
      videoKind: youtubeId ? ("youtube" as const) : ("file" as const),
      youtubeId,
      pdfUrl: ov?.pdfUrl ?? null,
      driveFileId,
    };
  });
}

function requireAdmin(req: AuthRequest, res: import("express").Response): boolean {
  if (req.userRole !== "admin") {
    res.status(403).json({ error: "Faqat admin" });
    return false;
  }
  return true;
}

router.get("/kirish/me", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireStajyor(req, res)) return;
  const progress = await getOrCreateProgress(req.userId!);
  const byStage = await youtubeByStage();
  res.json({
    progress: serializeProgress(progress),
    stages: publicStagesWithVideos(byStage),
  });
});

router.get("/kirish/videos", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const byStage = await youtubeByStage();
  res.json({
    videos: KIRISH_STAGES.map((s) => {
      const ov = byStage.get(s.stage);
      return {
        stage: s.stage,
        title: s.title,
        subtitle: s.subtitle,
        youtubeUrl: ov?.youtubeUrl ?? "",
        youtubeId: ov?.youtubeId || null,
        pdfUrl: ov?.pdfUrl ?? "",
        driveFileId: ov?.driveFileId ?? null,
        questions: questionsForStage(s, ov),
        updatedAt: ov?.updatedAt ? ov.updatedAt.toISOString() : null,
      };
    }),
  });
});

router.put("/kirish/videos/:n", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const n = Number(req.params.n);
  if (!getStage(n)) {
    res.status(400).json({ error: "Noto‘g‘ri bosqich" });
    return;
  }
  const rawYoutube = String(req.body?.youtubeUrl ?? "").trim();
  const rawPdf = String(req.body?.pdfUrl ?? "").trim();
  const youtubeId = rawYoutube ? parseYoutubeId(rawYoutube) : "";
  if (rawYoutube && !youtubeId) {
    res.status(400).json({ error: "YouTube havolasi noto‘g‘ri" });
    return;
  }
  const driveFileId = rawPdf ? parseDriveFileId(rawPdf) : null;
  if (rawPdf && !driveFileId) {
    res.status(400).json({ error: "Google Drive PDF havolasi noto‘g‘ri" });
    return;
  }
  const parsedQs = parseAdminQuestions(req.body?.questions);
  if (!Array.isArray(parsedQs)) {
    res.status(400).json({ error: parsedQs.error });
    return;
  }
  if (!youtubeId && !driveFileId && parsedQs.length === 0) {
    res.status(400).json({ error: "YouTube, Google Drive PDF yoki test savolini yozing" });
    return;
  }
  const youtubeUrl = youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : "";
  const pdfUrl = driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : null;
  const [existing] = await db
    .select()
    .from(kirishVideosTable)
    .where(eq(kirishVideosTable.stage, n))
    .limit(1);
  const now = new Date();
  if (existing) {
    const [updated] = await db
      .update(kirishVideosTable)
      .set({
        youtubeUrl,
        youtubeId: youtubeId || "",
        pdfUrl,
        driveFileId,
        questionsJson: parsedQs,
        updatedById: req.userId ?? null,
        updatedAt: now,
      })
      .where(eq(kirishVideosTable.id, existing.id))
      .returning();
    res.json({ video: updated });
    return;
  }
  const [created] = await db
    .insert(kirishVideosTable)
    .values({
      stage: n,
      youtubeUrl,
      youtubeId: youtubeId || "",
      pdfUrl,
      driveFileId,
      questionsJson: parsedQs,
      updatedById: req.userId ?? null,
    })
    .returning();
  res.json({ video: created });
});

router.delete("/kirish/videos/:n", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const n = Number(req.params.n);
  if (!getStage(n)) {
    res.status(400).json({ error: "Noto‘g‘ri bosqich" });
    return;
  }
  await db.delete(kirishVideosTable).where(eq(kirishVideosTable.stage, n));
  res.json({ ok: true });
});

router.post(
  "/kirish/me/stage/:n/complete-video",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    if (!requireStajyor(req, res)) return;
    const n = Number(req.params.n);
    if (!getStage(n)) {
      res.status(400).json({ error: "Noto‘g‘ri bosqich" });
      return;
    }
    const progress = await getOrCreateProgress(req.userId!);
    if (progress.status === "ready_for_hire" || progress.status === "hired") {
      res.json({ progress: serializeProgress(progress) });
      return;
    }
    if (n > progress.currentStage) {
      res.status(400).json({ error: "Avval oldingi bosqichni yakunlang" });
      return;
    }
    const stages = ensureStagesMap(progress.stagesJson);
    const key = String(n);
    stages[key] = { ...stages[key]!, videoDone: true };
    const [updated] = await db
      .update(kirishProgressTable)
      .set({ stagesJson: stages, updatedAt: new Date() })
      .where(eq(kirishProgressTable.id, progress.id))
      .returning();
    res.json({
      progress: serializeProgress({
        ...updated,
        stagesJson: ensureStagesMap(updated.stagesJson as KirishStagesMap),
      }),
    });
  },
);

router.post(
  "/kirish/me/stage/:n/complete-slides",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    if (!requireStajyor(req, res)) return;
    const n = Number(req.params.n);
    if (!getStage(n)) {
      res.status(400).json({ error: "Noto‘g‘ri bosqich" });
      return;
    }
    const progress = await getOrCreateProgress(req.userId!);
    if (progress.status === "ready_for_hire" || progress.status === "hired") {
      res.json({ progress: serializeProgress(progress) });
      return;
    }
    if (n > progress.currentStage) {
      res.status(400).json({ error: "Avval oldingi bosqichni yakunlang" });
      return;
    }
    const stages = ensureStagesMap(progress.stagesJson);
    const key = String(n);
    const st = stages[key]!;
    if (!st.videoDone) {
      res.status(400).json({ error: "Avval videoni ko‘ring" });
      return;
    }
    stages[key] = { ...st, slidesDone: true };
    const [updated] = await db
      .update(kirishProgressTable)
      .set({ stagesJson: stages, updatedAt: new Date() })
      .where(eq(kirishProgressTable.id, progress.id))
      .returning();
    res.json({
      progress: serializeProgress({
        ...updated,
        stagesJson: ensureStagesMap(updated.stagesJson as KirishStagesMap),
      }),
    });
  },
);

router.post(
  "/kirish/me/stage/:n/submit-test",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    if (!requireStajyor(req, res)) return;
    const n = Number(req.params.n);
    const stage = getStage(n);
    if (!stage) {
      res.status(400).json({ error: "Noto‘g‘ri bosqich" });
      return;
    }
    const progress = await getOrCreateProgress(req.userId!);
    if (progress.status === "ready_for_hire" || progress.status === "hired") {
      res.status(400).json({ error: "Kurs allaqachon yakunlangan" });
      return;
    }
    if (n > progress.currentStage) {
      res.status(400).json({ error: "Avval oldingi bosqichni yakunlang" });
      return;
    }
    const stages = ensureStagesMap(progress.stagesJson);
    const key = String(n);
    const st = stages[key]!;
    if (!st.videoDone || !st.slidesDone) {
      res.status(400).json({ error: "Avval video va slaydlarni tugating" });
      return;
    }

    const answers = (req.body?.answers || {}) as Record<string, number>;
    const byStage = await youtubeByStage();
    const overlayQs = questionsForStage(stage, byStage.get(n));
    const result = scoreAnswers({ ...stage, questions: overlayQs }, answers);
    const nowIso = new Date().toISOString();
    stages[key] = {
      ...st,
      videoDone: result.passed ? st.videoDone : false,
      score: result.score,
      attempts: st.attempts + 1,
      passed: result.passed,
      passedAt: result.passed ? nowIso : st.passedAt,
    };

    let currentStage = progress.currentStage;
    if (result.passed && n === progress.currentStage && n < KIRISH_STAGE_COUNT) {
      currentStage = n + 1;
    }

    const [updated] = await db
      .update(kirishProgressTable)
      .set({
        stagesJson: stages,
        currentStage,
        updatedAt: new Date(),
      })
      .where(eq(kirishProgressTable.id, progress.id))
      .returning();

    res.json({
      result,
      progress: serializeProgress({
        ...updated,
        stagesJson: ensureStagesMap(updated.stagesJson as KirishStagesMap),
      }),
    });
  },
);

router.post("/kirish/me/finish", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (!requireStajyor(req, res)) return;
  const progress = await getOrCreateProgress(req.userId!);
  const stages = ensureStagesMap(progress.stagesJson);
  const allPassed = Array.from({ length: KIRISH_STAGE_COUNT }, (_, i) =>
    Boolean(stages[String(i + 1)]?.passed),
  ).every(Boolean);

  if (!allPassed) {
    res.status(400).json({ error: "Barcha bosqichlarni muvaffaqiyatli yakunlang" });
    return;
  }

  const now = new Date();
  const [updated] = await db
    .update(kirishProgressTable)
    .set({
      status: "ready_for_hire",
      completedAt: now,
      updatedAt: now,
      stagesJson: stages,
    })
    .where(eq(kirishProgressTable.id, progress.id))
    .returning();

  const scores = Array.from({ length: KIRISH_STAGE_COUNT }, (_, i) => {
    const s = stages[String(i + 1)]!;
    return { stage: i + 1, score: s.score, attempts: s.attempts, passedAt: s.passedAt };
  });
  const avg =
    scores.reduce((a, b) => a + (b.score ?? 0), 0) / Math.max(1, scores.length);

  res.json({
    progress: serializeProgress({
      ...updated,
      stagesJson: ensureStagesMap(updated.stagesJson as KirishStagesMap),
    }),
    report: {
      status: "ready_for_hire",
      statusLabel: "Ishga qabulga tayyor",
      averageScore: Math.round(avg),
      stages: scores,
      completedAt: now.toISOString(),
      message:
        "Stajor barcha Kirish bosqichlarini muvaffaqiyatli yakunladi. HR/admin ishga olishni tasdiqlashi mumkin.",
    },
  });
});

export default router;
