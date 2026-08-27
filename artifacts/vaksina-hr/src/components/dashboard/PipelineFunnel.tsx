import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, ChevronDown, Users } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/utils';

type PipelineRow = {
  stage: string;
  label: string;
  count: number;
  currentCount?: number;
  rejectedCount?: number;
};

type FunnelSummary = {
  total?: number;
  pending?: number;
  hired?: number;
  rejected?: number;
};

const STAGE_COLORS = [
  'from-sky-500 to-sky-600',
  'from-blue-500 to-blue-600',
  'from-indigo-500 to-indigo-600',
  'from-violet-500 to-violet-600',
  'from-fuchsia-500 to-fuchsia-600',
  'from-rose-500 to-rose-600',
  'from-orange-500 to-orange-600',
  'from-amber-500 to-amber-600',
  'from-emerald-500 to-emerald-600',
];

const STAGE_SOFT = [
  'bg-sky-50 border-sky-100 text-sky-800',
  'bg-blue-50 border-blue-100 text-blue-800',
  'bg-indigo-50 border-indigo-100 text-indigo-800',
  'bg-violet-50 border-violet-100 text-violet-800',
  'bg-fuchsia-50 border-fuchsia-100 text-fuchsia-800',
  'bg-rose-50 border-rose-100 text-rose-800',
  'bg-orange-50 border-orange-100 text-orange-800',
  'bg-amber-50 border-amber-100 text-amber-800',
  'bg-emerald-50 border-emerald-100 text-emerald-800',
];

export function PipelineFunnel({
  pipeline,
  loading,
  summary,
}: {
  pipeline?: PipelineRow[];
  loading: boolean;
  summary?: FunnelSummary;
}) {
  const [open, setOpen] = useState(false);

  const maxCount = Math.max(1, ...(pipeline?.map((s) => s.count) ?? [1]));
  const totalReached = summary?.total ?? pipeline?.[0]?.count ?? 0;
  const hired = summary?.hired ?? pipeline?.find((s) => s.stage === 'hired')?.currentCount ?? 0;
  const pending = summary?.pending ?? 0;
  const rejected = summary?.rejected ?? 0;
  const conversionBase = Math.max(1, totalReached);
  const stageCount = pipeline?.length ?? 0;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!pipeline?.length) {
    return (
      <div className="text-center py-10 text-muted-foreground border border-dashed rounded-xl">
        Pipeline ma'lumoti yo'q
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-xl border bg-gradient-to-r from-slate-50 to-white p-4 text-left hover:border-primary/30 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-sm sm:text-base">Tanlov voronkasi</p>
            <p className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
              <span>
                Bosqich: <span className="font-medium text-foreground">{stageCount}</span>
              </span>
              <span>
                Jami: <span className="font-medium text-foreground tabular-nums">{totalReached}</span>
              </span>
              <span>
                Kutilmoqda: <span className="font-medium text-amber-700 tabular-nums">{pending}</span>
              </span>
              <span>
                Qabul: <span className="font-medium text-emerald-700 tabular-nums">{hired}</span>
              </span>
              <span>
                Rad etildi: <span className="font-medium text-rose-700 tabular-nums">{rejected}</span>
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
            <span className="text-xs hidden sm:inline">{open ? 'Yopish' : 'Ochish'}</span>
            <ChevronDown
              className={cn('w-5 h-5 transition-transform duration-200', open && 'rotate-180')}
            />
          </div>
        </div>
      </button>

      {open && (
        <div className="space-y-5 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Link href="/candidates">
              <div className="rounded-xl border bg-gradient-to-br from-slate-50 to-white p-4 h-full hover:border-slate-300 transition-colors cursor-pointer">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Jami</p>
                <p className="text-2xl font-bold mt-1 tabular-nums">{totalReached}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Barcha nomzodlar</p>
              </div>
            </Link>
            <Link href="/candidates?status=active">
              <div className="rounded-xl border bg-gradient-to-br from-amber-50 to-white p-4 h-full hover:border-amber-300 transition-colors cursor-pointer">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kutilmoqda</p>
                <p className="text-2xl font-bold mt-1 text-amber-700 tabular-nums">{pending}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Faol jarayondagilar</p>
              </div>
            </Link>
            <Link href="/candidates?status=hired">
              <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-white p-4 h-full hover:border-emerald-300 transition-colors cursor-pointer">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ishga qabul</p>
                <p className="text-2xl font-bold mt-1 text-emerald-700 tabular-nums">{hired}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Qabul qilinganlar</p>
              </div>
            </Link>
            <Link href="/candidates?status=rejected">
              <div className="rounded-xl border bg-gradient-to-br from-rose-50 to-white p-4 h-full hover:border-rose-300 transition-colors cursor-pointer">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rad etilgan</p>
                <p className="text-2xl font-bold mt-1 text-rose-700 tabular-nums">{rejected}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Rad etilganlar</p>
              </div>
            </Link>
            <Link href="/candidates?status=hired">
              <div className="rounded-xl border bg-gradient-to-br from-sky-50 to-white p-4 h-full hover:border-sky-300 transition-colors cursor-pointer col-span-2 lg:col-span-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Konversiya</p>
                <p className="text-2xl font-bold mt-1 tabular-nums">
                  {Math.round((hired / conversionBase) * 100)}%
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">Ishga qabul ro'yxati</p>
              </div>
            </Link>
          </div>

          <p className="text-sm text-muted-foreground">
            Kartochkaga bosing — tegishli nomzodlar ochiladi. Har bir qator — shu bosqichgacha yetganlar.
          </p>

          <div className="space-y-2.5">
            {pipeline.map((stage, idx) => {
              const widthPct = Math.max(12, Math.round((stage.count / maxCount) * 100));
              const prev = idx === 0 ? stage.count : pipeline[idx - 1].count;
              const dropPct = prev > 0 ? Math.round((stage.count / prev) * 100) : 0;
              const current = stage.currentCount ?? 0;
              const rejectedHere = stage.rejectedCount ?? 0;
              const color = STAGE_COLORS[idx % STAGE_COLORS.length];
              const soft = STAGE_SOFT[idx % STAGE_SOFT.length];

              return (
                <Link key={stage.stage} href={`/candidates?stage=${stage.stage}`}>
                  <div
                    className="group relative rounded-xl border bg-white p-3 sm:p-4 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer"
                    style={{ marginLeft: `${idx * 1.2}%`, marginRight: `${idx * 1.2}%` }}
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div
                        className={cn(
                          'w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 border',
                          soft,
                        )}
                      >
                        {idx + 1}
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm sm:text-base truncate">{stage.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                              <span>
                                Kutilmoqda: <span className="font-medium text-amber-700">{current}</span>
                              </span>
                              <span>
                                Rad: <span className="font-medium text-rose-700">{rejectedHere}</span>
                              </span>
                              {idx > 0 && (
                                <span>
                                  Oldingisidan: <span className="font-medium text-foreground">{dropPct}%</span>
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <p className="text-xl sm:text-2xl font-bold tabular-nums leading-none">{stage.count}</p>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">o'tgan</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>

                        <div className="h-2.5 rounded-full bg-muted/80 overflow-hidden">
                          <div
                            className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500', color)}
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {totalReached === 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-muted-foreground text-sm">
              <Users className="w-5 h-5 shrink-0" />
              Hali nomzodlar yo'q — yangi nomzod qo'shilganda voronka to'ldiriladi.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
