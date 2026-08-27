/** Muddatgacha qolgan vaqt — umumiy helper */

export type DeadlineUrgency = 'expired' | 'critical' | 'warning' | 'ok' | 'none';

export function msUntil(deadline?: string | Date | null): number | null {
  if (!deadline) return null;
  const t = new Date(deadline).getTime();
  if (Number.isNaN(t)) return null;
  return t - Date.now();
}

export function urgencyFromMs(ms: number | null): DeadlineUrgency {
  if (ms == null) return 'none';
  if (ms <= 0) return 'expired';
  const hours = ms / 3_600_000;
  // 7 kundan kam — qizil (yonib turadi)
  if (hours < 24 * 7) return 'critical';
  // 14 kundan kam — och qizil / ogohlantirish
  if (hours < 24 * 14) return 'warning';
  return 'ok';
}

/** Masalan: "2 kun 5 soat qoldi" / "Muddat o'tgan" */
export function formatRemaining(deadline?: string | Date | null): string {
  const ms = msUntil(deadline);
  if (ms == null) return '';
  if (ms <= 0) return "Muddat o'tgan";

  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (days > 0) {
    if (hours > 0) return `${days} kun ${hours} soat qoldi`;
    return `${days} kun qoldi`;
  }
  if (hours > 0) {
    return `${hours} soat ${mins} daq qoldi`;
  }
  if (mins > 0) {
    return `${mins} daq ${secs.toString().padStart(2, '0')} sek qoldi`;
  }
  return `${Math.max(1, secs)} sek qoldi`;
}

export const URGENCY_STYLES: Record<
  Exclude<DeadlineUrgency, 'none'>,
  { box: string; text: string; badge: string; badgeText: string; label: string; pulse?: boolean }
> = {
  expired: {
    box: 'bg-red-50 border-red-500 ring-red-200',
    text: 'text-red-800',
    badge: 'bg-red-600',
    badgeText: 'text-white',
    label: 'Muddati o‘tgan',
    pulse: true,
  },
  critical: {
    box: 'bg-red-50 border-red-500 ring-red-200',
    text: 'text-red-800',
    badge: 'bg-red-600',
    badgeText: 'text-white',
    label: 'Shoshilinch',
    pulse: true,
  },
  warning: {
    box: 'bg-amber-50 border-amber-400 ring-amber-200',
    text: 'text-amber-900',
    badge: 'bg-amber-400',
    badgeText: 'text-amber-950',
    label: 'Diqqat',
  },
  ok: {
    box: 'bg-emerald-50 border-emerald-400 ring-emerald-100',
    text: 'text-emerald-900',
    badge: 'bg-emerald-500',
    badgeText: 'text-white',
    label: 'Normal',
  },
};

export function sortByDeadlineAsc<T extends { deadline?: string | Date | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const am = msUntil(a.deadline);
    const bm = msUntil(b.deadline);
    if (am == null && bm == null) return 0;
    if (am == null) return 1;
    if (bm == null) return -1;
    return am - bm;
  });
}
