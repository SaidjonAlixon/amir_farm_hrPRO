export const FACE_AI_MIN_CONFIDENCE_DEFAULT = 0.9;
export const FACE_AI_WIN_MARGIN_DEFAULT = 0.08;

export type FaceAiCompareResult = {
  samePerson: boolean;
  confidence: number;
  similarity: number;
};

export type FaceAiGate =
  | { ok: true; source: "ai" | "local_fallback"; confidence: number; similarity: number }
  | { ok: false; error: string; code: "face_ai_mismatch" | "face_ai_low_confidence"; confidence: number };

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function parseFaceAiPayload(raw: unknown): FaceAiCompareResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const same =
    o.samePerson === true ||
    o.same_person === true ||
    o.match === true ||
    String(o.samePerson ?? o.same_person ?? "").toLowerCase() === "true";
  const confidence = clamp01(Number(o.confidence ?? o.score ?? 0));
  const similarity = clamp01(Number(o.similarity ?? o.confidence ?? 0));
  return { samePerson: same, confidence, similarity };
}

export function decideFaceAiGate(
  ai: FaceAiCompareResult,
  minConfidence = FACE_AI_MIN_CONFIDENCE_DEFAULT,
): FaceAiGate {
  if (!ai.samePerson) {
    return {
      ok: false,
      error: "Yuz mos kelmadi — bu boshqa odamga o‘xshaydi.",
      code: "face_ai_mismatch",
      confidence: ai.confidence,
    };
  }
  if (ai.confidence < minConfidence || ai.similarity < minConfidence) {
    return {
      ok: false,
      error: "Yuz aniq tasdiqlanmadi. Kameraga tik qarang, yorug‘ joyda qayta urinib ko‘ring.",
      code: "face_ai_low_confidence",
      confidence: ai.confidence,
    };
  }
  return {
    ok: true,
    source: "ai",
    confidence: ai.confidence,
    similarity: ai.similarity,
  };
}

export type FaceAiInspectResult = {
  ok: boolean;
  faceCount: number;
  quality: number;
  reason: string;
};

export function parseFaceAiInspect(raw: unknown): FaceAiInspectResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const faceCount = Math.max(0, Math.round(Number(o.faceCount ?? o.faces ?? 0)));
  const quality = clamp01(Number(o.quality ?? o.score ?? 0));
  const ok = o.ok === true || (faceCount === 1 && quality >= 0.75);
  const reason = String(o.reason ?? o.error ?? "").trim();
  return { ok, faceCount, quality, reason };
}

export type FaceAiCandidateScore = {
  faceProfileId: number;
  userId: number;
  samePerson: boolean;
  confidence: number;
  similarity: number;
};

export function pickAiIdentityWinner(
  scores: FaceAiCandidateScore[],
  minConfidence = FACE_AI_MIN_CONFIDENCE_DEFAULT,
  margin = FACE_AI_WIN_MARGIN_DEFAULT,
):
  | { ok: true; faceProfileId: number; userId: number; confidence: number; similarity: number }
  | { ok: false; code: "face_ai_mismatch" | "face_ai_low_confidence" } {
  const hits = scores
    .filter((s) => s.samePerson && s.confidence >= minConfidence && s.similarity >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence || b.similarity - a.similarity);
  const best = hits[0];
  const second = hits[1];
  if (!best) {
    const almost = scores.some((s) => s.samePerson);
    return { ok: false, code: almost ? "face_ai_low_confidence" : "face_ai_mismatch" };
  }
  if (second && best.confidence - second.confidence < margin) {
    return { ok: false, code: "face_ai_low_confidence" };
  }
  return {
    ok: true,
    faceProfileId: best.faceProfileId,
    userId: best.userId,
    confidence: best.confidence,
    similarity: best.similarity,
  };
}
