import { Link } from 'wouter';
import { format } from 'date-fns';
import { uz } from 'date-fns/locale';
import { FileText, UserRound, UserCheck, UserX, ArrowRight } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/utils';

type Activity = {
  id: number;
  text: string;
  type: string;
  actorName?: string | null;
  createdAt: string;
  linkUrl?: string;
  entityId?: number;
};

function resolveHref(activity: Activity): string {
  if (activity.linkUrl) return activity.linkUrl;
  if (activity.entityId) {
    return activity.type === 'new_request'
      ? `/requests/${activity.entityId}`
      : `/candidates/${activity.entityId}`;
  }
  if (activity.type === 'new_request') {
    const rid = activity.id >= 100000
      ? activity.id - 100000
      : activity.id >= 1000
        ? activity.id - 1000
        : activity.id;
    return `/requests/${rid}`;
  }
  return `/candidates/${activity.id}`;
}

const TYPE_META: Record<string, { icon: typeof FileText; color: string; soft: string; label: string }> = {
  new_request: {
    icon: FileText,
    color: 'text-sky-700',
    soft: 'bg-sky-100 border-sky-200',
    label: 'Ariza',
  },
  stage_change: {
    icon: UserRound,
    color: 'text-indigo-700',
    soft: 'bg-indigo-100 border-indigo-200',
    label: 'Nomzod',
  },
  hired: {
    icon: UserCheck,
    color: 'text-emerald-700',
    soft: 'bg-emerald-100 border-emerald-200',
    label: 'Ishga qabul',
  },
  rejected: {
    icon: UserX,
    color: 'text-rose-700',
    soft: 'bg-rose-100 border-rose-200',
    label: 'Rad etilgan',
  },
};

export function RecentActivityFeed({
  activities,
  loading,
}: {
  activities?: Activity[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!activities?.length) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm border border-dashed rounded-xl">
        Hali faollik yo'q
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {activities.map((activity) => {
        const meta = TYPE_META[activity.type] || TYPE_META.stage_change;
        const Icon = meta.icon;
        const href = resolveHref(activity);

        return (
          <Link key={`${activity.type}-${activity.id}`} href={href}>
            <div className="group flex items-start gap-3 rounded-xl border bg-white p-3 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer">
              <div className={cn('w-10 h-10 rounded-xl border flex items-center justify-center shrink-0', meta.soft)}>
                <Icon className={cn('w-4.5 h-4.5 w-4 h-4', meta.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={cn('text-[10px] font-semibold uppercase tracking-wide', meta.color)}>
                    {meta.label}
                  </span>
                </div>
                <p className="text-sm font-medium leading-snug text-foreground group-hover:text-primary transition-colors">
                  {activity.text}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(activity.createdAt), 'd MMM yyyy, HH:mm', { locale: uz })}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
