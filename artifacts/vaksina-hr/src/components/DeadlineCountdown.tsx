import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import {
  formatRemaining,
  msUntil,
  urgencyFromMs,
  URGENCY_STYLES,
  type DeadlineUrgency,
} from '../lib/deadline-countdown';
import { cn } from '../lib/utils';

type Props = {
  deadline?: string | Date | null;
  className?: string;
  compact?: boolean;
  showDate?: boolean;
  dateLabel?: string;
};

export function DeadlineCountdown({
  deadline,
  className,
  compact,
  showDate,
  dateLabel,
}: Props) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!deadline) return;
    let timeoutId = 0;
    const schedule = () => {
      const remaining = msUntil(deadline);
      const interval =
        remaining != null && remaining > 0 && remaining < 3_600_000 ? 1_000 : 30_000;
      timeoutId = window.setTimeout(() => {
        setTick((t) => t + 1);
        schedule();
      }, interval);
    };
    schedule();
    return () => window.clearTimeout(timeoutId);
  }, [deadline]);

  const ms = msUntil(deadline);
  const urgency: DeadlineUrgency = urgencyFromMs(ms);
  if (urgency === 'none' || !deadline) return null;

  const style = URGENCY_STYLES[urgency];
  const label = formatRemaining(deadline);
  const d = new Date(deadline);
  const dateStr = Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('uz-UZ', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

  return (
    <div
      className={cn(
        'inline-flex w-full flex-col gap-1.5 rounded-lg border px-2.5 py-2',
        style.box,
        style.pulse && 'animate-pulse ring-2',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            style.badge,
            style.badgeText,
          )}
        >
          {style.label}
        </span>
        <div className={cn('inline-flex items-center gap-1 font-semibold', style.text, compact ? 'text-[11px]' : 'text-xs')}>
          <Clock className={cn('shrink-0', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
          <span>{label}</span>
        </div>
      </div>
      {showDate && dateStr && (
        <span className={cn('text-[10px] opacity-80', style.text)}>
          {dateLabel || 'Muddat'}: {dateStr}
        </span>
      )}
    </div>
  );
}
