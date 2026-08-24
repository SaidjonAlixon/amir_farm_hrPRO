/** Candidate stage → forma URL va keyingi qadam */

export const STAGE_FORM_PATH: Record<string, string> = {
  phone_interview: 'phone-interview',
  online_interview: 'online-interview',
  preboarding: 'preboarding',
  offline_interview: 'offline-interview',
  final_decision: 'final-decision',
  offer: 'offer',
  documents: 'documents',
  internship: 'internship',
};

export function stageFormHref(candidateId: number, stageKey: string): string | null {
  const path = STAGE_FORM_PATH[stageKey];
  if (!path) return null;
  return `/candidates/${candidateId}/${path}`;
}

/** Bosqich muvaffaqiyatli yakunlanganda ochiladigan keyingi forma */
export const NEXT_STAGE_AFTER: Record<string, string> = {
  phone_interview: 'online_interview',
  online_interview: 'preboarding',
  preboarding: 'offline_interview',
  offline_interview: 'final_decision',
  final_decision: 'offer',
  offer: 'documents',
  documents: 'internship',
};

export function nextStageFormHref(candidateId: number, completedStage: string): string | null {
  const next = NEXT_STAGE_AFTER[completedStage];
  if (!next) return `/candidates/${candidateId}`;
  return stageFormHref(candidateId, next) ?? `/candidates/${candidateId}`;
}
