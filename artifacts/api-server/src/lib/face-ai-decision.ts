/** Face ID AI — qaror ishonch raqamiga emas, faktga: bir odam / boshqa odam / noaniq. */

export type FaceAiCompareResult = {
  samePerson: boolean;
  uncertain: boolean;
  confidence: number;
  similarity: number;
};

export type FaceAiGate =
  | { ok: true; source: "ai" | "local_fallback"; confidence: number; similarity: number }
  | {
      ok: false;
      error: string;
      code: "face_ai_mismatch" | "face_ai_low_confidence" | "face_ai_uncertain";
      confidence: number;
    };

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function truthy(v: unknown): boolean {
  return v === true || String(v ?? "").toLowerCase() === "true";
}

export function parseFaceAiPayload(raw: unknown): FaceAiCompareResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const verdict = String(o.verdict ?? o.decision ?? o.fact ?? "")
    .trim()
    .toLowerCase();

  const uncertain =
    truthy(o.uncertain) ||
    truthy(o.unsure) ||
    truthy(o.unknown) ||
    verdict === "unknown" ||
    verdict === "unsure" ||
    verdict === "uncertain" ||
    verdict === "cannot_tell";

  let samePerson =
    o.samePerson === true ||
    o.same_person === true ||
    o.match === true ||
    String(o.samePerson ?? o.same_person ?? "").toLowerCase() === "true" ||
    verdict === "same" ||
    verdict === "same_person" ||
    verdict === "yes";

  if (
    o.samePerson === false ||
    o.same_person === false ||
    o.match === false ||
    verdict === "different" ||
    verdict === "different_person" ||
    verdict === "no"
  ) {
    samePerson = false;
  }

  if (uncertain) samePerson = false;

  const confidence = clamp01(Number(o.confidence ?? o.score ?? 0));
  const similarity = clamp01(Number(o.similarity ?? 0));
  return { samePerson, uncertain, confidence, similarity };
}

export function decideFaceAiGate(ai: FaceAiCompareResult): FaceAiGate {
  if (ai.uncertain) {
    return {
      ok: false,
      error: "Yuz aniq o‘qilmadi. Kameraga tik qarang, yorug‘ joyda qayta urinib ko‘ring.",
      code: "face_ai_uncertain",
      confidence: ai.confidence,
    };
  }
  if (!ai.samePerson) {
    return {
      ok: false,
      error: "Yuz mos kelmadi — bu boshqa odam.",
      code: "face_ai_mismatch",
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
  const ok = o.ok === true || (faceCount === 1 && quality >= 0.4);
  const reason = String(o.reason ?? o.error ?? "").trim();
  return { ok, faceCount, quality, reason };
}

export type FaceAiCandidateScore = {
  faceProfileId: number;
  userId: number;
  samePerson: boolean;
  uncertain: boolean;
  confidence: number;
  similarity: number;
};

export function pickAiIdentityWinner(
  scores: FaceAiCandidateScore[],
):
  | { ok: true; faceProfileId: number; userId: number; confidence: number; similarity: number }
  | { ok: false; code: "face_ai_mismatch" | "face_ai_low_confidence" | "face_ai_uncertain" } {
  const facts = scores.filter((s) => s.samePerson && !s.uncertain);
  if (!facts.length) {
    if (scores.some((s) => s.uncertain)) return { ok: false, code: "face_ai_uncertain" };
    return { ok: false, code: "face_ai_mismatch" };
  }
  const uniqueUsers = new Set(facts.map((s) => s.userId));
  if (uniqueUsers.size > 1) {
    return { ok: false, code: "face_ai_low_confidence" };
  }
  const winner = facts[0]!;
  return {
    ok: true,
    faceProfileId: winner.faceProfileId,
    userId: winner.userId,
    confidence: winner.confidence,
    similarity: winner.similarity,
  };
}
