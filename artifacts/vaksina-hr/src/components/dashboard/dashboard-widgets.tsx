import React from 'react';
import { Link } from 'wouter';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Skeleton } from '../ui/skeleton';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import type { HolatMudirNode, HolatPerson, HolatReport } from '../../lib/holat-api';
import type { StaffingAlert } from '../../lib/staffing-api';

export function flattenHolatTree(holat?: HolatReport) {
  const mudirs: HolatMudirNode[] = [];
  const pharmacists: HolatPerson[] = [];
  const interns: HolatPerson[] = [];
  for (const c of holat?.coordinators ?? []) {
    for (const m of c.mudirs) {
      mudirs.push(m);
      for (const s of m.staff) {
        const role = s.orgRole || s.loginRole || '';
        if (role === 'farmasevt') pharmacists.push(s);
        else if (role === 'stajyor') interns.push(s);
      }
    }
  }
  return { mudirs, pharmacists, interns };
}

export function DashTile({
  title,
  value,
  icon: Icon,
  loading,
  color = 'text-slate-600',
  accent = 'bg-slate-100',
  onClick,
  hint,
  active,
}: {
  title: string;
  value?: number | string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  color?: string;
  accent?: string;
  onClick?: () => void;
  hint?: string;
  active?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group relative flex min-h-[88px] flex-col justify-between rounded-xl border bg-white p-3 text-left transition',
        onClick && 'cursor-pointer hover:border-[#0b3a5c]/35 hover:shadow-sm active:scale-[0.99]',
        active && 'border-[#0b3a5c]/50 ring-1 ring-[#0b3a5c]/15',
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className={cn('rounded-lg p-1.5 shrink-0', accent)}>
          <Icon className={cn('h-4 w-4', color)} />
        </span>
        {onClick ? (
          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition group-hover:text-[#0b3a5c]" />
        ) : null}
      </div>
      <div>
        <p className="text-[11px] font-medium leading-tight text-muted-foreground line-clamp-2">{title}</p>
        {loading ? (
          <Skeleton className="mt-1.5 h-6 w-12" />
        ) : (
          <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{value ?? '—'}</p>
        )}
        {hint ? <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">{hint}</p> : null}
      </div>
    </Tag>
  );
}

export function DashActionBar({
  items,
}: {
  items: Array<{
    href: string;
    title: string;
    desc?: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(({ href, title, desc, icon: Icon }) => (
        <Link key={href + title} href={href}>
          <div className="flex h-full items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 transition hover:border-[#0b3a5c]/35 hover:shadow-sm cursor-pointer">
            <span className="rounded-lg bg-slate-100 p-2 text-slate-700 shrink-0">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
              {desc ? <p className="truncate text-[11px] text-muted-foreground">{desc}</p> : null}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function DashListRow({
  title,
  subtitle,
  badge,
  onClick,
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2.5 text-left',
        onClick && 'cursor-pointer hover:bg-slate-50',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{title}</p>
        {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {badge ? <div className="shrink-0">{badge}</div> : null}
    </Tag>
  );
}

export function DashDetailDialog({
  open,
  onOpenChange,
  title,
  description,
  href,
  hrefLabel = 'Batafsil ochish',
  children,
  emptyText = "Ma'lumot yo'q",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
  children?: React.ReactNode;
  emptyText?: string;
}) {
  const hasContent = React.Children.count(children) > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="max-h-[min(52vh,420px)] space-y-2 overflow-y-auto pr-1">
          {hasContent ? children : <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>}
        </div>
        {href ? (
          <DialogFooter>
            <Link href={href}>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpenChange(false)}>
                {hrefLabel} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function PersonListRows({ people }: { people: HolatPerson[] }) {
  if (!people.length) return null;
  return (
    <>
      {people.map((p) => (
        <DashListRow
          key={`${p.employeeId ?? p.userId}-${p.fullName}`}
          title={p.fullName}
          subtitle={[p.branch, p.phone, p.orgRoleLabel || p.loginRoleLabel].filter(Boolean).join(' · ')}
          badge={
            p.login ? (
              <Badge variant="outline" className="text-[10px] font-normal">
                {p.login}
              </Badge>
            ) : undefined
          }
        />
      ))}
    </>
  );
}

export function MudirListRows({ mudirs }: { mudirs: HolatMudirNode[] }) {
  if (!mudirs.length) return null;
  return (
    <>
      {mudirs.map((m) => (
        <DashListRow
          key={m.employeeId ?? m.fullName}
          title={m.fullName}
          subtitle={`${m.branch} · Farmasevt: ${m.pharmacistCount} · Stajyor: ${m.internCount}`}
          badge={
            m.phone ? (
              <Badge variant="secondary" className="text-[10px] font-normal">
                {m.phone}
              </Badge>
            ) : undefined
          }
        />
      ))}
    </>
  );
}

export function BranchListRows({
  branches,
}: {
  branches: HolatReport['branchesWithoutStaff'];
}) {
  if (!branches?.length) return null;
  return (
    <>
      {branches.map((b) => (
        <DashListRow
          key={`${b.branch}-${b.mudirEmployeeId}`}
          title={b.branch}
          subtitle={[b.mudirName, b.coordinatorName].filter(Boolean).join(' · ')}
          badge={<Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 text-[10px]">Jamoa yo‘q</Badge>}
        />
      ))}
    </>
  );
}

export function StaffingAlertRows({ alerts }: { alerts: StaffingAlert[] }) {
  if (!alerts.length) return null;
  return (
    <>
      {alerts.map((a) => (
        <DashListRow
          key={a.id}
          title={`${a.branchLocation || 'Filial'} · ${a.employmentStatusLabel}`}
          subtitle={[a.shiftLabel || a.shiftType, a.employeeName].filter(Boolean).join(' · ')}
          badge={<Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-[10px]">Kutilmoqda</Badge>}
        />
      ))}
    </>
  );
}

export function NeedListRows({ needs }: { needs: any[] }) {
  if (!needs.length) return null;
  return (
    <>
      {needs.map((n) => (
        <DashListRow
          key={n.id}
          title={n.needType || n.title || 'Ehtiyoj'}
          subtitle={[n.branchLocation || n.branch, n.status].filter(Boolean).join(' · ')}
        />
      ))}
    </>
  );
}

export function TaskListRows({ tasks }: { tasks: any[] }) {
  if (!tasks.length) return null;
  return (
    <>
      {tasks.map((t) => (
        <DashListRow
          key={t.id}
          title={t.title || t.description}
          subtitle={[t.status === 'in_progress' ? 'Jarayonda' : 'Yangi', t.dueAt ? new Date(t.dueAt).toLocaleDateString('uz-UZ') : '']
            .filter(Boolean)
            .join(' · ')}
        />
      ))}
    </>
  );
}

export function ReminderListRows({ reminders }: { reminders: any[] }) {
  if (!reminders.length) return null;
  return (
    <>
      {reminders.map((r) => (
        <DashListRow
          key={r.id}
          title={r.title || r.text || 'Eslatma'}
          subtitle={r.dueAt ? new Date(r.dueAt).toLocaleDateString('uz-UZ') : r.status}
        />
      ))}
    </>
  );
}

export function ChatListRows({ chats }: { chats: Array<{ id: number; title?: string; name?: string; unreadCount?: number }> }) {
  if (!chats.length) return null;
  return (
    <>
      {chats.map((c) => (
        <DashListRow
          key={c.id}
          title={c.title || c.name || `Chat #${c.id}`}
          badge={
            (c.unreadCount ?? 0) > 0 ? (
              <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100">{c.unreadCount}</Badge>
            ) : undefined
          }
        />
      ))}
    </>
  );
}
