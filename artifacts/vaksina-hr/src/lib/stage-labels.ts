/** Nomzod pipeliningi — ko‘rsatish matnlari (DB key o‘zgarmaydi) */

export const STAGE_LABELS: Record<string, string> = {
  phone_interview: 'Tanishuv',
  online_interview: 'Onlayn suhbat',
  preboarding: 'Pre-boarding',
  offline_interview: 'Offline suhbat',
  final_decision: 'Yakuniy qaror',
  offer: 'Job Offer',
  documents: 'Hujjatlar',
  internship: 'Stajirovka',
  hired: 'Ishga olindi',
};

export function stageLabel(key?: string | null): string {
  if (!key) return '';
  return STAGE_LABELS[key] || key;
}

export function stageStepTitle(key: string, stepNum?: number): string {
  const label = stageLabel(key);
  if (stepNum != null) return `${stepNum}-qadam · ${label}`;
  return label;
}
