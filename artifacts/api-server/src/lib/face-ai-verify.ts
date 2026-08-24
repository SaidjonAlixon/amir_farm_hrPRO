/**
 * OpenAI Vision — Face ID. Lokal embedding faqat nomzodlar.
 * Yakuniy qaror: AI fakt (bir odam / boshqa odam / noaniq). Ishonch raqami ishlatilmaydi.
 */
import { logger } from "./logger";
import {
  decideFaceAiGate,
  parseFaceAiInspect,
  parseFaceAiPayload,
  pickAiIdentityWinner,
  type FaceAiCandidateScore,
  type FaceAiCompareResult,
  type FaceAiGate,
} from "./face-ai-decision";

export {
  decideFaceAiGate,
  parseFaceAiPayload,
  pickAiIdentityWinner,
  type FaceAiCompareResult,
  type FaceAiGate,
};

export const FACE_AI_TIMEOUT_MS = envNum("FACE_AI_TIMEOUT_MS", 20_000);

function envNum(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim()?.toLowerCase();
  if (!raw) return fallback;
  if (["0", "false", "off", "no"].includes(raw)) return false;
  if (["1", "true", "on", "yes"].includes(raw)) return true;
  return fallback;
}

export function isFaceAiEnabled(): boolean {
  if (!envFlag("FACE_AI_VERIFY", true)) return false;
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function toDataUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s.startsWith("data:image/")) return null;
  if (s.length < 80 || s.length > 1_200_000) return null;
  return s;
}

async function openaiJson(
  messages: unknown[],
  maxTokens = 280,
): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const model = process.env.OPENAI_FACE_MODEL?.trim() || "gpt-4o";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FACE_AI_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`openai_http_${res.status}:${errText.slice(0, 180)}`);
    }
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    try {
      return JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      throw new Error("openai_bad_json");
    }
  } finally {
    clearTimeout(timer);
  }
}

const COMPARE_SYSTEM =
  "You are a biometric identity judge. Decide a FACT, not a probability score. " +
  "Image 1 is the enrolled employee. Image 2 is a live camera photo. " +
  "Ignore hijab, glasses frames, clothing, background, makeup, compression. " +
  "Use eyes, eyelids, nose, philtrum, jaw, moles, ear shape. " +
  "verdict must be exactly one of: same | different | unknown. " +
  "same = it is the same human. different = another human. unknown = cannot tell (blur, angle, occlusion). " +
  "samePerson is true only when verdict is same. uncertain is true only when verdict is unknown. " +
  "Never mark same if it might be a different person. " +
  'JSON: {"verdict":"same"|"different"|"unknown","samePerson":boolean,"uncertain":boolean}.';

async function callOpenAiFaceCompare(
  enrolledDataUrl: string,
  liveDataUrl: string,
): Promise<FaceAiCompareResult> {
  const parsed = parseFaceAiPayload(
    await openaiJson([
      { role: "system", content: COMPARE_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: "Image 1 = enrolled record. Image 2 = live. Same human as a fact?" },
          { type: "image_url", image_url: { url: enrolledDataUrl, detail: "high" } },
          { type: "image_url", image_url: { url: liveDataUrl, detail: "high" } },
        ],
      },
    ]),
  );
  if (!parsed) throw new Error("openai_bad_json");
  return parsed;
}

export async function inspectEnrollFaceWithAi(
  liveSnapshot?: unknown,
): Promise<{ ok: true; quality: number } | { ok: false; error: string; code: string }> {
  if (!isFaceAiEnabled()) return { ok: true, quality: 1 };
  const live = toDataUrl(typeof liveSnapshot === "string" ? liveSnapshot : null);
  if (!live) {
    return { ok: false, error: "Yuz rasmi olinmadi — kameraga tik qarab qayta urinib ko‘ring", code: "face_ai_no_photo" };
  }
  try {
    const inspect = parseFaceAiInspect(
      await openaiJson(
        [
          {
            role: "system",
            content:
              "You inspect a live selfie for Face ID enrollment. Be lenient on lighting and slight angle. " +
              "Reject only if zero faces, many faces, or a photo of a screen/print. " +
              'JSON: {"ok":boolean,"faceCount":number,"quality":0-1,"reason":string}.',
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Is there exactly one real human face suitable to enroll?" },
              { type: "image_url", image_url: { url: live, detail: "high" } },
            ],
          },
        ],
        180,
      ),
    );
    if (!inspect || inspect.faceCount !== 1) {
      return {
        ok: false,
        error:
          inspect?.reason ||
          "Yuz oval ichida yolg‘iz bo‘lsin. Qayta ro‘yxatdan o‘ting.",
        code: "face_ai_enroll_quality",
      };
    }
    logger.info({ event: "face_ai_enroll_inspect", quality: inspect.quality }, "face AI enroll inspect ok");
    return { ok: true, quality: inspect.quality };
  } catch (err) {
    logger.warn({ event: "face_ai_enroll_inspect", err: err instanceof Error ? err.message : "error" }, "face AI enroll inspect skipped");
    return { ok: true, quality: 0.5 };
  }
}

type PhotoRow = { id: number; userId: number; photoUrl: string | null };

async function loadFacePhotos(
  ids: number[],
): Promise<Map<number, { userId: number; dataUrl: string }>> {
  const out = new Map<number, { userId: number; dataUrl: string }>();
  if (!ids.length) return out;
  const { inArray } = await import("drizzle-orm");
  const { db, faceProfilesTable } = await import("@workspace/db");
  const rows = (await db
    .select({
      id: faceProfilesTable.id,
      userId: faceProfilesTable.userId,
      photoUrl: faceProfilesTable.photoUrl,
    })
    .from(faceProfilesTable)
    .where(inArray(faceProfilesTable.id, ids))) as PhotoRow[];
  for (const row of rows) {
    const dataUrl = toDataUrl(row.photoUrl);
    if (dataUrl) out.set(row.id, { userId: row.userId, dataUrl });
  }
  return out;
}

export async function rejectIfFaceTakenByAi(opts: {
  liveSnapshot?: unknown;
  neighborProfileIds: number[];
}): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  if (!isFaceAiEnabled() || !opts.neighborProfileIds.length) return { ok: true };
  const live = toDataUrl(typeof opts.liveSnapshot === "string" ? opts.liveSnapshot : null);
  if (!live) return { ok: true };
  const photos = await loadFacePhotos(opts.neighborProfileIds.slice(0, 4));
  for (const [id, photo] of photos) {
    try {
      const ai = await callOpenAiFaceCompare(photo.dataUrl, live);
      if (ai.samePerson && !ai.uncertain) {
        logger.info({ event: "face_ai_enroll_dup", profileId: id }, "face AI enroll duplicate");
        return {
          ok: false,
          error: "Bu yuz allaqachon boshqa xodim Face ID siga biriktirilgan.",
          code: "face_already_taken",
        };
      }
    } catch (err) {
      logger.warn({ event: "face_ai_enroll_dup", err: err instanceof Error ? err.message : "error" }, "face AI dup check skipped");
    }
  }
  return { ok: true };
}

export async function resolveLoginIdentityWithAi(opts: {
  liveSnapshot?: unknown;
  candidates: Array<{ id: number; userId: number; dist: number; cosine: number }>;
}): Promise<
  | { ok: true; id: number; userId: number; dist: number; cosine: number; confidence: number }
  | { ok: false; error: string; code: string }
> {
  if (!isFaceAiEnabled()) {
    const c = opts.candidates[0];
    if (!c) return { ok: false, error: "Yuz aniqlanmadi", code: "face_not_registered" };
    return { ok: true, id: c.id, userId: c.userId, dist: c.dist, cosine: c.cosine, confidence: c.cosine };
  }
  const live = toDataUrl(typeof opts.liveSnapshot === "string" ? opts.liveSnapshot : null);
  if (!live) {
    return {
      ok: false,
      error: "Jonli yuz rasmi yo‘q. Kameraga qarab Face ID ni qayta urinib ko‘ring.",
      code: "face_ai_no_photo",
    };
  }
  const photos = await loadFacePhotos(opts.candidates.map((c) => c.id));
  if (!photos.size) {
    return {
      ok: false,
      error: "Face ID rasmi yo‘q. Avval yuzni qayta ro‘yxatdan o‘tkazing.",
      code: "face_ai_no_enrolled_photo",
    };
  }
  const scores: FaceAiCandidateScore[] = [];
  try {
    for (const c of opts.candidates) {
      const photo = photos.get(c.id);
      if (!photo) continue;
      const ai = await callOpenAiFaceCompare(photo.dataUrl, live);
      scores.push({
        faceProfileId: c.id,
        userId: c.userId,
        samePerson: ai.samePerson,
        uncertain: ai.uncertain,
        confidence: ai.confidence,
        similarity: ai.similarity,
      });
    }
  } catch (err) {
    logger.warn({ event: "face_ai_login", err: err instanceof Error ? err.message : "error" }, "face AI login failed");
    return {
      ok: false,
      error: "AI yuzni tasdiqlay olmadi. Qayta urinib ko‘ring — boshqa odam ochilmaydi.",
      code: "face_ai_unavailable",
    };
  }
  const winner = pickAiIdentityWinner(scores);
  if (!winner.ok) {
    const first = scores[0];
    const gate = decideFaceAiGate(
      first
        ? {
            samePerson: first.samePerson,
            uncertain: first.uncertain,
            confidence: first.confidence,
            similarity: first.similarity,
          }
        : { samePerson: false, uncertain: false, confidence: 0, similarity: 0 },
    );
    const error =
      winner.code === "face_ai_low_confidence"
        ? "Yuz bir nechta xodimga o‘xshaydi. Kameraga tik qarang."
        : winner.code === "face_ai_uncertain"
          ? "Yuz aniq o‘qilmadi. Kameraga tik qarab qayta urinib ko‘ring."
          : gate.ok
            ? "Yuz mos kelmadi — bu boshqa odam."
            : gate.error;
    return { ok: false, error, code: winner.code };
  }
  const local = opts.candidates.find((c) => c.id === winner.faceProfileId) ?? opts.candidates[0]!;
  logger.info(
    {
      event: "face_ai_login",
      userId: winner.userId,
      fact: "same",
      candidates: scores.length,
    },
    "face AI login identity",
  );
  return {
    ok: true,
    id: winner.faceProfileId,
    userId: winner.userId,
    dist: local.dist,
    cosine: local.cosine,
    confidence: winner.confidence,
  };
}

export async function verifyFaceWithAi(opts: {
  faceProfileId: number;
  liveSnapshot?: unknown;
  localDist: number;
  localCosine: number;
}): Promise<FaceAiGate> {
  const resolved = await resolveLoginIdentityWithAi({
    liveSnapshot: opts.liveSnapshot,
    candidates: [
      { id: opts.faceProfileId, userId: 0, dist: opts.localDist, cosine: opts.localCosine },
    ],
  });
  if (!resolved.ok) {
    const code =
      resolved.code === "face_ai_uncertain"
        ? "face_ai_uncertain"
        : resolved.code === "face_ai_unavailable"
          ? "face_ai_low_confidence"
          : "face_ai_mismatch";
    return {
      ok: false,
      error: resolved.error,
      code,
      confidence: 0,
    };
  }
  return {
    ok: true,
    source: "ai",
    confidence: resolved.confidence,
    similarity: resolved.confidence,
  };
}
